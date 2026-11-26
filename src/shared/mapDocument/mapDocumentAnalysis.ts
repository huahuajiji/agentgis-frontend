/**
 * 空间分析的纯函数层（第三刀）。无 I/O，全部可单测。
 *
 * 契约与 agentgis-backend/app/spatial.py 对应：
 * - 请求/响应都是 GeoJSON 几何，坐标系 WGS-84（方案 B 后文档统一）；
 * - 距离单位米（后端内部转 3857 平面计算）；
 * - 响应 { operation, geometry }。
 */
import type { Feature as GeoJsonFeature, Geometry } from 'geojson';

export type OverlayOperator = 'intersection' | 'union' | 'difference';

export type BufferAnalysisInput = {
  kind: 'buffer';
  geometry: Geometry;
  distance: number;
  segments?: number;
};

export type OverlayAnalysisInput = {
  kind: 'overlay';
  operator: OverlayOperator;
  geometryA: Geometry;
  geometryB: Geometry;
};

export type AnalysisInput = BufferAnalysisInput | OverlayAnalysisInput;

export const OVERLAY_LABELS: Record<OverlayOperator, string> = {
  intersection: '交集',
  union: '并集',
  difference: '差集'
};

export function describeAnalysis(input: AnalysisInput): string {
  return input.kind === 'buffer'
    ? `缓冲区 ${input.distance} 米`
    : `叠加 · ${OVERLAY_LABELS[input.operator]}`;
}

/** 构造 POST /api/spatial/analysis 的请求体。 */
export function buildAnalysisRequest(input: AnalysisInput): Record<string, unknown> {
  if (input.kind === 'buffer') {
    return {
      operation: 'buffer',
      geometry: input.geometry,
      distance: input.distance,
      segments: input.segments ?? 64
    };
  }

  return {
    operation: 'overlay',
    operator: input.operator,
    geometryA: input.geometryA,
    geometryB: input.geometryB
  };
}

export type AnalysisResponseBody = {
  operation: string;
  geometry: unknown;
};

/**
 * 后端响应 → 可直接进文档的 GeoJSON Feature。
 * properties 带上分析说明；name 由调用方（store 自动命名逻辑之外的显式名字）决定。
 */
export function toAnalysisFeature(
  body: AnalysisResponseBody,
  input: AnalysisInput
): GeoJsonFeature | null {
  const geometry = body.geometry as Geometry | undefined;
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry)) {
    return null;
  }

  return {
    type: 'Feature',
    geometry,
    properties: {
      name: describeAnalysis(input),
      analysis_operation: body.operation,
      analysis_distance_m: input.kind === 'buffer' ? input.distance : undefined,
      analysis_operator: input.kind === 'overlay' ? input.operator : undefined
    }
  };
}

/** 校验分析输入是否齐备（UI 侧按钮可用性也用它）。返回 null 表示可用。 */
export function validateAnalysisInput(
  input: Partial<AnalysisInput> & { kind?: AnalysisInput['kind'] }
): string | null {
  if (input.kind === 'buffer') {
    if (!input.geometry) {
      return '先选中一个要素作为缓冲对象';
    }
    if (!Number.isFinite(input.distance) || (input.distance ?? 0) <= 0) {
      return '缓冲距离必须是正数（米）';
    }
    return null;
  }

  if (input.kind === 'overlay') {
    if (!input.geometryA || !input.geometryB) {
      return '叠加需要选中两个要素（A 与 B）';
    }
    return null;
  }

  return '未知的分析类型';
}
