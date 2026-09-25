//#region lib/types/index.js
/**
 * @gamegeek-saikel/dsh-archive-manager root host entry.
 *
 * The published package is a single DSH plugin bundle. The three
 * implementations live inside the package as subpath exports:
 *
 * - `./workspace`  -> ArchiveWorkspaceRegistry (host workspace service)
 * - `./projcache`  -> ArchiveProjectionCache (host projection cache service)
 * - `./client`     -> the session row's delete action + confirmation dialog
 *
 * This root entry is the host body for the `ui-workspace-archive-manager`
 * loader row. Its only job is to BE a row: the browser half is discovered
 * through this package's `dsh.client` declaration, so the row must exist for
 * the shell to compose the bundle. It therefore has no host behavior.
 */
function apply() {}
//#endregion
export { apply };
