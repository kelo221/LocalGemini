<script lang="ts">
  import Markdown from "svelte-exmarkdown";
  import { gfmPlugin } from "svelte-exmarkdown/gfm";
  import hljs from "highlight.js";
  import "highlight.js/styles/atom-one-dark.css";
  import { onMount } from "svelte";
  import { tick } from "svelte";
  
  interface Props {
    md: string;
  }
  
  let { md = "" }: Props = $props();
  const plugins = [gfmPlugin()];
  let container: HTMLDivElement | null = null;

  async function highlight() {
    await tick();
    if (!container) return;
    const blocks = container.querySelectorAll("pre code:not(.hljs)");
    blocks.forEach((el) => {
      try {
        hljs.highlightElement(el as HTMLElement);
      } catch (e) {
        // Silently handle errors during partial rendering
      }
    });
  }

  onMount(() => {
    highlight();
  });
  
  // Re-highlight when markdown content changes
  $effect(() => {
    // Access md to make this reactive
    md;
    highlight();
  });
</script>

<div bind:this={container} class="markdown-content">
  <Markdown {md} {plugins} />
  {#if false}{/if}
</div>

<style>
  .markdown-content :global(pre) {
    border-radius: 0.5rem;
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
    overflow-x: auto;
    background-color: #282c34 !important;
    padding: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .markdown-content :global(pre code) {
    background-color: transparent !important;
    padding: 0 !important;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .markdown-content :global(code:not(pre code)) {
    background-color: oklch(var(--b3));
    color: oklch(var(--a));
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }

  .markdown-content :global(p) {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    margin-left: 1rem;
  }

  .markdown-content :global(li) {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }

  .markdown-content :global(a) {
    text-decoration: underline;
    color: oklch(var(--p));
  }

  .markdown-content :global(a:hover) {
    opacity: 0.8;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    font-weight: bold;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  .markdown-content :global(h1) {
    font-size: 1.5rem;
  }

  .markdown-content :global(h2) {
    font-size: 1.25rem;
  }

  .markdown-content :global(h3) {
    font-size: 1.125rem;
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid oklch(var(--b3));
    padding-left: 1rem;
    font-style: italic;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .markdown-content :global(table th),
  .markdown-content :global(table td) {
    padding: 0.5rem;
    border: 1px solid oklch(var(--b3));
  }

  .markdown-content :global(thead) {
    background-color: oklch(var(--b2));
  }

  .markdown-content :global(hr) {
    margin-top: 1rem;
    margin-bottom: 1rem;
    border-color: oklch(var(--b3));
  }
</style>

