import { describe, expect, it } from 'vitest';
import { createEmptyEditState } from '../mapDocumentCollection';
import { validateMapDocumentEditState } from '../mapDocumentEditValidation';
import { flattenLegacyCommitsForTest, normalizeStoredState } from '../mapDocumentMigration';
import { applyOperations } from '../mapDocumentOperationApply';
import {
  redoWorkingOperation,
  undoWorkingOperation
} from '../mapDocumentUndoRedo';
import {
  featureCreate,
  featureUpdate,
  layerCreate,
  makeDocument,
  makeFeature,
  makeLayer,
  pointGeoJson,
  TEST_VIEWPORT,
  withCommitPool,
  withLayers,
  withWorkingOperations
} from './fixtures';

describe('commit 池 - 提交语义', () => {
  it('空编辑态默认带空 commitPool', () => {
    const editState = createEmptyEditState();
    expect(editState.commitPool).toEqual([]);
  });

  it('校验会检查池内每条操作', () => {
    const state = validateMapDocumentEditState({
      baseRevisionId: null,
      remoteRevisionId: null,
      workingOperations: [],
      redoOperations: [],
      commitPool: [],
      externalOperations: []
    });
    expect(state.commitPool).toEqual([]);
  });
});

describe('commit 池 - 跨栈撤销/重做', () => {
  function buildDocumentWithPooledCreate() {
    const layer = makeLayer({ id: 'layer-1' });
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createOperation = featureCreate(feature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const builtDocument = applyOperations(baseDocument, [createOperation]);

    // 操作已提交进池：working 空、池里有
    return {
      document: withCommitPool(builtDocument, [createOperation]),
      createOperation,
      baseDocument
    };
  }

  it('working 为空时撤销会从池里退，操作进 redo 栈并离开池', () => {
    const { document, createOperation } = buildDocumentWithPooledCreate();

    const result = undoWorkingOperation(document as never);

    expect(result.operation).toStrictEqual(createOperation);
    expect(result.document.edit.commitPool).toEqual([]);
    expect(result.document.edit.workingOperations).toEqual([]);
    expect(result.document.edit.redoOperations).toHaveLength(1);
    expect(result.document.features['feature-1']).toBeUndefined();
  });

  it('撤销池内操作后重做，操作落回 working 栈（可再次提交）', () => {
    const { document, createOperation } = buildDocumentWithPooledCreate();

    const undone = undoWorkingOperation(document as never);
    const redone = redoWorkingOperation(undone.document);

    expect(redone.operation).toStrictEqual(createOperation);
    expect(redone.document.edit.workingOperations).toHaveLength(1);
    expect(redone.document.edit.commitPool).toEqual([]);
    expect(redone.document.edit.redoOperations).toEqual([]);
    expect(redone.document.features['feature-1']).toBeDefined();
  });

  it('working 有操作时撤销只退 working，不动池', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const pooledFeature = makeFeature('feature-pooled', layer.id, pointGeoJson([108.4, 22.8]));
    const pooledOperation = featureCreate(pooledFeature);
    const workingFeature = makeFeature('feature-working', layer.id, pointGeoJson([108.5, 22.9]));
    const workingOperation = featureCreate(workingFeature);

    const baseDocument = withLayers(makeDocument(), [layer]);
    const withBoth = applyOperations(baseDocument, [pooledOperation, workingOperation]);
    const document = withWorkingOperations(
      withCommitPool(withBoth, [pooledOperation]),
      [workingOperation]
    );

    const result = undoWorkingOperation(document as never);

    expect(result.operation).toStrictEqual(workingOperation);
    expect(result.document.edit.workingOperations).toEqual([]);
    // 池保持不动
    expect(result.document.edit.commitPool).toHaveLength(1);
    expect(result.document.edit.commitPool[0].id).toBe(pooledOperation.id);
  });

  it('池清空（模拟上传成功）后撤销边界停在清空点', () => {
    const { document } = buildDocumentWithPooledCreate();
    const cleared = withCommitPool(document, []);
    const workingCleared = withWorkingOperations(cleared, []);

    const result = undoWorkingOperation(workingCleared as never);

    expect(result.operation).toBeNull();
    expect(result.document).toBe(workingCleared);
  });
});

describe('commit 池 - 迁移', () => {
  it('旧 commitsById 链按时间拍平进 commitPool', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const createLayerOp = layerCreate(layer);
    const feature = makeFeature('feature-1', layer.id, pointGeoJson());
    const createFeatureOp = featureCreate(feature);

    const legacyEdit = {
      baseRevisionId: null,
      remoteRevisionId: null,
      workingOperations: [],
      redoOperations: [],
      externalOperations: [],
      commitsById: {
        'commit-2': {
          id: 'commit-2',
          baseRevisionId: null,
          parentCommitId: 'commit-1',
          operations: [createFeatureOp],
          createdAt: '2026-01-02T00:00:00.000Z',
          syncStatus: 'local'
        },
        'commit-1': {
          id: 'commit-1',
          baseRevisionId: null,
          parentCommitId: null,
          operations: [createLayerOp],
          createdAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'local'
        }
      },
      headCommitId: 'commit-2'
    };

    const flattened = flattenLegacyCommitsForTest(legacyEdit) as {
      commitPool: Array<{ id: string }>;
      commitsById?: unknown;
      headCommitId?: unknown;
    };

    expect(flattened.commitPool.map((operation) => operation.id)).toEqual([
      createLayerOp.id,
      createFeatureOp.id
    ]);
    expect(flattened.commitsById).toBeUndefined();
    expect(flattened.headCommitId).toBeUndefined();
  });

  it('旧状态经 normalizeStoredState 后能加载且池里有内容', () => {
    const layer = makeLayer({ id: 'layer-1' });
    const createLayerOp = layerCreate(layer);
    const legacyState = {
      defaultWorkspace: { id: 'ws', name: 'WS', mapIds: [] },
      documentsById: {},
      activeDocumentRef: { kind: 'draft' },
      draftDocument: {
        id: 'local-draft',
        kind: 'draft',
        name: 'Legacy',
        viewport: TEST_VIEWPORT,
        layers: [],
        features: {},
        selectedLayerId: null,
        selectedFeatureId: null,
        edit: {
          baseRevisionId: null,
          remoteRevisionId: null,
          workingOperations: [],
          redoOperations: [],
          externalOperations: [],
          commitsById: {
            'commit-1': {
              id: 'commit-1',
              baseRevisionId: null,
              parentCommitId: null,
              operations: [createLayerOp],
              createdAt: '2026-01-01T00:00:00.000Z',
              syncStatus: 'local'
            }
          },
          headCommitId: 'commit-1'
        }
      }
    };

    const result = normalizeStoredState(legacyState, {
      cloneViewport: (value) => (value as never) ?? TEST_VIEWPORT,
      createDefaultState: () => {
        throw new Error('should not fall back to default state');
      },
      defaultViewport: TEST_VIEWPORT
    });

    expect(result.state.draftDocument.edit.commitPool).toHaveLength(1);
    expect(result.state.draftDocument.edit.commitPool[0].type).toBe('layer.create');
    expect(result.notices.some((notice) => notice.message.includes('commit 池'))).toBe(true);
  });
});
