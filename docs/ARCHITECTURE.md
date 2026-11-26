# 架构说明

> 更新于 2026-11-18，对应前端收敛后的代码状态。

## 项目目标

这个项目是地图文档编辑器的前端。它的目标是先把「文档 → 图层 → 要素 → 编辑 → 保存」这条业务线在单机状态下走通、走清楚，再把持久化换成后端服务。当前阶段不包含后端，也不接 LLM。

## 应用结构

应用围绕 Vue Router（**hash 模式**）组织：

- `src/App.vue`：渲染当前路由。
- `src/router.ts`：三条导航路由（`/map`、`/project`、`/data`），全部映射到同一个 `AppLayout`，通过 `meta.section` 区分当前区。
- `src/layouts/AppLayout.vue`：挂载桌面端 shell（移动端已于 2026-11-20 移除）。
- `src/components/shell/DesktopShell.vue`：桌面端工作台组合（左栏 + 工作区 + 检查器）。

左侧工作区、中间地图、右侧检查器同时展示。

### 前端收敛后的界面构成

| 位置 | 内容 |
|---|---|
| 垂直导航（76px） | 地图 / 项目 / 数据 + 账户（BYOK 弹窗入口） |
| 左侧工作区侧栏（320px，可折叠） | 项目列表、图片资源（项目区）；GeoJSON 导入 / 导出（数据区）；地图区显示空态说明 |
| 中间地图工作区 | 命令栏（浏览/编辑/分析、选择/绘制/导入、导出、保存）+ 高德画布 |
| 右侧检查器（340px，可折叠） | 要素（图层树；图层头「⋯」设置）、操作（撤销/重做/待同步池 + 拉取/上传按钮） |
| 地图浮动属性表 | 展开图层时弹出；主表公共字段，点行左侧看私有字段 |

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

所有状态都是浏览器本地状态（2a 起为 IndexedDB，旧 localStorage 数据启动时自动迁移）。2b 起可选手动同步到 FastAPI 后端：两个显式动作（从云端拉取 / 同步到云端），无自动上传、无轮询。

## 地图文档模型

核心 schema 位于 `src/schemas/mapDocumentSchema.ts`，使用 Zod 做运行时校验，是全项目的单一真相源。模型包含：

- workspace、草稿地图、已保存地图
- 图层（正式 / 参考两种 role）与图层图片资源
- 基于 GeoJSON 的要素
- 当前选中的图层 / 要素

**要素与属性的边界（容易误解，明确写下）**：

- 要素的唯一标识是 `MapFeature.id`（`feature-<uuid>`），它同时是 `document.features` 字典的 key 和图层 `featureIds` 的元素；**不依赖 properties 里的任何字段**。
- 几何类型读 `feature.geojson.geometry.type`；属性全部在 `feature.geojson.properties`。
- `properties` 是**自由字典，schema 不做键/类型约束**（`GeoJsonFeatureSchema` 是 `z.custom` 只校验它是合法 Feature）。不同要素可以有不同字段——属性表的"公共列"是运行时求交集，没有持久化的字段定义。
- `properties.name` 是显示名（允许重名）；导入时没有 name 才用要素 id 兜底。手绘命名走 `mapDocumentNaming`。
- 导入会写入两个内部记账字段：`agentgis_imported_feature_id`、`agentgis_layer_id`。
- 后端同步以**文档级 id**（`remoteId` ↔ 后端 `doc-xxxx`）对账；要素 id / properties 只是 payload 数据，后端不解析。
- 编辑状态：本地操作、撤销/重做栈、commit 池（待同步队列）、外部操作审核记录
- 7 种 `MapOperation`（discriminatedUnion）：layer.create / layer.update / layer.delete、feature.create / feature.update / feature.delete、geojson.import

文档变更与持久化/同步逻辑拆在 `src/shared/mapDocument/` 的 19 个模块中：

| 模块 | 职责 |
|---|---|
| mapDocumentMutations | 图层/要素的常规变更 |
| mapDocumentDeletion | 删除图层（含级联要素） |
| mapDocumentGeoJson | GeoJSON 导入/导出 |
| mapDocumentUndoRedo | 撤销/重做双栈的搬运 |
| mapDocumentOperationApply | 操作的应用与回滚 |
| mapDocumentEditOperations | 操作压缩（连续更新合并） |
| mapDocumentCollection | 文档集合（新建/重命名/删除地图） |
| mapDocumentPersistence | 持久化编排：IndexedDB 读写、串行写队列、启动加载与旧 localStorage 迁移 |
| mapDocumentRemote | 后端 HTTP 客户端：五个 CRUD 端点 + /health，超时与错误归一化 |
| mapDocumentSync | 同步纯函数：上传 payload 剥离、后端→本地转换、拉取计划、错误翻译 |
| mapDocumentNaming | 手绘要素自动命名（点_1/线_1/面_1，图层+类型计数） |
| mapDocumentAttributeTable | 属性表纯函数：公共字段交集列、私有属性拆分、单元格解析 |
| mapDocumentIdb | IndexedDB 存储层（`idb` 库）：文档按 id 分条 + 草稿 + 元数据，增量写入 |
| mapDocumentMigration | 旧数据迁移 |
| mapDocumentCrs | 坐标系方案 B：旧文档 GCJ-02 → WGS-84 一次性转换（幂等） |
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
- `src/components/map/AmapBaseMap.vue`：画布容器，编排以上模块

应用只有在开启 BYOK 且 JS API Key / Security Code 都存在时，才会尝试加载高德底图；否则地图区显示提示。

### 坐标系（方案 B）

文档几何与 viewport **一律存 WGS-84**；GCJ-02 只存在于高德 SDK 边界，共四处，全用 `src/shared/geo/coordTransform.ts` 的纯函数转换：

| 边界 | 方向 |
|---|---|
| 绘制取点（`amapDraftGeometry.toPosition`） | GCJ → WGS |
| 要素渲染（`amapFeatureAdapter`）、编辑覆盖物（`amapEditSession`） | WGS → GCJ |
| viewport 读写（`AmapBaseMap` 的 getCenter/getBounds/setZoomAndCenter） | 双向 |

文档带 `crs: 'wgs84'` 标记（可选字段）；无标记即方案 B 之前的旧数据，`mapDocumentMigration` 在加载时一次性把几何 + viewport 转成 WGS 并补上标记，过程幂等（二次 normalize 不再转换）。中国大陆境外不加偏，直通。`gcj02ToWgs84` 用"镜像初值 + 两次迭代"，往返误差压到 1e-9° 量级。

## 几何编辑目标

`src/shared/map/useGeometryEditTarget.ts` 根据当前地图模式、工具和选中要素计算几何编辑目标。

## 外部操作（为 AI 预留）

项目把外部操作建模成结构化记录，可与本地操作历史匹配。这为将来接入 AI 或后端留出接口：外部建议先表示为 typed map operation，再决定是否应用到当前地图。

当前这仍然只是本地前端模型。项目不调用 LLM，也没有后端执行链路。

## 边界

已经包含：

- 本地状态模型与地图文档编辑
- 撤销/重做（只作用于未提交操作）、commit 池（打包后不可撤销）、外部操作审核记录
- 高德地图绘制 / 编辑集成（BYOK）
- GeoJSON 导入 / 导出
- 桌面端工作台 UI（三区导航 + 三面板 + 两页签检查器）
- `shared/mapDocument/` 核心模块的 Vitest 单测（撤销重做、操作压缩、GeoJSON 收发）

暂未包含（按路线图逐项补充）：

- 后端持久化与服务端空间分析（阶段 3）
- 组件层测试与 CI（后续阶段）
- 部署与 CI（阶段 4）
- 用户登录、多人协作
- 生产级密钥存储
- AI 接入（可选，最后）
