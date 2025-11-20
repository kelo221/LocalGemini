<script lang="ts">
  import { validateApiKey, listModels } from "$lib/services/genai";
  import { saveApiKey, getApiKey, clearApiKey } from "$lib/services/apiKeyStorage";
  import {
    getCustomModels,
    addCustomModel,
    removeCustomModel,
    DEFAULT_MODELS,
  } from "$lib/services/modelStorage";
  import { saveSettings, loadSettings } from "$lib/services/settingsStorage";

  let { isOpen = $bindable(false), onSave } = $props<{
    isOpen: boolean;
    onSave: () => void;
  }>();

  let apiKeyInput = $state("");
  let systemPromptInput = $state("");
  let validating = $state(false);
  let errorMessage = $state<string | undefined>(undefined);
  let successMessage = $state<string | undefined>(undefined);

  // Model management state
  let customModels = $state<string[]>([]);
  let newModelInput = $state("");
  let modelError = $state<string | undefined>(undefined);
  let browseModelsOpen = $state(false);
  let availableModels = $state<string[]>([]);
  let loadingModels = $state(false);
  let modelsLoadError = $state<string | undefined>(undefined);

  // Load current settings when modal opens
  $effect(() => {
    if (isOpen) {
      const currentKey = getApiKey();
      apiKeyInput = currentKey || "";
      
      const settings = loadSettings();
      systemPromptInput = settings.systemPrompt || "";

      errorMessage = undefined;
      successMessage = undefined;
      customModels = getCustomModels();
      newModelInput = "";
      modelError = undefined;
      browseModelsOpen = false;
      availableModels = [];
      modelsLoadError = undefined;
    }
  });

  async function handleSave() {
    const key = apiKeyInput.trim();
    if (!key) {
      errorMessage = "Please enter an API key";
      return;
    }

    validating = true;
    errorMessage = undefined;
    successMessage = undefined;

    const result = await validateApiKey(key);

    if (result.valid) {
      saveApiKey(key);
      
      // Save other settings
      saveSettings({
        systemPrompt: systemPromptInput.trim()
      });

      successMessage = "Settings saved successfully!";
      validating = false;
      setTimeout(() => {
        isOpen = false;
        onSave();
      }, 1000);
    } else {
      errorMessage = result.error || "Invalid API key";
      validating = false;
    }
  }

  function handleClear() {
    if (confirm("Are you sure you want to clear your API key? You will need to enter it again to use the app.")) {
      clearApiKey();
      apiKeyInput = "";
      successMessage = "API key cleared";
      setTimeout(() => {
        isOpen = false;
        onSave();
      }, 1000);
    }
  }

  function closeModal() {
    // Only allow closing if there's a saved API key
    if (getApiKey()) {
      isOpen = false;
    }
  }

  function handleAddModel() {
    const model = newModelInput.trim();
    if (!model) {
      modelError = "Please enter a model name";
      return;
    }

    // Validate format (should start with "models/")
    if (!model.startsWith("models/")) {
      modelError = 'Model name should start with "models/"';
      return;
    }

    // Check if it's a default model
    if (DEFAULT_MODELS.includes(model)) {
      modelError = "This is already a default model";
      return;
    }

    // Check if already added
    if (customModels.includes(model)) {
      modelError = "This model is already added";
      return;
    }

    addCustomModel(model);
    customModels = getCustomModels();
    newModelInput = "";
    modelError = undefined;
  }

  function handleRemoveModel(model: string) {
    if (confirm(`Remove "${model}" from available models?`)) {
      removeCustomModel(model);
      customModels = getCustomModels();
    }
  }

  async function handleBrowseModels() {
    const apiKey = getApiKey();
    if (!apiKey) {
      modelsLoadError = "Please save your API key first";
      return;
    }

    loadingModels = true;
    modelsLoadError = undefined;
    
    try {
      const models = await listModels(apiKey, 100);
      // Filter to only Gemini models and exclude already added ones
      const allAdded = [...DEFAULT_MODELS, ...customModels];
      availableModels = models
        .filter((m) => m.toLowerCase().includes("gemini"))
        .filter((m) => !allAdded.includes(m))
        .sort((a, b) => a.localeCompare(b));
      
      if (availableModels.length === 0) {
        modelsLoadError = "No additional models found";
      } else {
        browseModelsOpen = true;
      }
    } catch (e: any) {
      console.error("Failed to load models:", e);
      modelsLoadError = "Failed to load models. Please check your API key.";
    } finally {
      loadingModels = false;
    }
  }

  function handleSelectModel(model: string) {
    addCustomModel(model);
    customModels = getCustomModels();
    // Remove from available list
    availableModels = availableModels.filter((m) => m !== model);
    if (availableModels.length === 0) {
      browseModelsOpen = false;
    }
  }

  function closeBrowse() {
    browseModelsOpen = false;
    availableModels = [];
  }
</script>

{#if isOpen}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-2xl max-h-[90vh]">
      <h3 class="text-lg font-bold mb-4">Settings</h3>

      <div class="space-y-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
        <!-- API Key Section -->
        <div>
          <label for="api-key-input" class="label">
            <span class="label-text font-semibold">Google Gemini API Key</span>
          </label>
          <input
            id="api-key-input"
            type="password"
            class="input input-bordered w-full"
            placeholder="Enter your API key"
            bind:value={apiKeyInput}
            disabled={validating}
          />
          <p class="label text-sm opacity-70 mt-2">
            Get your API key from
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              class="link link-primary"
            >
              Google AI Studio
            </a>
          </p>
        </div>

        <!-- System Prompt Section -->
        <div class="divider"></div>
        <div>
          <label for="system-prompt-input" class="label">
            <span class="label-text font-semibold">System Prompt</span>
            <span class="label-text-alt text-opacity-60">Optional</span>
          </label>
          <textarea
            id="system-prompt-input"
            class="textarea textarea-bordered w-full h-24"
            placeholder="Enter instructions for the AI (e.g., 'You are a helpful coding assistant', 'Be concise'). This applies to all chats."
            bind:value={systemPromptInput}
            disabled={validating}
          ></textarea>
        </div>

        <!-- Custom Models Section -->
        <div class="divider"></div>
        <div>
          <label class="label">
            <span class="label-text font-semibold">Custom Models</span>
          </label>
          <p class="text-sm opacity-70 mb-3">
            Default models (gemini-flash-latest and gemini-pro-latest) are always available.
            Add custom models below if needed.
          </p>

          <!-- Browse Models Button -->
          <button
            type="button"
            class="btn btn-outline btn-primary w-full mb-3"
            onclick={handleBrowseModels}
            disabled={loadingModels}
          >
            {#if loadingModels}
              <span class="loading loading-spinner loading-sm"></span>
              Loading models...
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
              </svg>
              Browse Available Models
            {/if}
          </button>

          {#if modelsLoadError}
            <div class="alert alert-warning alert-sm mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 shrink-0 stroke-current"
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
              <span>{modelsLoadError}</span>
            </div>
          {/if}

          <!-- Browse Models Modal -->
          {#if browseModelsOpen}
            <div class="card bg-base-200 border border-base-300 mb-3">
              <div class="card-body p-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-semibold">Available Models ({availableModels.length})</h4>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-circle"
                    onclick={closeBrowse}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div class="max-h-60 overflow-y-auto space-y-1">
                  {#each availableModels as model (model)}
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm w-full justify-start font-mono text-xs"
                      onclick={() => handleSelectModel(model)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                      </svg>
                      {model.replace("models/", "")}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Manual Add Option -->
          <details class="collapse collapse-arrow bg-base-200 mb-3">
            <summary class="collapse-title text-sm font-medium">
              Or add model manually
            </summary>
            <div class="collapse-content">
              <div class="join w-full mt-2">
                <input
                  type="text"
                  class="input input-bordered join-item flex-1 input-sm"
                  placeholder="models/gemini-..."
                  bind:value={newModelInput}
                  onkeydown={(e) => e.key === "Enter" && handleAddModel()}
                />
                <button
                  type="button"
                  class="btn btn-primary join-item btn-sm"
                  onclick={handleAddModel}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                  </svg>
                  Add
                </button>
              </div>
            </div>
          </details>

          {#if modelError}
            <div class="alert alert-error alert-sm mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 shrink-0 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{modelError}</span>
            </div>
          {/if}

          <!-- Custom Models List -->
          {#if customModels.length > 0}
            <div class="space-y-2">
              {#each customModels as model (model)}
                <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                  <span class="text-sm font-mono">{model}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-circle"
                    onclick={() => handleRemoveModel(model)}
                    title="Remove model"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-4 text-sm opacity-50">
              No custom models added yet
            </div>
          {/if}
        </div>

        {#if errorMessage}
          <div class="alert alert-error">
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
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        {/if}

        {#if successMessage}
          <div class="alert alert-success">
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
        {/if}
      </div>

      <div class="modal-action">
        {#if getApiKey()}
          <button
            type="button"
            class="btn btn-ghost btn-error"
            onclick={handleClear}
            disabled={validating}
          >
            Clear Key
          </button>
        {/if}
        <button
          type="button"
          class="btn btn-ghost"
          onclick={closeModal}
          disabled={validating || !getApiKey()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={handleSave}
          disabled={validating || !apiKeyInput.trim()}
        >
          {#if validating}
            <span class="loading loading-spinner loading-sm"></span>
            Validating...
          {:else}
            Save
          {/if}
        </button>
      </div>
    </div>
  </dialog>
{/if}
