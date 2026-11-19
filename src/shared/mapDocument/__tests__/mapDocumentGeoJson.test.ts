import { describe, expect, it } from 'vitest';
import type { Feature as GeoJsonFeature, FeatureCollection } from 'geojson';
import { exportGeoJson, importGeoJson } from '../mapDocumentGeoJson';
import type { MapDocumentLike } from '../mapDocumentValidation';
import {
  lineGeoJson,
  makeDocument,
  makeFeature,
  makeLayer,
  pointGeoJson,
  polygonGeoJson,
  withFeatures,
  withLayers
} from './fixtures';

function featureCollectionOf(...features: GeoJsonFeature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('importGeoJson - 图形类型与图层划分', () => {
  it('导入单个 Feature：自动建点图层并选中新要素', () => {
    const result = importGeoJson(makeDocument(), { geojson: pointGeoJson() });

    expect(result.importedFeatureIds).toHaveLength(1);
    expect(result.touchedLayerIds).toHaveLength(1);
    expect(result.document.layers).toHaveLength(1);
    expect(result.document.layers[0].name).toBe('导入图层 · 点');
    expect(result.document.layers[0].geometryType).toBe('point');
    expect(result.document.layers[0].role).toBe('work');
    expect(result.document.layers[0].featureIds).toEqual(result.importedFeatureIds);
    expect(result.document.selectedLayerId).toBe(result.touchedLayerIds[0]);
    expect(result.document.selectedFeatureId).toBe(result.importedFeatureIds[0]);
  });

  it('FeatureCollection 且 splitByGeometryType=true：点线面各建一个图层', () => {
    const result = importGeoJson(makeDocument(), {
      geojson: featureCollectionOf(pointGeoJson(), lineGeoJson(), polygonGeoJson())
    });

    expect(result.importedFeatureIds).toHaveLength(3);
    expect(result.touchedLayerIds).toHaveLength(3);
    expect(result.document.layers.map((layer) => layer.geometryType).sort()).toEqual(['line', 'point', 'polygon']);
    expect(result.document.layers.map((layer) => layer.name).sort()).toEqual([
      '导入图层 · 点',
      '导入图层 · 线',
      '导入图层 · 面'
    ]);
    // 每个图层只挂一个要素
    expect(result.document.layers.every((layer) => layer.featureIds.length === 1)).toBe(true);
  });

  it('splitByGeometryType=false：点线面全部进入同一个混合图层', () => {
    const result = importGeoJson(makeDocument(), {
      geojson: featureCollectionOf(pointGeoJson(), lineGeoJson(), polygonGeoJson()),
      splitByGeometryType: false
    });

    expect(result.touchedLayerIds).toHaveLength(1);
    expect(result.document.layers).toHaveLength(1);
    expect(result.document.layers[0].geometryType).toBe('mixed');
    expect(result.document.layers[0].name).toBe('导入图层 · 混合');
    expect(result.document.layers[0].featureIds).toHaveLength(3);
  });

  it('同类型多个要素进入同一个导入图层', () => {
    const result = importGeoJson(makeDocument(), {
      geojson: featureCollectionOf(
        pointGeoJson([108.4, 22.8]),
        pointGeoJson([108.5, 22.9])
      )
    });

    expect(result.touchedLayerIds).toHaveLength(1);
    expect(result.document.layers[0].featureIds).toEqual(result.importedFeatureIds);
  });

  it('指定 targetLayerId：要素放进已有图层，不新建图层', () => {
    const layer = makeLayer({ id: 'layer-1', geometryType: 'point' });
    const document = withLayers(makeDocument(), [layer]);

    const result = importGeoJson(document, {
      geojson: pointGeoJson(),
      targetLayerId: 'layer-1'
    });

    expect(result.document.layers).toHaveLength(1);
    expect(result.touchedLayerIds).toEqual(['layer-1']);
    expect(result.document.layers[0].featureIds).toEqual(result.importedFeatureIds);
  });

  it('二次导入同类型要素时复用已有的导入图层', () => {
    const first = importGeoJson(makeDocument(), { geojson: pointGeoJson() });
    const second = importGeoJson(first.document, { geojson: pointGeoJson([108.5, 22.9]) });

    expect(second.document.layers).toHaveLength(1);
    expect(second.touchedLayerIds).toEqual(first.touchedLayerIds);
    expect(second.document.layers[0].featureIds).toHaveLength(2);
  });

  it('已有同名导入图层但角色不同时新建图层', () => {
    const referenceLayer = makeLayer({
      id: 'ref-layer',
      name: '导入图层 · 点',
      role: 'reference',
      geometryType: 'point'
    });
    const document = withLayers(makeDocument(), [referenceLayer]);

    const result = importGeoJson(document, { geojson: pointGeoJson() });

    expect(result.document.layers).toHaveLength(2);
    expect(result.touchedLayerIds).toEqual([result.document.layers[1].id]);
    expect(result.document.layers[1].role).toBe('work');
  });

  it('自定义 layerName 生效', () => {
    const result = importGeoJson(makeDocument(), {
      geojson: pointGeoJson(),
      layerName: '我的点位'
    });

    expect(result.document.layers[0].name).toBe('我的点位');
  });

  it('导入后要素打上 agentgis 内部属性标记', () => {
    const result = importGeoJson(makeDocument(), { geojson: pointGeoJson([108.4, 22.8], { name: '候选点' }) });
    const feature = result.document.features[result.importedFeatureIds[0]];

    expect(feature.geojson.properties).toMatchObject({
      name: '候选点',
      agentgis_imported_feature_id: result.importedFeatureIds[0],
      agentgis_layer_id: result.touchedLayerIds[0]
    });
  });

  it('原要素上的 agentgis_image_resource_id 会迁移到 imageResourceId', () => {
    const result = importGeoJson(makeDocument(), {
      geojson: pointGeoJson([108.4, 22.8], { agentgis_image_resource_id: 'image-42' })
    });
    const feature = result.document.features[result.importedFeatureIds[0]];

    expect(feature.imageResourceId).toBe('image-42');
  });

  it('非法 GeoJSON 输入被 zod 拒绝', () => {
    expect(() => importGeoJson(makeDocument(), {
      geojson: { type: 'Feature', geometry: { type: 'Point' }, properties: {} } as never
    })).toThrow();
  });
});

describe('exportGeoJson', () => {
  function buildDocumentWithTwoLayers(): MapDocumentLike {
    const workLayer = makeLayer({ id: 'work-layer', name: '工作图层', role: 'work', geometryType: 'point', featureIds: ['feature-1'] });
    const referenceLayer = makeLayer({ id: 'ref-layer', name: '参考图层', role: 'reference', geometryType: 'point', featureIds: ['feature-2'] });
    const feature1 = makeFeature('feature-1', workLayer.id, pointGeoJson([108.4, 22.8], { name: 'A' }));
    const feature2 = makeFeature('feature-2', referenceLayer.id, pointGeoJson([108.5, 22.9], { name: 'B' }));

    return withFeatures(withLayers(makeDocument(), [workLayer, referenceLayer]), [feature1, feature2]);
  }

  it('默认导出全部要素为 FeatureCollection', () => {
    const collection = exportGeoJson(buildDocumentWithTwoLayers());

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(2);
  });

  it('默认注入内部属性，可用 includeInternalProperties=false 关闭', () => {
    const document = buildDocumentWithTwoLayers();

    const withInternals = exportGeoJson(document);
    expect(withInternals.features[0].properties).toMatchObject({
      agentgis_feature_id: 'feature-1',
      agentgis_layer_id: 'work-layer',
      agentgis_layer_name: '工作图层'
    });

    const withoutInternals = exportGeoJson(document, { includeInternalProperties: false });
    expect(withoutInternals.features[0].properties).toEqual({ name: 'A' });
  });

  it('按 layerIds 筛选', () => {
    const collection = exportGeoJson(buildDocumentWithTwoLayers(), { layerIds: ['work-layer'] });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties?.agentgis_feature_id).toBe('feature-1');
  });

  it('按 featureIds 筛选', () => {
    const collection = exportGeoJson(buildDocumentWithTwoLayers(), { featureIds: ['feature-2'] });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties?.agentgis_feature_id).toBe('feature-2');
  });

  it('按 role 筛选（只导参考图层）', () => {
    const collection = exportGeoJson(buildDocumentWithTwoLayers(), { role: 'reference' });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties?.agentgis_feature_id).toBe('feature-2');
  });

  it('空文档导出空 FeatureCollection', () => {
    const collection = exportGeoJson(makeDocument());

    expect(collection).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('已挂不到图层的要素被跳过', () => {
    const document = withFeatures(makeDocument(), [
      makeFeature('orphan', 'missing-layer', pointGeoJson())
    ]);

    const collection = exportGeoJson(document);

    expect(collection.features).toHaveLength(0);
  });

  it('导出不修改文档本身（原始要素属性保持纯净）', () => {
    const document = buildDocumentWithTwoLayers();
    exportGeoJson(document);

    expect(document.features['feature-1'].geojson.properties).toEqual({ name: 'A' });
  });
});

describe('import → export 往返', () => {
  it('导入后立即导出：几何与业务属性保留，并带有内部追踪属性', () => {
    const input = pointGeoJson([108.4177, 22.8416], { name: '往返点', category: 'test' });
    const imported = importGeoJson(makeDocument(), { geojson: input });

    const exported = exportGeoJson(imported.document);

    expect(exported.features).toHaveLength(1);
    expect(exported.features[0].geometry).toEqual(input.geometry);
    expect(exported.features[0].properties).toMatchObject({
      name: '往返点',
      category: 'test',
      agentgis_feature_id: imported.importedFeatureIds[0]
    });
  });

  it('关闭内部属性导出后往返：业务属性完全一致', () => {
    const input = lineGeoJson([[108.4, 22.8], [108.5, 22.9], [108.6, 23.0]]);
    const imported = importGeoJson(makeDocument(), {
      geojson: { type: 'FeatureCollection', features: [input] }
    });

    const exported = exportGeoJson(imported.document, { includeInternalProperties: false });

    expect(exported.features[0].geometry).toEqual(input.geometry);
  });
});
