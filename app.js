// app.js - v2.6 (Hugging Face Production Sync)
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";

console.log("App.js has started loading...");

// 1. Configuration: Using official Hugging Face paths for stability
const MY_APP_CONFIG = {
  model_list: [
    // {
    //     model_id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
    //     // DIRECT LINK: Verified lowercase path on the official CDN
    //     model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/smollm2-135m-instruct-q4f16_1-mlc/smollm2-135m-instruct-q4f16_1-mlc-webgpu.wasm", 
    //     model: "https://huggingface.co/mlc-ai/SmolLM2-135M-Instruct-q4f16_1-MLC/resolve/main/",
    //     low_resource_required: true
    // }
    {
      model_id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
      model_lib: "https://github.com/mlc-ai/binary-mlc-llm-libs/blob/7e4a0b9dae58fb95b36190e558e4eaedd76b4362/web-llm-models/v0_2_48/SmolLM-360M-Instruct-q4f16_1-ctx2k_cs1k-webgpu.wasm",
      // model: "https://ai-buddy-lime.vercel.app/public/models/SmolLM-360M-Instruct-q4f16_1-ctx2k_cs1k-webgpu.wasm"
      model: "https://ai-buddy-lime.vercel.app/SmolLM-360M-Instruct-q4f16_1-ctx2k_cs1k-webgpu.wasm"
    }
  ]
};

// 2. UI Elements: Matches your index.html exactly
const getEl = (id) => document.getElementById(id);

const downloadBtn = getEl("download-btn");
const sendBtn = getEl("send-btn");
const userInput = getEl("prompt");      // Matches <textarea id="prompt">
const chatHistory = getEl("messages");  // Matches <div id="messages">
const gpuStatus = getEl("gpu-status");  // Matches <div id="gpu-status">
const progressBar = getEl("progress-bar"); // Matches <div id="progress-bar">
const progressText = getEl("progress-text"); // Matches <span id="progress-text">

// Immediate WebGPU Check
if (gpuStatus) {
  gpuStatus.innerText = navigator.gpu ? "WebGPU Status: Supported" : "WebGPU Status: Not Supported";
}

// 3. Helper Functions
function updateStatus(msg) {
  if (progressText) progressText.innerText = msg;
  console.log("AI Status:", msg);
}

function updateProgressBar(value) {
  if (progressBar) {
    progressBar.style.width = `${value}%`;
  }
}

function appendMessage(role, text) {
  if (!chatHistory) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}-msg`;
  msgDiv.innerText = text;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

// 4. The Nuclear Reset: Purges all corrupted cache fragments
async function handleClearCache() {
  updateStatus("Purging all local AI data...");
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    const dbs = await window.indexedDB.databases();
    for (const db of dbs) {
      window.indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
    sessionStorage.clear();

    updateStatus("Cache purged. Reloading...");
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    console.error("Reset failed:", err);
    updateStatus("Reset failed: " + err.message);
  }
}

getEl("clear-cache-btn")?.addEventListener("click", handleClearCache);

// 5. Load AI Engine Block
if (downloadBtn) {
  downloadBtn.addEventListener("click", async () => {
    try {
      updateStatus("Initializing local AI...");
      downloadBtn.disabled = true;
      updateProgressBar(0);

      const engine = await webllm.CreateMLCEngine(
        "SmolLM2-135M-Instruct-q4f16_1-MLC",
        {
          appConfig: MY_APP_CONFIG,
          cacheConfig: { scope: "model", notebook: false },
          low_resource_required: true,
          context_window_size: 1024,
          initProgressCallback: (report) => {
            updateStatus(report.text);
            updateProgressBar(report.progress * 100);
          }
        }
      );

      window.aiEngine = engine;
      updateStatus("Model logic and weights ready.");
      if (sendBtn) sendBtn.disabled = false;

    } catch (err) {
      updateStatus("Critical Load Failure: See Console");
      console.error("Initialization Error:", err);
      downloadBtn.disabled = false;
    }
  });
}

// 6. Chat Handler Block
if (sendBtn) {
  sendBtn.addEventListener("click", async () => {
    const promptText = userInput?.value.trim();
    if (!promptText || !window.aiEngine) return;

    appendMessage("user", promptText);
    userInput.value = "";
    sendBtn.disabled = true;

    try {
      let aiResponse = "";
      const msgDiv = document.createElement("div");
      msgDiv.className = "message ai-msg";
      chatHistory.appendChild(msgDiv);

      const chunks = await window.aiEngine.chat.completions.create({
        messages: [{ role: "user", content: promptText }],
        stream: true
      });

      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content || "";
        aiResponse += content;
        msgDiv.innerText = aiResponse;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }

    } catch (err) {
      updateStatus("AI Error: " + err.message);
      console.error("Chat Error:", err);
    } finally {
      sendBtn.disabled = false;
    }
  });
}