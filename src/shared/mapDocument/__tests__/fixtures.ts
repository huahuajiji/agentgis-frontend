import type { Feature as GeoJsonFeature } from 'geojson';
import type {
  DraftMapDocument,
  MapFeature,
  MapLayer,
  MapOperation
} from '../../../schemas/mapDocumentSchema';
import { createDraftDocument } from '../mapDocumentCollection';
import type { MapDocumentLike } from '../mapDocumentValidation';

export const TEST_VIEWPORT = {
  center: [108.4177, 22.8416] as [number, number],
  zoom: 13,
  bounds: null
};

export function makeDocument(): DraftMapDocument {
  return createDraftDocument(TEST_VIEWPORT);
}

export function makeLayer(overrides: Partial<MapLayer> & { id: string }): MapLayer {
  return {
    name: `图层-${overrides.id}`,
    role: 'work',
    geometryType: 'mixed',
    visible: true,
    locked: false,
    order: 0,
    featureIds: [],
    style: {},
    imageResources: [],
    ...overrides
  };
}

export function makeFeature(
  id: string,
  layerId: string,
  geojson: GeoJsonFeature
): MapFeature {
  return {
    id,
    layerId,
    geojson,
    imageResourceId: null
  };
}

export function pointGeoJson(
  coordinates: [number, number] = [108.4, 22.8],
  properties: Record<string, unknown> = {}
): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties
  };
}

export function lineGeoJson(
  coordinates: [number, number][] = [[108.4, 22.8], [108.5, 22.9]]
): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {}
  };
}

export function polygonGeoJson(
  coordinates: [number, number][] = [
    [108.4, 22.8],
    [108.5, 22.8],
    [108.5, 22.9],
    [108.4, 22.8]
  ]
): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: {}
  };
}

export function withLayers(
  document: DraftMapDocument,
  layers: MapLayer[]
): DraftMapDocument {
  return {
    ...document,
    layers,
    selectedLayerId: layers[0]?.id ?? null
  };
}

export function withFeatures(
  document: DraftMapDocument,
  features: MapFeature[]
): DraftMapDocument {
  return {
    ...document,
    features: Object.fromEntries(features.map((feature) => [feature.id, feature]))
  };
}

export function withWorkingOperations(
  document: MapDocumentLike,
  workingOperations: MapOperation[],
  redoOperations: MapOperation[] = []
): MapDocumentLike {
  return {
    ...document,
    edit: {
      ...document.edit,
      workingOperations,
      redoOperations
    }
  };
}

let operationSequence = 0;

export function resetOperationSequence() {
  operationSequence = 0;
}

function baseOperation() {
  operationSequence += 1;
  return {
    id: `op-${operationSequence}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'user' as const
  };
}

export function layerCreate(layer: MapLayer): MapOperation {
  return {
    ...baseOperation(),
    type: 'layer.create',
    layerId: layer.id,
    after: layer,
    summary: `新建图层「${layer.name}」`
  };
}

export function layerUpdate(
  layerId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): MapOperation {
  return {
    ...baseOperation(),
    type: 'layer.update',
    layerId,
    before,
    after,
    summary: '更新图层'
  };
}

export function layerDelete(
  layer: MapLayer,
  deletedFeatures: MapFeature[] = []
): MapOperation {
  return {
    ...baseOperation(),
    type: 'layer.delete',
    layerId: layer.id,
    before: layer,
    deletedFeatures,
    summary: `删除图层「${layer.name}」`
  };
}

export function featureCreate(feature: MapFeature): MapOperation {
  return {
    ...baseOperation(),
    type: 'feature.create',
    featureId: feature.id,
    layerId: feature.layerId,
    after: feature,
    summary: `新增要素「${feature.id}」`
  };
}

export function featureUpdate(
  featureId: string,
  layerId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): MapOperation {
  return {
    ...baseOperation(),
    type: 'feature.update',
    featureId,
    layerId,
    before,
    after,
    summary: '更新要素'
  };
}

export function featureDelete(feature: MapFeature): MapOperation {
  return {
    ...baseOperation(),
    type: 'feature.delete',
    featureId: feature.id,
    layerId: feature.layerId,
    before: feature,
    summary: `删除要素「${feature.id}」`
  };
}
