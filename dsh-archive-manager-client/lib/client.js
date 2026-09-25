window.__ModuleLoader__.load({
	id: "@gamegeek-saikel/dsh-archive-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region dsh-archive-manager: locale + Remote contribution
		/** Dictionary namespace owned by this bundle. */
		const NS = "archiveManager";
		const zh = {
			"menu.deleteSession": "删除会话",
			"dialog.title": "删除会话",
			"dialog.desc": "此操作不可撤销：会话记录、工作区记账、归档标记与投影缓存都会被永久删除；该会话派生的子代理会话一并删除。",
			"dialog.warning": "分叉出的会话是独立会话，不会被一并删除。",
			"dialog.confirm": "永久删除",
			"dialog.cancel": "取消",
			"dialog.close": "关闭",
			"dialog.pending": "删除中…",
			"dialog.failed": "删除失败：{error}"
		};
		const en = {
			"menu.deleteSession": "Delete session",
			"dialog.title": "Delete session",
			"dialog.desc": "This cannot be undone: the session log, its workspace accounting, its archive marker, and its projection-cache row are permanently removed. Subagent sessions derived from it are deleted too.",
			"dialog.warning": "Forked sessions are independent and are never deleted with it.",
			"dialog.confirm": "Delete permanently",
			"dialog.cancel": "Cancel",
			"dialog.close": "Close",
			"dialog.pending": "Deleting…",
			"dialog.failed": "Delete failed: {error}"
		};
		/**
		* Strict codec shims for the Remote descriptor. The generated 0.1.7
		* contract is `{ mode: "strict", typeSymbol, create() }`, where `create`
		* is the lazy schema factory the Host reflects from; the Client only
		* validates that shape (the Host owns wire validation), so a tiny
		* hand-written schema keeps a second zod copy out of this bundle.
		*/
		const sessionIdSchema = {
			parse(value) {
				if (typeof value !== "string" || value.length === 0) throw new TypeError(`sessionId must be a non-empty string, got ${String(value)}`);
				return value;
			}
		};
		const deletedSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value) || value.deleted !== true) throw new TypeError("deleted must be true");
				return value;
			}
		};
		/**
		* Client contribution for the host `workspaceRegistry.deleteSession`
		* Remote method added by `dsh-archive-manager-workspace`. Mounted through
		* `ctx.remote.$mount`; calls ride the typert gateway and reach the
		* official host service, so the legacy `/api/workspace.*` gateway stays
		* untouched. DSH 0.1.7 ships archive/unarchive itself, so this
		* contribution declares nothing else.
		*/
		const ARCHIVE_MANAGER_REMOTE = {
			package: "@gamegeek-saikel/dsh-archive-manager",
			descriptors: [
				{
					id: "@gamegeek-saikel/dsh-archive-manager#workspaceRegistry/deleteSession",
					service: "workspaceRegistry",
					namespace: "workspaceRegistry",
					method: "deleteSession",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => sessionIdSchema }
					}],
					result: {
						mode: "strict",
						typeSymbol: "@gamegeek-saikel/dsh-archive-manager/types#Deleted",
						create: () => deletedSchema
					},
					sourceLocation: { file: "@gamegeek-saikel/dsh-archive-manager/dsh-archive-manager-workspace/lib/index.js", line: 1, column: 1 }
				}
			]
		};
		//#endregion
		//#region dsh-archive-manager: pending-deletion store
		/**
		* The one piece of state the two contributions share: a row's menu closes
		* with the click that starts the flow, so the confirmation lives in a
		* frame-wide overlay entry and reads the request from here instead of from
		* a parent that is already unmounting.
		*/
		let pending = null;
		const listeners = /* @__PURE__ */ new Set();
		function getPending() {
			return pending;
		}
		function setPending(sessionId) {
			if (pending === sessionId) return;
			pending = sessionId;
			for (const listener of [...listeners]) listener();
		}
		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
		/** Subscribe one component to the pending request. */
		function usePending() {
			// The server snapshot is the same synchronous read, so the surfaces
			// stay renderable outside a browser (tests, SSR shells).
			return react.useSyncExternalStore(subscribe, getPending, getPending);
		}
		//#endregion
		//#region dsh-archive-manager: surfaces
		/**
		* One Session's "..." menu row. DSH 0.1.7 hands every `sidebar.
		* workspaces.session.menu.item` entry the row's Session identity and the
		* menu-open hook; closing the menu and raising the confirmation is all
		* this row does.
		*/
		function SessionDeleteMenuItem({ sessionId, useMenuOpenState, requestDelete, t }) {
			const setMenuOpen = useMenuOpenState()[1];
			return react.createElement(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
				danger: true,
				separatorBefore: true,
				onSelect: () => {
					setMenuOpen(false);
					requestDelete(sessionId);
				}
			}, t("menu.deleteSession"));
		}
		/**
		* The frame-wide confirmation. `Modal` portals itself to the body, so the
		* dialog outlives the menu row that raised it; a failed deletion keeps the
		* dialog open with the Host's message.
		*/
		function DeleteSessionDialog({ deleteSession, t }) {
			const sessionId = usePending();
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			if (sessionId === null) return null;
			const dismiss = () => {
				if (busy) return;
				setError(null);
				setPending(null);
			};
			const confirm = () => {
				setBusy(true);
				setError(null);
				void Promise.resolve().then(() => deleteSession(sessionId)).then(() => {
					setBusy(false);
					setPending(null);
				}, (cause) => {
					setBusy(false);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			const footer = [
				react.createElement(_deepseek_ai_dsh_client_ui_primitives.Button, {
					key: "cancel",
					variant: "outline",
					disabled: busy,
					onClick: dismiss
				}, t("dialog.cancel")),
				react.createElement(_deepseek_ai_dsh_client_ui_primitives.Button, {
					key: "confirm",
					variant: "primary",
					disabled: busy,
					onClick: confirm
				}, busy ? t("dialog.pending") : t("dialog.confirm"))
			];
			return react.createElement(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: dismiss,
				closeLabel: t("dialog.close"),
				title: t("dialog.title"),
				description: t("dialog.desc"),
				footer
			}, react.createElement("div", null, react.createElement("p", null, t("dialog.warning")), error === null ? null : react.createElement("p", { role: "alert" }, t("dialog.failed", { error }))));
		}
		//#endregion
		//#region dsh-archive-manager: plugin body
		/** Services required for locale registration, the Remote mount, and the slot entries. */
		const inject = ["slots", "locale", "remote"];
		/** One Remote call through the namespace this plugin mounted. */
		async function callDelete(ctx, sessionId) {
			// `ctx.get` rather than a property chain: this fiber performs the
			// `$mount` itself, so declaring `remote.workspaceRegistry` in inject
			// would make the fiber wait for what it is about to install.
			const registry = ctx.get("remote.workspaceRegistry");
			if (registry === void 0) throw new Error("archive-manager: the workspaceRegistry Remote namespace is not mounted");
			const result = await registry.deleteSession(sessionId);
			if (result.ok !== true) throw result.error;
			return result.value;
		}
		/**
		* Register the dictionaries, mount the deletion Remote, and contribute the
		* row action plus its frame-wide confirmation. DSH 0.1.7's own workspace
		* UI owns archived rows and unarchiving, so nothing here duplicates it.
		* @param ctx - client root context.
		* @returns disposer that withdraws the Remote contribution.
		*/
		async function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "archive-manager: dictionaries");
			const t = ctx.locale.bind(NS);
			const unmount = await ctx.remote.$mount(ARCHIVE_MANAGER_REMOTE);
			ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
				name: "sidebar.workspaces.session.menu.item",
				id: "@gamegeek-saikel/dsh-archive-manager/delete",
				order: 500,
				locale: NS,
				inject: () => ({ requestDelete: (sessionId) => setPending(sessionId) })
			}, SessionDeleteMenuItem));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "@gamegeek-saikel/dsh-archive-manager/delete-dialog",
				locale: NS,
				inject: () => ({ deleteSession: (sessionId) => callDelete(ctx, sessionId) })
			}, DeleteSessionDialog));
			return () => {
				setPending(null);
				unmount();
			};
		}
		//#endregion
		module.exports = {
			NS,
			inject,
			apply,
			__test: {
				zh,
				en,
				ARCHIVE_MANAGER_REMOTE,
				getPending,
				setPending,
				subscribe,
				usePending,
				callDelete,
				SessionDeleteMenuItem,
				DeleteSessionDialog
			}
		};
		return module.exports;
	}
});
