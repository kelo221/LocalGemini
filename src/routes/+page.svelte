<script lang="ts">
  import "../app.css";
  import { onMount, tick } from "svelte";
  import MarkdownMessage from "$lib/components/MarkdownMessage.svelte";
  import ChatHistorySidebar from "$lib/components/ChatHistorySidebar.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import SetupScreen from "$lib/components/SetupScreen.svelte";
  import { ChatController } from "$lib/controllers/chatController";
  import type { ChatMessage, ChatSession, FileAttachment } from "$lib/models/types";
  import { listModels, uploadFile } from "$lib/services/genai";
  import {
    saveChatSession,
    loadChatSessions,
    deleteChatSession,
    generateTitle,
  } from "$lib/services/chatHistory";
  import { getApiKey, hasApiKey } from "$lib/services/apiKeyStorage";
  import { getAllModels, DEFAULT_MODELS, isDefaultModel } from "$lib/services/modelStorage";
  import { initTheme, loadSettings, saveSettings, type AppSettings } from "$lib/services/settingsStorage";

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

  // Settings state
  let systemPrompt = $state<string>("");
  let currentTheme = $state<string>("dark");
  let useSearchGrounding = $state<boolean>(false);

  // Editing state
  let editingMessageId = $state<string | null>(null);
  let editContent = $state("");

  // Attachment state
  let pendingAttachments = $state<FileAttachment[]>([]);
  let uploadingFiles = $state<boolean>(false);
  let uploadProgress = $state<number>(0);
  let dragOver = $state<boolean>(false);

  let scroller: HTMLDivElement | null = null;
  let fileInputRef: HTMLInputElement | null = null;
  
  // Navbar hide on scroll
  let navbarHidden = $state(false);
  let lastScrollTop = 0;

  // Format timestamp for display
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    // Show time for today, date for older
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

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

  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      apiKeyError = "No API key configured.";
      return;
    }

    uploadingFiles = true;
    uploadProgress = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
        if (!allowedTypes.includes(file.type)) {
          console.warn(`Unsupported file type: ${file.type}`);
          continue;
        }

        // Create preview URL for images
        let previewUrl: string | undefined;
        if (file.type.startsWith('image/')) {
          previewUrl = URL.createObjectURL(file);
        }

        // Upload file
        const uploaded = await uploadFile(apiKey, file, (progress) => {
          uploadProgress = ((i / files.length) + (progress / 100 / files.length)) * 100;
        });

        pendingAttachments = [...pendingAttachments, {
          uri: uploaded.uri,
          mimeType: uploaded.mimeType,
          name: uploaded.name,
          previewUrl,
        }];
      }
    } catch (err) {
      console.error("File upload failed:", err);
      apiKeyError = "Failed to upload file. Please try again.";
    } finally {
      uploadingFiles = false;
      uploadProgress = 0;
    }
  }

  function removeAttachment(index: number) {
    const attachment = pendingAttachments[index];
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }

  function send() {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || generating) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      apiKeyError = "No API key configured. Please add your API key in settings.";
      return;
    }

    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    
    input = "";
    pendingAttachments = [];
    apiKeyError = undefined;
    
    controller.send(
      text, 
      { 
        apiKey, 
        systemInstruction: systemPrompt || undefined,
        useSearchGrounding,
        attachments,
      }, 
      update
    );
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

    // No need to save here - sessions are auto-saved after each message generation
    // Calling autoSave here was incorrectly resetting the updatedAt timestamp of
    // old sessions, making them appear recent even when just viewing them

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
    
    // Reload settings
    const settings = loadSettings();
    systemPrompt = settings.systemPrompt;
    currentTheme = settings.theme;
    useSearchGrounding = settings.useSearchGrounding;
  }

  function openSettings() {
    showSettingsModal = true;
  }

  function toggleTheme() {
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    saveSettings({ theme: newTheme });
    currentTheme = newTheme;
  }

  // Editing functions
  function startEdit(message: ChatMessage) {
    if (generating) return;
    editingMessageId = message.id;
    editContent = message.content;
  }

  function cancelEdit() {
    editingMessageId = null;
    editContent = "";
  }

  function saveEdit() {
    if (!editingMessageId || !editContent.trim() || generating) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      apiKeyError = "No API key configured.";
      return;
    }

    controller.editMessage(
      editingMessageId,
      editContent,
      { 
        apiKey, 
        systemInstruction: systemPrompt || undefined,
        useSearchGrounding,
      },
      update
    );
    
    editingMessageId = null;
    editContent = "";
  }

  function handleRegenerate() {
    if (generating) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      apiKeyError = "No API key configured.";
      return;
    }

    controller.regenerate(
      { 
        apiKey, 
        systemInstruction: systemPrompt || undefined,
        useSearchGrounding,
      },
      update
    );
  }

  function toggleSearchGrounding() {
    useSearchGrounding = !useSearchGrounding;
    saveSettings({ useSearchGrounding });
  }

  onMount(() => {
    // Initialize theme
    initTheme();
    const settings = loadSettings();
    currentTheme = settings.theme;
    systemPrompt = settings.systemPrompt;
    useSearchGrounding = settings.useSearchGrounding;

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

  function handleScroll(e: Event) {
    const target = e.target as HTMLDivElement;
    const scrollTop = target.scrollTop;
    const delta = scrollTop - lastScrollTop;
    
    // Hide navbar when scrolling down past threshold, show when scrolling up
    if (delta > 5 && scrollTop > 60) {
      navbarHidden = true;
    } else if (delta < -5 || scrollTop < 60) {
      navbarHidden = false;
    }
    
    lastScrollTop = scrollTop;
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
    <div 
      class="navbar bg-base-200 border-b border-base-300 transition-all duration-300 ease-out"
      class:overflow-hidden={navbarHidden}
      style="height: {navbarHidden ? '0px' : '3.5rem'}; min-height: {navbarHidden ? '0px' : '3.5rem'}; opacity: {navbarHidden ? '0' : '1'}; border-bottom-width: {navbarHidden ? '0' : '1px'};"
    >
      <div class="navbar-start">
        <div class="flex items-center ml-12">
           <h1 class="text-xl font-bold">Gemini Local Chat</h1>
        </div>
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
          <ul tabindex="-1" class="dropdown-content menu bg-base-100 rounded-box z-[100] w-64 p-2 shadow-lg border border-base-300 mt-1">
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
      <div class="navbar-end gap-1 md:gap-2">
        {#if generating}
          <button type="button" class="btn btn-sm btn-error" onclick={stop}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
            </svg>
            <span class="hidden sm:inline">Stop</span>
          </button>
        {/if}
        <button
          type="button"
          class="btn btn-sm btn-ghost hidden sm:flex"
          onclick={clear}
          disabled={generating || messages.length === 0}
        >
          Clear
        </button>
        
        <!-- Search Grounding Toggle -->
        <div class="tooltip tooltip-bottom" data-tip={useSearchGrounding ? "Web search enabled" : "Enable web search"}>
          <button
            class="btn btn-sm btn-ghost btn-circle transition-colors"
            onclick={toggleSearchGrounding}
            title="Toggle web search grounding"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5 transition-colors" 
              class:text-white={useSearchGrounding}
              class:opacity-50={!useSearchGrounding}
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        
        <!-- Theme Toggle -->
        <button class="btn btn-sm btn-ghost btn-circle" onclick={toggleTheme} title="Toggle theme">
          {#if currentTheme === 'dark'}
            <!-- Sun icon for dark mode -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
            </svg>
          {:else}
            <!-- Moon icon for light mode -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          {/if}
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
    <div 
      class="flex-1 overflow-y-auto px-2 py-4 md:px-4 transition-colors duration-200"
      class:bg-primary={dragOver}
      class:bg-opacity-10={dragOver}
      bind:this={scroller}
      onscroll={handleScroll}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      {#if dragOver}
        <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          <div class="bg-base-200 border-2 border-dashed border-primary rounded-xl p-8 text-center animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-lg font-medium">Drop files here</p>
          </div>
        </div>
      {/if}
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
        <div class="max-w-7xl mx-auto space-y-6 pb-12">
          {#each messages as m, index (m.id)}
            {#if m.role === 'user'}
              <!-- User message -->
              <div class="flex justify-end group animate-fade-in">
                <div class="flex flex-col items-end gap-1 max-w-[80%] md:max-w-[60%]">
                  <!-- Attachments -->
                  {#if m.attachments && m.attachments.length > 0}
                    <div class="flex flex-wrap gap-2 justify-end">
                      {#each m.attachments as attachment}
                        {#if attachment.mimeType.startsWith('image/')}
                          <div class="rounded-lg overflow-hidden border border-base-300 max-w-[200px]">
                            <img 
                              src={attachment.previewUrl || `data:${attachment.mimeType};base64,`} 
                              alt={attachment.name}
                              class="max-h-48 object-contain"
                            />
                          </div>
                        {:else}
                          <div class="badge badge-outline gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {attachment.name}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                  
                  <!-- Message bubble -->
                  <div class="bg-primary text-primary-content rounded-2xl px-4 py-2 relative">
                    {#if editingMessageId === m.id}
                      <!-- Edit Mode -->
                      <div class="flex flex-col gap-2 min-w-[200px]">
                        <textarea
                          class="textarea textarea-bordered text-base-content w-full p-2 min-h-[100px]"
                          bind:value={editContent}
                          autofocus
                        ></textarea>
                        <div class="flex justify-end gap-2">
                          <button class="btn btn-xs btn-ghost text-primary-content" onclick={cancelEdit}>Cancel</button>
                          <button class="btn btn-xs btn-secondary" onclick={saveEdit}>Save</button>
                        </div>
                      </div>
                    {:else}
                      <!-- Display Mode -->
                      <MarkdownMessage md={m.content} />
                      {#if !generating}
                        <button
                          class="btn btn-xs btn-circle btn-ghost absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onclick={() => startEdit(m)}
                          title="Edit message"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      {/if}
                    {/if}
                  </div>
                  
                  <!-- Timestamp -->
                  <span class="text-xs opacity-50 mr-1">{formatTime(m.createdAt)}</span>
                </div>
              </div>
            {:else}
              <!-- Assistant message -->
              <div class="w-full group relative animate-fade-in">
                <div class="prose prose-invert max-w-none">
                  {#if generating && index === messages.length - 1 && !m.content}
                    <!-- Typing indicator -->
                    <div class="flex gap-1 py-2">
                      <span class="w-2 h-2 bg-base-content rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                      <span class="w-2 h-2 bg-base-content rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                      <span class="w-2 h-2 bg-base-content rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                    </div>
                  {:else}
                    <MarkdownMessage md={m.content} />
                  {/if}
                </div>
                
                <!-- Grounding sources -->
                {#if m.groundingMetadata?.sources && m.groundingMetadata.sources.length > 0}
                  <div class="mt-3 p-3 bg-base-200 rounded-lg border border-base-300">
                    <div class="flex items-center gap-2 text-sm font-medium mb-2 opacity-70">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd" />
                      </svg>
                      Sources
                    </div>
                    <div class="flex flex-wrap gap-2">
                      {#each m.groundingMetadata.sources as source}
                        <a 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="badge badge-outline badge-sm gap-1 hover:badge-primary transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          {source.title.length > 30 ? source.title.slice(0, 30) + '...' : source.title}
                        </a>
                      {/each}
                    </div>
                  </div>
                {/if}
                
                <!-- Actions and timestamp -->
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-xs opacity-50">{formatTime(m.createdAt)}</span>
                  {#if !generating && index === messages.length - 1}
                    <button
                      class="btn btn-xs btn-ghost gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onclick={handleRegenerate}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                      </svg>
                      Regenerate
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Input Bar -->
    <form class="border-t border-base-300 p-4 bg-base-200" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <div class="flex flex-col gap-2 max-w-6xl mx-auto">
        <!-- Pending attachments -->
        {#if pendingAttachments.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each pendingAttachments as attachment, i}
              <div class="relative group">
                {#if attachment.mimeType.startsWith('image/') && attachment.previewUrl}
                  <div class="w-16 h-16 rounded-lg overflow-hidden border border-base-300 bg-base-300">
                    <img src={attachment.previewUrl} alt={attachment.name} class="w-full h-full object-cover" />
                  </div>
                {:else}
                  <div class="flex items-center gap-2 px-3 py-2 bg-base-300 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span class="text-sm truncate max-w-[100px]">{attachment.name}</span>
                  </div>
                {/if}
                <button
                  type="button"
                  class="absolute -top-1 -right-1 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                  onclick={() => removeAttachment(i)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Upload progress -->
        {#if uploadingFiles}
          <div class="flex items-center gap-2">
            <span class="loading loading-spinner loading-sm"></span>
            <progress class="progress progress-primary flex-1" value={uploadProgress} max="100"></progress>
            <span class="text-sm">{Math.round(uploadProgress)}%</span>
          </div>
        {/if}
        
        <div class="flex gap-2">
          <!-- Attachment button -->
          <input
            type="file"
            class="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
            multiple
            bind:this={fileInputRef}
            onchange={(e) => handleFileSelect((e.target as HTMLInputElement).files)}
          />
          <button
            type="button"
            class="btn btn-ghost btn-square"
            onclick={() => fileInputRef?.click()}
            disabled={generating || !apiKeyConfigured || uploadingFiles}
            title="Attach files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          
          <textarea
            class="textarea textarea-bordered flex-1 resize-none min-h-[3rem]"
            placeholder={apiKeyConfigured ? "Type a message… (Ctrl+Enter to send)" : "Configure API key in settings to start chatting"}
            bind:value={input}
            rows="2"
            onkeydown={onKeydown}
            disabled={generating || !apiKeyConfigured}
          ></textarea>
          <button 
            type="submit" 
            class="btn btn-primary" 
            disabled={generating || (!input.trim() && pendingAttachments.length === 0) || !apiKeyConfigured || uploadingFiles}
          >
            {#if generating}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            {/if}
            <span class="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </form>
  </main>
</div>
