/**
 * 坐标系一次性迁移（方案 B，2026-11-26）。
 *
 * 方案 B 之前，文档几何与 viewport 实际存的是 GCJ-02（高德原生坐标，无标记）。
 * 这里把「无 crs 标记」的旧文档整体转成 WGS-84 并补上 `crs: 'wgs84'`，
 * 之后每次 hydrate 都幂等（带标记的文档原样返回，不做二次转换）。
 */
import type { Feature as GeoJsonFeature, Geometry } from 'geojson';
import type {
  DraftMapDocument,
  MapFeature,
  MapViewport,
  SavedMapDocument
} from '../../schemas/mapDocumentSchema';
import { gcj02ToWgs84, transformGeometry } from '../geo/coordTransform';

type DocumentLike = DraftMapDocument | SavedMapDocument;

export function transformViewportToWgs84(viewport: MapViewport): MapViewport {
  const [centerLng, centerLat] = gcj02ToWgs84(viewport.center[0], viewport.center[1]);
  if (!viewport.bounds) {
    return { ...viewport, center: [centerLng, centerLat] };
  }

  const [neLng, neLat] = gcj02ToWgs84(viewport.bounds.northEast[0], viewport.bounds.northEast[1]);
  const [swLng, swLat] = gcj02ToWgs84(viewport.bounds.southWest[0], viewport.bounds.southWest[1]);
  return {
    ...viewport,
    center: [centerLng, centerLat],
    bounds: {
      northEast: [neLng, neLat],
      southWest: [swLng, swLat]
    }
  };
}

export function transformFeatureToWgs84(feature: MapFeature): MapFeature {
  const geojson: GeoJsonFeature = {
    ...feature.geojson,
    geometry: transformGeometry(feature.geojson.geometry as Geometry, gcj02ToWgs84)
  };
  return { ...feature, geojson };
}

/**
 * 旧文档（无 crs 标记）→ WGS-84 文档。
 * 已带标记的文档原样返回（幂等）。
 */
export function migrateDocumentToWgs84<T extends DocumentLike>(document: T): T {
  if (document.crs === 'wgs84') {
    return document;
  }

  return {
    ...document,
    viewport: transformViewportToWgs84(document.viewport),
    features: Object.fromEntries(
      Object.entries(document.features).map(([featureId, feature]) => [
        featureId,
        transformFeatureToWgs84(feature)
      ])
    ),
    crs: 'wgs84'
  };
}
