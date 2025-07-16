<template>
  <div >
    <!-- 组件的 HTML 结构 -->
    <%= pagePath %>
  </div>
</template>

<script>
import { ref, defineComponent } from 'vue';

export default defineComponent({
  name: '<%= pageName %>', // 组件名称
  setup() {
    const message = "Hello, Vue 3!";
    const counter = ref(0);

    const increment = () => {
      counter.value++;
    };

    return {
      message,
      counter,
      increment
    };
  }
});
</script>

<style scoped>
/* 组件样式 */

</style>