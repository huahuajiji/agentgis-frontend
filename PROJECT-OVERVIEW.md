# AgentGIS — 产品文档

> v1.0 · 2026-06-16

---

## 目录

1. [产品概述](#1-产品概述)
2. [竞品分析](#2-竞品分析)
3. [目标用户与使用场景](#3-目标用户与使用场景)
4. [产品架构](#4-产品架构)
5. [前端工作台](#5-前端工作台)
6. [后端 Agent 引擎](#6-后端-agent-引擎)
7. [核心技术决策](#7-核心技术决策)
8. [版本路线](#8-版本路线)
9. [已知限制与下一步](#9-已知限制与下一步)

---

## 1. 产品概述

AgentGIS 是一款 **AI 驱动的地理空间工作台**——用中文描述想做的事，系统自动在地图上执行分析或编辑。

| 部分 | 技术栈 | 状态 |
|------|--------|------|
| **前端工作台** | Vue 3 + TypeScript + Pinia + 高德 AMap JSAPI 2.0 | ✅ 可运行 |
| **后端 Agent 引擎** | FastAPI + LangGraph + Python | ✅ 核心链路跑通 |

**一句话：用对话操控地图，用操作记录一切。**

区别于"地图 App"或"AI 聊天工具"——AgentGIS 让地图从只读变成 AI 可操控、人类可审核的编辑画布。

---

## 2. 竞品分析

用户今天的体验是割裂的：在点评/小红书看评价 → 复制地址 → 打开高德看位置 → 自己整理。**信息分散，地理化靠手动。**

| 产品 | 能做 | 不能做 |
|------|------|--------|
| **高德/百度地图** | 搜索、路线规划 | 不懂语义查询（"附近口碑变好的店"），不能编辑地图 |
| **大众点评/美团** | 评价、团购 | 空间分析弱，不支持自定义地图 |
| **小红书** | 真实体验内容 | 不做地理可视化，内容无法沉淀为地图数据 |
| **Google My Maps** | 手动地图标记、图层 | 无 AI，全靠手操 |
| **ChatGPT + 地图插件** | 对话式地理查询 | 不支持图层编辑、要素管理、操作审计 |

AgentGIS 的定位：**自然语言操控 + 完整地图编辑 + 每步操作可审计 + 人机协同**。

---

## 3. 目标用户与使用场景

### 用户

- **普通用户**：快速了解一个地点周边怎么样，不想在多个 App 间跳转
- **地图数据维护者**：发现/核验/补充 POI 数据，需要批量操作和编辑历史

### 核心场景

**场景一：周边分析**
> "南宁东站周边 2 公里生活方便吗？" → Agent 分析配套 → 地图标记所有 POI → 生成总结

**场景二：AI 标记 + 人审核**
> "青秀万达附近新店帮我标出来" → Agent 检索 → 自动创建图层、添加要素 → 用户在操作面板逐条审核：确认 4 个，移除 1 个

**场景三：人机协同编辑**
> 用户手动绘制多边形 → 对 AI 说"在这个区域内补充餐饮点位" → AI 生成 8 个候选 → 用户审核接受/修改/拒绝 → 操作历史完整可追溯

### V1 不做

路线导航、下单支付、商家后台、全城大规模搜索。

---

## 4. 产品架构

```text
用户 (Vue 3 工作台)
  │ 地图画布 · 检查器 · 操作历史面板 · 图层树 · GeoJSON 导入导出
  │ POST /api/agent/run
  ▼
Agent 引擎 (FastAPI + LangGraph)
  │ RootPlanner → ContextBroker → Workers (Analysis / MapEdit / Memory)
  │ MemoryManager · GeoRetrieval · Trace · Artifact
  ▼
数据层
  │ 高德 POI API · Mock 数据 · JSON 持久化 (Memory / Artifact / Trace)
```

一次 AI 分析的数据流：用户输入 → `POST /api/agent/run` → LangGraph 路由（classify_intent → geo_retrieval → workflow）→ RootPlanner 生成计划 → Worker 执行 → 返回 `{ plan, artifacts, operations[], trace }` → 前端渲染点位、应用 MapOperation、标记 AI 来源待审核。

### 前端数据模型

```
MapDocumentStore
├── activeDocument
│   ├── layers[] → features[] (GeoJSON Point/LineString/Polygon)
│   ├── viewport (center, zoom, bounds)
│   └── editState
│       ├── workingOperations[]  ← 可撤销
│       ├── redoOperations[]     ← 可重做
│       └── externalOperations[] ← AI 提议，待审核
├── savedDocuments[]
└── activeDocumentRef
```

---

## 5. 前端工作台

**Vue 3.5 + TypeScript 5.7 + Vite 6 + Pinia 3 + Vue Router 4 + Zod 4 + 高德 AMap JSAPI 2.0**

### 布局

- **左侧**：76px 垂直导航（地图/项目/数据/AI/历史/设置）+ 320px 可折叠工作区侧栏
- **中央**：弹性地图画布（高德底图 + 图层叠加 + 绘制/编辑交互）
- **右侧**：340px 可折叠检查器（属性/来源/操作三个标签）
- **底部**：命令栏（浏览/编辑/分析模式切换 + 工具选择 + 保存）

### 操作式架构（核心设计）

所有地图变更——用户点击或 AI 输出——都建模为结构化 **MapOperation**，Zod discriminatedUnion 运行时校验：

```
layer.create / layer.update / layer.delete
feature.create / feature.update / feature.delete
geojson.import
```

三个来源：`user`（手动）、`ai`（Agent 生成）、`external`（第三方导入）。

关键能力：撤销/重做双栈、提交历史含同步状态、AI 操作进入 `ExternalMapOperationRecord` 含 `pending/applied/mismatch/failed` 状态、连续更新自动压缩合并。

### 高德地图

BYOK 模式：用户自带 Key + 安全密钥，localStorage 存储。`AmapFeatureAdapter` 双向绑定 Store ↔ 覆盖物。`AmapDrawingSession` 状态机驱动点/线/面绘制。`AmapEditSession` 支持拖拽节点编辑。视口自动同步。

### 移动端

`MobileShell` 接入同一套工作流，底部四 Tab：地图（实时地图+绘制）、项目（文档列表）、数据（图层+GeoJSON+操作历史）、我的（设置）。

### 已实现

创建/管理地图文档、图层 CRUD、点线面绘制编辑、GeoJSON 导入导出、撤销/重做、操作历史查看、BYOK 配置。

---

## 6. 后端 Agent 引擎

**V9.1**：LangGraph 编排的固定 Graph——`classify_intent → geo_retrieval → workflow → persist → memory_compaction → final_response`。6 种意图：analysis / edit / import_amap / geo_lookup / memory / chat。

**V10**：三层 Agent 运行时。

- **RootPlanner**：接收 user_message + UI_context + MemoryIndex → 输出 RootPlan（LLM 规划，不可用时降级为确定性规则）
- **ContextBroker**：为每个 task 组装 TaskContextPackage（goal + map_brief + memory_chunks + constraints）
- **Workers**：MemoryWorker / AnalysisWorker（分析 artifact）/ MapEditWorker（MapOperation[] + map-change artifact）
- **Persistence**：Artifact / Trace / Memory 均通过 JSON store 持久化

统一入口 `POST /api/agent/run`，所有测试不依赖真实 LLM 凭据。

---

## 7. 核心技术决策

| 决策 | 理由 |
|------|------|
| 操作式架构 | 撤销/重做、历史审计、AI 操作追踪天然支持 |
| Zod discriminatedUnion | 7 种操作类型运行时严格校验 |
| LLM + deterministic fallback | 无 LLM 凭据也能跑测试 |
| BYOK 地图 | 用户自带 Key，避免配额纠纷 |
| JSON 持久化 | 原型阶段零配置、可追踪，后续可换数据库 |
| 固定 Graph + 条件路由 | 不用自由 ReAct，每步可解释 |

---

## 8. 版本路线

```text
V1 MVP → V2 Agent+RAG → V3 产品硬化 → V4 AMap BYOK
  ↓          ↓               ↓              ↓
固定流程   LangGraph       评测+验收      真实地图API
Mock数据   真实数据+RAG    作品集打磨      MCP数据源

V8 AI地图编辑器 → V9 LangGraph Lite → V9.3 Vue前端 ★ 当前前端基线
(map_document)    (/api/agent/run)    (操作式架构+AMap+移动端)
       │                 │                    │
       └─────────────────┴────────────────────┘
                         ↓
               V10 Planner Tool Agent ★ 当前后端基线
               (RootPlanner→ContextBroker→Workers→Artifact/Trace)
```

v5–v7 为中间探索版本，成果已吸收进 V8–V10。v9_2、v9_4 为过渡/延续版本。

---

## 9. 已知限制与下一步

### 前端

| 限制 | 优先级 |
|------|--------|
| 仅 localStorage 持久化，清缓存即丢 | P0 |
| 未对接 `/api/agent/run`，操作全手动 | P0 |
| 无组件单测 | P1 |
| 移动端未深度打磨 | P2 |
| 无账号系统 | P2 |

### 后端

| 限制 | 优先级 |
|------|--------|
| OneShotTool 仅接口，无执行器 | P1 |
| depends_on 建模但串行执行 | P2 |
| MemoryConsolidator 无 LLM 摘要 | P2 |
| 无 Human interrupt | P2 |

### 优先级

```text
P0  前后端对接 — 前端调 /api/agent/run，后端返 MapOperation[]，前端应用并标为 AI 来源
    后端持久化 — localStorage → JSON store

P1  OneShotTool 注册/执行器
    前端核心组件单测

P2  SSE 流式步骤展示 · DAG 并行 · 移动端打磨 · Human interrupt
```

---

## 附录：快速开始

**前端**

```bash
cd iterations/v9_3-layout-exploration/vue-layout
npm install && npm run dev
```

打开浏览器 → 左侧设置配置高德 Key → 开始使用。

**后端**

```bash
cd iterations/v10-planner-tool-agent/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API 文档：`http://localhost:8000/docs`

**测试**

```bash
cd iterations/v10-planner-tool-agent/backend
pytest
```
