<script setup lang="ts">
/**
 * ArcGIS 式要素属性表（浮动面板）。
 *
 * 由图层树"展开"触发。主表只放公共字段（所有要素都有的属性）。
 * 点击某一行 → 左侧弹出该要素的私有属性面板（只有部分要素拥有的字段、
 * 以及新增任意键值对），再点一次或换行则关闭/切换。
 * 列多时横向滚动；面板可拖动。
 */
import { computed, ref, watch } from 'vue';
import { useMapDocumentStore, type MapFeature, type MapLayer } from '../../stores/mapDocumentStore';
import {
  buildAttributeTable,
  featureDisplayName,
  formatCellValue,
  parseCellValue,
  splitFeatureProperties
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
    return { commonColumns: [], rows: [] };
  }
  return buildAttributeTable(
    props.layer,
    Object.values(mapDocumentStore.activeDocument.features)
  );
});

/** 私有属性面板所属要素（本地状态，不依赖全局 selectedFeatureId）。 */
const detailFeatureId = ref<string | null>(null);
watch(() => props.layer?.id, () => {
  detailFeatureId.value = null;
});

const detailFeature = computed<MapFeature | null>(() => (
  detailFeatureId.value
    ? mapDocumentStore.activeDocument.features[detailFeatureId.value] ?? null
    : null
));

const detailSplit = computed(() => {
  if (!detailFeature.value) {
    return { common: {}, private: {} };
  }
  return splitFeatureProperties(detailFeature.value, table.value.commonColumns);
});

const detailPrivateEntries = computed(() => Object.entries(detailSplit.value.private));

/** 关闭整个面板：退出私有面板、清掉选中、通知父组件。 */
function closePanel() {
  detailFeatureId.value = null;
  mapDocumentStore.selectFeature(null);
  emit('close');
}
const detailCommonEntries = computed(() => Object.entries(detailSplit.value.common));

function toggleDetail(featureId: string) {
  detailFeatureId.value = detailFeatureId.value === featureId ? null : featureId;
  mapDocumentStore.selectFeature(detailFeatureId.value);
}

/** 拖动：记录面板位移（相对默认左下角）。 */
const dragOffset = ref({ x: 0, y: 0 });
let dragStart: { x: number; y: number; ox: number; oy: number } | null = null;

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
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
  if (detailFeatureId.value === deleteTarget.value.featureId) {
    detailFeatureId.value = null;
  }
  deleteTarget.value = null;
}

const deleteSummary = computed(() => (
  deleteTarget.value
    ? [{ label: '要素名称', value: deleteTarget.value.name }]
    : []
));

function featureProperties(featureId: string) {
  const feature = mapDocumentStore.activeDocument.features[featureId];
  return { ...(feature?.geojson.properties ?? {}) } as Record<string, unknown>;
}

function writeProperties(featureId: string, properties: Record<string, unknown>) {
  mapDocumentStore.updateFeatureProperties({ featureId, properties });
}

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
  writeProperties(featureId, {
    ...featureProperties(featureId),
    [key]: parseCellValue(input.value)
  });
}

/** 私有属性：改键名（同旧内联表的行为：冲突则回退）。 */
function updatePrivateKey(featureId: string, oldKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const nextKey = input.value.trim();
  const properties = featureProperties(featureId);

  if (!nextKey || (nextKey !== oldKey && Object.prototype.hasOwnProperty.call(properties, nextKey))) {
    input.value = oldKey;
    return;
  }
  if (nextKey === oldKey) {
    return;
  }

  const value = properties[oldKey];
  delete properties[oldKey];
  properties[nextKey] = value;
  writeProperties(featureId, properties);
}

/** 私有属性：改值。 */
function updatePrivateValue(featureId: string, key: string, event: Event) {
  const input = event.target as HTMLInputElement;
  writeProperties(featureId, {
    ...featureProperties(featureId),
    [key]: parseCellValue(input.value)
  });
}

/** 私有属性：删除字段。 */
function deletePrivateField(featureId: string, key: string) {
  const properties = featureProperties(featureId);
  delete properties[key];
  writeProperties(featureId, properties);
}

/** 新增属性（空键会被忽略）。 */
function addPrivateField(featureId: string, key: string, value: string) {
  const trimmed = key.trim();
  const properties = featureProperties(featureId);
  if (!trimmed || Object.prototype.hasOwnProperty.call(properties, trimmed)) {
    return false;
  }
  writeProperties(featureId, {
    ...properties,
    [trimmed]: parseCellValue(value)
  });
  return true;
}

const newKey = ref('');
const newValue = ref('');

function confirmAddPrivateField() {
  if (!detailFeatureId.value) {
    return;
  }
  if (addPrivateField(detailFeatureId.value, newKey.value, newValue.value)) {
    newKey.value = '';
    newValue.value = '';
  }
}

watch(detailFeatureId, () => {
  newKey.value = '';
  newValue.value = '';
});
</script>

<template>
  <section
    v-if="open && layer"
    class="attribute-table-float"
    :class="{ 'has-detail': Boolean(detailFeature) }"
    :style="panelStyle"
    aria-label="属性表"
  >
    <!-- 私有属性面板：长在主表左侧，平时不出现 -->
    <aside v-if="detailFeature" class="attribute-detail" aria-label="要素私有属性">
      <header class="attribute-table-head attribute-detail-head">
        <b>{{ featureDisplayName(detailFeature) }}</b>
        <span class="attribute-table-count">{{ detailFeature.geojson.geometry.type }}</span>
        <button
          class="attribute-table-close"
          type="button"
          title="关闭私有属性"
          @pointerdown.stop
          @click.stop="detailFeatureId = null"
        >×</button>
      </header>

      <div class="attribute-detail-body">
        <div class="attribute-detail-section">
          <span class="attribute-detail-label">公共属性</span>
          <div class="property-kv">
            <template v-for="([key, value]) in detailCommonEntries" :key="key">
              <span class="kv-key">{{ key }}</span>
              <span class="kv-value">{{ formatCellValue(value) || '—' }}</span>
            </template>
            <span v-if="!detailCommonEntries.length" class="kv-empty">无</span>
          </div>
        </div>

        <div class="attribute-detail-section">
          <span class="attribute-detail-label">私有属性</span>
          <div class="property-kv">
            <template v-for="([key, value]) in detailPrivateEntries" :key="key">
              <input
                class="kv-key-input"
                :value="key"
                type="text"
                autocomplete="off"
                @change="updatePrivateKey(detailFeature.id, key, $event)"
              >
              <input
                class="kv-value-input"
                :value="formatCellValue(value)"
                type="text"
                autocomplete="off"
                @change="updatePrivateValue(detailFeature.id, key, $event)"
              >
              <button
                class="attribute-table-delete"
                type="button"
                title="删除该属性"
                @click="deletePrivateField(detailFeature.id, key)"
              >删</button>
            </template>
            <span v-if="!detailPrivateEntries.length" class="kv-empty">还没有私有属性</span>
          </div>
        </div>

        <div class="property-kv property-kv-add">
          <input
            v-model="newKey"
            class="kv-key-input"
            type="text"
            placeholder="新键"
            autocomplete="off"
          >
          <input
            v-model="newValue"
            class="kv-value-input"
            type="text"
            placeholder="新值"
            autocomplete="off"
            @keyup.enter="confirmAddPrivateField"
          >
          <button
            class="attribute-table-delete"
            type="button"
            title="新增属性"
            @click="confirmAddPrivateField"
          >加</button>
        </div>
      </div>
    </aside>

    <!-- 主表 -->
    <div class="attribute-main">
      <header class="attribute-table-head" @pointerdown="startDrag" @pointermove="onDrag" @pointerup="endDrag">
        <span class="drag-grip" aria-hidden="true">⋮⋮</span>
        <b>{{ layer.name }}</b>
        <span class="attribute-table-count">{{ table.rows.length }} 个要素</span>
        <button
          class="attribute-table-close"
          type="button"
          title="关闭属性表"
          @pointerdown.stop
          @click="closePanel"
        >×</button>
      </header>

      <div class="attribute-table-scroll">
        <table class="attribute-table">
          <thead>
            <tr>
              <th class="col-name">名称</th>
              <th class="col-type">类型</th>
              <th v-for="column in table.commonColumns" :key="column">{{ column }}</th>
              <th class="col-count">属性数</th>
              <th class="col-action"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.rows"
              :key="row.featureId"
              :class="{ 'is-selected': detailFeatureId === row.featureId }"
              @click="toggleDetail(row.featureId)"
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
              <td v-for="column in table.commonColumns" :key="column">
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
              <td :colspan="table.commonColumns.length + 4" class="attribute-table-empty">
                这个图层还没有要素。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
