<script setup lang="ts">
import { computed, ref } from 'vue';
import { INSPECTOR_TABS, type InspectorMode } from '../../types';
import { useMapDocumentStore, type LayerGeometryType, type LayerRole } from '../../stores/mapDocumentStore';
import InspectorSearch from './InspectorSearch.vue';
import LayerCreateDialog from '../shared/LayerCreateDialog.vue';
import LayerFeatureTree from '../shared/LayerFeatureTree.vue';
import OperationHistoryPanel from '../shared/OperationHistoryPanel.vue';

const mode = defineModel<InspectorMode>('mode', { required: true });

defineProps<{
  collapsed: boolean;
}>();

const activeTab = computed(() => INSPECTOR_TABS.find((item) => item.id === mode.value) ?? INSPECTOR_TABS[0]);
const sortingLayers = ref(false);
const createLayerDialogOpen = ref(false);
const mapDocumentStore = useMapDocumentStore();

// 正式图层固定：V1 收缩后不再提供参考图层页签
const activeLayerRole: LayerRole = 'work';

function openCreateLayerDialog() {
  if (activeTab.value.content !== 'layer-tree') {
    return;
  }

  createLayerDialogOpen.value = true;
}

function createLayer(input: { name: string; geometryType: LayerGeometryType }) {
  mapDocumentStore.createLayer({
    name: input.name,
    role: activeLayerRole,
    geometryType: input.geometryType
  });
}
</script>

<template>
  <aside class="right-column" :class="{ collapsed }">
    <InspectorSearch />

    <section class="panel inspector-panel">
      <div class="inspector-switcher">
        <div class="segmented-tabs" :style="{ '--tab-count': INSPECTOR_TABS.length }">
          <button
            v-for="item in INSPECTOR_TABS"
            :key="item.id"
            class="segmented-tab"
            :class="{ active: mode === item.id }"
            type="button"
            @click="mode = item.id"
          >
            {{ item.id }}
          </button>
        </div>
      </div>

      <div class="inspector-content">
        <div class="panel-head sub-head">
          <h3>{{ activeTab.title }}</h3>
          <button
            v-if="activeTab.content === 'layer-tree'"
            class="text-action"
            type="button"
            @click="openCreateLayerDialog"
          >
            新建
          </button>
          <button
            v-if="activeTab.content === 'layer-tree'"
            class="text-action"
            :class="{ active: sortingLayers }"
            type="button"
            @click="sortingLayers = !sortingLayers"
          >
            排序
          </button>
          <span v-else-if="activeTab.content === 'operation-history'">本地记录</span>
        </div>
        <div class="panel-body">
          <LayerFeatureTree
            v-if="activeTab.content === 'layer-tree'"
            :variant="activeLayerRole"
            :sorting="sortingLayers"
          />
          <OperationHistoryPanel v-else-if="activeTab.content === 'operation-history'" />
        </div>
      </div>
    </section>

    <LayerCreateDialog
      v-model:open="createLayerDialogOpen"
      :role="activeLayerRole"
      @confirm="createLayer"
    />
  </aside>
</template>
