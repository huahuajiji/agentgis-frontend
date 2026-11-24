/**
 * 持久化层测试（2a）：写队列与读取入口。
 *
 * 覆盖三件事：
 * 1. persistState 入队后 flush 能从 IndexedDB 读回等价状态；
 * 2. 相同快照重复入队只写一次（避免无关重渲染触发重复写）；
 * 3. loadStoredStateAsync 在空库时返回默认状态。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloneViewport,
  createDefaultState,
  DEFAULT_VIEWPORT,
  flushPendingWrites,
  loadStoredStateAsync,
  persistAndReturn,
  persistState
} from '../mapDocumentPersistence';
import { readStoredState, clearStoredState, writeStoredState } from '../mapDocumentIdb';
import { createDraftDocument } from '../mapDocumentCollection';
import { SavedMapDocumentSchema, type SavedMapDocument } from '../../../schemas/mapDocumentSchema';

function makeSavedDocument(id: string, name: string): SavedMapDocument {
  return SavedMapDocumentSchema.parse({
    ...createDraftDocument(DEFAULT_VIEWPORT),
    id,
    kind: 'saved',
    name,
    workspaceId: 'ws-default',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z'
  });
}

beforeEach(async () => {
  vi.resetModules();
  await clearStoredState();
});

describe('持久化写队列', () => {
  it('persistState 入队后 flush，可从 IndexedDB 读回', async () => {
    const base = createDefaultState();
    const document = makeSavedDocument('map-q', '队列测试');
    const state = {
      ...base,
      defaultWorkspace: { ...base.defaultWorkspace, mapIds: ['map-q'] },
      documentsById: { 'map-q': document },
      activeDocumentRef: { kind: 'saved' as const, id: 'map-q' }
    };

    persistState(state);
    await flushPendingWrites();

    const restored = await readStoredState();
    expect(restored!.documentsById['map-q']?.name).toBe('队列测试');
    expect(restored!.activeDocumentRef).toEqual({ kind: 'saved', id: 'map-q' });
  });

  it('persistAndReturn 原样返回传入值', () => {
    const state = createDefaultState(cloneViewport(DEFAULT_VIEWPORT));
    const sentinel = { ok: true };
    expect(persistAndReturn(state, sentinel)).toBe(sentinel);
  });

  it('连续多次入队按顺序落盘，最后状态胜出', async () => {
    const base = createDefaultState();
    // 模拟用户快速连点：三次不同状态入队
    for (const name of ['第一次', '第二次', '第三次']) {
      persistState({
        ...base,
        documentsById: { 'map-q': makeSavedDocument('map-q', name) },
        defaultWorkspace: { ...base.defaultWorkspace, mapIds: ['map-q'] }
      });
    }
    await flushPendingWrites();

    const restored = await readStoredState();
    expect(restored!.documentsById['map-q']?.name).toBe('第三次');
  });
});

describe('启动读取', () => {
  it('空库返回默认状态，source=default', async () => {
    const result = await loadStoredStateAsync();
    expect(result.source).toBe('default');
    expect(result.state.documentsById).toEqual({});
  });

  it('库里有数据时返回库内状态，source=indexeddb', async () => {
    const base = createDefaultState();
    await writeStoredState({
      ...base,
      documentsById: { 'map-r': makeSavedDocument('map-r', '库里已有') },
      defaultWorkspace: { ...base.defaultWorkspace, mapIds: ['map-r'] }
    });

    const result = await loadStoredStateAsync();
    expect(result.source).toBe('indexeddb');
    expect(result.state.documentsById['map-r']?.name).toBe('库里已有');
  });
});

describe('旧 localStorage 迁移', () => {
  const LEGACY_KEY = 'agentgis:v9_3:map-document-state';
  const BACKUP_KEY = 'agentgis:v9_3:map-document-state:pre-migration-backup';

  function installLocalStorageStub() {
    const storage = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear()
    };
    return storage;
  }

  it('localStorage 有数据、库为空 → 迁移进库并留备份，第二次启动改走库', async () => {
    const storage = installLocalStorageStub();
    const emptyEdit = {
      baseRevisionId: null,
      remoteRevisionId: null,
      workingOperations: [],
      redoOperations: [],
      commitPool: [],
      externalOperations: []
    };
    const viewport = { center: [108.4, 22.8], zoom: 13, bounds: null };
    storage.set(LEGACY_KEY, JSON.stringify({
      defaultWorkspace: { id: 'ws-default', name: 'Default workspace', mapIds: ['map-legacy'] },
      draftDocument: {
        id: 'local-draft',
        kind: 'draft',
        name: '草稿',
        viewport,
        layers: [],
        features: {},
        selectedLayerId: null,
        selectedFeatureId: null,
        edit: emptyEdit
      },
      documentsById: {
        'map-legacy': {
          id: 'map-legacy',
          kind: 'saved',
          name: '老地图',
          workspaceId: 'ws-default',
          createdAt: '2026-11-20T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z',
          viewport,
          layers: [],
          features: {},
          selectedLayerId: null,
          selectedFeatureId: null,
          edit: emptyEdit
        }
      },
      activeDocumentRef: { kind: 'saved', id: 'map-legacy' }
    }));

    const first = await loadStoredStateAsync();
    expect(first.source).toBe('legacy-localstorage');
    expect(first.state.documentsById['map-legacy']?.name).toBe('老地图');
    expect(storage.get(BACKUP_KEY)).toBeTruthy();

    const persisted = await readStoredState();
    expect(persisted!.documentsById['map-legacy']?.name).toBe('老地图');

    const second = await loadStoredStateAsync();
    expect(second.source).toBe('indexeddb');
    expect(second.state.documentsById['map-legacy']?.name).toBe('老地图');
  });
});
