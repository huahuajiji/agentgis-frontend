import { describe, expect, it } from 'vitest';
import { applyOperations } from '../mapDocumentOperationApply';
import {
  redoWorkingOperation,
  undoWorkingOperation
} from '../mapDocumentUndoRedo';
import {
  featureCreate,
  featureUpdate,
  layerCreate,
  layerDelete,
  makeDocument,
  makeFeature,
  makeLayer,
  pointGeoJson,
  withFeatures,
  withLayers,
  withWorkingOperations
} from './fixtures';

describe('undoWorkingOperation', () => {
  it('空操作栈时原样返回文档和 null', () => {
    const document = makeDocument();
    const result = undoWorkingOperation(document);

    expect(result.document).toBe(document);
    expect(result.operation).toBeNull();
  });

  it('撤销 feature.create：要素从文档中移除并进入 redo 栈', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createOperation = featureCreate(feature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const createdDocument = applyOperations(baseDocument, [createOperation]);
    const document = withWorkingOperations(createdDocument, [createOperation]) as typeof baseDocument;

    const result = undoWorkingOperation(document);

    expect(result.operation).toBe(createOperation);
    expect(result.document.features['feature-1']).toBeUndefined();
    expect(result.document.layers[0].featureIds).toEqual([]);
    expect(result.document.edit.workingOperations).toEqual([]);
    expect(result.document.edit.redoOperations).toEqual([createOperation]);
  });

  it('撤销 feature.update：属性回到 before 值', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson([108.4, 22.8], { name: '旧名' }));
    const updateOperation = featureUpdate(
      'feature-1',
      layer.id,
      { geojson: feature.geojson, imageResourceId: null },
      {
        geojson: pointGeoJson([108.4, 22.8], { name: '新名' }),
        imageResourceId: null
      }
    );

    const baseDocument = withFeatures(
      withLayers(makeDocument(), [makeLayer({ id: 'layer-1', featureIds: ['feature-1'] })]),
      [feature]
    );
    const updatedDocument = applyOperations(baseDocument, [updateOperation]);
    const document = withWorkingOperations(updatedDocument, [updateOperation]) as typeof baseDocument;

    expect(document.features['feature-1'].geojson.properties).toEqual({ name: '新名' });

    const result = undoWorkingOperation(document);

    expect(result.document.features['feature-1'].geojson.properties).toEqual({ name: '旧名' });
    expect(result.document.edit.redoOperations).toEqual([updateOperation]);
  });

  it('撤销 layer.delete：图层和随删要素一起恢复', () => {
    const layer = makeLayer({ id: 'layer-1', featureIds: ['feature-1'] });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const deleteOperation = layerDelete(layer, [feature]);

    const baseDocument = withFeatures(withLayers(makeDocument(), [layer]), [feature]);
    const deletedDocument = applyOperations(baseDocument, [deleteOperation]);
    expect(deletedDocument.layers).toHaveLength(0);
    expect(deletedDocument.features['feature-1']).toBeUndefined();

    const document = withWorkingOperations(deletedDocument, [deleteOperation]) as typeof baseDocument;
    const result = undoWorkingOperation(document);

    expect(result.document.layers.map((item) => item.id)).toEqual(['layer-1']);
    expect(result.document.features['feature-1']).toBeDefined();
    expect(result.document.layers[0].featureIds).toEqual(['feature-1']);
  });

  it('连续撤销到底后返回 null，文档保持不变', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const createLayerOperation = layerCreate(layer);
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createFeatureOperation = featureCreate(feature);

    const baseDocument = makeDocument();
    const builtDocument = applyOperations(baseDocument, [createLayerOperation, createFeatureOperation]);
    let document = withWorkingOperations(builtDocument, [createLayerOperation, createFeatureOperation]) as typeof baseDocument;

    const firstUndo = undoWorkingOperation(document);
    expect(firstUndo.operation).toStrictEqual(createFeatureOperation);
    document = firstUndo.document as typeof baseDocument;

    const secondUndo = undoWorkingOperation(document);
    expect(secondUndo.operation).toStrictEqual(createLayerOperation);
    document = secondUndo.document as typeof baseDocument;
    expect(document.layers).toHaveLength(0);
    expect(document.edit.workingOperations).toEqual([]);

    const thirdUndo = undoWorkingOperation(document);
    expect(thirdUndo.operation).toBeNull();
    expect(thirdUndo.document).toBe(document);
  });
});

describe('redoWorkingOperation', () => {
  it('空 redo 栈时原样返回文档和 null', () => {
    const document = makeDocument();
    const result = redoWorkingOperation(document);

    expect(result.document).toBe(document);
    expect(result.operation).toBeNull();
  });

  it('撤销后重做：要素恢复到文档且移回 working 栈', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createOperation = featureCreate(feature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const createdDocument = applyOperations(baseDocument, [createOperation]);
    const document = withWorkingOperations(createdDocument, [createOperation]) as typeof baseDocument;

    const undone = undoWorkingOperation(document);
    expect(undone.document.features['feature-1']).toBeUndefined();

    const redone = redoWorkingOperation(undone.document);

    expect(redone.operation).toStrictEqual(createOperation);
    expect(redone.document.features['feature-1']).toBeDefined();
    expect(redone.document.layers[0].featureIds).toEqual(['feature-1']);
    expect(redone.document.edit.workingOperations).toEqual([createOperation]);
    expect(redone.document.edit.redoOperations).toEqual([]);
  });

  it('撤销——重做——再撤销 回到同一状态', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createOperation = featureCreate(feature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const createdDocument = applyOperations(baseDocument, [createOperation]);
    const document = withWorkingOperations(createdDocument, [createOperation]) as typeof baseDocument;

    const undone = undoWorkingOperation(document);
    const redone = redoWorkingOperation(undone.document);
    const undoneAgain = undoWorkingOperation(redone.document);

    expect(undoneAgain.document.features['feature-1']).toBeUndefined();
    expect(undoneAgain.document.edit.workingOperations).toEqual([]);
    expect(undoneAgain.document.edit.redoOperations).toEqual([createOperation]);
  });

  it('多次撤销按后进先出顺序重做', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const firstFeature = makeFeature('feature-1', layer.id, pointGeoJson([108.4, 22.8]));
    const secondFeature = makeFeature('feature-2', layer.id, pointGeoJson([108.5, 22.9]));
    const firstOperation = featureCreate(firstFeature);
    const secondOperation = featureCreate(secondFeature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const builtDocument = applyOperations(baseDocument, [firstOperation, secondOperation]);
    let document = withWorkingOperations(builtDocument, [firstOperation, secondOperation]) as typeof baseDocument;

    document = undoWorkingOperation(document).document as typeof baseDocument;
    document = undoWorkingOperation(document).document as typeof baseDocument;
    expect(Object.keys(document.features)).toEqual([]);
    expect(document.edit.redoOperations).toEqual([secondOperation, firstOperation]);

    const firstRedo = redoWorkingOperation(document);
    expect(firstRedo.operation).toStrictEqual(firstOperation);
    expect(Object.keys(firstRedo.document.features)).toEqual(['feature-1']);

    const secondRedo = redoWorkingOperation(firstRedo.document);
    expect(secondRedo.operation).toStrictEqual(secondOperation);
    expect(Object.keys(secondRedo.document.features).sort()).toEqual(['feature-1', 'feature-2']);
  });
});
