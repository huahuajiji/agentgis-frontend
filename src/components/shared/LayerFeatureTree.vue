<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMapDocumentStore, type LayerRole, type MapFeature, type MapLayer } from '../../stores/mapDocumentStore';
import ConfirmActionDialog from './ConfirmActionDialog.vue';
import TextInputDialog from './TextInputDialog.vue';

const props = withDefaults(defineProps<{
  variant?: LayerRole;
  sorting?: boolean;
}>(), {
  variant: 'work',
  sorting: false
});

const emit = defineEmits<{
  'open-attribute-table': [layer: MapLayer];
  'close-attribute-table': [layerId: string];
}>();

const mapDocumentStore = useMapDocumentStore();
const settingsLayerId = ref<string | null>(null);
const openLayers = ref<Set<string>>(new Set());
const layerOrder = ref<string[]>([]);
const draggedLayerId = ref<string | null>(null);
const renameLayerDialogOpen = ref(false);
const deleteLayerDialogOpen = ref(false);
const selectedActionLayer = ref<MapLayer | null>(null);

const sourceLayers = computed(() => (
  mapDocumentStore.activeDocument.layers
    .filter((layer) => layer.role === props.variant)
    .slice()
    .sort((a, b) => a.order - b.order)
));
const sourceLayerSignature = computed(() => (
  sourceLayers.value.map((layer) => `${layer.id}:${layer.order}`).join('|')
));

const orderedLayers = computed(() => {
  const layerById = new Map(sourceLayers.value.map((layer) => [layer.id, layer]));
  const ordered = layerOrder.value
    .map((id) => layerById.get(id))
    .filter((layer): layer is MapLayer => Boolean(layer));
  const missing = sourceLayers.value.filter((layer) => !layerOrder.value.includes(layer.id));

  return [...ordered, ...missing];
});

watch(
  sourceLayerSignature,
  () => {
    const layers = sourceLayers.value;
    const layerIds = new Set(layers.map((layer) => layer.id));
    const nextOpenLayers = new Set([...openLayers.value].filter((layerId) => layerIds.has(layerId)));
    if (!nextOpenLayers.size && layers[0]) {
      nextOpenLayers.add(layers[0].id);
    }

    layerOrder.value = layers.map((layer) => layer.id);
    openLayers.value = nextOpenLayers;
    draggedLayerId.value = null;
  },
  { immediate: true }
);

const selectedLayerId = computed(() => mapDocumentStore.activeDocument.selectedLayerId);
const selectedActionLayerSummary = computed(() => {
  if (!selectedActionLayer.value) {
    return [];
  }

  const layer = selectedActionLayer.value;
  return [
    { label: '图层名称', value: layer.name },
    { label: '图层归属', value: roleLabel(layer) },
    { label: '图层类型', value: geometryLabel(layer) },
    { label: '要素数量', value: getLayerFeatures(layer).length }
  ];
});

const deleteLayerDescription = computed(() => {
  if (!selectedActionLayer.value) {
    return '图层里的要素也会一起删除。';
  }

  return `删除图层「${selectedActionLayer.value.name}」？图层里的要素也会一起删除。`;
});

watch(selectedLayerId, (layerId) => {
  if (!layerId || !sourceLayers.value.some((layer) => layer.id === layerId)) {
    return;
  }

  openLayers.value = new Set([...openLayers.value, layerId]);
});

function roleLabel(layer: MapLayer) {
  return layer.role === 'reference' ? '参考图层' : '正式图层';
}

function geometryLabel(layer: MapLayer) {
  const labels: Record<MapLayer['geometryType'], string> = {
    point: '点',
    line: '线',
    polygon: '面',
    mixed: '混合'
  };
  return labels[layer.geometryType];
}

function getLayerFeatures(layer: MapLayer): MapFeature[] {
  return layer.featureIds
    .map((featureId) => mapDocumentStore.activeDocument.features[featureId])
    .filter((feature): feature is MapFeature => Boolean(feature));
}

function toggleLayer(layer: MapLayer) {
  if (props.sorting) {
    return;
  }

  const willOpen = !openLayers.value.has(layer.id);
  mapDocumentStore.selectLayer(layer.id);

  const next = new Set(openLayers.value);
  if (willOpen) {
    next.add(layer.id);
  } else {
    next.delete(layer.id);
  }
  openLayers.value = next;

  // 用户 2026-11-25：展开图层 → 在地图上弹出属性表；收起 → 关闭。
  if (willOpen) {
    emit('open-attribute-table', layer);
  } else {
    emit('close-attribute-table', layer.id);
  }
}

function startDrag(layerId: string) {
  if (!props.sorting) {
    return;
  }
  draggedLayerId.value = layerId;
}

function moveLayer(targetLayerId: string) {
  const sourceLayerId = draggedLayerId.value;
  if (sourceLayerId === null || sourceLayerId === targetLayerId) {
    return;
  }

  const next = [...layerOrder.value];
  const sourceIndex = next.indexOf(sourceLayerId);
  const targetIndex = next.indexOf(targetLayerId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceLayerId);
  layerOrder.value = next;
}

function endDrag() {
  if (draggedLayerId.value) {
    mapDocumentStore.reorderLayers(layerOrder.value);
  }
  draggedLayerId.value = null;
}

function toggleLayerVisible(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  mapDocumentStore.setLayerVisible(layer.id, !layer.visible);
}

function toggleSettings(layer: MapLayer, event: Event) {
  event.stopPropagation();
  settingsLayerId.value = settingsLayerId.value === layer.id ? null : layer.id;
}

/** 点击面板其它位置时收起设置菜单。 */
function closeSettings() {
  settingsLayerId.value = null;
}

function openRenameLayerDialog(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  selectedActionLayer.value = layer;
  renameLayerDialogOpen.value = true;
}

function confirmRenameLayer(name: string) {
  if (!selectedActionLayer.value || name === selectedActionLayer.value.name) {
    return;
  }

  mapDocumentStore.renameLayer({
    layerId: selectedActionLayer.value.id,
    name
  });
  selectedActionLayer.value = null;
}

function openDeleteLayerDialog(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  selectedActionLayer.value = layer;
  deleteLayerDialogOpen.value = true;
}

function confirmDeleteLayer() {
  if (!selectedActionLayer.value) {
    return;
  }

  mapDocumentStore.deleteLayer(selectedActionLayer.value.id);
  selectedActionLayer.value = null;
}
</script>

<template>
  <div v-if="orderedLayers.length" class="layer-tree" :class="{ 'is-sorting': sorting }" @click="closeSettings">
    <section
      v-for="layer in orderedLayers"
      :key="layer.id"
      class="layer-tree-item"
      :class="{
        dragging: draggedLayerId === layer.id,
        reference: layer.role === 'reference',
        active: selectedLayerId === layer.id,
        hidden: !layer.visible,
        'has-open-settings': settingsLayerId === layer.id
      }"
      :draggable="sorting"
      @dragstart="startDrag(layer.id)"
      @dragover.prevent
      @dragenter.prevent="moveLayer(layer.id)"
      @dragend="endDrag"
      @drop.prevent="endDrag"
    >
      <div class="layer-tree-head">
        <button class="layer-tree-toggle" type="button" @click="toggleLayer(layer)">
          <span>{{ sorting ? '↕' : openLayers.has(layer.id) ? '▾' : '▸' }}</span>
          <span class="layer-title">
            <b>{{ layer.name }}</b>
            <span>{{ roleLabel(layer) }} · {{ geometryLabel(layer) }} · {{ getLayerFeatures(layer).length }} 个要素</span>
          </span>
        </button>
        <div class="layer-row-actions">
          <button
            class="layer-action-button"
            :class="{ muted: !layer.visible }"
            type="button"
            :aria-pressed="layer.visible"
            :title="layer.visible ? '隐藏图层' : '显示图层'"
            @click="toggleLayerVisible(layer, $event)"
          >
            {{ layer.visible ? '显' : '隐' }}
          </button>
          <div class="layer-settings">
            <button
              class="layer-action-button"
              type="button"
              title="图层设置"
              :aria-expanded="settingsLayerId === layer.id"
              @click.stop="toggleSettings(layer, $event)"
            >
              ⋯
            </button>
            <div v-if="settingsLayerId === layer.id" class="layer-settings-menu" @click.stop>
              <button type="button" @click="openRenameLayerDialog(layer, $event)">重命名图层</button>
              <button class="danger" type="button" @click="openDeleteLayerDialog(layer, $event)">删除图层</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!sorting && openLayers.has(layer.id)" class="layer-tree-body">
        <button
          class="layer-open-table"
          type="button"
          title="在当前地图上打开属性表"
          @click="emit('open-attribute-table', layer)"
        >
          打开属性表 · {{ getLayerFeatures(layer).length }} 个要素
        </button>

        <div v-if="!getLayerFeatures(layer).length" class="empty-state compact">
          <b>暂无要素</b>
          <span>这个图层已经接到 MapDocument，但 featureIds 为空。</span>
        </div>
      </div>
    </section>
  </div>

  <div v-else class="empty-state">
    <b>暂无图层</b>
    <span>当前 MapDocument 里没有这个类型的图层。</span>
  </div>

  <TextInputDialog
    v-model:open="renameLayerDialogOpen"
    dialog-id="rename-layer-dialog"
    title="重命名图层"
    description="只修改图层名称，不影响图层下的要素。"
    label="图层名称"
    placeholder="请输入图层名称"
    :initial-value="selectedActionLayer?.name ?? ''"
    :summary-rows="selectedActionLayerSummary"
    confirm-text="保存"
    @confirm="confirmRenameLayer"
  />

  <ConfirmActionDialog
    v-model:open="deleteLayerDialogOpen"
    dialog-id="delete-layer-dialog"
    title="删除图层"
    :description="deleteLayerDescription"
    :summary-rows="selectedActionLayerSummary"
    confirm-text="删除"
    danger
    @confirm="confirmDeleteLayer"
  />
</template>
