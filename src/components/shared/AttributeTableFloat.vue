<script setup lang="ts">
/**
 * ArcGIS 式要素属性表（浮动面板）。
 *
 * 由图层树"展开"触发（open 由父组件控制）。表格列 = 固定列（名称/类型/属性数）
 * + 该图层所有要素属性键的并集。单元格可编辑，行可选中、删除。
 * 列多时横向滚动；面板可拖动。
 */
import { computed, ref } from 'vue';
import { useMapDocumentStore, type MapLayer } from '../../stores/mapDocumentStore';
import {
  buildAttributeTable,
  featureDisplayName,
  formatCellValue,
  parseCellValue
} from '../../shared/mapDocument/mapDocumentAttributeTable';
import ConfirmActionDialog from './ConfirmActionDialog.vue';

const props = defineProps<{
  layer: MapLayer | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const mapDocumentStore = useMapDocumentStore();

const table = computed(() => {
  if (!props.layer) {
    return { columns: [], rows: [] };
  }
  return buildAttributeTable(
    props.layer,
    Object.values(mapDocumentStore.activeDocument.features)
  );
});

const selectedFeatureId = computed(() => mapDocumentStore.activeDocument.selectedFeatureId);

/** 拖动：记录面板位移（相对默认左下角）。 */
const dragOffset = ref({ x: 0, y: 0 });
let dragStart: { x: number; y: number; ox: number; oy: number } | null = null;

function startDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    ox: dragOffset.value.x,
    oy: dragOffset.value.y
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onDrag(event: PointerEvent) {
  if (!dragStart) {
    return;
  }
  dragOffset.value = {
    x: dragStart.ox + (event.clientX - dragStart.x),
    y: dragStart.oy + (event.clientY - dragStart.y)
  };
}

function endDrag() {
  dragStart = null;
}

const panelStyle = computed(() => ({
  transform: `translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`
}));

function selectRow(featureId: string) {
  mapDocumentStore.selectFeature(
    selectedFeatureId.value === featureId ? null : featureId
  );
}

const deleteTarget = ref<{ featureId: string; name: string } | null>(null);
const deleteDialogOpen = ref(false);

function deleteRow(featureId: string, name: string) {
  deleteTarget.value = { featureId, name };
  deleteDialogOpen.value = true;
}

function confirmDeleteRow() {
  if (!deleteTarget.value) {
    return;
  }
  mapDocumentStore.deleteFeature({ featureId: deleteTarget.value.featureId });
  deleteTarget.value = null;
}

const deleteSummary = computed(() => (
  deleteTarget.value
    ? [{ label: '要素名称', value: deleteTarget.value.name }]
    : []
));

function updateName(featureId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim();
  if (!name) {
    input.value = featureDisplayName(
      mapDocumentStore.activeDocument.features[featureId]
    );
    return;
  }
  mapDocumentStore.renameFeature({ featureId, name });
}

function updateCell(featureId: string, key: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const feature = mapDocumentStore.activeDocument.features[featureId];
  if (!feature) {
    return;
  }
  mapDocumentStore.updateFeatureProperties({
    featureId,
    properties: {
      ...(feature.geojson.properties ?? {}),
      [key]: parseCellValue(input.value)
    }
  });
}
</script>

<template>
  <section
    v-if="open && layer"
    class="attribute-table-float"
    :style="panelStyle"
    aria-label="属性表"
  >
    <header class="attribute-table-head" @pointerdown="startDrag" @pointermove="onDrag" @pointerup="endDrag">
      <span class="drag-grip" aria-hidden="true">⋮⋮</span>
      <b>{{ layer.name }}</b>
      <span class="attribute-table-count">{{ table.rows.length }} 个要素</span>
      <button class="attribute-table-close" type="button" title="关闭属性表" @click="emit('close')">×</button>
    </header>

    <div class="attribute-table-scroll">
      <table class="attribute-table">
        <thead>
          <tr>
            <th class="col-name">名称</th>
            <th class="col-type">类型</th>
            <th v-for="column in table.columns" :key="column">{{ column }}</th>
            <th class="col-count">属性数</th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in table.rows"
            :key="row.featureId"
            :class="{ 'is-selected': selectedFeatureId === row.featureId }"
            @click="selectRow(row.featureId)"
          >
            <td class="col-name">
              <input
                :value="row.name"
                type="text"
                autocomplete="off"
                @click.stop
                @change="updateName(row.featureId, $event)"
              >
            </td>
            <td class="col-type">{{ row.geometryType }}</td>
            <td v-for="column in table.columns" :key="column">
              <input
                :value="formatCellValue(row.values[column])"
                type="text"
                autocomplete="off"
                @click.stop
                @change="updateCell(row.featureId, column, $event)"
              >
            </td>
            <td class="col-count">{{ row.propertyCount }}</td>
            <td class="col-action">
              <button
                class="attribute-table-delete"
                type="button"
                title="删除要素"
                @click.stop="deleteRow(row.featureId, row.name)"
              >
                删
              </button>
            </td>
          </tr>
          <tr v-if="!table.rows.length">
            <td :colspan="table.columns.length + 4" class="attribute-table-empty">
              这个图层还没有要素。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <ConfirmActionDialog
    v-model:open="deleteDialogOpen"
    dialog-id="delete-feature-from-table-dialog"
    title="删除要素"
    description="这个操作会从图层里移除要素。"
    :summary-rows="deleteSummary"
    confirm-text="删除"
    danger
    @confirm="confirmDeleteRow"
  />
</template>
