import { describe, expect, it } from 'vitest';
import { nextFeatureName } from '../mapDocumentNaming';
import { buildAttributeTable, featureDisplayName, formatCellValue, parseCellValue } from '../mapDocumentAttributeTable';
import type { MapFeature, MapLayer } from '../../../schemas/mapDocumentSchema';

function makeLayer(overrides: Partial<MapLayer> = {}): MapLayer {
  return {
    id: 'layer-1',
    name: '图层一',
    role: 'work',
    geometryType: 'point',
    visible: true,
    locked: false,
    order: 0,
    featureIds: [],
    style: {},
    imageResources: [],
    ...overrides
  } as MapLayer;
}

function makeFeature(id: string, layerId: string, type: string, properties: Record<string, unknown> = {}): MapFeature {
  return {
    id,
    layerId,
    imageResourceId: null,
    geojson: {
      type: 'Feature',
      properties,
      geometry: { type, coordinates: [108.4, 22.8] }
    }
  } as unknown as MapFeature;
}

describe('nextFeatureName', () => {
  const layer = makeLayer();

  it('空图层从 1 开始', () => {
    expect(nextFeatureName(layer, [], 'Point')).toBe('点_1');
  });

  it('取同类型最大序号 + 1', () => {
    const features = [
      makeFeature('f1', 'layer-1', 'Point', { name: '点_1' }),
      makeFeature('f2', 'layer-1', 'Point', { name: '点_3' })
    ];
    expect(nextFeatureName(layer, features, 'Point')).toBe('点_4');
  });

  it('不同类型分开计数', () => {
    const features = [
      makeFeature('f1', 'layer-1', 'Point', { name: '点_2' }),
      makeFeature('f2', 'layer-1', 'LineString', { name: '线_5' })
    ];
    expect(nextFeatureName(layer, features, 'LineString')).toBe('线_6');
    expect(nextFeatureName(layer, features, 'Point')).toBe('点_3');
  });

  it('其他图层的同名要素不计入', () => {
    const features = [
      makeFeature('f1', 'layer-2', 'Point', { name: '点_9' })
    ];
    expect(nextFeatureName(layer, features, 'Point')).toBe('点_1');
  });

  it('手动改过的名字不符合格式时不参与计数', () => {
    const features = [
      makeFeature('f1', 'layer-1', 'Point', { name: '我的第一个点' }),
      makeFeature('f2', 'layer-1', 'Point', { name: '点_2' })
    ];
    expect(nextFeatureName(layer, features, 'Point')).toBe('点_3');
  });

  it('多边形用「面_」', () => {
    expect(nextFeatureName(makeLayer({ geometryType: 'polygon' }), [], 'Polygon')).toBe('面_1');
  });
});

describe('buildAttributeTable', () => {
  it('列是属性键并集（不含 name），顺序稳定去重', () => {
    const layer = makeLayer({ featureIds: ['f1', 'f2'] });
    const features = [
      makeFeature('f1', 'layer-1', 'Point', { name: '点_1', population: 120 }),
      makeFeature('f2', 'layer-1', 'Point', { name: '点_2', area: 1.5, population: 80 })
    ];

    const table = buildAttributeTable(layer, features);

    expect(table.columns).toEqual(['population', 'area']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].name).toBe('点_1');
    expect(table.rows[0].values.population).toBe(120);
    expect(table.rows[1].values.area).toBe(1.5);
  });

  it('属性数不含 name', () => {
    const layer = makeLayer();
    const features = [makeFeature('f1', 'layer-1', 'Point', { name: '点_1', a: 1, b: 2 })];
    expect(buildAttributeTable(layer, features).rows[0].propertyCount).toBe(2);
  });

  it('只统计本图层要素', () => {
    const layer = makeLayer();
    const features = [
      makeFeature('f1', 'layer-1', 'Point', { name: '点_1' }),
      makeFeature('f2', 'layer-2', 'Point', { name: '别的' })
    ];
    expect(buildAttributeTable(layer, features).rows).toHaveLength(1);
  });

  it('没有 name 的要素回退显示 id', () => {
    const layer = makeLayer();
    const features = [makeFeature('feature-abc', 'layer-1', 'Point', {})];
    expect(buildAttributeTable(layer, features).rows[0].name).toBe('feature-abc');
  });
});

describe('单元格格式', () => {
  it('空值与字符串', () => {
    expect(formatCellValue(null)).toBe('');
    expect(formatCellValue(undefined)).toBe('');
    expect(formatCellValue('abc')).toBe('abc');
  });

  it('对象转 JSON', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
  });

  it('解析数字/布尔/JSON，非法按字符串', () => {
    expect(parseCellValue('42')).toBe(42);
    expect(parseCellValue('true')).toBe(true);
    expect(parseCellValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseCellValue('你好')).toBe('你好');
    expect(parseCellValue('   ')).toBe('');
  });

  it('featureDisplayName 优先 properties.name', () => {
    expect(featureDisplayName(makeFeature('f1', 'l', 'Point', { name: '点名' }))).toBe('点名');
    expect(featureDisplayName(makeFeature('f1', 'l', 'Point', {}))).toBe('f1');
  });
});
