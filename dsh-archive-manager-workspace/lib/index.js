import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
	WorkspaceRegistry,
	WorkspaceUnknownSessionError
} from "@deepseek-ai/dsh-workspace";
import { bindTypertRemote, Remote } from "@deepseek-ai/dsh-typert-protocol";
import { sessionDir } from "@deepseek-ai/dsh-spill-local";
//#region lib/types/index.js
/**
 * dsh-archive-manager host half — permanent session deletion.
 *
 * `ArchiveWorkspaceRegistry` extends the shipped `WorkspaceRegistry` (service
 * name `workspaceRegistry`, one domain open, every accounting invariant
 * inherited unchanged) and adds ONE durable operation:
 *
 * - `deleteSession(sessionId)` — PERMANENT deletion, no trace left on disk:
 *   1. validate the session is known (live, header-indexed, or persisted);
 *   2. if live: flush buffered events to disk, then detach the session from
 *      the sessions store (`session/disposed` is emitted, so the browser
 *      receives `host/session-removed` and greys the composer);
 *   3. wait for the projection cache's dispose write-behind (`whenIdle`) so
 *      the final cache row is durable BEFORE it is deleted;
 *   4. remove the transcript directory (the whole `session-<id>` dir under
 *      the persistence root, located through `sessionPersistence.locate`);
 *   5. remove the id from the registry-global archive and pin sets (durable
 *      `setState`);
 *   6. remove the id from every workspace record's `sessionIds` and refresh
 *      the in-memory entity snapshots (durable `table.update`, so the host
 *      stream pushes `host/workspace-changed` to every browser);
 *   7. delete the projection-cache row (`sessionProjectionCache.delete`);
 *   8. best-effort (failures only warn): cascade-delete SUBAGENT child
 *      sessions of the deleted session (`header.origin === "subagent"` ONLY —
 *      a fork branch carries `parentSession` too but is an independent user
 *      session and is never cascade-deleted) and clear its spill data.
 *
 * Core steps throw on failure (no half-delete states: every failing step is
 * idempotent and re-runnable, so a retry heals); cascade/spill are
 * best-effort by design.
 *
 * DSH 0.1.7 ships archive/unarchive, the archived-row filter, pinning, and the
 * workspace activity gate itself, so this fork deliberately adds none of them:
 * `archiveSession` / `unarchiveSession` / `pinSession` / `unpinSession` are
 * inherited from the shipped class and behave exactly as the official rows
 * expect. Permanent deletion is the one capability the shipped registry still
 * lacks.
 *
 * The method is also exported as a Typert Remote endpoint
 * (`workspaceRegistry/deleteSession`) through the service's `typertRemote`
 * binding + a `Remote` marker — the browser reaches it through the standard
 * typert gateway path, keeping the legacy `/api/workspace.*` gateway untouched.
 *
 * The default export is a Service subclass (same shape as the shipped
 * `@deepseek-ai/dsh-workspace` package), so the profile patch can substitute
 * this package for the `workspace` row with no other wiring change.
 */
function markRemoteMethod(instance, method) {
	// Simulate the TS decorator pipeline `@Remote(method)` for one method:
	// `Remote` returns a standard method decorator; we hand it a decorator
	// context whose addInitializer runs immediately with `this` = instance.
	const context = {
		private: false,
		static: false,
		name: method,
		addInitializer(fn) {
			fn.call(instance);
		}
	};
	Remote(method)(void 0, context);
}
var ArchiveWorkspaceRegistry = class extends WorkspaceRegistry {
	/** The shipped requirements plus the cache whose row deletion must be durable. */
	static inject = [
		"storageDomain",
		"sessionPersistence",
		"sessionProjectionCache"
	];
	constructor(ctx) {
		super(ctx);
		this.typertRemote = bindTypertRemote(this, this.name);
		markRemoteMethod(this, "deleteSession");
	}
	/**
	* Permanently delete one session and every trace of it (transcript
	* directory, workspace accounting, archive and pin markers, projection
	* cache row).
	* @param sessionId - the session to delete.
	* @returns `{ deleted: true }` after durability.
	* @throws {@link WorkspaceUnknownSessionError} when the session is unknown.
	*/
	async deleteSession(sessionId) {
		return this.enqueueOperation(() => this.deleteSessionCore(sessionId));
	}
	/** The serialized core deletion body (also used by the cascade path, which
	* already holds the operation chain — it must never re-enqueue). */
	async deleteSessionCore(sessionId) {
		if (!await this.sessionKnown(sessionId)) throw new WorkspaceUnknownSessionError(sessionId);
		const sessions = this.ctx.get("sessions");
		const live = sessions?.get(sessionId);
		const wasLive = live !== void 0;
		if (live !== void 0) {
			// Durability barrier first: no pending transcript writes may race
			// the directory removal (the persistence backend closes handles per
			// batch, so a flushed session leaves no open file).
			await sessions.flush(live);
			// Detach from the store; `session/disposed` fires synchronously, and
			// the shipped session-controller relay turns that into the
			// `api-session/removed` frame the browser drops the row on. It also
			// starts the projection cache's final write-behind.
			const entry = sessions.liveEntryFor(live);
			sessions.detachEntered(entry);
		}
		const projCache = this.ctx.get("sessionProjectionCache");
		// The dispose write-behind must land BEFORE the cache row is deleted,
		// otherwise the row is written back after deletion (resurrected).
		await projCache?.whenIdle?.();
		await this.removeTranscriptDirectory(sessionId);
		const state = this.requireState();
		const archived = state.archivedSessionIds.includes(sessionId);
		const pinned = state.pinnedSessionIds.includes(sessionId);
		if (archived || pinned) {
			await this.setState({
				...state,
				archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId),
				pinnedSessionIds: state.pinnedSessionIds.filter((id) => id !== sessionId)
			});
		}
		await this.removeFromWorkspaceAccounts(sessionId);
		if (projCache !== void 0) await projCache.delete(sessionId);
		// Rebuild the header index from storage now that the transcript is gone:
		// the deleted identity must stop being "known" (it would otherwise be
		// re-indexed by a later bootstrap and reappear as an empty workspace group).
		await this.replaceHeaderIndex(await this.listStoredHeaders());
		// A COLD session never fires `session/disposed`, so the shipped relay
		// (`ctx.on('session/disposed') -> ctx.emit('api-session/removed')`) never
		// runs and the browser would keep the row — with its transcript already
		// deleted it lands in the sidebar's 「未分组」 group and fails to open.
		// Relay the same frame the shipped relay sends, so the client records the
		// `remove` mutation and drops the identity.
		if (!wasLive) this.ctx.emit("api-session/removed", sessionId);
		await this.deleteDescendants(sessionId);
		await this.cleanSpill(sessionId);
		return { deleted: true };
	}
	/** Remove the session's whole transcript directory (throw on failure —
	* the irreversible step runs before any accounting mutation). */
	async removeTranscriptDirectory(sessionId) {
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0 || typeof persistence.locate !== "function") {
			throw new Error(`cannot delete session "${sessionId}": the session persistence backend does not expose locate() to resolve its transcript directory`);
		}
		const header = await this.readSessionHeader(sessionId);
		const location = persistence.locate(header);
		await rm(dirname(location.path), { recursive: true, force: true });
	}
	/** Drop the id from every workspace record and refresh entity snapshots. */
	async removeFromWorkspaceAccounts(sessionId) {
		const table = this.requireTable();
		const state = this.requireState();
		for (const workspaceId of state.workspaceIds) {
			const record = table.get(workspaceId);
			if (record === void 0 || !record.sessionIds.includes(sessionId)) continue;
			const next = await table.update(workspaceId, (current) => ({
				...current,
				sessionIds: current.sessionIds.filter((id) => id !== sessionId),
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			}));
			const entity = this.entities.get(workspaceId);
			if (entity !== void 0) entity.record = next;
		}
	}
	/** Best-effort cascade: delete SUBAGENT child sessions of `sessionId`.
	* Only sessions whose header marks `origin: "subagent"` qualify: `parentSession`
	* alone is ambiguous (fork branches also carry it), and a fork branch is an
	* independent user session that must never be cascade-deleted. */
	async deleteDescendants(sessionId) {
		try {
			const descendants = [];
			const sessions = this.ctx.get("sessions");
			if (sessions !== void 0) for (const session of sessions.list()) {
				if (session.header.parentSession === sessionId && session.header.origin === "subagent") descendants.push(session.id);
			}
			// `sessionPersistence.list()` answers snapshot records
			// (`{ header, ... }`); normalize so a cascade never silently misses
			// a stored child.
			for (const record of await this.ctx.sessionPersistence.list()) {
				const header = record?.header ?? record;
				if (header?.parentSession === sessionId && header.origin === "subagent" && !descendants.includes(header.id)) descendants.push(header.id);
			}
			for (const childId of descendants) {
				try {
					await this.deleteSessionCore(childId);
				} catch (error) {
					this.ctx.logger.warn(`archive-manager: cascade delete of subagent session "${childId}" (child of "${sessionId}") failed: ${String(error)}`);
				}
			}
		} catch (error) {
			this.ctx.logger.warn(`archive-manager: descendant enumeration for deleted session "${sessionId}" failed: ${String(error)}`);
		}
	}
	/** Best-effort spill cleanup: remove the session-scoped spill directory. */
	async cleanSpill(sessionId) {
		try {
			const spill = this.ctx.get("spillStore");
			if (spill === void 0 || typeof spill.root !== "string") return;
			await rm(sessionDir(spill.root, sessionId), { recursive: true, force: true });
		} catch (error) {
			this.ctx.logger.warn(`archive-manager: spill cleanup for deleted session "${sessionId}" failed: ${String(error)}`);
		}
	}
};
//#endregion
export { ArchiveWorkspaceRegistry, ArchiveWorkspaceRegistry as default };
