<script setup lang="ts">
/**
 * 分析工具坞（第三刀）：分析模式下浮在地图底部。
 * 输入来自当前选中要素：buffer 用 A；overlay 用 A（第一个选中）与当前选中。
 */
import { computed, ref, watch } from 'vue';
import { useMapDocumentStore } from '../../stores/mapDocumentStore';
import {
  OVERLAY_LABELS,
  validateAnalysisInput,
  type AnalysisInput,
  type OverlayOperator
} from '../../shared/mapDocument/mapDocumentAnalysis';
import type { Geometry } from 'geojson';

const mapDocumentStore = useMapDocumentStore();
const kind = ref<'buffer' | 'overlay'>('buffer');
const distance = ref(500);
const operator = ref<OverlayOperator>('intersection');

// overlay 的 A 要素：进入分析模式后第一次选中的面。B 始终是"当前选中"。
const pinnedFeatureId = ref<string | null>(null);

const selectedFeature = computed(() => {
  const id = mapDocumentStore.activeDocument.selectedFeatureId;
  return id ? mapDocumentStore.activeDocument.features[id] ?? null : null;
});
const selectedGeometry = computed<Geometry | null>(() => {
  const feature = selectedFeature.value;
  return feature ? feature.geojson.geometry : null;
});
const pinnedGeometry = computed<Geometry | null>(() => {
  const id = pinnedFeatureId.value;
  const feature = id ? mapDocumentStore.activeDocument.features[id] : null;
  return feature ? feature.geojson.geometry : null;
});

// 选中的要素变了：B 跟着变；A 为空时自动钉住第一个。
watch(() => mapDocumentStore.activeDocument.selectedFeatureId, (id) => {
  if (id && !pinnedFeatureId.value) {
    pinnedFeatureId.value = id;
  }
});

const currentInput = computed<Partial<AnalysisInput> & { kind: 'buffer' | 'overlay' }>(() => (
  kind.value === 'buffer'
    ? { kind: 'buffer', geometry: selectedGeometry.value ?? undefined, distance: distance.value }
    : {
      kind: 'overlay',
      operator: operator.value,
      geometryA: pinnedGeometry.value ?? undefined,
      geometryB: selectedGeometry.value ?? undefined
    }
));

const invalidReason = computed(() => validateAnalysisInput(currentInput.value));
const running = computed(() => mapDocumentStore.analysisStatus === 'running');
const message = computed(() => mapDocumentStore.analysisMessage);
const statusClass = computed(() => `is-${mapDocumentStore.analysisStatus}`);

const geometryLabel = computed(() => {
  const feature = selectedFeature.value;
  if (!feature) {
    return '未选中要素';
  }
  const name = feature.geojson.properties?.name;
  return typeof name === 'string' ? name : feature.id;
});

async function run() {
  const input = currentInput.value;
  if (validateAnalysisInput(input)) {
    return;
  }
  await mapDocumentStore.runAnalysis(input as AnalysisInput);
}

function resetPinned() {
  pinnedFeatureId.value = mapDocumentStore.activeDocument.selectedFeatureId;
}
</script>

<template>
  <aside class="map-analysis-dock">
    <div class="map-analysis-row">
      <button
        class="button map-analysis-mode"
        :class="{ active: kind === 'buffer' }"
        type="button"
        @click="kind = 'buffer'"
      >
        缓冲区
      </button>
      <button
        class="button map-analysis-mode"
        :class="{ active: kind === 'overlay' }"
        type="button"
        @click="kind = 'overlay'"
      >
        叠加
      </button>

      <template v-if="kind === 'buffer'">
        <label class="map-analysis-field">
          距离
          <input
            v-model.number="distance"
            class="map-analysis-input"
            type="number"
            min="1"
            max="100000"
            step="50"
          >
          米
        </label>
      </template>

      <template v-else>
        <select v-model="operator" class="map-analysis-select">
          <option v-for="(label, value) in OVERLAY_LABELS" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <button class="text-action" type="button" @click="resetPinned">A = 当前选中</button>
      </template>

      <button
        class="button primary"
        type="button"
        :disabled="Boolean(invalidReason) || running"
        @click="run"
      >
        {{ running ? '计算中…' : '执行' }}
      </button>
    </div>

    <div class="map-analysis-meta">
      <span v-if="invalidReason">{{ invalidReason }}</span>
      <span v-else-if="message" :class="statusClass">{{ message }}</span>
      <span v-else>
        当前选中：{{ geometryLabel }}
        <template v-if="kind === 'overlay'">
          · A：{{ pinnedFeatureId ? '已钉住' : '未设置' }}
        </template>
      </span>
    </div>
  </aside>
</template>
