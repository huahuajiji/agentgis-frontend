import {
  ExternalMapOperationRecordSchema,
  MapDocumentEditStateSchema,
  MapOperationSchema,
  type ExternalMapOperationRecord,
  type MapDocumentEditState,
  type MapOperation
} from '../../schemas/mapDocumentSchema';

export function validateMapOperation(value: unknown): MapOperation {
  const operation = MapOperationSchema.parse(value);
  assertOperationConsistency(operation);
  return operation;
}

export function validateExternalMapOperationRecord(value: unknown): ExternalMapOperationRecord {
  const record = ExternalMapOperationRecordSchema.parse(value);
  return {
    ...record,
    operation: validateMapOperation({
      ...record.operation,
      source: record.source
    })
  };
}

export function validateMapDocumentEditState(value: unknown): MapDocumentEditState {
  const editState = MapDocumentEditStateSchema.parse(value);

  return {
    ...editState,
    workingOperations: editState.workingOperations.map(validateMapOperation),
    redoOperations: editState.redoOperations.map(validateMapOperation),
    commitPool: editState.commitPool.map(validateMapOperation),
    externalOperations: editState.externalOperations.map(validateExternalMapOperationRecord)
  };
}

function assertOperationConsistency(operation: MapOperation) {
  if (operation.type === 'layer.create' && operation.after.id !== operation.layerId) {
    throw new Error(`layer.create layerId mismatch: ${operation.layerId}`);
  }

  if (operation.type === 'layer.delete' && operation.before.id !== operation.layerId) {
    throw new Error(`layer.delete layerId mismatch: ${operation.layerId}`);
  }

  if (operation.type === 'feature.create') {
    assertFeatureTarget(operation.after.id, operation.featureId, 'feature.create featureId');
    assertFeatureTarget(operation.after.layerId, operation.layerId, 'feature.create layerId');
  }

  if (operation.type === 'feature.delete') {
    assertFeatureTarget(operation.before.id, operation.featureId, 'feature.delete featureId');
    assertFeatureTarget(operation.before.layerId, operation.layerId, 'feature.delete layerId');
  }

  if (operation.type === 'geojson.import') {
    assertUniqueIds(operation.layerIds, 'geojson.import layerIds');
    assertUniqueIds(operation.featureIds, 'geojson.import featureIds');

    const importedLayerIds = new Set(operation.layerIds);
    const importedFeatureIds = new Set(operation.featureIds);
    operation.layers.forEach((layer) => {
      if (!importedLayerIds.has(layer.id)) {
        throw new Error(`geojson.import layer missing from layerIds: ${layer.id}`);
      }
    });
    operation.features.forEach((feature) => {
      if (!importedFeatureIds.has(feature.id)) {
        throw new Error(`geojson.import feature missing from featureIds: ${feature.id}`);
      }
      if (!importedLayerIds.has(feature.layerId)) {
        throw new Error(`geojson.import feature layer missing from layerIds: ${feature.layerId}`);
      }
    });
  }
}

function assertFeatureTarget(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertUniqueIds(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate ids`);
  }
}
