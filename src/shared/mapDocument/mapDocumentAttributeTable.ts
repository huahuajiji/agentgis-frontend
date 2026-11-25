/**
 * ArcGIS 式属性表（纯函数部分）。
 *
 * 公共字段 = 该图层**所有**要素都拥有的属性键（不含 name），作为表格列。
 * 只有部分要素拥有的键属于"私有属性"，在左侧面板里按要素查看和编辑。
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
  commonColumns: string[];
  rows: AttributeTableRow[];
};

export function featureDisplayName(feature: MapFeature): string {
  const properties = feature.geojson.properties;
  return properties && typeof properties.name === 'string' && properties.name.trim()
    ? properties.name
    : feature.id;
}

function propertyKeys(feature: MapFeature): string[] {
  return Object.keys(feature.geojson.properties ?? {}).filter((key) => key !== 'name');
}

/**
 * 构造图层的属性表。
 *
 * 公共字段取所有要素属性键的交集，顺序以第一个要素的键顺序为准，
 * 保证列顺序稳定，不随某个要素增删私有字段而抖动。
 */
export function buildAttributeTable(
  layer: MapLayer,
  features: MapFeature[]
): AttributeTableModel {
  const layerFeatures = features.filter((feature) => feature.layerId === layer.id);

  const orderedKeys = layerFeatures.flatMap((feature) => propertyKeys(feature));
  const keyCounts = new Map<string, number>();
  for (const key of orderedKeys) {
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const commonColumns = [...new Set(orderedKeys)].filter(
    (key) => keyCounts.get(key) === layerFeatures.length
  );

  const rows = layerFeatures.map((feature) => {
    const properties = (feature.geojson.properties ?? {}) as Record<string, unknown>;
    return {
      featureId: feature.id,
      name: featureDisplayName(feature),
      geometryType: feature.geojson.geometry.type,
      propertyCount: propertyKeys(feature).length,
      values: properties
    };
  });

  return { commonColumns, rows };
}

/** 把单个要素的属性按公共/私有两组拆开。 */
export function splitFeatureProperties(
  feature: MapFeature,
  commonColumns: string[]
): {
  common: Record<string, unknown>;
  private: Record<string, unknown>;
} {
  const properties = (feature.geojson.properties ?? {}) as Record<string, unknown>;
  const commonSet = new Set(commonColumns);
  const common: Record<string, unknown> = {};
  const privateProps: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (key === 'name') {
      continue;
    }
    if (commonSet.has(key)) {
      common[key] = value;
    } else {
      privateProps[key] = value;
    }
  }

  return { common, private: privateProps };
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
