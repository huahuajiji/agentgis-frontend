/**
 * 要素自动命名（手绘专用）。
 *
 * 规则（用户 2026-11-25 定）：
 * - 只给手绘新建的要素命名；导入的 GeoJSON 保留原 properties.name，没有就不改。
 * - 名字格式：类型_序号，如 点_1、线_2、面_1（中文类型名）。
 * - 计数基准：同一图层内、同一几何类型；mixed 图层里点线面各数各的。
 * - 序号取现有最大 + 1，删除后不重排（名字保持稳定）。
 */
import type { MapFeature, MapLayer } from '../../schemas/mapDocumentSchema';

const NAME_BY_GEOMETRY: Record<string, string> = {
  point: '点',
  line: '线',
  polygon: '面'
};

const NAME_BY_GEOJSON_TYPE: Record<string, string> = {
  Point: '点',
  MultiPoint: '点',
  LineString: '线',
  MultiLineString: '线',
  Polygon: '面',
  MultiPolygon: '面'
};

export function geometryKindLabel(geojsonType: string): string | null {
  return NAME_BY_GEOJSON_TYPE[geojsonType] ?? null;
}

/** 图层的要素几何类型（用于限制 new geometry 与图层匹配，也可用于命名分组）。 */
export function layerGeometryLabel(layer: MapLayer): string | null {
  return NAME_BY_GEOMETRY[layer.geometryType] ?? null;
}

/**
 * 生成图层内下一个同类型要素名。
 *
 * 解析现有名字 `类型_数字`，只统计与目标类型匹配且格式合法的；
 * 取最大序号 + 1。名字被手动改过（不符合格式）的不计入，但也不会被覆盖。
 */
export function nextFeatureName(
  layer: MapLayer,
  existingFeatures: MapFeature[],
  geometryType: string
): string {
  const typeLabel = NAME_BY_GEOJSON_TYPE[geometryType] ?? layerGeometryLabel(layer) ?? '要素';
  let maxIndex = 0;

  for (const feature of existingFeatures) {
    if (feature.layerId !== layer.id) {
      continue;
    }
    const properties = feature.geojson.properties;
    const name = properties && typeof properties.name === 'string' ? properties.name : '';
    const match = /^(.+)_(\d+)$/.exec(name.trim());
    if (!match) {
      continue;
    }
    if (match[1] !== typeLabel) {
      continue;
    }
    const index = Number(match[2]);
    if (Number.isFinite(index) && index > maxIndex) {
      maxIndex = index;
    }
  }

  return `${typeLabel}_${maxIndex + 1}`;
}
