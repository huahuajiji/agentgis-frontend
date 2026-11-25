# 使用说明

> 更新于 2026-11-18，对应前端收敛后的界面。

## 安装依赖

先进入前端目录：

```powershell
npm install
```

## 本地运行

```powershell
npm run dev
```

Vite 默认监听 `127.0.0.1`。打开终端输出的地址，会进入 `/#/map`。

## 构建

```powershell
npm run build
```

先执行 `vue-tsc --noEmit` 做 TypeScript / Vue 类型检查，再执行 Vite 构建。

## 运行测试

```powershell
npm run test
```

使用 Vitest 运行 `src/shared/mapDocument/__tests__/` 下的单元测试（撤销/重做、操作压缩、GeoJSON 收发）。

```powershell
npm run typecheck:test
```

对测试文件单独做类型检查。测试文件不在主 `tsconfig.json` 的检查范围内（应用代码保持无 Node 类型依赖），由 `tsconfig.test.json` 覆盖。

## 预览生产构建

```powershell
npm run preview
```

请先运行 `npm run build`，再启动 preview。

## 使用高德地图

底图是可选能力。没有配置 Key 时，地图区域显示「未启用 BYOK」提示，其余功能（文档管理、GeoJSON 导入/导出）不受影响。

开启底图：

1. 点击左下角「账户」。
2. 开启 BYOK。
3. 填写高德 JS API Key 和 Security Code。
4. 保存。

设置保存在浏览器 localStorage 的 `agentgis:v9_3:settings` key 下。地图文档状态保存在浏览器 IndexedDB（数据库名 `agentgis`，旧 localStorage 数据首次启动自动迁移）。同步到后端需手动操作：右侧检查器「操作」页签的待同步池里有「从云端拉取」和「同步到云端」按钮；未点击则只存在本地。

## 界面总览

- **垂直导航**（最左）：地图 / 项目 / 数据，底部是账户按钮。
- **左侧工作区侧栏**：随导航区变化。地图区为空（显示说明文案）；项目区有项目列表和图片资源；数据区有 GeoJSON 导入 / 导出。
- **中间地图工作区**：顶部命令栏（浏览 / 编辑 / 分析模式，选择 / 绘制 / 导入工具，导出 GeoJSON、保存），下方是高德画布。
- **右侧检查器**：要素页签（图层树，支持新建图层、排序；图层头「⋯」里可重命名/删除图层）、操作页签（撤销 / 重做 / 打包）。
- **浮动属性表**：展开图层时在地图左下弹出，可拖动；主表只列所有要素都有的公共字段，点行在左侧弹出该要素的私有属性（可改名、改值、删字段、加字段）。
- **顶部右侧「左栏 / 右栏」按钮**：折叠或展开两侧面板。

## 主流程

1. 打开 `/#/project`，在「项目列表」里新建一个地图文档（或直接使用默认草稿）。
2. 回到 `/#/map`，在右侧检查器「要素」页签点「新建」创建图层。
3. 需要批量数据时，去 `/#/data` 用「导入 GeoJSON」（可选按点/线/面自动分层）。
4. 配置了高德 Key 后，切到「编辑」模式，用「绘制」工具在画布上画点/线/面。
5. 展开图层 → 地图上弹出属性表；点某一行在左侧查看/编辑该要素的私有属性。
6. 在检查器「操作」页签查看操作历史，可撤销 / 重做 / 提交。
7. 需要时用命令栏的「导出 GeoJSON」导出当前数据。

## 重置本地状态

可以使用应用内的重置动作（同时清空 IndexedDB 与 localStorage 设置）。

重要存储位置：

- IndexedDB 数据库 `agentgis`：地图文档（documents / draft / meta 三个对象仓）
- localStorage `agentgis:v9_3:settings`：账户 / BYOK 设置
- 旧版 localStorage 文档 key 会在首次迁移进 IndexedDB 后自动清理
