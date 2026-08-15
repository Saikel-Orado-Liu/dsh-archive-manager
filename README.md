<h1 align="center">DSH Archive Manager</h1>

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
</p>

**DSH Archive Manager** is an archived-session management plugin for the DeepSeek Harness (DSH) Web GUI — a **"Show archived" view toggle**, **archived-session styling and guarding** (red title, tinted background, "Archived" badge, not openable), **unarchive**, and **permanent session deletion** (transcript directory, workspace accounting, archive marker, and projection cache row are all removed; live sessions are disposed first so the UI never crashes).

- Host half (internal `dsh-archive-manager-workspace` / `dsh-archive-manager-projcache`): `WorkspaceRegistry` and `SessionProjectionCache` subclasses that add `unarchiveSession` / `deleteSession` and `delete(id)` / `whenIdle()`, exposed as Typert Remote endpoints.
- Client half (internal `dsh-archive-manager-client`): a forked `dsh-client-ui-workspace` browser bundle — view toggle, archived row treatment, guarded open, row menus, confirmation dialogs, and toasts, in Simplified Chinese and English.

The plugin ships as a **single npm package** (`@gamegeek-saikel/dsh-archive-manager`) containing the three implementations as internal submodules. Its `cordis.patch.yml` disables the stock rows and inserts the archive-manager rows. **Official package files are never modified.**

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

This installs the single npm package through the DSH CLI, which applies the package's root `cordis.patch.yml` (disables the stock `workspace`, `session-projection-cache`, and `ui-workspace` rows; inserts `workspace-archive-manager`, `session-projection-cache-archive-manager`, and `ui-workspace-archive-manager`).

## Overview

DSH Web keeps a registry-global `archivedSessionIds` set, but the stock UI offers no way to see archived sessions in the sidebar, no way to unarchive them, and no way to permanently delete a session. Naively hiding archived sessions from the list makes them unrecoverable through the GUI, and deleting a session touches several independent stores (transcript directory, workspace accounting, archive marker, projection cache) whose ordering matters.

**Archive Manager** solves this with a small, disciplined patch layer:

- **One visibility toggle** — `showArchived` lives in the same persisted store as grouping/sorting (`dsh.workspace.view.v5`), so the choice survives browser restarts and old preferences deserialize as "off" without breaking anything.
- **One derivation path** — grouping, the flat list, and search all share `sessionVisible`, so archived sessions appear consistently in every surface (or disappear consistently when the toggle is off).
- **One serialized deletion flow** — `deleteSession` runs inside the registry's operation queue with strict ordering: flush → detach (`session/disposed`) → wait for the projection cache's dispose write-behind (`whenIdle`) → remove the transcript directory → clear the archive marker → remove workspace accounting → delete the cache row → best-effort subagent cascade + spill cleanup. Every failing step is idempotent and re-runnable, so a retry heals a half-delete.

## Key Properties

| Property | Value |
|---|---|
| Scope | Show-archived toggle, archived styling + guard, unarchive, permanent delete |
| Delivery | Single npm package; official packages untouched; web-profile patch layer (`cordis.patch.yml`) |
| Install / rollback | `npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager` / `... remove ...` |
| Remote API | Typert SRC endpoints `workspaceRegistry/unarchiveSession`, `workspaceRegistry/deleteSession`; legacy `/api/workspace.*` untouched |
| Delete semantics | Permanent; live session flush → detach → `session/disposed`; cache write-behind awaited before row delete; subagent children cascade (origin `subagent` only — fork branches never) |
| UI surfaces | Sidebar session/workspace browser · view options menu · row menus · confirmation dialogs · toast |
| Locale | Simplified Chinese (source) + English |
| Tests | 22 cases across 4 `node:test` suites (host, client bundle, client remote, installed copies) |

## Usage

Once installed and restarted:

| Surface | Description |
|---|---|
| View options | New "Show archived" item (separator-separated) alongside group-by/order-by; persisted in the same store |
| Session rows | Archived rows: red title + tinted background + "Archived" badge (theme danger token), click guarded with a toast; row menu = [Unarchive, Delete session] |
| Search results | Archived matches get the same red treatment; the browser-level guard keeps them from opening |
| Row menus | Normal sessions gain a danger-styled "Delete session" item; archived sessions show only [Unarchive, Delete session] |
| Delete dialog | Two-step confirmation ("This permanently deletes session … This cannot be undone."), pending state, failure keeps the dialog open |
| Live session delete | Composer greys out, row disappears, UI does not crash |

### Restart verification checklist

1. View options → "Show archived": toggling shows/hides archived sessions in their workspace groups (flat list and search included).
2. Clicking an archived session does not open it; a toast says "This session is archived. Unarchive it to continue the conversation." and messaging stays blocked.
3. An archived row's menu contains only [Unarchive, Delete session]; unarchive restores normal styling and openability at the session's original workspace position.
4. A normal row's menu contains "Delete session"; confirming permanently removes the session with no disk residue:
   - `~/.dsh\sessions\…\session-<id>\` no longer exists;
   - `~/.dsh\storages\workspace.json` — `global.archivedSessionIds` and every workspace's `sessionIds` no longer contain the id;
   - `~/.dsh\storages\session_projcache.json` — `tables.sessions` no longer contains the id.
5. Deleting the currently open session greys the composer and removes the row without crashing.
6. Rename / fork / archive / drag-sort / search / flat list / workspace CRUD all keep working.
7. Both locales render correctly (switch the browser language and reload).

## How It Works

### Host half — workspace (`dsh-archive-manager-workspace`)

`ArchiveWorkspaceRegistry extends WorkspaceRegistry` (same service name `workspaceRegistry`, same accounting invariants) and adds:

- `unarchiveSession(sessionId)` — removes the id from the registry-global `archivedSessionIds` set. Archiving never moves the accounting seat, so unarchiving restores the session at its original workspace position. Idempotent; unknown ids reject like `archiveSession` does.
- `deleteSession(sessionId)` — the serialized permanent deletion described in the overview: validate → flush → detach/`session/disposed` → `whenIdle` → remove transcript dir → clear archive marker → remove workspace accounting → delete cache row → best-effort cascade/spill.

Both are exported as Typert Remote endpoints through the service's `typertRemote` binding plus `Remote` markers. The browser reaches them through the standard typert gateway SRC path, keeping the legacy `/api/workspace.*` gateway untouched.

### Host half — projection cache (`dsh-archive-manager-projcache`)

`ArchiveProjectionCache extends SessionProjectionCache` (same service name `sessionProjectionCache`, same fail-soft write path) and adds:

- `delete(id)` — permanently removes one session's cached projection row (`table.delete`).
- `whenIdle()` — resolves once every in-flight fail-soft checkpoint write has settled. Session disposal triggers one final write-behind (`flushSoft(session, "detach")`); the deletion flow must wait for it to land *before* deleting the row, otherwise the row is written back after deletion and resurrects the cache entry.

### Client half (`dsh-archive-manager-client`)

The package is a full fork of the `@deepseek-ai/dsh-client-ui-workspace` bundle (the stock package has no inheritable exports, so `lib/client.js` is a self-registering bundle copied wholesale and patched at 12 points — see `dsh-archive-manager-client/PATCHES.md` for the exact list). Highlights:

- `createWorkspaceViewStore` gains `showArchived` (`setShowArchived` coerces to boolean) in the same persisted store family;
- `sessionVisible` gains a 4th parameter, and `deriveGroups` / `deriveFlat` / `deriveSearchResults` thread it through and stamp `archived` on rows;
- `ARCHIVE_MANAGER_REMOTE` mounts the two Remote descriptors with dependency-free strict-codec shims (no second zod copy in the bundle);
- The `apply` fiber is async: it `$mount`s the Remote contribution before registering slots, then reads `ctx.get("remote.workspaceRegistry")` explicitly (declaring `remote.workspaceRegistry` in inject would deadlock with the same fiber performing the mount).

## Project Structure

```
dsh-archive-manager/
  package.json                    # Single npm package @gamegeek-saikel/dsh-archive-manager
  lib/index.js                    # Root host entry (empty apply; client via dsh.client)
  cordis.patch.yml                # DSH bundle patch (disables stock rows, inserts archive rows)
  scripts/check-package.mjs       # Publish preflight (pnpm build)
  README.md / README.zh-CN.md     # Bilingual docs
  test/                           # node:test suites (19 cases)
    host.test.mjs                 # Workspace + projcache behavior, typert gateway E2E
    client.test.mjs               # Forked bundle derivation + view store
    client-remote.test.mjs        # Client Remote $mount / ctx.get integration
  dsh-archive-manager-workspace/  # Internal: WorkspaceRegistry subclass + Remote methods
    lib/index.js
  dsh-archive-manager-projcache/  # Internal: SessionProjectionCache subclass (delete/whenIdle)
    lib/index.js
  dsh-archive-manager-client/     # Internal: forked ui-workspace bundle
    lib/index.js                  #   Host plugin body (empty apply)
    lib/client.js                 #   Forked browser bundle (PATCHES.md lists the 12 edits)
    PATCHES.md                    #   Fork patch notes
```

## Development

There is no compile step — the package is plain ESM. `pnpm build` runs a lightweight publish preflight (`scripts/check-package.mjs`) that verifies the single-package structure.

Self-tests resolve the real `@deepseek-ai` packages through the test tree's `node_modules` junction to the DSH flat fallback (`%USERPROFILE%\.dsh\profiles\node_modules`, same module instances as the runtime). Create it once if it is missing:

```powershell
New-Item -ItemType Junction -Path .\node_modules -Target "$env:USERPROFILE\.dsh\profiles\node_modules"
pnpm build    # publish preflight
npm test      # node:test suites
```

The suites cover: unarchive/delete idempotency, unknown-id errors, accounting + archive-marker cleanup, transcript-directory removal, live-session flush → detach → `session/disposed`, `whenIdle`-before-row-delete ordering, subagent cascade (origin `subagent` only — fork branches with `parentSession` are never cascade-deleted), the intact legacy API surface, projcache delete/whenIdle timing, typert gateway claims + dispatch end to end, and the client bundle's real-load derivation behavior.

## Documentation

- [`dsh-archive-manager-client/PATCHES.md`](dsh-archive-manager-client/PATCHES.md) — the 12 fork patch points and why the Typert Remote path is used instead of extending `/api/workspace.*`
- [`README.zh-CN.md`](README.zh-CN.md) — 简体中文版本

## License

This repository (source, tests, README, and the DSH plugin bundle shape) is licensed under the **MIT License** — see [`LICENSE`](LICENSE).

Copyright (c) 2026 Saikel-Orado-Liu aka GameGeek-Saikel

