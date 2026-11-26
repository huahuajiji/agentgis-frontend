<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMapDocumentStore, type PullOverwriteRisk } from '../../stores/mapDocumentStore';
import ConfirmActionDialog from './ConfirmActionDialog.vue';
import ExternalOperationCard from './ExternalOperationCard.vue';
import OperationCard from './OperationCard.vue';
import OperationStack from './OperationStack.vue';

type OperationPanelSection = 'summary' | 'working' | 'external';

const mapDocumentStore = useMapDocumentStore();
const openSections = ref<Set<OperationPanelSection>>(new Set(['summary', 'working', 'external']));

const editState = computed(() => mapDocumentStore.activeDocument.edit);
const workingOperations = computed(() => editState.value.workingOperations.slice().reverse());
const redoOperations = computed(() => editState.value.redoOperations);
const totalStackOperations = computed(() => (
  editState.value.workingOperations.length + editState.value.redoOperations.length
));
const commitPool = computed(() => editState.value.commitPool.slice().reverse());
const externalOperations = computed(() => editState.value.externalOperations);
const pendingExternalOperations = computed(() => (
  externalOperations.value.filter((operation) => operation.status === 'pending')
));
const canCommit = computed(() => editState.value.workingOperations.length > 0);
const canUndo = computed(() => editState.value.workingOperations.length > 0);
const canRedo = computed(() => editState.value.redoOperations.length > 0);

function isSectionOpen(section: OperationPanelSection) {
  return openSections.value.has(section);
}

function toggleSection(section: OperationPanelSection) {
  const next = new Set(openSections.value);
  if (next.has(section)) {
    next.delete(section);
  } else {
    next.add(section);
  }
  openSections.value = next;
}

function commitWorkingOperations() {
  mapDocumentStore.commitWorkingOperations();
  openSections.value = new Set([...openSections.value, 'working']);
}

function undoWorkingOperation() {
  mapDocumentStore.undoWorkingOperation();
  openSections.value = new Set([...openSections.value, 'working']);
}

function redoWorkingOperation() {
  mapDocumentStore.redoWorkingOperation();
  openSections.value = new Set([...openSections.value, 'working']);
}

function matchExternalOperations() {
  mapDocumentStore.matchExternalOperations();
  openSections.value = new Set([...openSections.value, 'external']);
}

function applyExternalOperation(recordId: string) {
  mapDocumentStore.applyExternalOperation(recordId);
  openSections.value = new Set([...openSections.value, 'external', 'working']);
}

function matchExternalOperation(recordId: string) {
  mapDocumentStore.matchExternalOperation(recordId);
  openSections.value = new Set([...openSections.value, 'external']);
}

function clearExternalOperations() {
  mapDocumentStore.clearExternalOperations();
  openSections.value = new Set([...openSections.value, 'external']);
}

const syncStatus = computed(() => mapDocumentStore.syncStatus);
const syncMessage = computed(() => mapDocumentStore.syncMessage);
const syncDisabled = computed(() => syncStatus.value === 'syncing');
const pullDisabled = computed(() => syncStatus.value === 'syncing');

async function syncToRemote() {
  await mapDocumentStore.syncActiveDocumentToRemote();
}

// 拉取覆盖保护：预检发现风险时暂存，弹确认框；确认后带名单重跑。
const pullOverwrites = ref<PullOverwriteRisk[]>([]);
const pullConfirmOpen = ref(false);
const pullConfirmRows = computed(() => pullOverwrites.value.map((item) => ({
  label: item.documentName,
  value: `${item.pendingCount} 个待同步操作`
})));

async function pullFromRemote() {
  const outcome = await mapDocumentStore.pullFromRemote();
  if (outcome.status === 'needs-confirmation') {
    pullOverwrites.value = outcome.overwrites;
    pullConfirmOpen.value = true;
  }
}

async function confirmPullOverwrite() {
  await mapDocumentStore.pullFromRemote(pullOverwrites.value.map((item) => item.remoteId));
  pullOverwrites.value = [];
}
</script>

<template>
  <div class="operation-history-panel">
    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('summary') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('summary')">
          <span class="panel-chevron">{{ isSectionOpen('summary') ? '▾' : '▸' }}</span>
          <h4>版本摘要</h4>
        </button>
        <span>本地记录</span>
      </div>

      <div v-if="isSectionOpen('summary')" class="detail-card">
        <div class="detail-body">
          <div class="detail-grid">
            <div class="detail-field">
              <span>未提交</span>
              <b>{{ editState.workingOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>可重做</span>
              <b>{{ editState.redoOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>待同步</span>
              <b>{{ editState.commitPool.length }}</b>
            </div>
            <div class="detail-field">
              <span>外部操作</span>
              <b>{{ externalOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>基础版本</span>
              <b>{{ editState.baseRevisionId ?? '无' }}</b>
            </div>
            <div class="detail-field">
              <span>远端版本</span>
              <b>{{ editState.remoteRevisionId ?? '无' }}</b>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('working') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('working')">
          <span class="panel-chevron">{{ isSectionOpen('working') ? '▾' : '▸' }}</span>
          <h4>未提交操作</h4>
        </button>
        <div class="operation-section-actions">
          <button
            class="text-action"
            type="button"
            :disabled="!canUndo"
            title="撤销最后一条未提交操作（已打包进待同步池的操作不可撤销）"
            @click="undoWorkingOperation"
          >
            撤销
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!canRedo"
            title="重做最后一条已撤销操作"
            @click="redoWorkingOperation"
          >
            重做
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!canCommit"
            title="把未提交操作压缩（打包）后放入待同步池；打包后不可撤销"
            @click="commitWorkingOperations"
          >
            打包
          </button>
          <span>已执行 {{ workingOperations.length }} · 可重做 {{ redoOperations.length }}</span>
        </div>
      </div>

      <OperationStack
        v-if="isSectionOpen('working')"
        :working-operations="workingOperations"
        :redo-operations="redoOperations"
        :total-stack-operations="totalStackOperations"
      />
    </section>

    <section v-if="commitPool.length" class="operation-section">
      <div class="operation-section-head">
        <span class="panel-chevron">▾</span>
        <h4>待同步池</h4>
        <span>待同步 {{ commitPool.length }}</span>
      </div>

      <div class="sync-actions">
        <button
          class="text-action"
          type="button"
          :disabled="pullDisabled"
          title="从后端拉取云端文档（本地较新的保留本地）"
          @click="pullFromRemote"
        >
          从云端拉取
        </button>
        <button
          class="text-action primary"
          type="button"
          :disabled="!commitPool.length || syncDisabled"
          title="把整份文档上传到云端；成功后清空待同步池"
          @click="syncToRemote"
        >
          同步到云端（{{ commitPool.length }}）
        </button>
      </div>

      <p v-if="syncMessage" class="sync-message" :class="`is-${syncStatus}`">
        {{ syncMessage }}
      </p>

      <div class="operation-list">
        <OperationCard
          v-for="operation in commitPool"
          :key="operation.id"
          :operation="operation"
        />
      </div>
    </section>

    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('external') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('external')">
          <span class="panel-chevron">{{ isSectionOpen('external') ? '▾' : '▸' }}</span>
          <h4>外部操作</h4>
        </button>
        <div class="operation-section-actions">
          <button
            class="text-action"
            type="button"
            :disabled="!externalOperations.length"
            title="把外部操作和地图实际生成的内部操作重新匹配"
            @click="matchExternalOperations"
          >
            匹配
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!externalOperations.length"
            title="清空外部操作记录"
            @click="clearExternalOperations"
          >
            清空
          </button>
          <span>待匹配 {{ pendingExternalOperations.length }} · 总数 {{ externalOperations.length }}</span>
        </div>
      </div>

      <div v-if="isSectionOpen('external') && externalOperations.length" class="operation-list">
        <ExternalOperationCard
          v-for="record in externalOperations"
          :key="record.id"
          :record="record"
          @apply="applyExternalOperation"
          @match="matchExternalOperation"
        />
      </div>

      <div v-else-if="isSectionOpen('external')" class="empty-state compact">
        <b>暂无外部操作</b>
        <span>AI、后端或文件导入给出的操作意图会先放在这里，匹配成功后才和内部历史对上。</span>
      </div>
    </section>

    <ConfirmActionDialog
      v-model:open="pullConfirmOpen"
      dialog-id="pull-overwrite-confirm"
      title="云端版本将覆盖本地待同步操作"
      description="以下文档本地还有未上传到云端的修改，继续拉取会丢弃它们。"
      confirm-text="仍要覆盖"
      danger
      :summary-rows="pullConfirmRows"
      @confirm="confirmPullOverwrite"
    />
  </div>
</template>
