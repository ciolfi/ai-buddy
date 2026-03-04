// import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/+esm";
// import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/+esm";
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";
import { Vault } from './vault.js';

// 1. Setup & Configuration
const vault = new Vault();
let engine = null;
let chatAbortController = null;

const MY_APP_CONFIG = {
    model_list: [
        {
            model_id: "SmolLM2-135M-Instruct-q0f32-MLC",
            model_lib: "/public/models/smollm2.wasm", 
            // This URL is structured exactly as the engine expects to find the config files
            model: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/SmolLM2-135M-Instruct-q0f32-MLC/resolve/main/"
        }
    ]
};

// 2. UI Elements
const downloadBtn = document.getElementById('download-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const messagesContainer = document.getElementById('messages');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const clearCacheBtn = document.getElementById('clear-cache-btn');

// 3. Lifecycle & Initialization
async function init() {
  if (!navigator.gpu) {
    document.getElementById('gpu-status').innerText = "WebGPU ERROR: Please use Chrome/Edge";
    return;
  }
  await vault.init();
  document.getElementById('gpu-status').innerText = "System Ready | Local WASM Active";
}

// 4. Loading the Engine
downloadBtn.addEventListener('click', async () => {
  const selectedId = modelSelect.value;
  downloadBtn.disabled = true;
  progressBar.style.width = "5%";
  progressText.innerText = "Initializing Local AI Worker...";

  try {
    engine = new webllm.MLCEngine({
      initProgressCallback: (report) => {
        const pct = Math.floor(report.progress * 100);
        progressBar.style.width = `${pct}%`;
        progressText.innerText = report.text;
      },
      appConfig: MY_APP_CONFIG
    });

    await engine.reload(selectedId);
    downloadBtn.innerText = "AI Online";
    progressText.innerText = "Model logic and weights ready.";
  } catch (err) {
    console.error("Critical Load Failure:", err);
    progressText.innerText = "Error: " + err.message;
    downloadBtn.disabled = false;
    engine = null;
  }
});

// 5. Chat & RAG Logic
async function handleChat() {
  const query = document.getElementById('prompt').value.trim();
  if (!engine || !query) return;

  appendMessage(query, 'user-msg');
  document.getElementById('prompt').value = "";
  chatAbortController = new AbortController();
  const aiMsgDiv = appendMessage("Searching Vault...", 'ai-msg');

  try {
    const context = await vault.query(query);
    aiMsgDiv.innerText = "Generating Response...";

    const chunks = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "You are a research assistant. Use the provided context to answer. If the context is irrelevant, use your general knowledge." },
        { role: "user", content: context ? `CONTEXT:\n${context}\n\nUSER QUESTION: ${query}` : query }
      ],
      stream: true,
    });

    let fullText = "";
    aiMsgDiv.innerText = "";
    for await (const chunk of chunks) {
      if (chatAbortController.signal.aborted) break;
      const content = chunk.choices[0]?.delta?.content || "";
      fullText += content;
      aiMsgDiv.innerText = fullText;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } catch (err) {
    if (err.name !== 'AbortError') aiMsgDiv.innerText = "AI Error: " + err.message;
  }
}

// 6. Utility Functions
function appendMessage(txt, cls) {
  const d = document.createElement('div');
  d.className = `message ${cls}`;
  d.innerText = txt;
  messagesContainer.appendChild(d);
  return d;
}

sendBtn.addEventListener('click', handleChat);

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  await vault.addText(text, (p) => {
    progressText.innerText = `Indexing Vault: ${p}%`;
  });
  progressText.innerText = "Vault indexing complete.";
});

clearCacheBtn?.addEventListener('click', async () => {
  if (confirm("Delete local model cache?")) {
    await webllm.hasModelInCache("SmolLM2-135M-Instruct-q0f32-MLC", MY_APP_CONFIG);
    // This clears the browser's Cache API specifically for webllm
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.includes("webllm")) await caches.delete(name);
    }
    location.reload();
  }
});

init();