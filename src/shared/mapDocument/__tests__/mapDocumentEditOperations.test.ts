import { beforeEach, describe, expect, it } from 'vitest';
import { compactOperations } from '../mapDocumentEditOperations';
import {
  featureCreate,
  featureDelete,
  featureUpdate,
  layerCreate,
  layerDelete,
  layerUpdate,
  makeFeature,
  makeLayer,
  pointGeoJson,
  resetOperationSequence
} from './fixtures';

beforeEach(() => {
  resetOperationSequence();
});

describe('compactOperations - 基础保留规则', () => {
  it('空数组返回空数组', () => {
    expect(compactOperations([])).toEqual([]);
  });

  it('不相关的操作按原顺序保留', () => {
    const layerA = makeLayer({ id: 'layer-a' });
    const layerB = makeLayer({ id: 'layer-b' });
    const feature = makeFeature('feature-1', layerA.id, pointGeoJson());

    const operations = [
      layerCreate(layerA),
      layerCreate(layerB),
      featureCreate(feature)
    ];

    const compacted = compactOperations(operations);

    expect(compacted.map((operation) => operation.type)).toEqual([
      'layer.create',
      'layer.create',
      'feature.create'
    ]);
    expect(compacted.map((operation) => operation.id)).toEqual(operations.map((operation) => operation.id));
  });
});

describe('compactOperations - feature.update 合并', () => {
  it('连续两次修改同一要素属性合并为一条，before 取最早、after 取最新', () => {
    const firstUpdate = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: pointGeoJson([108.4, 22.8], { name: '原名' }), imageResourceId: null },
      { geojson: pointGeoJson([108.4, 22.8], { name: '第一次' }), imageResourceId: null }
    );
    const secondUpdate = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: pointGeoJson([108.4, 22.8], { name: '第一次' }), imageResourceId: null },
      { geojson: pointGeoJson([108.4, 22.8], { name: '第二次' }), imageResourceId: null }
    );

    const compacted = compactOperations([firstUpdate, secondUpdate]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].type).toBe('feature.update');
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'feature.update' }>;
    expect((merged.before.geojson as { properties: unknown }).properties).toEqual({ name: '原名' });
    expect((merged.after.geojson as { properties: unknown }).properties).toEqual({ name: '第二次' });
  });

  it('两次修改改回原值时整条操作被剔除', () => {
    const update = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: pointGeoJson([108.4, 22.8]), imageResourceId: null },
      { geojson: pointGeoJson([108.5, 22.9]), imageResourceId: null }
    );
    const revert = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: pointGeoJson([108.5, 22.9]), imageResourceId: null },
      { geojson: pointGeoJson([108.4, 22.8]), imageResourceId: null }
    );

    const compacted = compactOperations([update, revert]);

    expect(compacted).toHaveLength(0);
  });

  it('before 与 after 完全相同的单条操作被丢弃', () => {
    const noop = featureUpdate(
      'feature-1',
      'layer-1',
      { name: '同名' },
      { name: '同名' }
    );

    expect(compactOperations([noop])).toHaveLength(0);
  });

  it('不同要素的 update 不合并', () => {
    const first = featureUpdate('feature-1', 'layer-1', { a: 1 }, { a: 2 });
    const second = featureUpdate('feature-2', 'layer-1', { a: 1 }, { a: 2 });

    const compacted = compactOperations([first, second]);

    expect(compacted).toHaveLength(2);
    expect(compacted.map((operation) => operation.id)).toEqual([first.id, second.id]);
  });

  it('同一要素但中间隔了其他操作时仍合并（查找最近一条同要素 update）', () => {
    const updateA = featureUpdate('feature-1', 'layer-1', { a: 1 }, { a: 2 });
    const otherFeature = makeFeature('feature-2', 'layer-1', pointGeoJson());
    const createOther = featureCreate(otherFeature);
    const updateB = featureUpdate('feature-1', 'layer-1', { a: 2 }, { a: 3 });

    const compacted = compactOperations([updateA, createOther, updateB]);

    expect(compacted).toHaveLength(2);
    expect(compacted.map((operation) => operation.type)).toEqual(['feature.update', 'feature.create']);
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'feature.update' }>;
    expect(merged.before.a).toBe(1);
    expect(merged.after.a).toBe(3);
  });
});

describe('compactOperations - create 吸收 update', () => {
  it('feature.update 合并进之前的 feature.create 的 after', () => {
    const feature = makeFeature('feature-1', 'layer-1', pointGeoJson([108.4, 22.8], { name: '原名' }));
    const createOperation = featureCreate(feature);
    const update = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: pointGeoJson([108.4, 22.8], { name: '原名' }), imageResourceId: null },
      { geojson: pointGeoJson([108.4, 22.8], { name: '改过的名字' }), imageResourceId: null }
    );

    const compacted = compactOperations([createOperation, update]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].type).toBe('feature.create');
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'feature.create' }>;
    expect(merged.after.geojson.properties).toEqual({ name: '改过的名字' });
  });

  it('layer.update 合并进之前的 layer.create 的 after', () => {
    const layer = makeLayer({ id: 'layer-1', name: '原图层名' });
    const createOperation = layerCreate(layer);
    const update = layerUpdate('layer-1', { name: '原图层名' }, { name: '新图层名' });

    const compacted = compactOperations([createOperation, update]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].type).toBe('layer.create');
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'layer.create' }>;
    expect(merged.after.name).toBe('新图层名');
  });
});

describe('compactOperations - delete 湮灭规则', () => {
  it('create 后 delete 同一要素：两条都消失', () => {
    const feature = makeFeature('feature-1', 'layer-1', pointGeoJson());
    const createOperation = featureCreate(feature);
    const deleteOperation = featureDelete(feature);

    expect(compactOperations([createOperation, deleteOperation])).toEqual([]);
  });

  it('update 后 delete 同一要素：delete 的 before 融合 update 之前的旧值', () => {
    const deletePayloadFeature = makeFeature('feature-1', 'layer-1', pointGeoJson([108.4, 22.8], { name: '原名' }));
    const update = featureUpdate(
      'feature-1',
      'layer-1',
      { geojson: deletePayloadFeature.geojson, imageResourceId: null },
      {
        geojson: pointGeoJson([108.5, 22.9], { name: '改过' }),
        imageResourceId: null
      }
    );
    const deleteOperation = featureDelete(deletePayloadFeature);

    const compacted = compactOperations([update, deleteOperation]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].type).toBe('feature.delete');
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'feature.delete' }>;
    expect(merged.before.geojson.properties).toEqual({ name: '原名' });
  });

  it('同一图层 create 后 delete：图层内所有操作连同 create 一起消失', () => {
    const layer = makeLayer({ id: 'layer-1', featureIds: ['feature-1'] });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createLayerOperation = layerCreate(layer);
    const createFeatureOperation = featureCreate(feature);
    const deleteLayerOperation = layerDelete(layer, [feature]);

    expect(compactOperations([
      createLayerOperation,
      createFeatureOperation,
      deleteLayerOperation
    ])).toEqual([]);
  });

  it('图层 delete 吞并图层内所有 update，并将其 before 融合进 delete 载荷', () => {
    const layer = makeLayer({ id: 'layer-1', name: '原名', featureIds: [] });
    const renameOperation = layerUpdate('layer-1', { name: '原名' }, { name: '改名后' });
    const deleteOperation = layerDelete({ ...layer, name: '改名后' });

    const compacted = compactOperations([renameOperation, deleteOperation]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].type).toBe('layer.delete');
    const merged = compacted[0] as Extract<typeof compacted[number], { type: 'layer.delete' }>;
    expect(merged.before.name).toBe('原名');
  });

  it('不同图层互不影响', () => {
    const layerA = makeLayer({ id: 'layer-a' });
    const layerB = makeLayer({ id: 'layer-b' });
    const featureInA = makeFeature('feature-a', layerA.id, pointGeoJson());
    const createFeatureA = featureCreate(featureInA);
    const deleteLayerB = layerDelete(layerB);

    const compacted = compactOperations([createFeatureA, deleteLayerB]);

    expect(compacted).toHaveLength(2);
    expect(compacted.map((operation) => operation.type)).toEqual(['feature.create', 'layer.delete']);
  });
});

describe('compactOperations - 结果有效性', () => {
  it('压缩结果每条仍能通过 schema 校验', () => {
    const layer = makeLayer({ id: 'layer-1', name: '原名' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson([108.4, 22.8], { name: '原' }));

    const operations = [
      layerCreate(layer),
      featureCreate(feature),
      layerUpdate('layer-1', { name: '原名' }, { name: '一次' }),
      layerUpdate('layer-1', { name: '一次' }, { name: '两次' }),
      featureUpdate(
        'feature-1',
        'layer-1',
        { geojson: pointGeoJson([108.4, 22.8], { name: '原' }), imageResourceId: null },
        { geojson: pointGeoJson([108.4, 22.8], { name: '改' }), imageResourceId: null }
      )
    ];

    const compacted = compactOperations(operations);

    expect(compacted).toHaveLength(2);
    expect(compacted[0].type).toBe('layer.create');
    const compactedLayer = compacted[0] as Extract<typeof compacted[number], { type: 'layer.create' }>;
    expect(compactedLayer.after.name).toBe('两次');

    expect(compacted[1].type).toBe('feature.create');
    const compactedFeature = compacted[1] as Extract<typeof compacted[number], { type: 'feature.create' }>;
    expect(compactedFeature.after.geojson.properties).toEqual({ name: '改' });
  });

  it('压缩不改变与自身无关操作的 id 引用', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const createOperation = layerCreate(layer);

    const compacted = compactOperations([createOperation]);

    expect(compacted).toHaveLength(1);
    expect(compacted[0].id).toBe(createOperation.id);
    expect(compacted[0].createdAt).toBe(createOperation.createdAt);
    expect(compacted[0].summary).toBe(createOperation.summary);
  });
});
