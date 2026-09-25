//#region lib/types/index.js
/**
* Session deletion client half (dsh-archive-manager-client). Pure UI plugin:
* the empty apply exists so the plugin appears in the host cordis.yml / Loader
* (load and lifecycle follow the host; the browser half ships via
* exports["./client"], discovered through the package.json dsh.client
* declaration).
*/
/** Host plugin body — no host-side behavior for the deletion UI plugin. */
function apply() {}
//#endregion
export { apply };
