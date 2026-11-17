export type NavSection = '地图' | '项目' | '数据';
export type MapMode = '浏览' | '编辑' | '分析';
export type MapTool = '' | '选择' | '绘制' | '导入';
export type MapDrawGeometry = '' | 'point' | 'line' | 'polygon';
export type MapAction = '' | '定位' | '放大' | '缩小';
export const INSPECTOR_TABS = [
  { id: '要素', title: '要素属性', content: 'layer-tree', layerCount: 10, featureRows: 3 },
  { id: '操作', title: '执行记录', content: 'operation-history' }
] as const;

export type InspectorMode = typeof INSPECTOR_TABS[number]['id'];
export type MobileTab = 'map' | 'project' | 'data' | 'mine';
export type MobileEditMode = 'manual' | 'agent' | 'preview';
