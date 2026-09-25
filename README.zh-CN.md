<h1 align="center">DSH Archive Manager（会话彻底删除）</h1>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;·&nbsp;
  <strong>简体中文</strong>
</p>

**DSH Archive Manager** 为 DeepSeek Harness（DSH）Web GUI 增加**彻底删除会话**能力：转录目录、workspace 记账、归档/置顶标记、投影缓存行、派生的子代理会话与 spill 数据一并清除，侧边栏实时更新。

自 DSH 0.1.7 起，归档能力已由框架自身提供——`WorkspaceRegistry.archiveSession` / `unarchiveSession`、归档筛选（隐藏 / 显示 / 仅归档）、归档行样式、置顶、会话活动门禁。因此本插件**不再 fork 或替换任何浏览器表面**：官方 `ui-workspace` 行保持组合中的原位，插件只向官方侧边栏贡献一个行菜单动作及其确认对话框。

- Host 半区（内部 `dsh-archive-manager-workspace` / `dsh-archive-manager-projcache`）：`WorkspaceRegistry` 与 `SessionProjectionCache` 子类，新增 `deleteSession` 与 `delete(id)` / `whenIdle()`，以 Typert Remote 端点暴露。
- Client 半区（内部 `dsh-archive-manager-client`）：小型浏览器 bundle，注册 `sidebar.workspaces.session.menu.item`（危险样式「删除会话」行）与 frame 级 `shell.overlay` 确认对话框，内置简体中文与英文。

插件以**单个 npm 包**（`@gamegeek-saikel/dsh-archive-manager`）交付，三个实现作为包内子模块。根 `cordis.patch.yml` 只替换它需要扩展的两个 host 行并插入自己的行。**官方包文件零改动。**

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

通过 DSH CLI 安装单个 npm 包，它会应用包内根 `cordis.patch.yml`（禁用官方 `workspace`、`session-projection-cache` 两行；插入 `workspace-archive-manager`、`session-projection-cache-archive-manager`、`ui-workspace-archive-manager`）。官方 `ui-workspace` 行保持启用。

## 概述

在 DSH 中删除一个会话会牵涉多个相互独立的存储，顺序稍有差池就会留下残留或复活数据——而官方 UI 有意不做删除入口：live 会话必须先 flush 再 detach（否则浏览器会留着一个指向已消失会话的输入区），投影缓存又会在 dispose 时写最后一次 checkpoint，删得太早就会把缓存行写回来。

**Archive Manager** 用一层小而严谨的实现解决：

- **一条串行化删除流程**——`deleteSession` 在注册表操作队列内按严格顺序执行：flush → detach（`session/disposed`）→ 等待投影缓存 dispose 写回落盘（`whenIdle`）→ 删除转录目录 → 清除归档与置顶标记 → 移除 workspace 记账 → 删除缓存行 → best-effort 子代理级联与 spill 清理。每个失败步骤都幂等、可重跑，重试即可自愈半删除状态。
- **不重复官方 UI**——归档会话、其筛选、样式与取消归档完全由官方 `ui-workspace` 表面负责；本插件只补上 DSH 尚未提供的那一个动作。

## 关键性质

| 性质 | 值 |
|---|---|
| 范围 | 会话彻底删除（动作 + 二次确认 + host 流程） |
| 交付 | 单个 npm 包；官方包零改动；web profile patch 层（`cordis.patch.yml`） |
| 安装 / 回滚 | `npx @deepseek-ai/dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager` / `... remove ...` |
| 远程 API | Typert 端点 `workspaceRegistry/deleteSession`；旧 `/api/workspace.*` 路由不受影响 |
| 继承 | 归档 / 取消归档 / 置顶 / 活动门禁均为官方 `WorkspaceRegistry` 原方法，未做任何覆写 |
| 删除语义 | 彻底删除；live 会话 flush → detach → `session/disposed`；缓存写回先于行删除；子代理级联（仅 `origin: "subagent"`——fork 分支绝不级联） |
| UI 表面 | 一个 `sidebar.workspaces.session.menu.item` 行 + 一个 `shell.overlay` 对话框 |
| 本地化 | 简体中文（键源）+ 英文 |
| 测试 | 3 个 `node:test` 套件共 19 个用例（host、client bundle、client remote） |

## 用法

安装并重启后：

| 表面 | 说明 |
|---|---|
| 会话行菜单 | 危险样式的「删除会话」行，与官方 置顶/重命名/分叉/归档 行以分隔线隔开（order 500） |
| 删除对话框 | body portal 的二次确认：说明清除范围、fork 分支例外、处理中状态；失败时保持打开并显示 host 的错误信息 |
| 删除当前打开的会话 | 输入区置灰、行消失、界面不崩溃 |
| 归档会话 | 行为不变：官方筛选（隐藏 / 显示 / 仅归档）、样式、守卫、取消归档仍由其负责 |

### 重启验证清单

1. 会话行的「...」菜单在官方各行**之后**出现「删除会话」，并以分隔线隔开。
2. 确认后该会话从列表消失，且磁盘无残留：
   - `~/.dsh\sessions\…\session-<id>\` 目录不存在；
   - `~/.dsh\storages\workspace.json` 的 `global.archivedSessionIds`、`global.pinnedSessionIds` 与所有 workspace 的 `sessionIds` 均无该 id；
   - `~/.dsh\storages\session_projcache.json` 的 `tables.sessions` 无该 id。
3. 取消则一切不变。
4. 删除当前打开的会话：输入区置灰、行消失、界面不崩溃。
5. 带子代理子会话的会话会随之一并删除；同一会话的 **fork 分支**保留。
6. 官方归档流程仍正常：隐藏 / 显示 / 仅归档筛选、归档行样式、归档点击守卫、取消归档、置顶 / 取消置顶。
7. 中英文文案均正常（浏览器语言切换后重载页面验证）。

## 工作原理

### Host 半区——workspace（`dsh-archive-manager-workspace`）

`ArchiveWorkspaceRegistry extends WorkspaceRegistry`（服务名仍为 `workspaceRegistry`，记账不变量一致，官方方法全部继承），仅新增一个方法：

- `deleteSession(sessionId)`——上文概述的串行化彻底删除：校验 → flush → detach/`session/disposed` → `whenIdle` → 删转录目录 → 清归档/置顶标记 → 移除 workspace 记账 → 删缓存行 → best-effort 级联/spill 清理。

`unarchiveSession`、`archiveSession`、`pinSession`、`unpinSession`、`stopSessionActivity` 均使用官方实现，**刻意不覆写**。

该方法通过服务的 `typertRemote` binding + `Remote` 标记导出为 Typert Remote 端点。浏览器经标准 typert gateway 路径直达，旧 `/api/workspace.*` gateway 保持不动。

### Host 半区——投影缓存（`dsh-archive-manager-projcache`）

`ArchiveProjectionCache extends SessionProjectionCache`（服务名仍为 `sessionProjectionCache`、同一 `session_projcache` 域、沿用同一 fail-soft 写路径），新增：

- `delete(id)`——永久删除某会话的投影缓存行（`table.delete`）。
- `whenIdle()`——等待所有在途 fail-soft checkpoint 写完成。会话 dispose 会触发最后一次写回（`flushSoft(session, "detach")`）；删除流程必须等它落盘**之后**再删行，否则该行会在删除后被写回复活缓存条目。

### Client 半区（`dsh-archive-manager-client`）

一个手写的自注册 bundle（`window.__ModuleLoader__.load({ id, factory })`），只依赖 shell 平台种子表（`react`、`@deepseek-ai/dsh-client-ui-primitives`）。它贡献：

- `sidebar.workspaces.session.menu.item`——一个 `MenuItemButton`（`danger`、`separatorBefore`、order 500），点击后关闭菜单并抛出删除请求；
- `shell.overlay`——frame 级 `Modal` 确认框，因此对话框的生命周期长于打开它的菜单行；
- `ARCHIVE_MANAGER_REMOTE`——`workspaceRegistry/deleteSession` 描述符，strict codec 遵循 0.1.7 生成契约 `{ mode: 'strict', typeSymbol, create() }`，并用无依赖 shim 实现（bundle 内不引入第二份 zod）。

`apply` fiber 为 async：先 `$mount` Remote contribution 再注册 slots，随后用 `ctx.get("remote.workspaceRegistry")` 显式读取（若把 `remote.workspaceRegistry` 声明进 inject，会与同一 fiber 自身的 `$mount` 死锁）。

## 项目结构

```
dsh-archive-manager/
  package.json                    # 单个 npm 包 @gamegeek-saikel/dsh-archive-manager
  lib/index.js                    # 根 Host 入口（空 apply；浏览器端经 dsh.client）
  cordis.patch.yml                # DSH bundle patch（替换两个被扩展的 host 行）
  scripts/check-package.mjs       # 发布预检（pnpm build）
  README.md / README.zh-CN.md     # 双语文档
  test/                           # node:test 套件（19 个用例）
    host.test.mjs                 # Registry + projcache 行为、typert gateway E2E
    client.test.mjs               # Client bundle 表面 + Remote 描述符 + store
    client-remote.test.mjs        # Client Remote $mount / ctx.get 集成
  dsh-archive-manager-workspace/  # 内部：WorkspaceRegistry 子类 + Remote 方法
    lib/index.js
  dsh-archive-manager-projcache/  # 内部：SessionProjectionCache 子类（delete/whenIdle）
    lib/index.js
  dsh-archive-manager-client/     # 内部：删除 UI bundle
    lib/index.js                  #   Host 插件体（空 apply）
    lib/client.js                 #   浏览器 bundle
    PATCHES.md                    #   扩展说明
```

## 开发

无编译步骤——包为纯 ESM。`pnpm build` 运行轻量发布预检（`scripts/check-package.mjs`），校验单包结构。

自测通过测试树的 `node_modules` junction 解析真实 `@deepseek-ai` 包（指向 `%USERPROFILE%\.dsh\profiles\node_modules` 扁平 fallback，与运行时同源、无重复模块实例）。缺失时创建一次：

```powershell
New-Item -ItemType Junction -Path .\node_modules -Target "$env:USERPROFILE\.dsh\profiles\node_modules"
pnpm build    # 发布预检
pnpm test     # node:test 套件
```

覆盖范围：官方归档/取消归档/置顶行为的继承、delete 幂等性与未知 id 报错、记账与归档/置顶标记清理、转录目录删除、live 会话 flush → detach → `session/disposed`、`whenIdle` 先于缓存行删除、子会话级联（仅 `origin: "subagent"`——带 `parentSession` 的 fork 分支绝不级联删除）、原 API 面完好、projcache delete/whenIdle 时序、typert gateway 的 claim 与分发端到端、client bundle 的 Remote 描述符与 store，以及对官方 registry/gateway bundle 的真实 `$mount` + `connection.rpc.call` 集成。

## 文档

- [`dsh-archive-manager-client/PATCHES.md`](dsh-archive-manager-client/PATCHES.md) —— client bundle 贡献了什么，以及为何走 Typert Remote 而非扩展 `/api/workspace.*`
- [`README.md`](README.md) — English version

## 许可证

本仓库（源码、测试、README 与 DSH 插件 bundle 形态）以 **MIT License** 授权——见 [`LICENSE`](LICENSE)。

Copyright (c) 2026 Saikel-Orado-Liu aka GameGeek-Saikel
