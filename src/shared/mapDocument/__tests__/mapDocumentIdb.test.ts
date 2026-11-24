/**
 * IndexedDB 存储层测试（2a）。
 *
 * 每个用例前重置数据库模块（模块级 dbPromise 缓存），用 fake-indexeddb 模拟。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultState, cloneViewport, DEFAULT_VIEWPORT } from '../mapDocumentPersistence';
import { createDraftDocument } from '../mapDocumentCollection';
import {
  canUseIndexedDb,
  clearStoredState,
  deleteSavedDocument,
  readStoredState,
  writeSavedDocument,
  writeStoredState
} from '../mapDocumentIdb';
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

function makeState() {
  const base = createDefaultState();
  const documentA = makeSavedDocument('map-a', '地图 A');
  const documentB = makeSavedDocument('map-b', '地图 B');
  return {
    ...base,
    defaultWorkspace: { ...base.defaultWorkspace, mapIds: ['map-a', 'map-b'] },
    documentsById: { 'map-a': documentA, 'map-b': documentB },
    activeDocumentRef: { kind: 'saved' as const, id: 'map-a' }
  };
}

beforeEach(async () => {
  vi.resetModules();
  await clearStoredState();
});

describe('IndexedDB 存储层', () => {
  it('环境可用（fake-indexeddb 已注册）', () => {
    expect(canUseIndexedDb()).toBe(true);
  });

  it('空库读出 null', async () => {
    expect(await readStoredState()).toBeNull();
  });

  it('整状态写入后能原样读回', async () => {
    const state = makeState();
    await writeStoredState(state);

    const restored = await readStoredState();
    expect(restored).not.toBeNull();
    expect(Object.keys(restored!.documentsById).sort()).toEqual(['map-a', 'map-b']);
    expect(restored!.draftDocument.id).toBe(state.draftDocument.id);
    expect(restored!.activeDocumentRef).toEqual({ kind: 'saved', id: 'map-a' });
    expect(restored!.defaultWorkspace.mapIds).toEqual(['map-a', 'map-b']);
  });

  it('重写会替换旧内容而不是叠加', async () => {
    await writeStoredState(makeState());

    const next = createDefaultState(cloneViewport(DEFAULT_VIEWPORT));
    await writeStoredState(next);

    const restored = await readStoredState();
    expect(restored!.documentsById).toEqual({});
  });

  it('单文档写入与删除', async () => {
    await writeStoredState(createDefaultState());
    await writeSavedDocument(makeSavedDocument('map-c', '地图 C'));

    let restored = await readStoredState();
    expect(restored!.documentsById['map-c']?.name).toBe('地图 C');

    await deleteSavedDocument('map-c');
    restored = await readStoredState();
    expect(restored!.documentsById['map-c']).toBeUndefined();
  });

  it('清空后读出 null', async () => {
    await writeStoredState(makeState());
    await clearStoredState();
    expect(await readStoredState()).toBeNull();
  });
});
