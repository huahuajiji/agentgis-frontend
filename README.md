# AgentGIS V9.3 Vue Layout

AgentGIS 是一个基于 Vue 3 的 GIS 地图文档工作台。它探索一件事：地图画布、图层/文档管理、要素检查、操作历史、人机协同审核，怎样被组织进一个足够清晰、可继续扩展的产品界面里。

这个仓库是 AgentGIS 的前端：没有内置任何地图 API Key，底图使用 BYOK（用户自带高德 Key）。后端仓库独立（`agentgis-backend`），接入前数据保存在浏览器 localStorage。

## 当前状态（2026-11-18）

项目正在按「收缩到一条完整业务线」的方向复活：**建文档 → 建图层 → 画要素 → 编辑属性 → 保存 → 重新打开还在**，加上后端空间分析。

前端已完成收敛：

- 导航三个区：**地图 / 项目 / 数据**（另有账户弹窗，是 BYOK 配置入口）
- 左侧工作区只有三个真实面板：项目列表、图片资源、GeoJSON 导入 / 导出
- 右侧检查器两个页签：要素（图层树 + 属性）、操作（撤销/重做/待同步池）
- 所有占位面板与探索性 demo 已删除，界面没有无响应的按钮
- 路由使用 hash 模式（静态托管刷新兼容）

## 架构亮点

项目最核心的设计是**操作溯源（Operation-based Architecture）**：每次对地图文档的修改——创建图层、添加要素、重命名、删除、导入 GeoJSON——都会生成一个带类型的 `MapOperation` 对象。这带来了三个关键能力：

- **完整撤销/重做**：`workingOperations` 与 `redoOperations` 双栈，每一步操作都可回退、可重放。
- **待同步池（commit 池）**：未提交操作压缩后可提交进池，作为「尚未同步到后端」的队列；上传成功后清空，撤销可跨池边界。
- **外部操作追踪**：AI 或外部系统的操作作为 `ExternalMapOperationRecord` 进入系统，可与内部操作历史匹配审计（管道已就绪，尚未接入 LLM）。

这些 `MapOperation` 通过 Zod discriminatedUnion 在运行时校验，涵盖 7 种操作类型（layer.create、layer.update、layer.delete、feature.create、feature.update、feature.delete、geojson.import），类型安全保障贯穿整个数据流。

## 包含内容

- Vue 3.5 + TypeScript 5.7 + Vite 6 应用骨架。
- 桌面端工作台：垂直导航 + 可折叠侧栏 + 地图工作区 + 检查器 + 账户弹窗。
- 移动端工作台：地图、项目、数据、我的四个 tab（与桌面端共用同一套状态）。
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

测试位于 `src/shared/mapDocument/__tests__/`，覆盖撤销/重做、操作压缩、GeoJSON 收发三个核心纯函数模块。

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

## 移动端

视口宽度 ≤ 1039px 时切换为移动工作台，四个 tab：

- **地图**：实时地图、当前文档摘要、保存、模式/工具控制、绘制/编辑。
- **项目**：已保存地图列表、图片资源。
- **数据**：图层、GeoJSON、操作历史。
- **我的**：当前地图统计和账户/BYOK 设置入口。

移动端与桌面端共用同一套文档状态与地图集成。绘制与几何编辑需要选中正式图层并配置有效的高德凭据。

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
    │   ├── mobile/       移动端 shell 与底部导航
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
| 3 | FastAPI 后端：文档持久化 + 空间分析（buffer / overlay） | 计划 |
| 4 | 部署：前端静态托管 + 后端容器 | 计划 |
| 5 | 演示数据与作品集截图 | 计划 |
| 6 | （可选）自然语言 → MapOperation 的 AI 接入 | 计划 |

## 当前限制

- 仅 localStorage 持久化（后端接入后替换）。
- 自动化测试目前只覆盖 `shared/mapDocument/` 的三个核心模块（46 个用例），组件层尚未测试。
- 高德底图需要用户自己的 Key。
- 无 LICENSE（公开部署前补充）。

## 技术栈

- Vue 3.5 · TypeScript 5.7 · Vite 6
- Pinia 3 · Vue Router 4（hash）
- Zod 4
- @amap/amap-jsapi-loader
