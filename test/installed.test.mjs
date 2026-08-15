// Sanity check against the INSTALLED copies under ~/.dsh/profiles/archive-manager:
// proves the profile install resolves the same flat fallback at runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Context, Service } from "@deepseek-ai/cordis";
// Import the INSTALLED copies by absolute path: their internal deps resolve
// through the parent walk to the flat fallback, exactly like the loader.
const INSTALLED = join(process.env.USERPROFILE, ".dsh/profiles/archive-manager");
const { ArchiveWorkspaceRegistry } = await import(pathToFileURL(join(INSTALLED, "dsh-archive-manager-workspace/lib/index.js")).href);
const { ArchiveProjectionCache } = await import(pathToFileURL(join(INSTALLED, "dsh-archive-manager-projcache/lib/index.js")).href);

// These bare imports resolve from the test tree's node_modules junction ONLY
// if the junction links the packages; here we resolve via the web profile
// links explicitly to mirror the loader's resolution.
import { createRequire } from "node:module";
const profileRequire = createRequire(join(process.env.USERPROFILE, ".dsh/profiles/web/x.js"));

test("installed packages resolve from the web profile node_modules", () => {
	for (const pkg of ["dsh-archive-manager-workspace", "dsh-archive-manager-projcache", "dsh-archive-manager-client"]) {
		assert.match(profileRequire.resolve(pkg), /profiles[\\/]archive-manager[\\/]/);
	}
});

test("installed ArchiveWorkspaceRegistry drives a real deleteSession", async () => {
	const root = mkdtempSync(join(tmpdir(), "dsh-am-installed-"));
	const proj = join(root, "proj");
	mkdirSync(proj);
	const canonical = realpathSync(proj);
	const sessionId = "session-installed-test-0001";
	const logDir = join(root, `sessions-${sessionId}`);
	mkdirSync(logDir);
	writeFileSync(join(logDir, "session.jsonl.zstd"), "x");
	const ctx = new Context();
	const table = new Map();
	table.set("ws-1", { path: canonical, title: "proj", sessionIds: [sessionId], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
	const global = { initialized: true, workspaceIds: ["ws-1"], archivedSessionIds: [sessionId] };
	const domain = {
		table: (name) => ({
			get: (k) => table.get(k),
			put: async () => {},
			delete: async () => {},
			update: async (k, fn) => { const n = fn(table.get(k)); table.set(k, n); return n; },
			entries: () => table.entries(),
			keys: () => table.keys(),
			values: () => table.values(),
			get size() { return table.size; }
		}),
		get global() { return { get: () => global, set: async (n) => { Object.assign(global, n); } }; },
		close() {}
	};
	ctx.provide("storageDomain", { open: async () => domain });
	ctx.provide("sessionPersistence", {
		list: async () => [{ id: sessionId, cwd: canonical, createdAt: 1700000000000 }],
		locate: (meta) => ({ kind: "jsonl", path: join(logDir, "session.jsonl.zstd") })
	});
	ctx.provide("sessionProjectionCache", { whenIdle: async () => {}, delete: async () => {} });
	const registry = new ArchiveWorkspaceRegistry(ctx);
	await registry[Service.init]();
	const out = await registry.deleteSession(sessionId);
	assert.deepEqual(out, { deleted: true });
	assert.deepEqual(global.archivedSessionIds, []);
	assert.deepEqual(table.get("ws-1").sessionIds, []);
	assert.equal(existsSync(logDir), false, "transcript dir removed");
});

test("installed ArchiveProjectionCache delete + whenIdle", async () => {
	const ctx = new Context();
	const table = new Map();
	const domain = {
		table: (name) => ({ get: (k) => table.get(k), put: async (k, v) => { table.set(k, v); }, delete: async (k) => { table.delete(k); }, update: async () => {} }),
		get global() { return { get: () => null, set: async () => {} }; },
		close() {}
	};
	ctx.provide("storageDomain", { open: async () => domain });
	ctx.provide("sessionProjections", { checkpoint: () => ({ title: { ver: 1, seq: 1, val: "t" } }) });
	ctx.provide("sessionPersistence", { list: async () => [] });
	ctx.provide("sessions", { get: () => void 0 });
	const cache = new ArchiveProjectionCache(ctx, { writeEveryEvents: 200, writeIntervalMs: 5000 });
	await cache[Service.init]();
	await cache.put("s1", { createdAt: 1 }, { title: { ver: 1, seq: 1, val: "t" } });
	assert.ok(table.has("s1"));
	await cache.delete("s1");
	assert.ok(!table.has("s1"));
	await cache.whenIdle();
});
