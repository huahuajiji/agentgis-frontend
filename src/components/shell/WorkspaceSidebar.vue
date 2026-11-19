<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NavSection } from '../../types';
import GeoJsonTransferPanel from '../panels/GeoJsonTransferPanel.vue';
import LayerImageResourcesPanel from '../panels/LayerImageResourcesPanel.vue';
import MapDocumentList from '../panels/MapDocumentList.vue';

const props = defineProps<{
  activeSection: NavSection;
  collapsed: boolean;
}>();

type PanelConfig = {
  title: string;
  meta: string;
  shape: 'map-documents' | 'image-resources' | 'geojson-transfer';
};

// V1 收缩：只保留真实现的面板。占位面板（视图设置、地图工具、数据源、AI 对话……）
// 已从导航层面撤掉，代码不再渲染无响应 UI。
const panelsBySection: Record<NavSection, PanelConfig[]> = {
  地图: [],
  项目: [
    { title: '项目列表', meta: 'MapDocument', shape: 'map-documents' },
    { title: '图片资源', meta: 'MapLayer.imageResources', shape: 'image-resources' }
  ],
  数据: [
    { title: 'GeoJSON 导入 / 导出', meta: 'FeatureCollection', shape: 'geojson-transfer' }
  ]
};

const activePanels = computed(() => panelsBySection[props.activeSection]);
const openPanels = ref<Set<string>>(new Set());

function panelKey(panel: PanelConfig) {
  return `${props.activeSection}:${panel.title}`;
}

function isPanelOpen(panel: PanelConfig) {
  const key = panelKey(panel);
  return !openPanels.value.has(key);
}

function togglePanel(panel: PanelConfig) {
  const key = panelKey(panel);
  const next = new Set(openPanels.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  openPanels.value = next;
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <header class="side-head">
      <h1>{{ activeSection }}工作区</h1>
    </header>

    <section class="side-scroll">
      <p v-if="activePanels.length === 0" class="side-empty">
        这个区暂时没有面板。<br>
        常用操作在中间的地图工作区和右侧检查器。
      </p>

      <section
        v-for="panel in activePanels"
        :key="panel.title"
        class="panel side-panel"
        :class="{ 'is-collapsed-panel': !isPanelOpen(panel) }"
      >
        <button class="panel-head collapsible-panel-head" type="button" @click="togglePanel(panel)">
          <span class="panel-chevron">{{ isPanelOpen(panel) ? '▾' : '▸' }}</span>
          <h3>{{ panel.title }}</h3>
          <span>{{ panel.meta }}</span>
        </button>
        <div v-if="isPanelOpen(panel) && panel.shape === 'map-documents'" class="panel-body">
          <MapDocumentList />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'image-resources'" class="panel-body">
          <LayerImageResourcesPanel />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'geojson-transfer'" class="panel-body">
          <GeoJsonTransferPanel />
        </div>
      </section>
    </section>
  </aside>
</template>
