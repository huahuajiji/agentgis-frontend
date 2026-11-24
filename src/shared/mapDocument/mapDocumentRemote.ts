/**
 * 后端 HTTP 客户端（2b）。
 *
 * 只做"请求 + 解析 + 归一化错误"，不碰 store、不解释业务。
 * 契约来自 agentgis-backend/docs/PLAN.md：全量 PUT、payload 原样存。
 */

export type RemoteDocumentMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteDocumentDetail = RemoteDocumentMeta & {
  payload: Record<string, unknown>;
};

export type RemoteErrorCode = 'network' | 'timeout' | 'not_found' | 'server' | 'invalid_response';

export class RemoteError extends Error {
  readonly code: RemoteErrorCode;

  constructor(code: RemoteErrorCode, message: string) {
    super(message);
    this.name = 'RemoteError';
    this.code = code;
  }
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = 5000;

export function remoteBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return (typeof configured === 'string' && configured.trim())
    ? configured.trim().replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 测试注入用；默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  if (typeof fetchImpl !== 'function') {
    throw new RemoteError('network', '当前环境不支持 fetch，无法连接后端');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${remoteBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RemoteError('timeout', `请求超时（${timeoutMs} 毫秒），后端可能没启动`);
    }
    throw new RemoteError('network', '连不上后端，请确认后端已启动且地址正确');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new RemoteError('not_found', '后端找不到这份文档（可能已被删除）');
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new RemoteError('server', message ?? `后端返回 ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return await response.json() as T;
  } catch {
    throw new RemoteError('invalid_response', '后端返回的不是合法 JSON');
  }
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === 'string' && message ? message : null;
  } catch {
    return null;
  }
}

export function remoteHealth(options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}) {
  return request<{ status: string; service: string; version: string }>('/health', options);
}

export function listRemoteDocuments(options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}) {
  return request<RemoteDocumentMeta[]>('/api/documents', options);
}

export function getRemoteDocument(
  remoteId: string,
  options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}
) {
  return request<RemoteDocumentDetail>(`/api/documents/${encodeURIComponent(remoteId)}`, options);
}

export function createRemoteDocument(
  name: string,
  payload: Record<string, unknown>,
  options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}
) {
  return request<RemoteDocumentDetail>('/api/documents', {
    ...options,
    method: 'POST',
    body: { name, payload }
  });
}

export function updateRemoteDocument(
  remoteId: string,
  name: string,
  payload: Record<string, unknown>,
  options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}
) {
  return request<RemoteDocumentDetail>(`/api/documents/${encodeURIComponent(remoteId)}`, {
    ...options,
    method: 'PUT',
    body: { name, payload }
  });
}

export function deleteRemoteDocument(
  remoteId: string,
  options: Pick<RequestOptions, 'fetchImpl' | 'timeoutMs'> = {}
) {
  return request<void>(`/api/documents/${encodeURIComponent(remoteId)}`, {
    ...options,
    method: 'DELETE'
  });
}
