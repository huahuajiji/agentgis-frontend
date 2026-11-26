/**
 * GCJ-02 ↔ WGS-84 坐标转换（方案 B，2026-11-26）。
 *
 * 约定：
 * - 文档几何与 viewport 一律存 WGS-84（北京时间线坐标系下的标准经纬度）；
 * - GCJ-02 只在高德 JS SDK 边界短暂存在：取点后立刻转 WGS 进文档，渲染前再转回 GCJ；
 * - 中国大陆境外不加偏，直接直通（与高德 API 行为一致）。
 *
 * 算法与 WebGIS-Dev 的 `crs/coordTransform.ts` 同一套公开公式（火星坐标系偏移模型），
 * 本文件为独立实现，不含任何外部依赖。
 */

const PI = Math.PI;
/** 克拉索夫斯基椭球长半轴（米） */
const A = 6378245.0;
/** 第一偏心率平方 */
const EE = 0.00669342162296594323;

export type LngLat = [number, number];

/** 中国大陆境外判定（与高德/GCJ 偏移模型的适用边界一致）。 */
export function outOfChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

function delta(lon: number, lat: number): LngLat {
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [dLon, dLat];
}

/**
 * WGS-84 → GCJ-02（正向加偏）。
 * 用于把文档坐标交给高德 SDK 渲染/编辑前。
 */
export function wgs84ToGcj02(lon: number, lat: number): LngLat {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return [lon, lat];
  }
  if (outOfChina(lon, lat)) {
    return [lon, lat];
  }
  const [dLon, dLat] = delta(lon, lat);
  return [lon + dLon, lat + dLat];
}

/**
 * GCJ-02 → WGS-84（反解）。
 * 用于高德 SDK 给出的坐标落进文档前。
 *
 * 正向加偏没有解析逆，先用镜像近似得到初值，再迭代两次把残差压到 1e-9° 以下
 * （毫米级），保证「GCJ→WGS→GCJ」与「WGS→GCJ→WGS」往返都稳定。
 */
export function gcj02ToWgs84(lon: number, lat: number): LngLat {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return [lon, lat];
  }
  if (outOfChina(lon, lat)) {
    return [lon, lat];
  }
  const [dLon, dLat] = delta(lon, lat);
  let guessLon = lon - dLon;
  let guessLat = lat - dLat;
  for (let i = 0; i < 2; i += 1) {
    const [fLon, fLat] = wgs84ToGcj02(guessLon, guessLat);
    guessLon += lon - fLon;
    guessLat += lat - fLat;
  }
  return [guessLon, guessLat];
}

/** 单个坐标点转换（保留第三维，如高程/时间）。 */
export function transformPosition(
  position: readonly number[],
  fn: (lon: number, lat: number) => LngLat
): number[] {
  const [lon, lat, ...rest] = position;
  const [nextLon, nextLat] = fn(lon, lat);
  return [nextLon, nextLat, ...rest];
}

/** GeoJSON 几何整体转换（Point / LineString / Polygon / MultiXxx / GeometryCollection）。 */
export function transformGeometry<G extends { type: string }>(
  geometry: G,
  fn: (lon: number, lat: number) => LngLat
): G {
  const walkCoords = (coords: unknown): unknown => {
    if (!Array.isArray(coords)) {
      return coords;
    }
    // 判定为坐标点：数组前两位都是有限数字
    if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      return transformPosition(coords as number[], fn);
    }
    return coords.map(walkCoords);
  };

  const geo = geometry as unknown as Record<string, unknown>;
  if (geo.type === 'GeometryCollection' && Array.isArray(geo.geometries)) {
    return {
      ...geo,
      geometries: (geo.geometries as Array<{ type: string }>).map((item) => transformGeometry(item, fn))
    } as unknown as G;
  }
  if ('coordinates' in geo) {
    return { ...geo, coordinates: walkCoords(geo.coordinates) } as unknown as G;
  }
  return geometry;
}
