# AgentGIS V9.3 Vue Layout

AgentGIS 是一个基于 Vue 3 的 GIS 地图文档工作台。它探索一件事：地图画布、图层/文档管理、要素检查、操作历史、人机协同审核，怎样被组织进一个足够清晰、可继续扩展的产品界面里。

这个仓库是 AgentGIS 的前端：没有内置任何地图 API Key，底图使用 BYOK（用户自带高德 Key）。后端仓库独立（`agentgis-backend`），接入前数据保存在浏览器 IndexedDB（旧 localStorage 数据首次启动时自动迁移）。

## 当前状态（2026-11-25）

项目正在按「收缩到一条完整业务线」的方向复活：**建文档 → 建图层 → 画要素 → 编辑属性 → 保存 → 重新打开还在**，加上后端空间分析。

前端已完成收敛，并已接上两条持久化链路（本地 IndexedDB + 手动后端同步）：

- 导航三个区：**地图 / 项目 / 数据**（另有账户弹窗，是 BYOK 配置入口）
- 左侧工作区只有三个真实面板：项目列表、图片资源、GeoJSON 导入 / 导出
- 右侧检查器两个页签：要素（图层树 + 属性表入口）、操作（撤销/重做/待同步池）
- 展开图层在地图上弹出可拖动属性表：主表只列公共字段，点行在左侧看/改私有字段
- 手绘要素自动命名（点_1 / 线_1 / 面_1）；导入要素优先用 name，否则用要素 id
- 所有占位面板与探索性 demo 已删除，界面没有无响应的按钮
- 路由使用 hash 模式（静态托管刷新兼容）

## 架构亮点

项目最核心的设计是**操作溯源（Operation-based Architecture）**：每次对地图文档的修改——创建图层、添加要素、重命名、删除、导入 GeoJSON——都会生成一个带类型的 `MapOperation` 对象。这带来了三个关键能力：

- **完整撤销/重做**：`workingOperations` 与 `redoOperations` 双栈，每一步操作都可回退、可重放。
- **待同步池（commit 池）**：未提交操作点「打包」压缩后进入待同步池，作为「尚未同步到后端」的队列；上传成功后清空。打包后不可撤销——撤销只作用于未提交操作。
- **外部操作追踪**：AI 或外部系统的操作作为 `ExternalMapOperationRecord` 进入系统，可与内部操作历史匹配审计（管道已就绪，尚未接入 LLM）。

这些 `MapOperation` 通过 Zod discriminatedUnion 在运行时校验，涵盖 7 种操作类型（layer.create、layer.update、layer.delete、feature.create、feature.update、feature.delete、geojson.import），类型安全保障贯穿整个数据流。

## 包含内容

- Vue 3.5 + TypeScript 5.7 + Vite 6 应用骨架。
- 桌面端工作台：垂直导航 + 可折叠侧栏 + 地图工作区 + 检查器 + 账户弹窗。
- Pinia 本地状态：地图文档状态、账户设置、BYOK 配置。
- 地图文档模型：图层、要素、已保存地图、草稿地图、commit 池（待同步）、撤销/重做、外部操作记录。
- GeoJSON 导入/导出。
- 可选的高德地图底图集成（BYOK：用户自己的 JS API Key 和 Security Code）。
- 点/线/面绘制与几何编辑（依赖高德 Key）。

## 快速开始

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址。默认入口跳到 `/#/map`。

构建检查：

```bash
npm run build
```

构建命令先执行 `vue-tsc --noEmit` 做类型检查，再执行 Vite 构建。

单元测试（Vitest）：

```bash
npm run test            # 运行全部测试
npm run typecheck:test  # 对测试文件做类型检查
```

测试位于 `src/shared/mapDocument/__tests__/`，共 9 个测试文件 98 例：撤销/重做、操作压缩、GeoJSON 收发、commit 池、IndexedDB 存储与迁移、后端客户端（mock fetch）、同步纯函数、要素命名与属性表。

## 地图 Key 配置

仓库不包含任何地图 API Key。要加载高德底图：

1. 点击左下角「账户」打开配置弹窗。
2. 开启 BYOK。
3. 填写高德 JS API Key 和 Security Code。
4. 保存。

配置保存在浏览器 localStorage（`agentgis:v9_3:settings`）。这是原型阶段的方案，不是生产级凭据管理。

## 路由

hash 模式，路径形如 `/#/map`：

- `/#/map`：地图工作区（默认）
- `/#/project`：项目区（地图文档列表、图片资源）
- `/#/data`：数据区（GeoJSON 导入 / 导出）
- `/`：重定向到 `/#/map`

## 目录结构（简）

```
.
├── index.html
├── package.json / vite.config.ts / tsconfig*.json
└── src/
    ├── components/
    │   ├── shell/        桌面外壳（导航栏、左栏、主区、顶栏按钮）
    │   ├── map/          地图工作区（画布、命令栏、模式/工具、绘制坞）
    │   ├── panels/       侧栏面板（项目列表、图片资源、GeoJSON 收发）
    │   ├── inspector/    检查器（两页签容器与搜索）
    │   ├── dialogs/      弹窗（账户、草稿保存）
    │   └── shared/       通用组件（对话框、图层树、操作历史…）
    ├── layouts/AppLayout.vue    同时挂载桌面与移动 shell
    ├── shared/
    │   ├── mapDocument/  文档模型的纯函数模块（14 个）+ __tests__
    │   ├── amap/         高德集成（加载、绘制会话、编辑会话）
    │   └── map/          要素适配器、几何编辑目标
    ├── schemas/mapDocumentSchema.ts   Zod 单一真相源
    ├── stores/           Pinia：mapDocumentStore、settingsStore
    ├── router.ts         hash 路由
    └── styles.css        全局样式（CSS 变量 + class 组织）

backend/                  后端（阶段 3 创建，见 backend/README.md）
```

## 文档

- 阶段总结存放在工作区根目录（`..\阶段总结-01-前端收敛.md`），不随代码仓库走
- [项目结构图](./docs/项目结构图.html)：可视化结构（浏览器打开）
- [使用说明](./docs/USAGE.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [项目评价](./docs/PROJECT_REVIEW.md)
- [产品背景文档](./PROJECT-OVERVIEW.md)：产品定位、愿景与路线（含历史版本说明）

## 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 前端收敛（删占位、三区导航、hash 路由） | ✅ 2026-11-17 |
| 2 | Vitest 单测：撤销重做、操作压缩、GeoJSON 收发 | ✅ 2026-11-18 |
| 2a | 持久化层 localStorage → IndexedDB（idb，含旧数据迁移） | ✅ 2026-11-24 |
| 2b | 前端手动同步后端（拉取 / 上传两个显式动作，remoteId） | ✅ 2026-11-24 |
| 2.5 | 打包语义重构（进池不可撤销）、要素命名、浮动属性表 | ✅ 2026-11-25 |
| 3 | 空间分析 buffer / overlay（**前置：坐标系方案 B 落地**） | 计划 |
| 4 | 部署：前端静态托管 + 后端容器 | 计划 |
| 5 | 演示数据与作品集截图 | 计划 |
| 6 | （可选）自然语言 → MapOperation 的 AI 接入 | 计划 |

## 当前限制

- 浏览器本地持久化（IndexedDB）+ **手动**后端同步：待同步池面板里有「从云端拉取 / 同步到云端」两个按钮，无自动上传。后端地址由 `VITE_API_BASE_URL` 配置（默认 `http://127.0.0.1:8000`）。
- 自动化测试目前只覆盖 `shared/mapDocument/` 的核心模块（98 个用例），组件层尚未测试。
- **坐标系尚未统一**：文档几何当前实际存 GCJ-02（高德原生坐标），导出 GeoJSON 名义 WGS-84 实际有偏移；已定方案 B（存 WGS-84、高德边界转换），第三刀开工前落地。
- 高德底图需要用户自己的 Key。
- 无 LICENSE（公开部署前补充）。

## 技术栈

- Vue 3.5 · TypeScript 5.7 · Vite 6
- Pinia 3 · Vue Router 4（hash）
- Zod 4
- @amap/amap-jsapi-loader
