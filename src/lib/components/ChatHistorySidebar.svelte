<script lang="ts">
  import type { ChatSession } from "$lib/models/types";

  interface Props {
    sessions: ChatSession[];
    currentSessionId: string | null;
    isOpen: boolean;
    onToggle: () => void;
    onNewChat: () => void;
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
  }

  let {
    sessions,
    currentSessionId,
    isOpen,
    onToggle,
    onNewChat,
    onSelectSession,
    onDeleteSession,
  }: Props = $props();

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  function handleDelete(e: MouseEvent, sessionId: string): void {
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      onDeleteSession(sessionId);
    }
  }

  function handleSelectAndClose(sessionId: string) {
    onSelectSession(sessionId);
    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) {
      onToggle();
    }
  }

  function handleNewChatAndClose() {
    onNewChat();
    // Close sidebar on mobile after creating new chat
    if (window.innerWidth < 768) {
      onToggle();
    }
  }
</script>

<div class="relative flex h-full">
  <!-- Toggle Button (only visible when sidebar is closed) -->
  {#if !isOpen}
    <button
      onclick={onToggle}
      class="absolute top-4 left-2 z-50 btn btn-sm btn-circle btn-ghost bg-base-100 shadow-sm md:bg-transparent md:shadow-none"
      aria-label="Open sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  {/if}

  <!-- Mobile backdrop -->
  {#if isOpen}
    <button
      class="fixed inset-0 bg-black/50 z-30 md:hidden animate-fade-in"
      onclick={onToggle}
      aria-label="Close sidebar"
    ></button>
  {/if}

  <!-- Sidebar -->
  <div
    class="bg-base-200 border-r border-base-300 flex flex-col transition-all duration-300 ease-in-out overflow-hidden
           fixed md:relative h-full z-40"
    style="width: {isOpen ? '280px' : '0'};"
  >
    <div class="flex flex-col h-full min-w-[280px]">
      <!-- Header with collapse button and New Chat -->
      <div class="p-3 border-b border-base-300">
        <div class="flex items-center gap-2">
          <!-- Collapse button -->
          <button
            onclick={onToggle}
            class="btn btn-sm btn-ghost btn-square"
            aria-label="Close sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <!-- New Chat button -->
          <button
            onclick={handleNewChatAndClose}
            class="btn btn-primary btn-sm flex-1 gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            New Chat
          </button>
        </div>
      </div>

      <!-- Chat Sessions List -->
      <div class="flex-1 overflow-y-auto">
        {#if sessions.length === 0}
          <div class="p-4 text-center text-sm opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            No chat history yet
          </div>
        {:else}
          <div class="p-2 space-y-1">
            {#each sessions as session, index (session.id)}
              <div 
                class="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
                       hover:bg-base-300 active:bg-base-300
                       {session.id === currentSessionId ? 'bg-base-300 border-l-2 border-primary' : ''}"
                style="animation-delay: {index * 30}ms"
              >
                <button
                  onclick={() => handleSelectAndClose(session.id)}
                  class="flex-1 text-left min-w-0 overflow-hidden py-1"
                >
                  <div class="text-sm font-medium truncate">
                    {session.title}
                  </div>
                  <div class="text-xs opacity-60 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatDate(session.updatedAt)}
                  </div>
                </button>
                <button
                  onclick={(e) => handleDelete(e, session.id)}
                  class="btn btn-ghost btn-xs btn-circle flex-shrink-0 opacity-50 hover:opacity-100 hover:btn-error"
                  aria-label="Delete chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
