/**
 * 后端客户端测试（2b）：全部 mock fetch，不碰网络。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  RemoteError,
  createRemoteDocument,
  deleteRemoteDocument,
  getRemoteDocument,
  listRemoteDocuments,
  updateRemoteDocument
} from '../mapDocumentRemote';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const meta = {
  id: 'doc-abc123',
  name: '测试地图',
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z'
};

describe('后端客户端', () => {
  it('列表成功解析', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([meta]));
    const result = await listRemoteDocuments({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('doc-abc123');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/documents'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('404 抛 not_found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(
      { error: { code: 'not_found', message: '文档不存在' } },
      404
    ));

    await expect(getRemoteDocument('doc-missing', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('网络失败抛 network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(listRemoteDocuments({ fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: 'network' });
  });

  it('超时抛 timeout', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => (
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })
    ));

    await expect(listRemoteDocuments({ fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 }))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it('后端错误体解析出中文提示', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(
      { error: { code: 'validation_error', message: '请求参数不合法' } },
      422
    ));

    await expect(createRemoteDocument('x', {}, { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: 'server', message: '请求参数不合法' });
  });

  it('PUT 请求形状正确（name + payload + JSON 头）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ...meta, payload: { id: 'map-1' } }));

    await updateRemoteDocument('doc-abc123', '新名字', { id: 'map-1' }, {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/api/documents/doc-abc123');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ name: '新名字', payload: { id: 'map-1' } });
  });

  it('DELETE 204 不解析 body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteRemoteDocument('doc-abc123', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .resolves.toBeUndefined();
  });

  it('RemoteError 带 code 字段', () => {
    const error = new RemoteError('network', '连不上');
    expect(error.code).toBe('network');
    expect(error.name).toBe('RemoteError');
  });
});
