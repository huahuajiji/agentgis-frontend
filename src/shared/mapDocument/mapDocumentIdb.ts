/**
 * IndexedDB 存储层（2a）。
 *
 * 职责边界：只管"存/取/删"，不解释业务。文档对象按 id 分条存进 `documents`，
 * 工作区与当前活动引用这类"整体状态"存进 `meta` 单条。这样改一份文档只写一行，
 * 不像 localStorage 每次整体序列化。
 *
 * 上层（mapDocumentPersistence）负责 normalize / 迁移 / 串行队列，本文件保持薄。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MapDocumentState, SavedMapDocument, DraftMapDocument } from '../../schemas/mapDocumentSchema';

const DB_NAME = 'agentgis';
const DB_VERSION = 1;

type StoredDraft = { key: 'draft'; document: DraftMapDocument };
type StoredMeta = {
  key: 'state';
  defaultWorkspace: MapDocumentState['defaultWorkspace'];
  activeDocumentRef: MapDocumentState['activeDocumentRef'];
};

interface AgentGisDb extends DBSchema {
  documents: {
    key: string;
    value: SavedMapDocument;
  };
  draft: {
    key: 'draft';
    value: StoredDraft;
  };
  meta: {
    key: 'state';
    value: StoredMeta;
  };
}

let dbPromise: Promise<IDBPDatabase<AgentGisDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AgentGisDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('draft')) {
          db.createObjectStore('draft', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      }
    });
  }
  return dbPromise;
}

export function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

/** 读回完整状态；库为空返回 null，由上层决定默认值与迁移。 */
export async function readStoredState(): Promise<MapDocumentState | null> {
  const db = await getDb();
  const [meta, draftRecord, savedDocuments] = await Promise.all([
    db.get('meta', 'state'),
    db.get('draft', 'draft'),
    db.getAll('documents')
  ]);

  if (!meta || !draftRecord) {
    return null;
  }

  const documentsById: Record<string, SavedMapDocument> = {};
  for (const document of savedDocuments) {
    documentsById[document.id] = document;
  }

  return {
    defaultWorkspace: meta.defaultWorkspace,
    draftDocument: draftRecord.document,
    documentsById,
    activeDocumentRef: meta.activeDocumentRef
  };
}

/**
 * 整体同步写入：只写变化的部分。
 *
 * 对比现有记录后：改动的文档 put（覆盖），新增的 put，删掉的 delete，
 * 未变化的文档不碰。这是 IndexedDB 相对 localStorage 的核心收益——
 * 改一份文档不必重写全部。
 *
 * 注意 IndexedDB 事务陷阱：事务内若 await 了非 IDB 的异步步骤，事务会自动提交
 * （TransactionInactiveError）。所以先在只读事务里拿到现有记录，再在写事务里
 * 一次性同步发出所有请求，最后等技术完成。写方由上层队列串行化，无并发窗口。
 */
export async function writeStoredState(state: MapDocumentState): Promise<void> {
  const db = await getDb();

  const existingDocuments = await db.getAll('documents');
  const existingById = new Map(existingDocuments.map((document) => [document.id, document]));
  const nextDocuments = Object.values(state.documentsById);
  const nextIds = new Set(nextDocuments.map((document) => document.id));
  const removedKeys = existingDocuments
    .map((document) => document.id)
    .filter((key) => !nextIds.has(key));

  const toPut = nextDocuments.filter((document) => {
    const previous = existingById.get(document.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(document);
  });

  const tx = db.transaction(['documents', 'draft', 'meta'], 'readwrite');
  const documentStore = tx.objectStore('documents');

  for (const document of toPut) {
    void documentStore.put(toStoredSavedDocument(document));
  }
  for (const key of removedKeys) {
    void documentStore.delete(key);
  }
  void tx.objectStore('draft').put({
    key: 'draft',
    document: toStoredDraftDocument(state.draftDocument)
  });
  void tx.objectStore('meta').put({
    key: 'state',
    defaultWorkspace: state.defaultWorkspace,
    activeDocumentRef: state.activeDocumentRef
  });

  await tx.done;
}

/** 只更新一份已保存文档（加减量写用；当前 V1 未调用，留作 2b 同步的接缝）。 */
export async function writeSavedDocument(document: SavedMapDocument): Promise<void> {
  const db = await getDb();
  await db.put('documents', toStoredSavedDocument(document));
}

export async function deleteSavedDocument(documentId: string): Promise<void> {
  const db = await getDb();
  await db.delete('documents', documentId);
}

export async function clearStoredState(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'draft', 'meta'], 'readwrite');
  await tx.objectStore('documents').clear();
  await tx.objectStore('draft').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}

/**
 * structured clone 无法直接存 Vue 的响应式代理，但普通对象可以。
 * 这里显式复制，顺带剥掉任何不可序列化的属性，保证写入的是纯数据。
 */
function toStoredSavedDocument(document: SavedMapDocument): SavedMapDocument {
  return JSON.parse(JSON.stringify(document)) as SavedMapDocument;
}

function toStoredDraftDocument(document: DraftMapDocument): DraftMapDocument {
  return JSON.parse(JSON.stringify(document)) as DraftMapDocument;
}
