<script setup lang="ts">
const { data: blogs } = await useAsyncData('blogs', () => 
  queryCollectionNavigation("blog")
)

useSeoMeta({
  title: "Home Page",
  description: "This is my home page"
})

</script>

<template>
  <div>
    <div v-for="blog in blogs" :key="blog.path">
      <div v-for="actualBlog in blog.children" :key="actualBlog.path">
        <NuxtLink :to="actualBlog.path">{{ actualBlog.title }}</NuxtLink>
      </div>
    </div>
  </div>
</template>