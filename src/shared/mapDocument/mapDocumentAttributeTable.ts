/**
 * ArcGIS 式属性表（纯函数部分）。
 *
 * 一列 = 一个字段。固定列在前（名称 / 几何类型 / 属性数），
 * 然后是"该图层所有要素出现过的属性键"的并集，按出现顺序稳定排列。
 */
import type { MapFeature, MapLayer } from '../../schemas/mapDocumentSchema';

export type AttributeTableRow = {
  featureId: string;
  name: string;
  geometryType: string;
  propertyCount: number;
  values: Record<string, unknown>;
};

export type AttributeTableModel = {
  columns: string[];
  rows: AttributeTableRow[];
};

export function featureDisplayName(feature: MapFeature): string {
  const properties = feature.geojson.properties;
  return properties && typeof properties.name === 'string' && properties.name.trim()
    ? properties.name
    : feature.id;
}

/**
 * 构造图层的属性表。
 *
 * 字段并集按"要素顺序 + 每个要素内键出现顺序"去重累积，保证列顺序稳定，
 * 不会因为某个要素删了字段就抖动。
 */
export function buildAttributeTable(
  layer: MapLayer,
  features: MapFeature[]
): AttributeTableModel {
  const layerFeatures = features.filter((feature) => feature.layerId === layer.id);
  const columnSet = new Set<string>();

  for (const feature of layerFeatures) {
    const properties = feature.geojson.properties ?? {};
    for (const key of Object.keys(properties)) {
      if (key !== 'name') {
        columnSet.add(key);
      }
    }
  }

  const columns = [...columnSet];
  const rows = layerFeatures.map((feature) => {
    const properties = (feature.geojson.properties ?? {}) as Record<string, unknown>;
    return {
      featureId: feature.id,
      name: featureDisplayName(feature),
      geometryType: feature.geojson.geometry.type,
      propertyCount: Object.keys(properties).filter((key) => key !== 'name').length,
      values: properties
    };
  });

  return { columns, rows };
}

/** 单元格展示文本；null/undefined 显示空串，对象转 JSON。 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** 单元格输入解析：先试 JSON（数字/布尔/数组），失败按字符串。 */
export function parseCellValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}
