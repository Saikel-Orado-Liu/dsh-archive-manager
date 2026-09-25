# dsh-archive-manager-client — client half notes

> This directory is the **client submodule** inside the single npm package
> `@gamegeek-saikel/dsh-archive-manager`; it is not published separately. The
> root package exposes `lib/client.js` through `exports["./client"]` and wires
> the browser half through the root `package.json` `dsh.client` declaration.

## What changed in 0.3.0 (DSH 0.1.7)

Up to 0.2.0 this directory was a **wholesale fork of the
`@deepseek-ai/dsh-client-ui-workspace` browser bundle** (12 patch points: a
`showArchived` view toggle, archived row styling/badges, guarded open, row
menus, toasts, plus the Remote contribution). DSH 0.1.7 shipped all of that
itself:

| Capability | 0.1.7 official |
| --- | --- |
| `WorkspaceRegistry.archiveSession` / `unarchiveSession` | shipped host service |
| Archived-row filter | `viewOptions.hideArchived` / `showArchived` / `onlyArchived` (three modes, superseding the fork's boolean toggle) |
| Archived styling + click guard | shipped (row treatment, "not openable" toast) |
| Client archive commands | `ctx.workspaces.archiveSession()` / `unarchiveSession()` (`dsh-api-workspace-controller`) |
| Pinning | `pinSession` / `unpinSession` / `pinnedSessionIds` |

So the fork was deleted and replaced by a small hand-written bundle that adds
only what DSH still lacks: **permanent session deletion**.

## What the bundle does now

`lib/client.js` is a self-registering bundle (`window.__ModuleLoader__.load({ id, factory })`)
with exactly two runtime requires, both from the shell's platform seed table:
`react` and `@deepseek-ai/dsh-client-ui-primitives`.

1. **Locale** — namespace `archiveManager` (zh source + en).
2. **Remote contribution** — `ctx.remote.$mount({ package, descriptors })` with
   one descriptor, `workspaceRegistry/deleteSession`. The strict codecs follow
   the generated 0.1.7 contract `{ mode: 'strict', typeSymbol, create() }`; the
   `create()` factory returns a tiny hand-written schema, so no second zod copy
   enters the bundle. (0.2.0's shims exposed `schema.parse()` only, which
   0.1.7's registry rejects with "strict codec has no create() factory".)
3. **`sidebar.workspaces.session.menu.item`** — one `MenuItemButton`
   (`danger: true`, `separatorBefore: true`, order 500, after the shipped
   pin 100 / rename 200 / fork 300 / archive 400 rows). It closes the menu
   through the injected `useMenuOpenState` hook and raises the request.
4. **`shell.overlay`** — the frame-wide `Modal` confirmation. A menu row
   unmounts with the click that closes the menu, so the dialog cannot live
   inside it; the two contributions share one module-level pending-request
   store instead. `useSyncExternalStore` is given the same function as its
   server snapshot, so the dialog is also renderable outside a DOM.

`apply` is async: it registers the dictionary, `await`s `ctx.remote.$mount`,
then registers the two slots, and returns a disposer that clears the pending
request and withdraws the contribution. Reads use
`ctx.get("remote.workspaceRegistry")` rather than a property chain — this fiber
performs the `$mount` itself, so declaring `remote.workspaceRegistry` in
`inject` would make it wait for what it is about to install.

## Why Typert Remote instead of extending `/api/workspace.*`

- The shipped `dsh-host-apiproxy` route and schema tables are static; unknown
  method names fail, and the browser API client is a fixed method table too.
- `dsh-api-gateway` (the `typert-gateway` row) intercepts `/api` by claim: the
  host reflects a Service carrying a `typertRemote` binding and exports its
  `@Remote` methods as `<namespace>/<method>`. `@gamegeek-saikel/dsh-archive-manager/workspace`
  binds `ArchiveWorkspaceRegistry` and marks `deleteSession`, so the browser
  reaches it through the ordinary gateway path while the legacy
  `workspace.*` routes keep serving the shipped UI unchanged.
