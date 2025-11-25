<script lang="ts">
  import Markdown from "svelte-exmarkdown";
  import { gfmPlugin } from "svelte-exmarkdown/gfm";
  import rehypeRaw from "rehype-raw";
  import hljs from "highlight.js";
  import "highlight.js/styles/atom-one-dark.css";
  import { tick, onDestroy } from "svelte";

  interface Props {
    md: string;
  }

  let { md = "" }: Props = $props();
  const plugins = [gfmPlugin(), { rehypePlugin: rehypeRaw }];

  // Handle code blocks inside markdown table cells (standard MD parsers don't support this)
  const multilineCodeCellRegex = /\|([^|\n]+)\|\s*```(\w+)?\s*\r?\n([\s\S]*?)```[ \t]*\|/g;

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeCodeBlocksInTables(input: string): string {
    return input.replace(multilineCodeCellRegex, (_, firstCell, lang = "", rawCode) => {
      const trimmedCode = rawCode.replace(/\r\n/g, "\n").replace(/\s+$/, "");
      const escapedCode = escapeHtml(trimmedCode).replace(/\n/g, "&#10;");
      const languageClass = lang ? ` class="language-${lang}"` : "";
      const normalizedCell = firstCell.trim();
      return `| ${normalizedCell} | <pre><code${languageClass}>${escapedCode}</code></pre> |`;
    });
  }

  const normalizedMd = $derived(normalizeCodeBlocksInTables(md));

  let container: HTMLDivElement | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyCode(index: number, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      // Visual feedback handled by button update below
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }

  async function highlight() {
    await tick();
    if (!container) return;
    const blocks = container.querySelectorAll("pre code");

    blocks.forEach((el) => {
      if (el instanceof HTMLElement) {
        // Reset highlight state if already highlighted
        if (el.dataset.highlighted) {
          delete el.dataset.highlighted;
        }

        try {
          hljs.highlightElement(el);
        } catch (e) {
          console.error("Highlight error:", e);
        }
      }
    });

    // Add copy buttons after highlighting
    await tick();
    addCopyButtons();
  }

  function addCopyButtons() {
    if (!container) return;
    const blocks = container.querySelectorAll("pre code");

    blocks.forEach((el, index) => {
      if (el instanceof HTMLElement) {
        const preElement = el.parentElement;
        if (preElement && preElement.tagName === "PRE") {
          // Remove any existing copy button first to avoid duplicates
          const existingBtn = preElement.querySelector(".copy-code-btn");
          if (existingBtn) {
            existingBtn.remove();
          }

          const rawTextContent = el.textContent || "";

          try {
            preElement.style.position = "relative";

            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-code-btn btn btn-xs btn-ghost";
            copyBtn.setAttribute("data-index", index.toString());
            copyBtn.setAttribute("type", "button");
            copyBtn.setAttribute("aria-label", "Copy code");
            copyBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            `;

            copyBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              const idx = parseInt(copyBtn.getAttribute("data-index") || "0");
              copyCode(idx, rawTextContent);

              // Update button to show "Copied!"
              copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span class="text-xs ml-1">Copied!</span>
              `;

              setTimeout(() => {
                copyBtn.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                `;
              }, 2000);
            };

            preElement.appendChild(copyBtn);
          } catch (e) {
            console.error(`Failed to add copy button to block ${index}:`, e);
          }
        }
      }
    });
  }

  // Re-highlight when markdown content changes
  $effect(() => {
    // Access normalizedMd to make this reactive
    normalizedMd;
    // Debounce highlighting to avoid running during streaming updates
    if (highlightTimer) {
      clearTimeout(highlightTimer);
    }
    highlightTimer = setTimeout(() => {
      highlight();
    }, 200);
  });

  onDestroy(() => {
    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
  });
</script>

<div bind:this={container} class="markdown-content">
  <Markdown md={normalizedMd} {plugins} />
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
  }

  .markdown-content :global(pre .copy-code-btn) {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
    min-height: 1.75rem;
    height: 1.75rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .markdown-content :global(pre:hover .copy-code-btn) {
    opacity: 1;
  }

  .markdown-content :global(pre .copy-code-btn:hover) {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
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
    vertical-align: top;
  }

  .markdown-content :global(thead) {
    background-color: oklch(var(--b2));
  }

  .markdown-content :global(table pre) {
    margin-top: 0;
    margin-bottom: 0;
  }

  .markdown-content :global(hr) {
    margin-top: 1rem;
    margin-bottom: 1rem;
    border-color: oklch(var(--b3));
  }
</style>
