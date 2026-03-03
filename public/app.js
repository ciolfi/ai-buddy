import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/+esm";
import { Vault } from './vault.js';

const vault = new Vault();
let engine = null;
let chatAbortController = null;

const downloadBtn = document.getElementById('download-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const messagesContainer = document.getElementById('messages');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');

// 2026 OFFICIAL CDN PATHS - These bypass the manual GitHub link issues
const MY_APP_CONFIG = {
  model_list: [
    {
      model_id: "SmolLM2-135M-Instruct-q0f32-MLC",
      model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/SmolLM2-135M-Instruct-q0f32-ctx2k-webgpu.wasm",
      model: "https://huggingface.co/mlc-ai/SmolLM2-135M-Instruct-q0f32-MLC/resolve/main/"
    },
    {
      model_id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
      model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
      model: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/main/"
    },
    {
      model_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
      model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
      model: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/"
    }
  ]
};

async function init() {
  if (!navigator.gpu) {
    document.getElementById('gpu-status').innerText = "WebGPU NOT SUPPORTED";
    return;
  }
  await vault.init();
  document.getElementById('gpu-status').innerText = "WebGPU Ready | Vault Active";
}

downloadBtn.addEventListener('click', async () => {
  const selectedModelId = modelSelect.value;
  downloadBtn.disabled = true;
  progressBar.style.width = "5%";
  progressText.innerText = "Connecting to CDN...";

  try {
    // Create engine with our config
    engine = new webllm.MLCEngine({
      initProgressCallback: (report) => {
        const pct = Math.floor(report.progress * 100);
        progressBar.style.width = `${pct}%`;
        progressText.innerText = report.text;
      },
      appConfig: MY_APP_CONFIG
    });

    // Trigger the download
    await engine.reload(selectedModelId);

    downloadBtn.innerText = "AI Loaded";
    progressText.innerText = "Model ready.";
  } catch (err) {
    console.error("MLC Load Error:", err);
    // If it fails, clear the engine so we can try again
    engine = null;
    progressText.innerText = "Network Error: Please check CORS extension or VPN status.";
    downloadBtn.disabled = false;
  }
});

// --- VAULT HANDLING ---
document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('vault-status').innerText = "Indexing...";
  const text = await file.text();
  await vault.addText(text, (p) => {
    document.getElementById('index-progress').style.display = 'block';
    document.getElementById('index-percent').innerText = p;
  });
  document.getElementById('vault-status').innerText = `Vault: ${file.name} (Ready)`;
});

// --- CHAT LOGIC ---
async function handleChat() {
  const query = document.getElementById('prompt').value.trim();
  if (!engine || !query) return;

  appendMessage(query, 'user-msg');
  document.getElementById('prompt').value = "";

  chatAbortController = new AbortController();
  const aiMsgDiv = appendMessage("Thinking...", 'ai-msg');
  let fullText = "";

  try {
    const context = await vault.query(query);
    const chunks = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "Answer based on context. If none, answer generally." },
        { role: "user", content: context ? `Context: ${context}\n\nQuestion: ${query}` : query }
      ],
      stream: true,
    });

    aiMsgDiv.innerText = "";
    for await (const chunk of chunks) {
      if (chatAbortController.signal.aborted) break;
      fullText += (chunk.choices[0]?.delta?.content || "");
      aiMsgDiv.innerText = fullText;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } catch (err) {
    if (err.name !== 'AbortError') aiMsgDiv.innerText = "Error: " + err.message;
  } finally {
    chatAbortController = null;
  }
}

sendBtn.addEventListener('click', handleChat);

function appendMessage(txt, cls) {
  const d = document.createElement('div');
  d.className = `message ${cls}`;
  d.innerText = txt;
  messagesContainer.appendChild(d);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return d;
}

init();