// dsh-archive-manager client Remote integration test (node:test).
//
// Mounts the REAL client typert registry and api-gateway bundles, $mounts the
// archive-manager contribution from a plugin fiber (like the bundle's own
// apply), and verifies that `ctx.get("remote.workspaceRegistry")` resolves and
// dispatches through `connection.rpc.call` — while the proxy property path
// indeed requires the service name in inject (and cannot be declared by the
// mounting fiber).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";

const requireFallback = createRequire(import.meta.url);
const statics = {};
// The modules these three bundles actually require: cordis (for the gateway
// and typert client halves), react (for the archive-manager surfaces), and the
// primitives stand-in below. dsh-client-store is deliberately absent — the
// 0.1.7 deletion UI does not touch it.
for (const spec of ["react", "react/jsx-runtime", "@deepseek-ai/cordis"]) {
	statics[spec] = await import(pathToFileURL(requireFallback.resolve(spec)).href);
}
statics["@deepseek-ai/dsh-client-ui-primitives"] = { MenuItemButton: () => null, Button: () => null, Modal: () => null };

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, createElement: () => ({ dataset: {}, set textContent(v) {} }), head: { appendChild: () => {} }, baseURI: "http://127.0.0.1:3080/" };
// The 0.1.7 gateway client builds its Remote-stream mux socket eagerly at
// `apply`. Pin the transport base and install an inert socket so the test never
// opens a real connection to the running harness.
globalThis.__DSH_TRANSPORT__ = { streamBaseUrl: "http://127.0.0.1:3080/" };
globalThis.WebSocket = class InertWebSocket {
	constructor() { this.readyState = 0; }
	close() {}
	send() {}
	addEventListener() {}
	removeEventListener() {}
};
const factories = new Map();
window.__ModuleLoader__ = { load: (h) => { factories.set(h.id, h.factory); } };

async function loadBundle(pkg) {
	// packages export "./client" (or nothing); resolve the bundle file directly
	const pkgJson = requireFallback.resolve(`${pkg}/package.json`);
	const dir = pkgJson.slice(0, -"/package.json".length);
	await import(pathToFileURL(join(dir, "lib/client.js")).href);
}
function materialize(id) {
	const factory = factories.get(id);
	if (factory === void 0) throw new Error(`no factory registered for ${id}`);
	const module = { exports: {} };
	const require = (spec) => {
		if (Object.hasOwn(statics, spec)) return statics[spec];
		const stripped = spec.endsWith("/client") ? spec.slice(0, -7) : spec;
		if (stripped !== id && factories.has(stripped)) return materialize(stripped);
		throw new Error(`smoke require miss: ${spec}`);
	};
	return factory(require, module, module.exports) ?? module.exports;
}

await loadBundle("@deepseek-ai/dsh-typert-registry");
await loadBundle("@deepseek-ai/dsh-api-gateway");
const typertClient = materialize("@deepseek-ai/dsh-typert-registry");
const gatewayClient = materialize("@deepseek-ai/dsh-api-gateway");
await import(pathToFileURL(fileURLToPath(new URL("../dsh-archive-manager-client/lib/client.js", import.meta.url))).href);
const bundle = materialize("@gamegeek-saikel/dsh-archive-manager");
const contribution = bundle.__test.ARCHIVE_MANAGER_REMOTE;

const calls = [];
const root = new Context();
root.provide("connection", {
	rpc: {
		async call(channel, endpoint, payload, signal) {
			calls.push({ channel, endpoint, payload, signal });
			return { ok: true, value: { deleted: true } };
		}
	},
	// The 0.1.7 alpha connection surface: the api-gateway client registers a
	// generation source (unregister-capable) and starts the connection loop
	// (returns a stop handle) at construction.
	registerGenerationSource: () => () => {},
	start: () => ({ stop: () => {} })
});
typertClient.apply(root);
gatewayClient.apply(root);

test("$mount registers the namespace; ctx.get resolves it and dispatches through connection.rpc.call", async () => {
	const fiber = root.plugin({
		inject: ["remote", "typert"],
		apply: async (ctx) => {
			await ctx.remote.$mount(contribution);
		}
	});
	await fiber;
	try {
		const registry = root.get("remote.workspaceRegistry");
		assert.ok(registry !== void 0, "namespace service resolves via ctx.get");
		const result = await registry.deleteSession("s1");
		assert.deepEqual(result, { ok: true, value: { deleted: true } });
		assert.equal(calls.length, 1);
		assert.equal(calls[0].channel, "/api");
		assert.equal(calls[0].endpoint, "workspaceRegistry/deleteSession");
		// the gateway builds args as a null-prototype object; compare JSON-normalized
		assert.deepEqual(JSON.parse(JSON.stringify(calls[0].payload)), { args: { sessionId: "s1" } });
	} finally {
		await fiber.dispose();
	}
});

test("the contribution declares no archived-session endpoint (DSH 0.1.7 ships those)", () => {
	assert.deepEqual(contribution.descriptors.map((d) => d.method), ["deleteSession"]);
});

test("proxy property path (ctx.remote.workspaceRegistry) without inject declares the missing-service error", async () => {
	const fiber = root.plugin({
		inject: ["remote", "typert"],
		apply: async (ctx) => {
			await ctx.remote.$mount(contribution);
			assert.throws(() => ctx.remote.workspaceRegistry, /without inject/);
		}
	});
	await fiber;
	await fiber.dispose();
});

test("proxy property path works when the service name is declared in inject (consumer pattern)", async () => {
	const fiber = root.plugin({
		inject: ["remote", "typert", "remote.workspaceRegistry"],
		apply: async (ctx) => {
			// a consumer fiber never mounts the contribution itself; here the
			// root-mounted namespace (previous tests) satisfies the inject
			assert.equal(typeof ctx.remote.workspaceRegistry.deleteSession, "function");
		}
	});
	await fiber;
	await fiber.dispose();
});
