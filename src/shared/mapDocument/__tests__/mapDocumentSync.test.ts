/**
 * 同步纯函数测试（2b）。
 */
import { describe, expect, it } from 'vitest';
import { createDraftDocument } from '../mapDocumentCollection';
import { DEFAULT_VIEWPORT } from '../mapDocumentPersistence';
import { SavedMapDocumentSchema, type SavedMapDocument } from '../../../schemas/mapDocumentSchema';
import {
  attachRemoteId,
  describeSyncError,
  fromRemoteDetail,
  planPull,
  toRemotePayload
} from '../mapDocumentSync';
import { RemoteError } from '../mapDocumentRemote';

function makeSavedDocument(overrides: Partial<SavedMapDocument> = {}): SavedMapDocument {
  return SavedMapDocumentSchema.parse({
    ...createDraftDocument(DEFAULT_VIEWPORT),
    id: 'map-1',
    kind: 'saved',
    name: '地图一',
    workspaceId: 'ws-default',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    ...overrides
  });
}

describe('toRemotePayload', () => {
  it('剥离 edit、选中态与 remoteId，保留业务字段', () => {
    const document = makeSavedDocument({
      remoteId: 'doc-abc',
      selectedLayerId: 'layer-x',
      selectedFeatureId: 'feature-y'
    });

    const payload = toRemotePayload(document);

    expect(payload).not.toHaveProperty('edit');
    expect(payload).not.toHaveProperty('selectedLayerId');
    expect(payload).not.toHaveProperty('selectedFeatureId');
    expect(payload).not.toHaveProperty('remoteId');
    expect(payload.id).toBe('map-1');
    expect(payload.name).toBe('地图一');
    expect(payload.layers).toEqual([]);
    expect(payload.features).toEqual({});
    expect((payload.viewport as { zoom: number }).zoom).toBe(DEFAULT_VIEWPORT.zoom);
  });
});

describe('fromRemoteDetail / attachRemoteId', () => {
  it('把后端 id 贴到 remoteId，本地 id 不变', () => {
    const detail = {
      id: 'doc-abc',
      name: '地图一',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
      payload: {
        kind: 'saved',
        id: 'map-1',
        name: '地图一',
        workspaceId: 'ws-default',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
        viewport: DEFAULT_VIEWPORT,
        layers: [],
        features: {}
      }
    };

    const parsed = fromRemoteDetail(detail);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('map-1');
    expect(parsed!.remoteId).toBe('doc-abc');
    expect(parsed!.edit.commitPool).toEqual([]);
    expect(parsed!.edit.workingOperations).toEqual([]);
  });

  it('payload 缺 id 返回 null', () => {
    expect(fromRemoteDetail({
      id: 'doc-abc',
      name: 'x',
      createdAt: '',
      updatedAt: '',
      payload: { name: 'x' }
    })).toBeNull();
  });

  it('attachRemoteId 只加字段', () => {
    const document = makeSavedDocument();
    const attached = attachRemoteId(document, 'doc-new');
    expect(attached.remoteId).toBe('doc-new');
    expect(attached.id).toBe(document.id);
    expect(attached.updatedAt).toBe(document.updatedAt);
  });
});

describe('planPull', () => {
  const localWithRemote = makeSavedDocument({
    id: 'map-local',
    remoteId: 'doc-remote',
    updatedAt: '2026-11-24T00:00:00.000Z'
  });

  it('云端更新的文档需要下载，本地更新的跳过', () => {
    const toDownload = planPull(
      { [localWithRemote.id]: localWithRemote },
      [
        { id: 'doc-remote', updatedAt: '2026-11-24T01:00:00.000Z' }, // 更新 → 下载
        { id: 'doc-other', updatedAt: '2026-11-24T00:00:00.000Z' },  // 本地没有 → 下载
        { id: 'doc-stale', updatedAt: '2020-01-01T00:00:00.000Z' }   // 本地没有 → 也下载
      ]
    );
    // doc-remote 需要下载；doc-other / doc-stale 本地没有 remoteId 对应 → 下载
    expect(toDownload).toContain('doc-remote');
    expect(toDownload).toContain('doc-other');
    expect(toDownload).toContain('doc-stale');
  });

  it('本地较新时不下载', () => {
    const toDownload = planPull(
      { [localWithRemote.id]: localWithRemote },
      [{ id: 'doc-remote', updatedAt: '2026-11-23T00:00:00.000Z' }]
    );
    expect(toDownload).not.toContain('doc-remote');
  });
});

describe('describeSyncError', () => {
  it('RemoteError 直接用人话', () => {
    expect(describeSyncError(new RemoteError('timeout', '请求超时（5000 毫秒）')))
      .toBe('请求超时（5000 毫秒）');
  });

  it('普通 Error 加前缀', () => {
    expect(describeSyncError(new Error('boom'))).toBe('同步失败：boom');
  });

  it('未知值给兜底文案', () => {
    expect(describeSyncError('what')).toBe('同步失败：未知错误');
  });
});
