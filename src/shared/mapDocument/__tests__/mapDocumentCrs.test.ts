import { describe, expect, it } from 'vitest';
import type { DraftMapDocument } from '../../../schemas/mapDocumentSchema';
import { createDraftDocument } from '../mapDocumentCollection';
import { migrateDocumentToWgs84, transformFeatureToWgs84, transformViewportToWgs84 } from '../mapDocumentCrs';
import { normalizeStoredState } from '../mapDocumentMigration';
import { DEFAULT_VIEWPORT, cloneViewport, createDefaultState } from '../mapDocumentPersistence';

const GCJ_CENTER: [number, number] = [116.397128, 39.916527];

function makeLegacyDocument() {
  const document = createDraftDocument({
    center: GCJ_CENTER,
    zoom: 13,
    bounds: null
  });
  // 模拟方案 B 之前的旧数据：没有 crs 标记，几何是 GCJ-02。
  const { crs: _crs, ...legacy } = document;
  return {
    ...legacy,
    features: {
      'feature-1': {
        id: 'feature-1',
        layerId: 'layer-1',
        imageResourceId: null,
        geojson: {
          type: 'Feature' as const,
          properties: { name: '点_1' },
          geometry: { type: 'Point' as const, coordinates: GCJ_CENTER }
        }
      }
    }
  };
}

describe('mapDocumentCrs · 迁移幂等', () => {
  it('无标记文档转换为 WGS 并打上标记', () => {
    const legacy = makeLegacyDocument();
    const migrated = migrateDocumentToWgs84(legacy as unknown as DraftMapDocument);
    expect(migrated.crs).toBe('wgs84');
    const coords = (migrated.features['feature-1'].geojson.geometry as unknown as { coordinates: [number, number] }).coordinates;
    expect(coords[0]).not.toBe(GCJ_CENTER[0]);
    expect(Math.abs(coords[0] - 116.391216)).toBeLessThan(5e-4);
  });

  it('已带标记文档原样返回（二次迁移不变）', () => {
    const legacy = makeLegacyDocument();
    const once = migrateDocumentToWgs84(legacy as unknown as DraftMapDocument);
    const twice = migrateDocumentToWgs84(once);
    expect(twice).toBe(once);
  });

  it('viewport 的 center 与 bounds 同步转换', () => {
    const viewport = transformViewportToWgs84({
      center: GCJ_CENTER,
      zoom: 13,
      bounds: {
        northEast: [116.40, 39.92],
        southWest: [116.39, 39.91]
      }
    });
    expect(viewport.center[0]).not.toBe(GCJ_CENTER[0]);
    expect(viewport.bounds?.northEast[0]).not.toBe(116.40);
    expect(viewport.bounds?.southWest[1]).not.toBe(39.91);
  });

  it('transformFeatureToWgs84 保留 properties 与其他字段', () => {
    const feature = makeLegacyDocument().features['feature-1'];
    const migrated = transformFeatureToWgs84(feature);
    expect(migrated.geojson.properties).toEqual({ name: '点_1' });
    expect(migrated.id).toBe('feature-1');
  });
});

describe('mapDocumentCrs · normalizeStoredState 集成', () => {
  it('从旧状态读入时自动迁移并给出提示', () => {
    const legacy = makeLegacyDocument();
    const state = {
      defaultWorkspace: { id: 'ws', name: 'Default', mapIds: [] },
      draftDocument: legacy,
      documentsById: {},
      activeDocumentRef: { kind: 'draft' as const }
    };
    const result = normalizeStoredState(state, {
      cloneViewport,
      createDefaultState,
      defaultViewport: DEFAULT_VIEWPORT
    });
    expect(result.state.draftDocument.crs).toBe('wgs84');
    expect(result.notices.some((notice) => notice.message.includes('WGS-84'))).toBe(true);
  });

  it('带标记的状态再次 normalize 不再迁移', () => {
    const state = createDefaultState();
    const result = normalizeStoredState(state, {
      cloneViewport,
      createDefaultState,
      defaultViewport: DEFAULT_VIEWPORT
    });
    expect(result.state.draftDocument.crs).toBe('wgs84');
    expect(result.notices.some((notice) => notice.message.includes('WGS-84'))).toBe(false);
  });

  it('归一化两遍不产生二次转换（坐标必须保持不变）', () => {
    const legacy = makeLegacyDocument();
    const state = {
      defaultWorkspace: { id: 'ws', name: 'Default', mapIds: [] },
      draftDocument: legacy,
      documentsById: {},
      activeDocumentRef: { kind: 'draft' as const }
    };
    const first = normalizeStoredState(state, {
      cloneViewport,
      createDefaultState,
      defaultViewport: DEFAULT_VIEWPORT
    });
    const second = normalizeStoredState(first.state, {
      cloneViewport,
      createDefaultState,
      defaultViewport: DEFAULT_VIEWPORT
    });
    const firstCoords = (first.state.draftDocument.features['feature-1'].geojson.geometry as unknown as { coordinates: number[] }).coordinates;
    const secondCoords = (second.state.draftDocument.features['feature-1'].geojson.geometry as unknown as { coordinates: number[] }).coordinates;
    expect(secondCoords).toEqual(firstCoords);
  });
});
