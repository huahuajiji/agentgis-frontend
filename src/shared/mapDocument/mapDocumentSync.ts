/**
 * 同步相关的纯函数（2b）。无 I/O，全部可单测。
 */
import type { SavedMapDocument } from '../../schemas/mapDocumentSchema';
import { createEmptyEditState } from './mapDocumentCollection';
import type { RemoteDocumentDetail } from './mapDocumentRemote';
import { RemoteError } from './mapDocumentRemote';

/**
 * 上传用的 payload：只含业务内容。
 *
 * 剥离 `edit`（含待同步池、撤销栈、外部操作记录——这些是设备本地的同步元数据，
 * 后端永远不该看到）与选中态（纯 UI），以及 `remoteId`（前端自己的记账字段）。
 */
export function toRemotePayload(document: SavedMapDocument): Record<string, unknown> {
  return {
    kind: document.kind,
    id: document.id,
    name: document.name,
    workspaceId: document.workspaceId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    viewport: document.viewport,
    layers: document.layers,
    features: document.features
  };
}

/**
 * 拉回的后端文档 → 本地文档。
 *
 * - 本地 id 保留 payload 里带的 id（前端生成的 map-xxxx），remoteId 用后端 id 补齐；
 * - payload 里没有 `edit`（上传时被剥离）→ 补一个空编辑态。
 *   注意：待同步池 / 撤销栈是设备本地状态，跨设备拉回来就是空的，这是设计而非缺陷。
 * - 缺字段时返回 null，由调用方决定跳过并提示，而不是抛错中断整次拉取。
 */
export function fromRemoteDetail(detail: RemoteDocumentDetail): SavedMapDocument | null {
  const payload = detail.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id) {
    return null;
  }

  // 做最小形状检查；完整校验交给调用方的 Zod schema。
  return {
    ...(raw as unknown as SavedMapDocument),
    kind: 'saved',
    edit: createEmptyEditState(),
    selectedLayerId: null,
    selectedFeatureId: null,
    remoteId: detail.id
  };
}

/** 给本地文档贴上后端 id（不改变其他字段）。 */
export function attachRemoteId(document: SavedMapDocument, remoteId: string): SavedMapDocument {
  return { ...document, remoteId };
}

/**
 * 合并远程列表到本地集合。返回要"按需下载详情"的 remoteId 列表：
 * - 本地没有对应 remoteId → 需要下载；
 * - 本地有但远程 updatedAt 更新 → 需要下载（本地较新则保留本地）。
 */
export function planPull(
  documentsById: Record<string, SavedMapDocument>,
  remoteMetas: Array<{ id: string; updatedAt: string }>
): string[] {
  const localByRemoteId = new Map<string, SavedMapDocument>();
  for (const document of Object.values(documentsById)) {
    if (document.remoteId) {
      localByRemoteId.set(document.remoteId, document);
    }
  }

  const toDownload: string[] = [];
  for (const meta of remoteMetas) {
    const local = localByRemoteId.get(meta.id);
    if (!local || isRemoteNewer(meta.updatedAt, local.updatedAt)) {
      toDownload.push(meta.id);
    }
  }
  return toDownload;
}

function isRemoteNewer(remoteUpdatedAt: string, localUpdatedAt: string) {
  const remoteTime = Date.parse(remoteUpdatedAt);
  const localTime = Date.parse(localUpdatedAt);
  if (!Number.isFinite(remoteTime)) {
    return false;
  }
  if (!Number.isFinite(localTime)) {
    return true;
  }
  return remoteTime > localTime;
}

/** 同步错误 → 界面用的中文人话。 */
export function describeSyncError(error: unknown): string {
  if (error instanceof RemoteError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return `同步失败：${error.message}`;
  }
  return '同步失败：未知错误';
}
