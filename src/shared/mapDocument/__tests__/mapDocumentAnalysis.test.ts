/**
 * 空间分析前端纯函数测试（第三刀）。
 */
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_LABELS,
  buildAnalysisRequest,
  describeAnalysis,
  toAnalysisFeature,
  validateAnalysisInput
} from '../mapDocumentAnalysis';

const POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[[109.10, 21.40], [109.11, 21.40], [109.11, 21.41], [109.10, 21.40]]]
};
const POLYGON_B = {
  type: 'Polygon' as const,
  coordinates: [[[109.11, 21.40], [109.12, 21.40], [109.12, 21.41], [109.11, 21.40]]]
};

describe('buildAnalysisRequest', () => {
  it('buffer 请求带 operation/geometry/distance/segments', () => {
    const body = buildAnalysisRequest({ kind: 'buffer', geometry: POLYGON, distance: 500 });
    expect(body).toMatchObject({
      operation: 'buffer',
      geometry: POLYGON,
      distance: 500,
      segments: 64
    });
  });

  it('overlay 请求带 operator 与两个几何', () => {
    const body = buildAnalysisRequest({
      kind: 'overlay',
      operator: 'difference',
      geometryA: POLYGON,
      geometryB: POLYGON_B
    });
    expect(body).toMatchObject({
      operation: 'overlay',
      operator: 'difference',
      geometryA: POLYGON,
      geometryB: POLYGON_B
    });
  });
});

describe('toAnalysisFeature', () => {
  it('合成带分析属性的 Feature', () => {
    const feature = toAnalysisFeature(
      { operation: 'buffer', geometry: POLYGON },
      { kind: 'buffer', geometry: POLYGON, distance: 300 }
    );
    expect(feature).not.toBeNull();
    expect(feature?.geometry).toEqual(POLYGON);
    expect(feature?.properties).toMatchObject({
      name: '缓冲区 300 米',
      analysis_operation: 'buffer',
      analysis_distance_m: 300
    });
  });

  it('overlay 结果带 operator 属性', () => {
    const feature = toAnalysisFeature(
      { operation: 'overlay.union', geometry: POLYGON },
      { kind: 'overlay', operator: 'union', geometryA: POLYGON, geometryB: POLYGON_B }
    );
    expect(feature?.properties).toMatchObject({
      name: `叠加 · ${OVERLAY_LABELS.union}`,
      analysis_operator: 'union'
    });
  });

  it('响应缺几何时返回 null', () => {
    expect(toAnalysisFeature(
      { operation: 'buffer', geometry: undefined },
      { kind: 'buffer', geometry: POLYGON, distance: 10 }
    )).toBeNull();
  });
});

describe('validateAnalysisInput', () => {
  it('buffer 缺几何报错', () => {
    expect(validateAnalysisInput({ kind: 'buffer', distance: 100 })).toContain('选中');
  });

  it('buffer 距离非正报错', () => {
    expect(validateAnalysisInput({ kind: 'buffer', geometry: POLYGON, distance: 0 })).toContain('正数');
  });

  it('overlay 少一个几何报错', () => {
    expect(validateAnalysisInput({ kind: 'overlay', geometryA: POLYGON })).toContain('两个要素');
  });

  it('齐全时返回 null', () => {
    expect(validateAnalysisInput({
      kind: 'overlay',
      geometryA: POLYGON,
      geometryB: POLYGON_B
    })).toBeNull();
  });
});
