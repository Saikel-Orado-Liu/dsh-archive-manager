<h1 align="center">DSH Archive Manager（归档会话管理）</h1>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;·&nbsp;
  <strong>简体中文</strong>
</p>

**DSH Archive Manager** 是为 DeepSeek Harness（DSH）Web GUI 打造的归档会话管理插件——**「显示归档」视图开关**、**归档会话的样式与守卫**（红色标题、红色背景、「已归档」角标、不可打开）、**取消归档**，以及**彻底删除会话**（转录目录、workspace 记账、归档标记与投影缓存行全部清除；live 会话先 dispose，界面不崩）。

- Host 半区（内部 `dsh-archive-manager-workspace` / `dsh-archive-manager-projcache`）：`WorkspaceRegistry` 与 `SessionProjectionCache` 子类，新增 `unarchiveSession` / `deleteSession` 与 `delete(id)` / `whenIdle()`，并以 Typert Remote 端点暴露。
- Client 半区（内部 `dsh-archive-manager-client`）：fork 的 `dsh-client-ui-workspace` 浏览器 bundle——视图开关、归档行样式、守卫打开、行菜单、二次确认对话框与 Toast，内置简体中文与英文。

插件以**单个 npm 包**（`@gamegeek-saikel/dsh-archive-manager`）交付，三个实现作为包内子模块。根 `cordis.patch.yml` 禁用官方原行、插入 archive-manager 行。**官方包文件零改动。**

---

## 安装

### 已发布包（推荐）

```bash
npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager
```

然后启动 DSH Web：

```bash
npx @deepseek-ai/dsh web
```

> 如果已全局安装 DSH CLI，也可以用 `dsh` 代替 `npx @deepseek-ai/dsh`。

通过 DSH CLI 安装单个 npm 包，它会应用包内根 `cordis.patch.yml`（禁用官方 `workspace`、`session-projection-cache`、`ui-workspace` 三行；插入 `workspace-archive-manager`、`session-projection-cache-archive-manager`、`ui-workspace-archive-manager`）。

## 概述

DSH Web 内部维护着一个注册表全局的 `archivedSessionIds` 集合，但官方 UI 既无法在侧边栏看到归档会话、无法取消归档，也没有任何彻底删除会话的入口。简单地把归档会话从列表里藏掉会让它们在 GUI 里"不可恢复"；而删除一个会话会牵涉多个相互独立的存储（转录目录、workspace 记账、归档标记、投影缓存），顺序稍有差池就会留下残留或复活数据。

**Archive Manager** 用一层小而严谨的 patch 解决：

- **一个可见性开关**——`showArchived` 与分组/排序存放在同一持久化 store（`dsh.workspace.view.v5`），重启浏览器保持；旧偏好反序列化后按"关闭"处理，不破坏既有体验。
- **一条派生路径**——分组、单列表、搜索共用 `sessionVisible`，归档会话在所有界面天然一致地出现（或一致地隐藏）。
- **一条串行化删除流程**——`deleteSession` 在注册表操作队列内按严格顺序执行：flush → detach（`session/disposed`）→ 等待投影缓存 dispose 写回落盘（`whenIdle`）→ 删除转录目录 → 清除归档标记 → 移除 workspace 记账 → 删除缓存行 → best-effort 子代理级联与 spill 清理。每个失败步骤都幂等、可重跑，重试即可自愈半删除状态。

## 关键性质

| 性质 | 值 |
|---|---|
| 范围 | 显示归档开关、归档样式 + 守卫、取消归档、彻底删除 |
| 交付 | 单个 npm 包；官方包零改动；web profile patch 层（`cordis.patch.yml`） |
| 安装 / 回滚 | `npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager` / `... remove ...` |
| 远程 API | Typert SRC 端点 `workspaceRegistry/unarchiveSession`、`workspaceRegistry/deleteSession`；旧 `/api/workspace.*` 路由不受影响 |
| 删除语义 | 彻底删除；live 会话 flush → detach → `session/disposed`；缓存写回先于行删除；子代理级联（仅 `origin: "subagent"`——fork 分支绝不级联） |
| UI 表面 | 侧边栏会话/工作区浏览器 · 视图选项菜单 · 行菜单 · 二次确认对话框 · Toast |
| 本地化 | 简体中文（键源）+ 英文 |
| 测试 | 3 个 `node:test` 套件共 19 个用例（host、client bundle、client remote） |

## 用法

安装并重启后：

| 表面 | 说明 |
|---|---|
| 视图选项 | 新增「显示归档」条目（带分隔线），与分组/排序同 store 持久化 |
| 会话行 | 归档行：红色标题 + 红色背景 + 「已归档」角标（主题危险色 token 派生），点击被守卫并弹 Toast；行菜单 = [取消归档, 删除会话] |
| 搜索结果 | 归档结果同样红字处理；浏览器层守卫阻止打开 |
| 行菜单 | 普通会话新增危险样式「删除会话」；归档会话仅 [取消归档, 删除会话] |
| 删除对话框 | 二次确认（「将永久删除会话 … 此操作不可恢复」）、处理中状态、失败保持对话框打开 |
| 删除当前打开的会话 | 输入区置灰、行消失、界面不崩溃 |

### 重启验证清单

1. 视图选项 →「显示归档」：勾选/取消后，归档会话在其工作区分组中（含单列表、搜索）出现/消失。
2. 点击归档会话：不进入对话，Toast 提示「已归档，取消归档后可继续对话」，无法发送消息。
3. 归档会话行菜单仅含「取消归档」「删除会话」；取消归档后恢复普通样式、可打开，位置仍在其原工作区分组。
4. 普通会话行菜单含「删除会话」；确认后该会话从列表消失，且磁盘无残留：
   - `~/.dsh\sessions\…\session-<id>\` 目录不存在；
   - `~/.dsh\storages\workspace.json` 的 `global.archivedSessionIds` 与所有 workspace 的 `sessionIds` 无该 id；
   - `~/.dsh\storages\session_projcache.json` 的 `tables.sessions` 无该 id。
5. 删除当前打开的会话：输入区置灰、行消失、界面不崩溃。
6. 重命名/分叉/归档/拖拽排序/搜索/单列表/工作区增删改均正常。
7. 中英文文案均正常（浏览器语言切换后重载页面验证）。

## 工作原理

### Host 半区——workspace（`dsh-archive-manager-workspace`）

`ArchiveWorkspaceRegistry extends WorkspaceRegistry`（服务名仍为 `workspaceRegistry`，记账不变量一致），新增：

- `unarchiveSession(sessionId)`——把 id 从注册表全局 `archivedSessionIds` 集合移除。归档从不移动记账席位，因此取消归档后会话回到其原工作区位置。幂等；未知 id 与 `archiveSession` 同样拒绝。
- `deleteSession(sessionId)`——上文概述的串行化彻底删除：校验 → flush → detach/`session/disposed` → `whenIdle` → 删转录目录 → 清归档标记 → 移除 workspace 记账 → 删缓存行 → best-effort 级联/spill 清理。

两者通过服务的 `typertRemote` binding + `Remote` 标记导出为 Typert Remote 端点。浏览器经标准 typert gateway SRC 路径直达，旧 `/api/workspace.*` gateway 保持不动。

### Host 半区——投影缓存（`dsh-archive-manager-projcache`）

`ArchiveProjectionCache extends SessionProjectionCache`（服务名仍为 `sessionProjectionCache`，沿用同一 fail-soft 写路径），新增：

- `delete(id)`——永久删除某会话的投影缓存行（`table.delete`）。
- `whenIdle()`——等待所有在途 fail-soft checkpoint 写完成。会话 dispose 会触发最后一次写回（`flushSoft(session, "detach")`）；删除流程必须等它落盘**之后**再删行，否则该行会在删除后被写回复活缓存条目。

### Client 半区（`dsh-archive-manager-client`）

本包是对 `@deepseek-ai/dsh-client-ui-workspace` bundle 的**整体 fork**（官方包无可继承导出，故 `lib/client.js` 为自注册 bundle，整份复制后定点修补 12 处——详见 `dsh-archive-manager-client/PATCHES.md`）。要点：

- `createWorkspaceViewStore` 新增 `showArchived`（`setShowArchived` 强制布尔），与既有视图偏好同 store 家族；
- `sessionVisible` 增加第 4 参，`deriveGroups` / `deriveFlat` / `deriveSearchResults` 透传并为行对象打上 `archived` 标志；
- `ARCHIVE_MANAGER_REMOTE` 以无依赖的 strict-codec shim 挂载两个 Remote descriptor（bundle 内不引入第二份 zod）；
- `apply` fiber 为 async：先 `$mount` Remote contribution 再注册 slots，随后用 `ctx.get("remote.workspaceRegistry")` 显式读取（若把 `remote.workspaceRegistry` 声明进 inject，会与同一 fiber 自身的 `$mount` 死锁）。

## 项目结构

```
dsh-archive-manager/
  package.json                    # 单个 npm 包 @gamegeek-saikel/dsh-archive-manager
  lib/index.js                    # 根 Host 入口（空 apply；浏览器端经 dsh.client）
  cordis.patch.yml                # DSH bundle patch（禁用官方行、插入归档行）
  scripts/check-package.mjs       # 发布预检（pnpm build）
  README.md / README.zh-CN.md     # 双语文档
  test/                           # node:test 套件（19 个用例）
    host.test.mjs                 # Workspace + projcache 行为、typert gateway E2E
    client.test.mjs               # Fork bundle 派生函数 + 视图 store
    client-remote.test.mjs        # Client Remote $mount / ctx.get 集成
  dsh-archive-manager-workspace/  # 内部：WorkspaceRegistry 子类 + Remote 方法
    lib/index.js
  dsh-archive-manager-projcache/  # 内部：SessionProjectionCache 子类（delete/whenIdle）
    lib/index.js
  dsh-archive-manager-client/     # 内部：fork 的 ui-workspace bundle
    lib/index.js                  #   Host 插件体（空 apply）
    lib/client.js                 #   Fork 浏览器 bundle（PATCHES.md 列出 12 处修补）
    PATCHES.md                    #   Fork 修补说明
```

## 开发

无编译步骤——包为纯 ESM。`pnpm build` 运行轻量发布预检（`scripts/check-package.mjs`），校验单包结构。

自测通过测试树的 `node_modules` junction 解析真实 `@deepseek-ai` 包（指向 `%USERPROFILE%\.dsh\profiles\node_modules` 扁平 fallback，与运行时同源、无重复模块实例）。缺失时创建一次：

```powershell
New-Item -ItemType Junction -Path .\node_modules -Target "$env:USERPROFILE\.dsh\profiles\node_modules"
pnpm build    # 发布预检
npm test      # node:test 套件
```

覆盖范围：unarchive/delete 幂等性、未知 id 报错、记账与归档标记清理、转录目录删除、live 会话 flush → detach → `session/disposed`、`whenIdle` 先于缓存行删除、子会话级联（仅 `origin: "subagent"`——带 `parentSession` 的 fork 分支绝不级联删除）、原 API 面完好、projcache delete/whenIdle 时序、typert gateway 的 claim 与分发端到端、client bundle 真实加载后的派生行为。

## 文档

- [`dsh-archive-manager-client/PATCHES.md`](dsh-archive-manager-client/PATCHES.md) —— 12 处 fork 修补点，以及为何走 Typert Remote 而非扩展 `/api/workspace.*`
- [`README.md`](README.md) — English version

## 许可证

本仓库（源码、测试、README 与 DSH 插件 bundle 形态）以 **MIT License** 授权——见 [`LICENSE`](LICENSE)。

Copyright (c) 2026 Saikel-Orado-Liu aka GameGeek-Saikel
