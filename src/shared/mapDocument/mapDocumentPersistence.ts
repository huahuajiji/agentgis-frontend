import {
  MapDocumentStateSchema,
  MapViewportSchema,
  WorkspaceSchema,
  type MapDocumentState,
  type MapViewport,
  type Workspace
} from '../../schemas/mapDocumentSchema';
import { createDraftDocument } from './mapDocumentCollection';
import { DEFAULT_WORKSPACE_ID } from './mapDocumentConstants';
import {
  normalizeStoredState,
  type MigrationNotice
} from './mapDocumentMigration';
import {
  canUseIndexedDb,
  clearStoredState as clearIndexedDbState,
  readStoredState as readIndexedDbState,
  writeStoredState as writeIndexedDbState
} from './mapDocumentIdb';

const LEGACY_STORAGE_KEY = 'agentgis:v9_3:map-document-state';
const LEGACY_DOCUMENT_KEY = 'agentgis:v9_3:map-document';
const MIGRATION_NOTICE_KEY = 'agentgis:v9_3:migration-notices';
const MIGRATION_BACKUP_KEY = 'agentgis:v9_3:map-document-state:pre-migration-backup';

type LngLat = [number, number];

export const DEFAULT_VIEWPORT: MapViewport = {
  center: [108.4177, 22.8416],
  zoom: 13,
  bounds: null
};

export function cloneViewport(value: unknown = DEFAULT_VIEWPORT): MapViewport {
  const viewport = isRecord(value) ? value : {};
  const bounds = isRecord(viewport.bounds) ? viewport.bounds : null;

  return MapViewportSchema.parse({
    center: cloneLngLat(viewport.center, DEFAULT_VIEWPORT.center),
    zoom: Number.isFinite(Number(viewport.zoom)) ? Number(viewport.zoom) : DEFAULT_VIEWPORT.zoom,
    bounds: bounds
      ? {
        northEast: cloneLngLat(bounds.northEast, DEFAULT_VIEWPORT.center),
        southWest: cloneLngLat(bounds.southWest, DEFAULT_VIEWPORT.center)
      }
      : null
  });
}

export function createDefaultState(viewport: MapViewport = DEFAULT_VIEWPORT): MapDocumentState {
  return MapDocumentStateSchema.parse({
    defaultWorkspace: createDefaultWorkspace(),
    draftDocument: createDraftDocument(viewport),
    documentsById: {},
    activeDocumentRef: { kind: 'draft' }
  });
}

/**
 * 启动时读取完整状态（2a 起为异步：IndexedDB）。
 *
 * 顺序：IndexedDB 有数据 → 用；没有 → 尝试从旧 localStorage 迁移；都没有 → 默认状态。
 * 传入 `fallback` 是为了让界面能先挂载（同步的默认状态），读完后替换。
 */
export async function loadStoredStateAsync(): Promise<{
  state: MapDocumentState;
  source: 'indexeddb' | 'legacy-localstorage' | 'default';
}> {
  if (canUseIndexedDb()) {
    try {
      const stored = await readIndexedDbState();
      if (stored) {
        // 库里的数据同样过一遍 normalize，兜住版本间 schema 变化。
        const result = normalizeStoredState(stored, {
          cloneViewport,
          createDefaultState,
          defaultViewport: DEFAULT_VIEWPORT
        });
        persistMigrationNotices(result.notices);
        vacuumLegacyKeys();
        return { state: result.state, source: 'indexeddb' };
      }
    } catch (error) {
      console.warn('[AgentGIS] IndexedDB 读取失败，尝试旧存储', error);
    }
  }

  const legacy = readLegacyLocalStorageState();
  if (legacy) {
    // 迁移一次：写入 IndexedDB 后，旧 key 保留为只读备份（MIGRATION_BACKUP_KEY），
    // 下一版本确认无误后再删。
    backupRawStoredState(legacy.raw);
    if (canUseIndexedDb()) {
      try {
        await writeIndexedDbState(legacy.state);
      } catch (error) {
        console.warn('[AgentGIS] 迁移写入 IndexedDB 失败，本次仍使用内存状态', error);
      }
    }
    return { state: legacy.state, source: 'legacy-localstorage' };
  }

  return { state: createDefaultState(), source: 'default' };
}

/** 同步版，仅保留给测试与无 IndexedDB 环境的兜底。 */
export function loadStoredState(): MapDocumentState {
  const legacy = readLegacyLocalStorageState();
  return legacy ? legacy.state : createDefaultState();
}

export function persistState(state: MapDocumentState) {
  enqueueWrite(state);
}

export function persistAndReturn<T>(state: MapDocumentState, value: T) {
  enqueueWrite(state);
  return value;
}

export async function clearStoredState() {
  if (canUseIndexedDb()) {
    try {
      await clearIndexedDbState();
    } catch (error) {
      console.warn('[AgentGIS] IndexedDB 清空失败', error);
    }
  }

  if (canUseLocalStorage()) {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_DOCUMENT_KEY);
    window.localStorage.removeItem(MIGRATION_NOTICE_KEY);
    window.localStorage.removeItem(MIGRATION_BACKUP_KEY);
  }
}

/**
 * 写队列：同一时刻只有一个 IndexedDB 写事务在跑，排队执行。
 *
 * 为什么必须要串行：用户连点撤销时，两次 persistState 会几乎同时入队；
 * IndexedDB 的两个事务如果交错提交，后写的旧快照可能覆盖先写的新快照。
 * 队列保证"入队顺序 = 落盘顺序"。
 *
 * 快照在入队时取（JSON.stringify），而不是等轮到自己再读 state——
 * 队列有等待期内 state 已被后续修改，读实时值会存错版本。
 */
let writeQueue: Promise<void> = Promise.resolve();
let lastQueuedSnapshot = '';

function enqueueWrite(state: MapDocumentState) {
  if (!canUseIndexedDb()) {
    return;
  }

  let snapshot: string;
  try {
    snapshot = JSON.stringify(state);
  } catch (error) {
    console.warn('[AgentGIS] 状态无法序列化，跳过本次保存', error);
    return;
  }

  if (snapshot === lastQueuedSnapshot) {
    return;
  }
  lastQueuedSnapshot = snapshot;

  writeQueue = writeQueue
    .then(() => writeIndexedDbState(JSON.parse(snapshot) as MapDocumentState))
    .catch((error) => {
      console.warn('[AgentGIS] IndexedDB 写入失败（内存状态不受影响）', error);
    });
}

/** 等待所有排队写入完成（测试与页面卸载前使用）。 */
export async function flushPendingWrites(): Promise<void> {
  await writeQueue;
}

function readLegacyLocalStorageState(): { state: MapDocumentState; raw: string } | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      return {
        state: normalizeAndPersistNotices(JSON.parse(saved)),
        raw: saved
      };
    }
  } catch {
    return null;
  }

  try {
    const legacyDocument = window.localStorage.getItem(LEGACY_DOCUMENT_KEY);
    if (legacyDocument) {
      return {
        state: normalizeAndPersistNotices({
          defaultWorkspace: createDefaultWorkspace(),
          draftDocument: JSON.parse(legacyDocument),
          documentsById: {},
          activeDocumentRef: { kind: 'draft' }
        }),
        raw: legacyDocument
      };
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeAndPersistNotices(value: unknown) {
  const result = normalizeStoredState(value, {
    cloneViewport,
    createDefaultState,
    defaultViewport: DEFAULT_VIEWPORT
  });
  persistMigrationNotices(result.notices);
  return result.state;
}

function persistMigrationNotices(notices: MigrationNotice[]) {
  if (!notices.length || !canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(MIGRATION_NOTICE_KEY, JSON.stringify(notices));
    console.warn('[AgentGIS] MapDocument migration notices', notices);
  } catch {
    // Migration notices are best-effort; recovered map data should still load.
  }
}

function backupRawStoredState(raw: string) {
  if (!canUseLocalStorage() || window.localStorage.getItem(MIGRATION_BACKUP_KEY)) {
    return;
  }

  try {
    window.localStorage.setItem(MIGRATION_BACKUP_KEY, raw);
  } catch {
    // Local recovery backup is best-effort.
  }
}

/**
 * 迁移尸体清理（2b）：IndexedDB 确认可用且有数据后，
 * 旧 localStorage 的三个 key（主数据 / 备份 / 迁移报告）已无作用，一并删除。
 * 只在"IDB 读到了真实状态"这条路径上调用，绝不先删后验。
 */
function vacuumLegacyKeys() {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_DOCUMENT_KEY);
    window.localStorage.removeItem(MIGRATION_NOTICE_KEY);
    window.localStorage.removeItem(MIGRATION_BACKUP_KEY);
  } catch {
    // Cleanup is best-effort.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneLngLat(value: unknown, fallback: LngLat): LngLat {
  if (!Array.isArray(value) || value.length < 2) {
    return [...fallback];
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return [...fallback];
  }

  return [lng, lat];
}

function createDefaultWorkspace(mapIds: string[] = []): Workspace {
  return WorkspaceSchema.parse({
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default workspace',
    mapIds
  });
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
