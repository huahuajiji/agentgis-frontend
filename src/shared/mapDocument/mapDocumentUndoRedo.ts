import type { MapOperation } from '../../schemas/mapDocumentSchema';
import { validateMapDocumentEditState } from './mapDocumentEditValidation';
import { applyOperation, revertOperation } from './mapDocumentOperationApply';
import type { MapDocumentLike } from './mapDocumentValidation';

export type UndoRedoResult<T extends MapDocumentLike> = {
  document: T;
  operation: MapOperation | null;
};

/**
 * 撤销。跨越 working 栈与 commitPool 两个区：
 * - working 里还有操作 → 从 working 退；
 * - working 为空但池里有 → 从池里退。池内操作被撤销是先把它移回 working 之外，
 *   记录进 redoOperations，同时从池移除（它不再"已提交待同步"）。
 *   下次重做时落回 working（可以再次提交）。
 * - 都为空 → 原样返回。
 *
 * 注意：池被后端同步清空后，撤销边界就停在清空点，符合"上传后不能再撤回已同步内容"的语义。
 */
export function undoWorkingOperation<T extends MapDocumentLike>(document: T): UndoRedoResult<T> {
  const fromWorking = document.edit.workingOperations.at(-1) ?? null;
  const fromPool = fromWorking ? null : (document.edit.commitPool.at(-1) ?? null);
  const operation = fromWorking ?? fromPool;

  if (!operation) {
    return {
      document,
      operation: null
    };
  }

  const nextDocument = revertOperation(document, operation);
  return {
    document: {
      ...nextDocument,
      edit: validateMapDocumentEditState({
        ...nextDocument.edit,
        workingOperations: fromWorking
          ? document.edit.workingOperations.slice(0, -1)
          : document.edit.workingOperations,
        commitPool: fromWorking
          ? document.edit.commitPool
          : document.edit.commitPool.slice(0, -1),
        redoOperations: [...document.edit.redoOperations, operation]
      })
    } as T,
    operation
  };
}

/**
 * 重做。redoOperations 里既有曾在 working 的操作，也有曾在池里的操作；
 * 重做时一律落回 working 栈（撤销的"已同步"身份不恢复，重新提交即可再进池）。
 */
export function redoWorkingOperation<T extends MapDocumentLike>(document: T): UndoRedoResult<T> {
  const operation = document.edit.redoOperations.at(-1) ?? null;
  if (!operation) {
    return {
      document,
      operation: null
    };
  }

  const nextDocument = applyOperation(document, operation);
  return {
    document: {
      ...nextDocument,
      edit: validateMapDocumentEditState({
        ...nextDocument.edit,
        workingOperations: [...document.edit.workingOperations, operation],
        redoOperations: document.edit.redoOperations.slice(0, -1)
      })
    } as T,
    operation
  };
}
