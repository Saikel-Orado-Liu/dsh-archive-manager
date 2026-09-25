import { SessionProjectionCache } from "@deepseek-ai/dsh-session-projection-cache";
//#region lib/types/index.js
/**
 * dsh-archive-manager projcache half.
 *
 * `ArchiveProjectionCache` extends the shipped `SessionProjectionCache`
 * (service name `sessionProjectionCache`, same `session_projcache` domain,
 * same fail-soft write path) and adds the two public methods the archive
 * manager's `deleteSession` needs:
 *
 * - `delete(id)` — permanently remove one session's cached projection row
 *   (`table.delete` on the `session_projcache` domain).
 * - `whenIdle()` — resolve once every in-flight fail-soft checkpoint write
 *   has settled. Session disposal triggers one final write-behind
 *   (`flushSoft(session, "detach")`); the deletion flow must wait for that
 *   write to land BEFORE deleting the row, otherwise the row is written back
 *   after deletion and resurrects the cache entry.
 *
 * The shipped 0.1.7 class exposes no write-behind barrier and no row removal,
 * so this stays a subclass rather than a caller of the shipped service. The
 * default export is a Service subclass (same shape as the shipped
 * `@deepseek-ai/dsh-session-projection-cache` package), so the profile patch
 * can substitute this package for the `session-projection-cache` row with no
 * other wiring change.
 */
var ArchiveProjectionCache = class extends SessionProjectionCache {
	/** Tail of in-flight fail-soft checkpoint writes (settled promises only). */
	writeTail = Promise.resolve();
	constructor(ctx, config) {
		super(ctx, config);
	}
	/** Fail-soft durable checkpoint, tracked so {@link whenIdle} can observe it. */
	flushSoft(session, trigger) {
		const task = super.flushSoft(session, trigger);
		this.writeTail = Promise.allSettled([this.writeTail, task]).then(() => void 0);
		return task;
	}
	/**
	* Resolve once every tracked in-flight write has settled (failures
	* included). Fresh calls during an idle cache resolve immediately.
	* @returns resolution after the tracked writes settle.
	*/
	whenIdle() {
		return this.writeTail;
	}
	/**
	* Permanently remove one session's cached projection row.
	* @param id - the session whose cache row to delete.
	* @returns resolution after the row is gone.
	*/
	async delete(id) {
		await this.requireTable().delete(id);
	}
};
//#endregion
export { ArchiveProjectionCache, ArchiveProjectionCache as default };
