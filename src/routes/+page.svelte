<script lang="ts">
  import "../app.css";
  import { onMount, tick } from "svelte";
  import MarkdownMessage from "$lib/components/MarkdownMessage.svelte";
  import ChatHistorySidebar from "$lib/components/ChatHistorySidebar.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import SetupScreen from "$lib/components/SetupScreen.svelte";
  import { ChatController } from "$lib/controllers/chatController";
  import type { ChatMessage, ChatSession } from "$lib/models/types";
  import { listModels } from "$lib/services/genai";
  import {
    saveChatSession,
    loadChatSessions,
    deleteChatSession,
    generateTitle,
  } from "$lib/services/chatHistory";
  import { getApiKey, hasApiKey } from "$lib/services/apiKeyStorage";
  import { getAllModels, DEFAULT_MODELS, isDefaultModel } from "$lib/services/modelStorage";

  const controller = new ChatController("models/gemini-flash-latest");

  let input = $state("");
  let messages: ChatMessage[] = $state([]);
  let generating = $state(false);
  let model = $state("models/gemini-flash-latest");
  let availableModels: string[] = $state(getAllModels());
  let modelsLoading = $state(false);
  let modelsError: string | undefined = $state(undefined);

  // Chat history state
  let chatSessions: ChatSession[] = $state([]);
  let currentSessionId = $state<string | null>(null);
  let sidebarOpen = $state(false);

  // API key state
  let apiKeyConfigured = $state(false);
  let showSetupScreen = $state(false);
  let showSettingsModal = $state(false);
  let apiKeyError = $state<string | undefined>(undefined);

  let scroller: HTMLDivElement | null = null;

  function update(next: ChatMessage[], gen: boolean) {
    messages = next;
    generating = gen;
    scrollToBottom();

    // Auto-save after message generation completes
    if (!gen && messages.length > 0) {
      autoSave();
    }
  }

  function autoSave() {
    const session = controller.exportSession();
    
    // Auto-generate title from first user message if still "New Chat"
    if (session.title === "New Chat" && messages.length > 0) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const title = generateTitle(firstUserMsg.content);
        controller.setSessionTitle(title);
        session.title = title;
      }
    }

    saveChatSession(session);
    currentSessionId = session.id;
    
    // Reload sessions to update the list
    chatSessions = loadChatSessions();
  }

  function loadModels() {
    // Load available models from storage (default + custom)
    availableModels = getAllModels();
    
    // Ensure current model is available
    if (!availableModels.includes(model)) {
      model = availableModels[0];
      applyModel();
    }
  }

  function applyModel() {
    controller.setModel(model);
  }

  function send() {
    const text = input.trim();
    if (!text || generating) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      apiKeyError = "No API key configured. Please add your API key in settings.";
      return;
    }

    input = "";
    apiKeyError = undefined;
    controller.send(text, apiKey, update);
  }

  function stop() {
    controller.stop();
  }

  function clear() {
    if (generating) return;
    messages = [];
    controller.clear();
  }

  async function scrollToBottom() {
    await tick();
    if (!scroller) return;
    
    // Check if user is near the bottom (within 100px)
    const isNearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100;
    
    // Only auto-scroll if user is already near bottom
    if (isNearBottom) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function createNewChat() {
    if (generating) return;

    // Auto-save current session if it has messages
    if (messages.length > 0) {
      autoSave();
    }

    // Create new session
    controller.createNewSession();
    messages = [];
    currentSessionId = controller.getSessionId();
    model = "models/gemini-flash-latest";
    applyModel();
  }

  function switchChat(sessionId: string) {
    if (generating) return;
    if (sessionId === currentSessionId) return;

    // Auto-save current session if it has messages
    if (messages.length > 0) {
      autoSave();
    }

    // Load selected session
    const session = chatSessions.find((s) => s.id === sessionId);
    if (session) {
      controller.loadSession(session);
      messages = controller.getMessages();
      currentSessionId = sessionId;
      model = session.model;
      applyModel();
    }
  }

  function deleteChat(sessionId: string) {
    deleteChatSession(sessionId);
    chatSessions = loadChatSessions();

    // If we deleted the current session, create a new one
    if (sessionId === currentSessionId) {
      createNewChat();
    }
  }

  function checkApiKey() {
    apiKeyConfigured = hasApiKey();
    if (!apiKeyConfigured) {
      showSetupScreen = true;
    }
  }

  function handleSetupComplete() {
    showSetupScreen = false;
    apiKeyConfigured = true;
    loadModels();
  }

  function handleSettingsSaved() {
    apiKeyConfigured = hasApiKey();
    apiKeyError = undefined;
    // Reload models to get any newly added custom models
    loadModels();
  }

  function openSettings() {
    showSettingsModal = true;
  }

  onMount(() => {
    // Check for API key first
    checkApiKey();
    
    // Load chat history
    chatSessions = loadChatSessions();
    
    // Set current session ID
    currentSessionId = controller.getSessionId();
    
    // Update messages from controller
    update(controller.getMessages(), controller.isBusy());
    
    // Load models if API key is configured
    if (apiKeyConfigured) {
      loadModels();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  }
</script>

{#if showSetupScreen}
  <SetupScreen onComplete={handleSetupComplete} />
{/if}

<SettingsModal bind:isOpen={showSettingsModal} onSave={handleSettingsSaved} />

<div class="flex h-screen bg-base-100">
  <!-- Sidebar -->
  <ChatHistorySidebar
    sessions={chatSessions}
    currentSessionId={currentSessionId}
    isOpen={sidebarOpen}
    onToggle={toggleSidebar}
    onNewChat={createNewChat}
    onSelectSession={switchChat}
    onDeleteSession={deleteChat}
  />

  <!-- Main Content -->
  <main class="flex flex-col flex-1 min-w-0">
    <!-- Navbar -->
    <div class="navbar bg-base-200 border-b border-base-300">
      <div class="navbar-start">
        <h1 class="text-xl font-bold ml-12">Gemini Local Chat</h1>
      </div>
      <div class="navbar-center flex items-center gap-2">
        <div class="dropdown dropdown-bottom">
          <div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2" class:btn-disabled={generating}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
            </svg>
            <span class="font-medium">
              {model === "models/gemini-flash-latest" ? "Flash" : model === "models/gemini-pro-latest" ? "Pro" : model.replace("models/", "")}
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
          <ul tabindex="-1" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-64 p-2 shadow-lg border border-base-300 mt-1">
            <li class="menu-title">
              <span class="text-xs font-semibold opacity-60">Recommended Models</span>
            </li>
            {#each DEFAULT_MODELS as m}
              <li>
                <button
                  type="button"
                  class="flex items-center gap-2"
                  class:active={model === m}
                  onclick={() => { model = m; applyModel(); }}
                >
                  <div class="flex-1 text-left">
                    <div class="font-medium">
                      {m === "models/gemini-flash-latest" ? "Gemini Flash" : "Gemini Pro"}
                    </div>
                    <div class="text-xs opacity-60">
                      {m === "models/gemini-flash-latest" ? "Fast & efficient" : "Advanced reasoning"}
                    </div>
                  </div>
                  {#if model === m}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </button>
              </li>
            {/each}
            
            {#if availableModels.length > DEFAULT_MODELS.length}
              <div class="divider my-1"></div>
              <li class="menu-title">
                <span class="text-xs font-semibold opacity-60">Custom Models</span>
              </li>
              {#each availableModels as m}
                {#if !isDefaultModel(m)}
                  <li>
                    <button
                      type="button"
                      class="flex items-center gap-2"
                      class:active={model === m}
                      onclick={() => { model = m; applyModel(); }}
                    >
                      <div class="flex-1 text-left">
                        <div class="font-medium font-mono text-sm">{m.replace("models/", "")}</div>
                      </div>
                      {#if model === m}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                      {/if}
                    </button>
                  </li>
                {/if}
              {/each}
            {/if}
          </ul>
        </div>
      </div>
      <div class="navbar-end gap-2">
        {#if generating}
          <button type="button" class="btn btn-sm btn-error" onclick={stop}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
            </svg>
            Stop
          </button>
        {/if}
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onclick={clear}
          disabled={generating || messages.length === 0}
        >
          Clear
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-circle"
          onclick={openSettings}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Messages Area -->
    <div class="flex-1 overflow-y-auto px-2 py-4 md:px-4" bind:this={scroller}>
      {#if apiKeyError}
        <div class="alert alert-warning max-w-4xl mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p>{apiKeyError}</p>
            <button class="btn btn-sm btn-ghost" onclick={openSettings}>
              Open Settings
            </button>
          </div>
        </div>
      {/if}

      {#if !apiKeyConfigured}
        <div class="alert alert-info max-w-4xl mx-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="h-6 w-6 shrink-0 stroke-current"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>No API key configured. Chat is disabled until you add your API key.</span>
        </div>
      {:else if messages.length === 0}
        <div class="flex items-center justify-center h-full">
          <div class="text-center opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p class="text-lg">Start a conversation</p>
          </div>
        </div>
      {:else}
        <div class="max-w-7xl mx-auto space-y-6">
          {#each messages as m (m.id)}
            {#if m.role === 'user'}
              <!-- User message: small bubble on the right -->
              <div class="flex justify-end">
                <div class="bg-primary text-primary-content rounded-2xl px-4 py-2 max-w-[80%] md:max-w-[60%]">
                  <MarkdownMessage md={m.content} />
                </div>
              </div>
            {:else}
              <!-- Assistant message: full width, no bubble -->
              <div class="w-full">
                <div class="prose prose-invert max-w-none">
                  <MarkdownMessage md={m.content} />
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Input Bar -->
    <form class="border-t border-base-300 p-4 bg-base-200" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <div class="flex gap-2 max-w-6xl mx-auto">
        <textarea
          class="textarea textarea-bordered flex-1 resize-none"
          placeholder={apiKeyConfigured ? "Type a message… (Ctrl+Enter to send)" : "Configure API key in settings to start chatting"}
          bind:value={input}
          rows="3"
          onkeydown={onKeydown}
          disabled={generating || !apiKeyConfigured}
        ></textarea>
        <button type="submit" class="btn btn-primary" disabled={generating || !input.trim() || !apiKeyConfigured}>
          {#if generating}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          {/if}
          Send
        </button>
      </div>
    </form>
  </main>
</div>
