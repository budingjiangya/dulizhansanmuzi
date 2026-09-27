<script setup lang="ts">
/**
 * 关于本站（静态内容页）
 *
 * 文案写在前端，不占后端字段（后端目前也没有站点配置管理页，放后端同样要改代码）。
 * 排版复用全局 .prose-article，与文章详情页保持同一套阅读节奏。
 */
</script>

<template>
  <div class="shell">
    <article class="mx-auto max-w-[46rem] pb-16">
      <header class="pt-12 md:pt-16">
        <h1 class="font-serif text-[1.875rem] leading-tight font-semibold text-ink md:text-[2.5rem]">关于本站</h1>
        <p class="mt-5 font-serif text-[1.0625rem] leading-relaxed text-ink-soft md:text-[1.125rem]">
          一个不接稿、不带货的产品推荐博客。只写自己长期用过的东西。
        </p>
      </header>

      <div class="prose-article rule-top mt-12 pt-12 md:mt-14 md:pt-14">
        <h2>我们在做什么</h2>
        <p>
          这个站点的内容只有一类：我们自己买、自己用、用够长时间之后，觉得值得写下来的产品。
          覆盖显示器、耳机、键鼠、桌面与家居好物。不做开箱即评，不做参数复读，
          每篇都给出明确的购买建议和避坑提示。
        </p>

        <h2>评测原则</h2>
        <ul>
          <li><strong>自费购买。</strong>不接受厂商送测，不接付费软文，结论不受干扰。</li>
          <li><strong>长期使用。</strong>至少连续使用一个月才动笔，短期体验不足以判断耐用性。</li>
          <li><strong>说清适用边界。</strong>没有「适合所有人」的产品，每篇都会写清什么场景下别买。</li>
          <li><strong>参数服务于体验。</strong>只讲参数里真正影响日常使用的那部分，其余略过。</li>
        </ul>

        <h2>关于推广链接</h2>
        <p>
          站内部分购买链接带有推广标识。这不会影响结论——推荐与否、优缺点怎么写，
          都在挂链接之前就定了。如果你介意，直接搜索型号购买也完全一样。
        </p>

        <h2>联系方式与投稿</h2>
        <p>
          内容纠错、选品建议、合作咨询，都可以通过邮件联系。如果你有想看的品类，
          也欢迎告诉我，我会把它排进评测计划。
        </p>
        <blockquote>
          <p>邮件的回复可能不快，但每一封都会看。</p>
        </blockquote>

        <h2>这个站点是怎么搭的</h2>
        <p>
          前台是 Vue 3 + Vite + TailwindCSS，后台是 NestJS + Prisma + MySQL，
          视频封面由服务端调用 FFmpeg 抽帧生成。整套代码开源在 GitHub 上。
        </p>
      </div>

      <footer class="rule-top mt-16 pt-8">
        <RouterLink
          :to="{ name: 'home' }"
          class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent"
        >
          ← 回到推荐清单
        </RouterLink>
      </footer>
    </article>
  </div>
</template>
