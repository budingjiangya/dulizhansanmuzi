<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  actionText?: string
}>()

defineEmits<{ action: [] }>()
</script>

<template>
  <div class="rule-top flex flex-col items-start gap-3 py-16">
    <h3 class="font-serif text-xl font-semibold text-ink">{{ title }}</h3>
    <p v-if="description" class="max-w-[56ch] text-[0.95rem] text-ink-soft">{{ description }}</p>
    <button
      v-if="actionText"
      type="button"
      class="mt-2 text-[13.5px] text-accent underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70"
      @click="$emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>
