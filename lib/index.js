//#region lib/types/index.js
/**
 * @gamegeek-saikel/dsh-archive-manager root host entry.
 *
 * The published package is a single DSH plugin bundle. The three
 * implementations live inside the package as subpath exports:
 *
 * - `./workspace`  -> ArchiveWorkspaceRegistry (host workspace service)
 * - `./projcache`  -> ArchiveProjectionCache (host projection cache service)
 * - `./client`     -> forked dsh-client-ui-workspace browser bundle
 *
 * This root entry is the host body for the `ui-workspace-archive-manager`
 * loader row. The browser half is discovered through the package.json
 * `dsh.client` declaration, so this host body intentionally has no behavior.
 */
function apply() {}
//#endregion
export { apply };
