# AgentGIS — 产品背景文档

> v1.0 · 2026-06-16 · **2026-11-25 按收缩复活进度更新（2a/2b 完成）**
>
> 说明：本文保留产品定位、愿景和版本历史（第一至三节主要是背景）；第四至九节已按「V1 只走一条业务线」的当前决策重写。前端现状以 [README](./README.md) 为准，阶段总结存放在工作区根目录（不在本仓库内）。

---

## 目录

1. [产品概述](#1-产品概述)
2. [竞品分析](#2-竞品分析)
3. [目标用户与使用场景](#3-目标用户与使用场景)
4. [V1 产品架构](#4-v1-产品架构)
5. [前端工作台](#5-前端工作台)
6. [后端计划](#6-后端计划)
7. [核心技术决策](#7-核心技术决策)
8. [版本路线](#8-版本路线)
9. [已知限制与下一步](#9-已知限制与下一步)

---

## 1. 产品概述

AgentGIS 的目标形态是一款 **AI 驱动的地理空间工作台**——用中文描述想做的事，系统自动在地图上执行分析或编辑。

| 部分 | 技术栈 | 状态 |
|------|--------|------|
| **前端工作台** | Vue 3 + TypeScript + Pinia + 高德 AMap JSAPI 2.0 | ✅ 可用（已收敛） |
| **后端服务** | FastAPI + Shapely（文档持久化 + 空间分析） | ✅ 文档 CRUD；空间分析待第三刀 |
| **AI 接入** | LLM function calling → MapOperation | ⏳ 可选，最后做 |

**一句话：用对话操控地图，用操作记录一切。**（AI 部分是目标形态；V1 先交付人工作业 + 后端能力的完整闭环。）

---

## 2. 竞品分析

用户今天的体验是割裂的：在点评/小红书看评价 → 复制地址 → 打开高德看位置 → 自己整理。**信息分散，地理化靠手动。**

| 产品 | 能做 | 不能做 |
|------|------|--------|
| **高德/百度地图** | 搜索、路线规划 | 不懂语义查询，不能编辑地图 |
| **大众点评/美团** | 评价、团购 | 空间分析弱，不支持自定义地图 |
| **小红书** | 真实体验内容 | 不做地理可视化，内容无法沉淀为地图数据 |
| **Google My Maps** | 手动地图标记、图层 | 无 AI，全靠手操 |
| **ChatGPT + 地图插件** | 对话式地理查询 | 不支持图层编辑、要素管理、操作审计 |

AgentGIS 的定位：**完整地图编辑 + 每步操作可审计 +（最终）自然语言操控 + 人机协同**。

---

## 3. 目标用户与使用场景

### 用户

- **普通用户**：快速了解一个地点周边怎么样，不想在多个 App 间跳转
- **地图数据维护者**：发现/核验/补充 POI 数据，需要批量操作和编辑历史

### 核心场景（目标形态）

**场景一：周边分析**
> "南宁东站周边 2 公里生活方便吗？" → Agent 分析配套 → 地图标记所有 POI → 生成总结

**场景二：AI 标记 + 人审核**
> "青秀万达附近新店帮我标出来" → Agent 检索 → 自动创建图层、添加要素 → 用户在操作面板逐条审核

**场景三：人机协同编辑**
> 用户手动绘制多边形 → 对 AI 说"在这个区域内补充餐饮点位" → AI 生成候选 → 用户审核 → 操作历史完整可追溯

### V1 范围（已收缩）

**V1 只保证一条业务线**：建文档 → 建图层 → 画要素 → 编辑属性 → 保存进后端 → 换浏览器打开还在；另有后端空间分析（缓冲区、叠加）作为服务端能力的证明。

V1 不做：路线导航、下单支付、商家后台、全城搜索、AI 对话、账号体系。

---

## 4. V1 产品架构

```text
用户 (Vue 3 工作台，纯前端)
  │ 地图画布 · 检查器 · 操作历史 · 图层树 · GeoJSON 导入导出
  │ fetch
  ▼
后端服务 (FastAPI + Shapely)
  ├── /api/documents/*     文档持久化（payload = 前端 MapDocument JSON）
  └── /api/spatial/analysis  空间分析（单端点 + operation 分发，v1 两算子）
  ▼
数据层
  └── SQLite（documents 表：id / name / payload JSON / updatedAt）
```

设计原则：**存储的就是前端文档模型的 JSON**，后端不在 V1 重新建模；空间分析 4326 进、4326 出，内部 3857 平面计算（距离单位米）。

详细 API 契约见阶段规划文档（工作区 `参考项目/04-个人项目开发规范-简版.md` §5）。

### 前端数据模型

```
MapDocumentStore
├── activeDocument
│   ├── layers[] → features[] (GeoJSON Point/LineString/Polygon)
│   ├── viewport (center, zoom, bounds)
│   └── editState
│       ├── workingOperations[]  ← 可撤销
│       ├── redoOperations[]     ← 可重做
│       └── externalOperations[] ← 外部操作（AI 预留，V1 未接入）
├── documentsById
└── activeDocumentRef (draft | saved)
```

---

## 5. 前端工作台

**Vue 3.5 + TypeScript 5.7 + Vite 6 + Pinia 3 + Vue Router 4（hash）+ Zod 4 + 高德 AMap JSAPI 2.0**

### 布局（2026-11-17 收敛后）

- **左侧**：76px 垂直导航（**地图 / 项目 / 数据** + 账户）+ 320px 可折叠工作区侧栏
- **中央**：弹性地图画布（高德底图 + 图层叠加 + 绘制/编辑交互）
- **右侧**：340px 可折叠检查器（**要素 / 操作**两个页签）
- **顶部**：工作区标题 + 侧栏折叠按钮

### 面板清单（全部为真实现）

| 区 | 面板 |
|---|---|
| 项目 | 项目列表（MapDocumentList）、图片资源（LayerImageResourcesPanel） |
| 数据 | GeoJSON 导入 / 导出（GeoJsonTransferPanel） |
| 检查器 | 要素（LayerFeatureTree + FeaturePropertyTable）、操作（OperationHistoryPanel） |

收敛前存在但已删除的占位：AI 对话、执行预览、上下文、执行记录、操作历史（左栏版）、视图设置、地图工具、版本、数据源、引用数据、导入队列、接口配置、偏好设置。

### 操作式架构（核心设计）

所有地图变更——用户操作或（将来的）AI 输出——都建模为结构化 **MapOperation**，Zod discriminatedUnion 运行时校验：

```
layer.create / layer.update / layer.delete
feature.create / feature.update / feature.delete
geojson.import
```

来源标记：`user` / `ai` / `backend` / `file` / `system`。

关键能力：撤销/重做双栈（只作用于未提交操作，打包进池后不可撤销）、commit 池作为待同步队列（上传后清空）、外部操作 `ExternalMapOperationRecord`（`pending/applied/mismatch/failed`）、连续更新自动压缩合并。

### 高德地图

BYOK 模式：用户自带 Key + 安全密钥，localStorage 存储。`AmapFeatureAdapter` 双向绑定 Store ↔ 覆盖物；`AmapDrawingSession` 状态机驱动点/线/面绘制；`AmapEditSession` 支持拖拽节点编辑；视口自动同步。

### 已实现

创建/管理地图文档、图层 CRUD、点线面绘制编辑（需 BYOK）、GeoJSON 导入导出、撤销/重做、commit 池、外部操作记录模型、BYOK 配置。

---

## 6. 后端计划

> V9.1 / V10 的 LangGraph Agent 引擎是历史探索，**不在当前路线内**（它也是项目上一轮失控放弃的原因）。保留的教训写在 §7。

当前后端计划只有一个最小的 FastAPI 服务：

| 模块 | 内容 |
|---|---|
| 文档持久化 | `GET/PUT/POST/DELETE /api/documents`，SQLite 单表存前端文档 JSON |
| 空间分析 | `POST /api/spatial/analysis`，v1 两个算子：buffer（缓冲区）、overlay（交集/并集/差集），Shapely 计算 |
| 测试 | pytest，每个算子至少一组用例 |

将来若接入 AI，采取**薄接口**而非 Agent 框架：`/api/agent/run` 接收自然语言 → LLM function calling 产出 `MapOperation[]` → 前端走现有外部操作审核 → 用户确认后应用。

---

## 7. 核心技术决策

| 决策 | 理由 |
|------|------|
| 操作式架构 | 撤销/重做、历史审计、AI 操作追踪天然支持 |
| Zod discriminatedUnion | 7 种操作类型运行时严格校验 |
| 先补测试再动持久化 | localStorage → IndexedDB → HTTP 是高风险改造点，测试兜底 |
| 后端存前端 JSON，不重新建模 | 单表即可上线，避免接口层与模型层双维护 |
| 单端点 + operation 分发 | 前端一个函数，加算子不改接口（借 WebGIS-Dev 形状） |
| BYOK 地图 | 用户自带 Key，仓库不含凭据 |
| hash 路由 | GitHub Pages 等静态托管刷新兼容 |
| **V1 不接 LLM、不做 Agent 框架** | 上一轮崩盘原因就是范围失控；AI 是最后一块 |
| AI 走薄接口 + 既有审核管道 | `MapOperation.source: 'ai'` 与外部记录管道已存在，接入是加法不是重写 |

---

## 8. 版本路线

```text
V1 MVP → V2 Agent+RAG → V3 产品硬化 → V4 AMap BYOK   (历史路线)
  ↓          ↓               ↓              ↓
固定流程   LangGraph       评测+验收      真实地图API

V8 AI地图编辑器 → V9 LangGraph Lite → V9.3 Vue前端（本仓库，操作式架构+AMap；移动端于 2026-11-20 移除）
       │                 │                    │
       └─────────────────┴────────────────────┘
                         ↓
               V10 Planner Tool Agent（历史后端基线，已放弃）

──────────────────────────────────────────────────────
2026-11 起真人路线（收缩复活）：

阶段 1 前端收敛 ✅  →  阶段 2 单测  →  阶段 3 后端纵切（FastAPI + 空间分析）
  →  阶段 4 部署  →  阶段 5 演示素材  →  阶段 6 接入个人站（iframe）
  →  （可选）阶段 7 AI 薄接口
```

v5–v7、v9_2、v9_4、V10 均为历史探索；本仓库只保留 V9.3 前端，并按 2026-11 的收缩路线推进。

---

## 9. 已知限制与下一步

### 前端

| 限制 | 状态 |
|------|------|
| 手动同步：需用户点「同步到云端」；未点则只在本地 | 自动同步属 V2，V1 刻意保持显式动作 |
| 自动化测试覆盖纯函数与适配层（98 用例），组件层未测 | 组件测试延后 |
| 无部署、无 CI | 阶段 4 |
| 移动端已移除（2026-11-20，专注桌面端） | 不再计划 |
| 无 LICENSE | 公开前补 |
| 无账号系统 | V1 不做 |

### 后端

`agentgis-backend` 仓库：FastAPI + SQLite 文档 CRUD 已完成（第一刀，14 例 pytest），空间分析待第三刀。

### 下一步

阶段 2（Vitest 单测）已完成。阶段 3 拆为：**2a 持久化层换 IndexedDB（✅ 2026-11-24）→ 2b 前端手动同步后端（✅ 2026-11-24）→ 属性表/命名优化（✅ 2026-11-25，98 例）→ 第三刀空间分析 buffer/overlay（待做，前置：坐标系方案 B + 拉取覆盖保护）**。阶段总结见工作区根目录的 `阶段总结-03-持久化与同步.md`。

---

## 附录：快速开始

**前端**

```powershell
cd C:\Users\32083\aigc\webgis\fristwebgis\agentgis-frontend
npm install && npm run dev
```

打开 `http://127.0.0.1:5173/#/map` → 左下角「账户」配置高德 Key（可选）→ 开始使用。

**后端（阶段 3，尚未开始）**：FastAPI + SQLite，独立仓库 `agentgis-backend`，接口契约见 §4。
