# 架构说明

> 更新于 2026-11-18，对应前端收敛后的代码状态。

## 项目目标

这个项目是地图文档编辑器的前端。它的目标是先把「文档 → 图层 → 要素 → 编辑 → 保存」这条业务线在单机状态下走通、走清楚，再把持久化换成后端服务。当前阶段不包含后端，也不接 LLM。

## 应用结构

应用围绕 Vue Router（**hash 模式**）组织：

- `src/App.vue`：渲染当前路由。
- `src/router.ts`：三条导航路由（`/map`、`/project`、`/data`），全部映射到同一个 `AppLayout`，通过 `meta.section` 区分当前区。
- `src/layouts/AppLayout.vue`：同时挂载桌面端和移动端 shell，由 CSS 媒体查询（1039px）决定显示哪一个。
- `src/components/DesktopShell.vue`：桌面端工作台组合（左栏 + 工作区 + 检查器）。
- `src/components/mobile/MobileShell.vue`：移动端四 tab 工作台。

桌面端多面板同时展示：左侧工作区、中间地图、右侧检查器。移动端把同一套任务拆成四个 tab：地图、项目、数据、我的。两端共用同一套 Pinia store 和地图文档模型。

### 前端收敛后的界面构成

| 位置 | 内容 |
|---|---|
| 垂直导航（76px） | 地图 / 项目 / 数据 + 账户（BYOK 弹窗入口） |
| 左侧工作区侧栏（320px，可折叠） | 项目列表、图片资源（项目区）；GeoJSON 导入 / 导出（数据区）；地图区显示空态说明 |
| 中间地图工作区 | 命令栏（浏览/编辑/分析、选择/绘制/导入、导出、保存）+ 高德画布 |
| 右侧检查器（340px，可折叠） | 要素（图层树 + 属性表）、操作（撤销/重做/提交历史） |

历史遗留的占位面板（AI 对话、执行预览、数据源、导入队列、设置等）已从导航与组件中移除。

## 状态管理

状态由 Pinia 管理，store 只做**编排**，计算逻辑全部下沉到纯函数模块：

- `src/stores/mapDocumentStore.ts`（约 1060 行）
  - 当前草稿 / 已保存地图、活动文档切换
  - 图层和要素动作（创建、重命名、删除、可见性、排序、属性/几何更新）
  - 地图视口
  - 本地操作历史、撤销/重做双栈
  - 外部操作记录与匹配
  - GeoJSON 导入 / 导出
  - 提交（commit）管理

- `src/stores/settingsStore.ts`
  - BYOK 开关、高德底图凭据、LLM 占位配置

所有状态都是浏览器本地状态（localStorage），没有服务端同步。

## 地图文档模型

核心 schema 位于 `src/schemas/mapDocumentSchema.ts`，使用 Zod 做运行时校验，是全项目的单一真相源。模型包含：

- workspace、草稿地图、已保存地图
- 图层（正式 / 参考两种 role）与图层图片资源
- 基于 GeoJSON 的要素
- 当前选中的图层 / 要素
- 编辑状态：本地操作、撤销/重做栈、本地提交、外部操作审核记录
- 7 种 `MapOperation`（discriminatedUnion）：layer.create / layer.update / layer.delete、feature.create / feature.update / feature.delete、geojson.import

文档变更的具体逻辑拆在 `src/shared/mapDocument/` 的 14 个模块中：

| 模块 | 职责 |
|---|---|
| mapDocumentMutations | 图层/要素的常规变更 |
| mapDocumentDeletion | 删除图层（含级联要素） |
| mapDocumentGeoJson | GeoJSON 导入/导出 |
| mapDocumentUndoRedo | 撤销/重做双栈的搬运 |
| mapDocumentOperationApply | 操作的应用与回滚 |
| mapDocumentEditOperations | 操作压缩（连续更新合并） |
| mapDocumentCollection | 文档集合（新建/重命名/删除地图） |
| mapDocumentPersistence | localStorage 持久化 |
| mapDocumentMigration | 旧数据迁移 |
| mapDocumentDraftValidation | 草稿要素目标校验 |
| mapDocumentEditValidation | 操作/提交/外部记录校验 |
| mapDocumentValidation | 文档结构校验 |
| mapDocumentExternalOperations | 外部操作匹配与应用 |
| mapDocumentConstants | 常量 |

## 地图集成

高德地图集成被隔离在几个模块里：

- `src/shared/amap/amapLoader.ts`：SDK 动态加载与类型声明
- `src/shared/amap/amapDrawingSession.ts`：绘制状态机（点/线/面）
- `src/shared/amap/amapEditSession.ts`：几何编辑会话（拖拽节点）
- `src/shared/amap/amapDraftGeometry.ts`：草稿几何转换
- `src/shared/map/amapFeatureAdapter.ts`：Store ↔ 覆盖物双向绑定
- `src/components/AmapBaseMap.vue`：画布容器，编排以上模块

应用只有在开启 BYOK 且 JS API Key / Security Code 都存在时，才会尝试加载高德底图；否则地图区显示提示。

## 几何编辑目标

`src/shared/map/useGeometryEditTarget.ts` 根据当前地图模式、工具和选中要素计算几何编辑目标，桌面端与移动端复用同一套判断。

## 外部操作（为 AI 预留）

项目把外部操作建模成结构化记录，可与本地操作历史匹配。这为将来接入 AI 或后端留出接口：外部建议先表示为 typed map operation，再决定是否应用到当前地图。

当前这仍然只是本地前端模型。项目不调用 LLM，也没有后端执行链路。

## 边界

已经包含：

- 本地状态模型与地图文档编辑
- 撤销/重做、提交历史、外部操作审核记录
- 高德地图绘制 / 编辑集成（BYOK）
- GeoJSON 导入 / 导出
- 桌面端工作台 UI（三区导航 + 三面板 + 两页签检查器）
- 移动端地图 / 项目 / 数据 / 账户工作流

暂未包含（按路线图逐项补充）：

- 后端持久化与服务端空间分析（阶段 3）
- 自动化测试（阶段 2）
- 部署与 CI（阶段 4）
- 用户登录、多人协作
- 生产级密钥存储
- AI 接入（可选，最后）
