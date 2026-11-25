<script setup lang="ts">
import { computed, ref } from 'vue';
import DraftMapSaveDialog from '../dialogs/DraftMapSaveDialog.vue';
import InspectorPanel from '../inspector/InspectorPanel.vue';
import MapWorkspace from '../map/MapWorkspace.vue';
import { useGeometryEditTarget } from '../../shared/map/useGeometryEditTarget';
import { useMapDocumentStore, type MapLayer } from '../../stores/mapDocumentStore';
import type { InspectorMode, MapAction, MapMode, MapTool, NavSection } from '../../types';

defineProps<{
  activeSection: NavSection;
  inspectorCollapsed: boolean;
}>();

const activeMode = ref<MapMode>('浏览');
const activeTool = ref<MapTool>('');
const activeMapAction = ref<MapAction>('');
const activeInspector = ref<InspectorMode>('要素');
const draftSaveDialogOpen = ref(false);
const attributeTableLayerId = ref<string | null>(null);
const mapDocumentStore = useMapDocumentStore();

// 属性表态：按 id 取，避免图层对象更新后表格拿到旧引用。
const attributeTableLayer = computed<MapLayer | null>(() => (
  attributeTableLayerId.value
    ? mapDocumentStore.activeDocument.layers.find((layer) => layer.id === attributeTableLayerId.value) ?? null
    : null
));

function openAttributeTable(layer: MapLayer) {
  attributeTableLayerId.value = layer.id;
}

function closeAttributeTable() {
  attributeTableLayerId.value = null;
}

/** 收起图层时只关闭属于该图层的表，不影响别的图层已打开的表。 */
function onCloseAttributeTable(layerId: string) {
  if (attributeTableLayerId.value === layerId) {
    attributeTableLayerId.value = null;
  }
}
const { geometryEditFeatureId } = useGeometryEditTarget(activeMode, activeTool);

const workspaceTitle = computed(() => mapDocumentStore.activeDocument.name);
const workspaceSubtitle = computed(
  () => {
    const document = mapDocumentStore.activeDocument;
    const workLayers = document.layers.filter((layer) => layer.role === 'work').length;
    const referenceLayers = document.layers.filter((layer) => layer.role === 'reference').length;
    const featureCount = Object.keys(document.features).length;
    return `${workLayers} 个正式图层 · ${referenceLayers} 个参考图层 · ${featureCount} 个要素 · ${activeMode.value}模式 · ${activeInspector.value}检查器`;
  }
);
function openDraftSaveDialog() {
  if (mapDocumentStore.activeDocumentRef.kind !== 'draft') {
    return;
  }

  draftSaveDialogOpen.value = true;
}
</script>

<template>
  <section class="workspace">
    <header class="workspace-head">
      <div class="head-context">
        <b>{{ workspaceTitle }}</b>
        <span>{{ workspaceSubtitle }}</span>
      </div>
      <slot name="head-actions"></slot>
    </header>

    <section class="main-grid" :class="{ 'is-inspector-collapsed': inspectorCollapsed }">
      <MapWorkspace
        v-model:mode="activeMode"
        v-model:tool="activeTool"
        v-model:map-action="activeMapAction"
        :geometry-edit-feature-id="geometryEditFeatureId"
        :attribute-table-layer="attributeTableLayer"
        :show-attribute-table="!inspectorCollapsed"
        @save-draft="openDraftSaveDialog"
        @close-attribute-table="closeAttributeTable"
      />

      <InspectorPanel
        v-model:mode="activeInspector"
        :collapsed="inspectorCollapsed"
        @open-attribute-table="openAttributeTable"
        @close-attribute-table="onCloseAttributeTable"
      />
    </section>

    <DraftMapSaveDialog v-model:open="draftSaveDialogOpen" />
  </section>
</template>
