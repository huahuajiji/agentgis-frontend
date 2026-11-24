<script setup lang="ts">
import { onMounted } from 'vue';
import { useMapDocumentStore } from './stores/mapDocumentStore';

const mapDocumentStore = useMapDocumentStore();

onMounted(() => {
  void mapDocumentStore.initializePersistence();
});
</script>

<template>
  <div v-if="mapDocumentStore.isHydrating" class="app-boot-splash" role="status">
    <span>正在加载本地数据…</span>
  </div>
  <RouterView v-else />
</template>

<style>
.app-boot-splash {
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: #ecebe6;
  color: #4a5158;
  font: 14px/1.5 system-ui, sans-serif;
}
</style>
