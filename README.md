<h1 align="center">DSH Archive Manager</h1>

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
</p>

**DSH Archive Manager** adds **permanent session deletion** to the DeepSeek Harness (DSH) Web GUI: the transcript directory, workspace accounting, archive/pin markers, projection-cache row, derived subagent sessions, and spill data all go, and the sidebar updates live.

Since DSH 0.1.7 the harness itself owns archived sessions — `WorkspaceRegistry.archiveSession` / `unarchiveSession`, the archived-row filter (hide / show / only), archived row styling, pinning, and the session activity gate. This plugin therefore **does not fork or replace any browser surface**: it leaves the official `ui-workspace` row exactly where the composition put it and contributes one row-menu action plus its confirmation dialog into the official sidebar.

- Host half (internal `dsh-archive-manager-workspace` / `dsh-archive-manager-projcache`): `WorkspaceRegistry` and `SessionProjectionCache` subclasses that add `deleteSession` and `delete(id)` / `whenIdle()`, exposed as a Typert Remote endpoint.
- Client half (internal `dsh-archive-manager-client`): a small browser bundle registering `sidebar.workspaces.session.menu.item` (the destructive "Delete session" row) and a frame-wide `shell.overlay` confirmation dialog, in Simplified Chinese and English.

The plugin ships as a **single npm package** (`@gamegeek-saikel/dsh-archive-manager`) containing the three implementations as internal submodules. Its `cordis.patch.yml` substitutes the two host rows it extends and inserts its own rows. **Official package files are never modified.**

---

## Installation

### Published package (recommended)

```bash
npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager
```

Then start DSH Web:

```bash
npx @deepseek-ai/dsh web
```

> If you have the DSH CLI installed globally, you can use `dsh` instead of `npx @deepseek-ai/dsh`.

This installs the single npm package through the DSH CLI, which applies the package's root `cordis.patch.yml` (disables the stock `workspace` and `session-projection-cache` rows; inserts `workspace-archive-manager`, `session-projection-cache-archive-manager`, and `ui-workspace-archive-manager`). The stock `ui-workspace` row is left enabled.

## Overview

Deleting a session in DSH touches several independent stores whose ordering matters, and DSH's own UI deliberately offers no delete action: a live session must be flushed and detached first (or the browser keeps a composer bound to a session that no longer exists), and the projection cache writes one final checkpoint on disposal, which would resurrect a row deleted too early.

**Archive Manager** solves this with one small, disciplined layer:

- **One serialized deletion flow** — `deleteSession` runs inside the registry's operation queue with strict ordering: flush → detach (`session/disposed`) → wait for the projection cache's dispose write-behind (`whenIdle`) → remove the transcript directory → clear the archive and pin markers → remove workspace accounting → delete the cache row → best-effort subagent cascade + spill cleanup. Every failing step is idempotent and re-runnable, so a retry heals a half-delete.
- **No duplicated UI** — archived sessions, their filter, their styling, and unarchiving stay entirely with the official `ui-workspace` surface; this plugin adds only the action DSH does not have.

## Key Properties

| Property | Value |
|---|---|
| Scope | Permanent session deletion (action + confirmation + host flow) |
| Delivery | Single npm package; official packages untouched; web-profile patch layer (`cordis.patch.yml`) |
| Install / rollback | `npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager` / `... remove ...` |
| Remote API | Typert endpoint `workspaceRegistry/deleteSession`; legacy `/api/workspace.*` untouched |
| Inheritance | Archive / unarchive / pin / activity gate are the shipped `WorkspaceRegistry` methods, unmodified |
| Delete semantics | Permanent; live session flush → detach → `session/disposed`; cache write-behind awaited before row delete; subagent children cascade (origin `subagent` only — fork branches never) |
| UI surfaces | One `sidebar.workspaces.session.menu.item` row + one `shell.overlay` dialog |
| Locale | Simplified Chinese (source) + English |
| Tests | 19 cases across 3 `node:test` suites (host, client bundle, client remote) |

## Usage

Once installed and restarted:

| Surface | Description |
|---|---|
| Session row menu | A destructive "Delete session" row, separated from the shipped pin/rename/fork/archive rows (order 500) |
| Delete dialog | Body-portaled confirmation: what is removed, the fork-branch carve-out, a pending state, and a failure that keeps the dialog open with the Host's message |
| Live session delete | Composer greys out, row disappears, UI does not crash |
| Archived sessions | Unchanged: the official filter (hide / show / only), styling, guarding, and unarchive still own them |

### Restart verification checklist

1. A session row's "..." menu shows "Delete session" **after** the shipped rows, separated by a hairline.
2. Confirming permanently removes the session with no disk residue:
   - `~/.dsh\sessions\…\session-<id>\` no longer exists;
   - `~/.dsh\storages\workspace.json` — `global.archivedSessionIds`, `global.pinnedSessionIds`, and every workspace's `sessionIds` no longer contain the id;
   - `~/.dsh\storages\session_projcache.json` — `tables.sessions` no longer contains the id.
3. Cancelling leaves everything untouched.
4. Deleting the currently open session greys the composer and removes the row without crashing.
5. A session with subagent children deletes its children with it; a **fork branch** of the same session survives.
6. The official archive flow still works: hide / show / only-archived filter, archived row styling, archived click guard, unarchive, pin / unpin.
7. Both locales render correctly (switch the browser language and reload).

## How It Works

### Host half — workspace (`dsh-archive-manager-workspace`)

`ArchiveWorkspaceRegistry extends WorkspaceRegistry` (same service name `workspaceRegistry`, same accounting invariants, every shipped method inherited) and adds exactly one method:

- `deleteSession(sessionId)` — the serialized permanent deletion described in the overview: validate → flush → detach/`session/disposed` → `whenIdle` → remove transcript dir → clear archive/pin markers → remove workspace accounting → delete cache row → best-effort cascade/spill.

`unarchiveSession`, `archiveSession`, `pinSession`, `unpinSession`, and `stopSessionActivity` are the shipped implementations and are deliberately **not** overridden.

The method is exported as a Typert Remote endpoint through the service's `typertRemote` binding plus a `Remote` marker. The browser reaches it through the standard typert gateway path, keeping the legacy `/api/workspace.*` gateway untouched.

### Host half — projection cache (`dsh-archive-manager-projcache`)

`ArchiveProjectionCache extends SessionProjectionCache` (same service name `sessionProjectionCache`, same `session_projcache` domain, same fail-soft write path) and adds:

- `delete(id)` — permanently removes one session's cached projection row (`table.delete`).
- `whenIdle()` — resolves once every in-flight fail-soft checkpoint write has settled. Session disposal triggers one final write-behind (`flushSoft(session, "detach")`); the deletion flow must wait for it to land *before* deleting the row, otherwise the row is written back after deletion and resurrects the cache entry.

### Client half (`dsh-archive-manager-client`)

A hand-written, self-registering bundle (`window.__ModuleLoader__.load({ id, factory })`) that requires only the shell's platform seed table (`react`, `@deepseek-ai/dsh-client-ui-primitives`). It contributes:

- `sidebar.workspaces.session.menu.item` — one `MenuItemButton` (`danger`, `separatorBefore`, order 500) that closes the menu and raises the request;
- `shell.overlay` — the frame-wide `Modal` confirmation, so the dialog outlives the menu row that opened it;
- `ARCHIVE_MANAGER_REMOTE` — the `workspaceRegistry/deleteSession` descriptor, whose strict codecs follow the generated 0.1.7 contract `{ mode: 'strict', typeSymbol, create() }` with dependency-free shims (no second zod copy in the bundle).

The `apply` fiber is async: it `$mount`s the Remote contribution before registering slots, then reads `ctx.get("remote.workspaceRegistry")` explicitly (declaring `remote.workspaceRegistry` in inject would deadlock with the same fiber performing the mount).

## Project Structure

```
dsh-archive-manager/
  package.json                    # Single npm package @gamegeek-saikel/dsh-archive-manager
  lib/index.js                    # Root host entry (empty apply; client via dsh.client)
  cordis.patch.yml                # DSH bundle patch (substitutes the two extended host rows)
  scripts/check-package.mjs       # Publish preflight (pnpm build)
  README.md / README.zh-CN.md     # Bilingual docs
  test/                           # node:test suites (19 cases)
    host.test.mjs                 # Registry + projcache behavior, typert gateway E2E
    client.test.mjs               # Client bundle surfaces + Remote descriptor + store
    client-remote.test.mjs        # Client Remote $mount / ctx.get integration
  dsh-archive-manager-workspace/  # Internal: WorkspaceRegistry subclass + Remote method
    lib/index.js
  dsh-archive-manager-projcache/  # Internal: SessionProjectionCache subclass (delete/whenIdle)
    lib/index.js
  dsh-archive-manager-client/     # Internal: deletion UI bundle
    lib/index.js                  #   Host plugin body (empty apply)
    lib/client.js                 #   Browser bundle
    PATCHES.md                    #   Fork/extension notes
```

## Development

There is no compile step — the package is plain ESM. `pnpm build` runs a lightweight publish preflight (`scripts/check-package.mjs`) that verifies the single-package structure.

Self-tests resolve the real `@deepseek-ai` packages through the test tree's `node_modules` junction to the DSH flat fallback (`%USERPROFILE%\.dsh\profiles\node_modules`, same module instances as the runtime). Create it once if it is missing:

```powershell
New-Item -ItemType Junction -Path .\node_modules -Target "$env:USERPROFILE\.dsh\profiles\node_modules"
pnpm build    # publish preflight
pnpm test     # node:test suites
```

The suites cover: the inherited shipped archive/unarchive/pin behavior, delete idempotency and unknown-id errors, accounting + archive/pin marker cleanup, transcript-directory removal, live-session flush → detach → `session/disposed`, `whenIdle`-before-row-delete ordering, subagent cascade (origin `subagent` only — fork branches with `parentSession` are never cascade-deleted), the intact legacy API surface, projcache delete/whenIdle timing, the typert gateway claim + dispatch end to end, the client bundle's Remote descriptor and store, and a real `$mount` + `connection.rpc.call` integration against the shipped registry/gateway bundles.

## Documentation

- [`dsh-archive-manager-client/PATCHES.md`](dsh-archive-manager-client/PATCHES.md) — what the client bundle contributes and why the Typert Remote path is used instead of extending `/api/workspace.*`
- [`README.zh-CN.md`](README.zh-CN.md) — 简体中文版本

## License

This repository (source, tests, README, and the DSH plugin bundle shape) is licensed under the **MIT License** — see [`LICENSE`](LICENSE).

Copyright (c) 2026 Saikel-Orado-Liu aka GameGeek-Saikel
