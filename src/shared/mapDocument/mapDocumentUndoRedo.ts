import type { MapOperation } from '../../schemas/mapDocumentSchema';
import { validateMapDocumentEditState } from './mapDocumentEditValidation';
import { applyOperation, revertOperation } from './mapDocumentOperationApply';
import type { MapDocumentLike } from './mapDocumentValidation';

export type UndoRedoResult<T extends MapDocumentLike> = {
  document: T;
  operation: MapOperation | null;
};

/**
 * 撤销。只作用于 workingOperations（未提交操作）：
 * - working 里还有操作 → 从栈顶退，操作进 redoOperations；
 * - working 为空 → 原样返回（打包进 commitPool 的操作不可撤销）。
 *
 * 打包（compress → commitPool）是"结账"动作：进池即视为用户确认，
 * 后续同步、清池都只围绕池进行，撤销边界就在这里。
 */
export function undoWorkingOperation<T extends MapDocumentLike>(document: T): UndoRedoResult<T> {
  const operation = document.edit.workingOperations.at(-1) ?? null;

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
        workingOperations: document.edit.workingOperations.slice(0, -1),
        redoOperations: [...document.edit.redoOperations, operation]
      })
    } as T,
    operation
  };
}

/**
 * 重做。从 redoOperations 取栈顶，应用后落回 working 栈（仍可再次打包）。
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
