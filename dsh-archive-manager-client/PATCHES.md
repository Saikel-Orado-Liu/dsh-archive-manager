# dsh-archive-manager-client — fork 修补说明 (PATCHES.md)

> 本目录是 `@gamegeek-saikel/dsh-archive-manager` 单 npm 包内部的 **client 子模块**，不单独发布。
> 根包通过 `exports["./client"]` 暴露 `lib/client.js`，并通过根 `package.json` 的 `dsh.client` 声明接入浏览器。

本目录是 `@deepseek-ai/dsh-client-ui-workspace`（v0.1.0-rc.6）浏览器 bundle 的**整体 fork**：
`lib/client.js` 为自注册 bundle（`window.__ModuleLoader__.load({id, factory})`），官方包无可继承导出，
因此整份复制并定点修补；外部 require 列表（共享模块）保持原样：
`@deepseek-ai/dsh-client-runtime/client`、`@deepseek-ai/dsh-client-ui-primitives`、
`react`、`react/jsx-runtime`。仅模块 id 改为 `dsh-archive-manager-client`。

## 修补点清单（对照官方 lib/client.js）

| # | 位置（原 bundle 区域） | 修补内容 |
| --- | --- | --- |
| 1 | bundle 头 | `id` 改为 `dsh-archive-manager-client`；三处 CSS `<style>` 的 `data-plugin` 归属改为新 id |
| 2 | 新增区域（require 之后） | `ARCHIVE_MANAGER_REMOTE`：typert Remote contribution（`workspaceRegistry/unarchiveSession`、`workspaceRegistry/deleteSession`，strict codec 用无依赖的 `parse()` shim，避免向 bundle 内联第二份 zod）；`ARCHIVED_CLASSES` + `ARCHIVED_CSS`（归档行红底/红标题/角标，全部基于主题 token `--dsw-alias-state-error-primary` 派生，无硬编码色值） |
| 3 | `createWorkspaceViewStore` | `init` 增 `showArchived: false`；actions 增 `setShowArchived(d, value)`（强制布尔）。与 `groupBy`/`orderBy` 同一 `persist: "dsh.workspace.view.v5"` 持久化机制（旧数据反序列化后该字段为 undefined，按关闭处理，不破坏既有偏好） |
| 4 | `sessionVisible` | 增第 4 参 `showArchived`：关闭（默认）时归档会话不可见（行为与现状一致）；开启时可见。分组、单列表、搜索共用此函数，天然一致 |
| 5 | `sessionNode` / `deriveGroups` / `deriveFlat` / `deriveSearchResults` | 增加 `showArchived` 透传；行对象增加 `archived` 标志 |
| 6 | `SessionNodeItem` | 归档行：红色标题 + 红底 + 「已归档」角标（角标位于标题**左侧**，`margin-right: 8px` 留出间距）；点击不 open；行菜单 = [取消归档, 删除会话]。普通行菜单 = [重命名, 分叉, 归档, 删除会话]（新增危险样式「删除会话」） |
| 7 | `SearchResultItem` | 归档结果：红色标题 + 左侧角标；打开行为由浏览器层守卫拦截 |
| 8 | `ViewOptionsMenu` | items 末尾增分隔线 + 「显示归档」条目（id `show-archived`），选中态经 `selectedIds` 复选表达（Menu 无独立 toggle 条目类型） |
| 9 | `WorkspaceBrowser` | 读 `showArchived`；`guardedOpen`（归档点击 → Toast「已归档，取消归档后可继续对话」，不打开）；新增 deleteSession 确认对话框状态机（复用 workspace 删除模式：target + 防重复提交 + 失败保持打开 + 危险按钮样式 `deleteAction`）；Toast 渲染；向 SessionTree/FlatList/SearchResults/ViewOptionsMenu 透传新 props |
| 10 | locale | zh/en 新增：`viewOptions.showArchived`、`menu.unarchive`、`menu.deleteSession`、`archived.badge`、`archived.notOpenable`、`deleteSession.title`、`deleteSession.desc`、`deleteSession.pending` |
| 11 | `apply` | inject 增 `remote`、`typert`；apply 改为 async：先 `ctx.remote.$mount(ARCHIVE_MANAGER_REMOTE)`，再注册 slots；返回 disposer 负责卸载 contribution。注入 actions 增 `unarchiveSession`/`deleteSession`（经 `ctx.get("remote.workspaceRegistry")` 显式读取——`ctx.remote.workspaceRegistry` 属性链需要把该服务名声明进 inject，而本 fiber 自己执行 `$mount`，声明即死锁；服务缺失时抛友好错误，错误消息与现有 `archiveSession` 同构） |
| 12 | 尾部 | 增 `exports.__test`（纯派生函数测试面，运行时无副作用） |

## 为什么走 typert Remote 而不是扩展 /api/workspace.*

- 官方 `dsh-host-apiproxy` 的 `UNARY_ROUTES`/schema 表是静态的，未知方法名直接 500；
  浏览器 API client 也是固定方法表。
- `dsh-api-gateway`（`typert-gateway` 行）在 `/api` 上按 claim 拦截：host 侧对带
  `typertRemote` 绑定的 Service 做 SRC 反射，自动导出其 `@Remote` 方法为
  `<namespace>/<method>` 端点。`@gamegeek-saikel/dsh-archive-manager/workspace` 在
  `ArchiveWorkspaceRegistry` 上挂 binding + 两个 Remote 标记，浏览器经
  `connection.rpc.call("/api", "workspaceRegistry/…", {args}, signal)` 直达，
  旧 `workspace.*` 路由不受影响（本 fork 测试中已验证 claim 分流）。
