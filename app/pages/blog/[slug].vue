<script setup lang="ts">
const route = useRoute();
const { data: blog } = await useAsyncData(route.path, () => 
  queryCollection("blog").path(route.path).first()
)

useSeoMeta({
  title: blog.value?.title,
  description: blog.value?.description
})

</script>

<template>
  <ContentRenderer v-if="blog" :value="blog"/>
</template>