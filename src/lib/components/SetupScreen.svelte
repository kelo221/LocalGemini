<script lang="ts">
  import { validateApiKey } from "$lib/services/genai";
  import { saveApiKey } from "$lib/services/apiKeyStorage";

  let { onComplete } = $props<{
    onComplete: () => void;
  }>();

  let apiKeyInput = $state("");
  let validating = $state(false);
  let errorMessage = $state<string | undefined>(undefined);

  async function handleSubmit() {
    const key = apiKeyInput.trim();
    if (!key) {
      errorMessage = "Please enter an API key";
      return;
    }

    validating = true;
    errorMessage = undefined;

    const result = await validateApiKey(key);

    if (result.valid) {
      saveApiKey(key);
      validating = false;
      onComplete();
    } else {
      errorMessage = result.error || "Invalid API key";
      validating = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !validating) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <h2 class="text-2xl font-bold mb-2">Welcome to Gemini Local Chat</h2>
    <p class="mb-6 opacity-80">
      To get started, you'll need a Google Gemini API key. This key is stored locally on your
      device and is never sent to anyone except Google's API.
    </p>

    <div class="space-y-4">
      <div>
        <label for="setup-api-key-input" class="label">
          <span class="label-text font-semibold">Google Gemini API Key</span>
        </label>
        <input
          id="setup-api-key-input"
          type="password"
          class="input input-bordered w-full"
          placeholder="Enter your API key"
          bind:value={apiKeyInput}
          disabled={validating}
          onkeydown={onKeydown}
          autofocus
        />
      </div>

      <div class="alert alert-info">
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
        <div class="text-sm">
          <p class="font-semibold mb-1">How to get your API key:</p>
          <ol class="list-decimal list-inside space-y-1">
            <li>
              Visit
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                class="link link-primary"
              >
                Google AI Studio
              </a>
            </li>
            <li>Sign in with your Google account</li>
            <li>Click "Create API Key"</li>
            <li>Copy the key and paste it above</li>
          </ol>
        </div>
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
    </div>

    <div class="modal-action">
      <button
        type="button"
        class="btn btn-primary btn-wide"
        onclick={handleSubmit}
        disabled={validating || !apiKeyInput.trim()}
      >
        {#if validating}
          <span class="loading loading-spinner loading-sm"></span>
          Validating...
        {:else}
          Get Started
        {/if}
      </button>
    </div>
  </div>
</div>

