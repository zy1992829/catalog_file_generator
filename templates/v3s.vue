<template>
   <!-- 组件的 HTML 结构 -->
  <div>
    <%= pagePath %>
  </div>
</template>

<script setup>
import { ref, defineOptions } from 'vue'
defineOptions({
  name: '<%= pageName %>'
})
// 响应式数据
const message = 'Hello Vue 3 with script setup'
const count = ref(0)

// 方法
function increment() {
  count.value++
}
</script>

<style scoped lang="scss">
/* 组件样式 */
</style>