/**
 * app.js — NEURON PWA main application
 * Integrates WebLLM (client-side LLM inference) with RAG engine
 *
 * Model roster:
 *   Slot 1 — Qwen2.5-0.5B-Instruct-q4f16_1-MLC     ~400 MB  (fastest)
 *   Slot 2 — Llama-3.2-1B-Instruct-q4f16_1-MLC      ~800 MB  (balanced)
 *   Slot 3 — Phi-3.5-mini-instruct-q4f16_1-MLC      ~1.4 GB  (smartest)
 *             Replaces Llama-3.2-3B which caused browser storage quota errors.
 *             Phi-3.5 Mini is a 3.8B model quantized to q4f16 — better reasoning
 *             than the 3B Llama at a smaller on-disk footprint.
 */

'use strict';

// ─────────────────────────────────────────────
// WebLLM CDN import
// ─────────────────────────────────────────────
let mlc_llm = null; // will be set after dynamic import

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

// ─────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────
const state = {
  engine: null,
  modelLoaded: false,
  modelId: null,
  generating: false,
  messages: [],          // full chat history for the model
  documents: [],         // { name, size, chunkCount }
};

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = {
  splash:          $('splash-screen'),
  splashStatus:    $('splash-status'),
  app:             $('app'),
  sidebar:         $('sidebar'),
  sidebarOpen:     $('sidebar-open'),
  sidebarClose:    $('sidebar-close'),
  modelSelect:     $('model-select'),
  loadModelBtn:    $('load-model-btn'),
  modelStatusDot:  document.querySelector('.status-dot'),
  modelStatusText: $('model-status-text'),
  modelProgressW:  $('model-progress-wrap'),
  modelProgressF:  $('model-progress-fill'),
  modelProgressL:  $('model-progress-label'),
  dropZone:        $('drop-zone'),
  fileInput:       $('file-input'),
  docList:         $('doc-list'),
  ragStats:        $('rag-stats'),
  ragChunkCount:   $('rag-chunk-count'),
  ctxSelect:       $('ctx-select'),
  tempSlider:      $('temp-slider'),
  tempVal:         $('temp-val'),
  topkSelect:      $('topk-select'),
  clearChatBtn:    $('clear-chat-btn'),
  activeModelLabel:$('active-model-label'),
  ragIndicator:    $('rag-indicator'),
  chatMessages:    $('chat-messages'),
  welcomeCard:     $('welcome-card'),
  ragContextPrev:  $('rag-context-preview'),
  ragPreviewDetail:$('rag-preview-detail'),
  chatInput:       $('chat-input'),
  sendBtn:         $('send-btn'),
};

// ─────────────────────────────────────────────
// Splash boot sequence
// ─────────────────────────────────────────────
async function boot() {
  const steps = [
    [300,  'Loading WebLLM runtime…'],
    [700,  'Initializing WASM modules…'],
    [1100, 'Bootstrapping RAG engine…'],
    [1500, 'Checking WebGPU availability…'],
    [1900, 'Ready.'],
  ];

  for (const [ms, msg] of steps) {
    await sleep(ms - (steps[steps.indexOf([ms,msg]) - 1]?.[0] || 0));
    el.splashStatus.textContent = msg;
  }

  // Try dynamic import of WebLLM
  try {
    mlc_llm = await import(WEBLLM_CDN);
    el.splashStatus.textContent = 'WebLLM loaded ✓';
  } catch (e) {
    console.warn('[boot] WebLLM import failed:', e);
    el.splashStatus.textContent = 'Using fallback mode…';
  }

  await sleep(400);
  el.splash.classList.add('fade-out');
  await sleep(600);
  el.splash.style.display = 'none';
  el.app.classList.remove('hidden');

  checkWebGPU();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkWebGPU() {
  if (!navigator.gpu) {
    showToast('⚠️ WebGPU not detected. Model loading may fail or be slow.', 'error', 5000);
  } else {
    showToast('✓ WebGPU available', 'success', 2500);
  }
}

// ─────────────────────────────────────────────
// Model loading
// ─────────────────────────────────────────────
async function loadModel() {
  const modelId = el.modelSelect.value;
  if (state.generating) return;

  el.loadModelBtn.disabled = true;
  setModelStatus('loading', 'Downloading model…');
  el.modelProgressW.classList.remove('hidden');
  el.modelProgressF.style.width = '0%';
  el.modelProgressL.textContent = '0%';

  try {
    if (!mlc_llm) throw new Error('WebLLM module not loaded');

    // Unload previous engine
    if (state.engine) {
      try { await state.engine.unload(); } catch {}
      state.engine = null;
    }

    const initProgressCallback = (report) => {
      const pct = Math.round((report.progress || 0) * 100);
      el.modelProgressF.style.width = pct + '%';
      el.modelProgressL.textContent = pct + '%';
      const text = report.text || `Loading… ${pct}%`;
      setModelStatus('loading', text.length > 40 ? text.slice(0, 37) + '…' : text);
    };

    state.engine = await mlc_llm.CreateMLCEngine(modelId, {
      initProgressCallback,
      appConfig: mlc_llm.prebuiltAppConfig,
    });

    state.modelLoaded = true;
    state.modelId = modelId;
    state.messages = [];

    const shortName = el.modelSelect.options[el.modelSelect.selectedIndex].text.split('·')[0].trim();
    setModelStatus('ready', `${shortName} ready`);
    el.activeModelLabel.textContent = shortName;
    el.modelProgressW.classList.add('hidden');
    enableChat(true);
    showToast(`✓ ${shortName} loaded successfully`, 'success');

  } catch (err) {
    console.error('[loadModel]', err);
    setModelStatus('error', 'Load failed');
    el.modelProgressW.classList.add('hidden');
    showToast(`✗ Model load failed: ${err.message}`, 'error', 6000);
  } finally {
    el.loadModelBtn.disabled = false;
  }
}

function setModelStatus(type, text) {
  el.modelStatusDot.className = `status-dot ${type}`;
  el.modelStatusText.textContent = text;
}

function enableChat(enabled) {
  el.chatInput.disabled = !enabled;
  el.sendBtn.disabled = !enabled;
  if (enabled) el.chatInput.focus();
}

// ─────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────
async function sendMessage() {
  const text = el.chatInput.value.trim();
  if (!text || !state.modelLoaded || state.generating) return;

  el.chatInput.value = '';
  el.chatInput.style.height = 'auto';
  hideWelcome();

  // RAG context retrieval
  let ragContext = null;
  let ragResults = [];
  if (window.ragEngine.hasDocuments()) {
    const topK = parseInt(el.topkSelect.value);
    ragResults = window.ragEngine.query(text, topK);
    ragContext = window.ragEngine.buildContext(ragResults);
  }

  // Show RAG preview
  updateRagPreview(ragResults);

  // Display user message
  appendMessage('user', text);

  // Build model prompt
  const systemPrompt = buildSystemPrompt(ragContext);
  const apiMessages = buildApiMessages(systemPrompt, text);

  // Typing indicator
  const typingId = appendTypingIndicator();
  state.generating = true;
  el.sendBtn.disabled = true;
  el.chatInput.disabled = true;

  try {
    const temperature = parseFloat(el.tempSlider.value);
    const max_tokens = 1024;

    // Remove typing indicator, create streaming bubble
    removeTypingIndicator(typingId);
    const assistantBubble = appendStreamingMessage();

    let fullResponse = '';
    const chunks = await state.engine.chat.completions.create({
      messages: apiMessages,
      temperature,
      max_tokens,
      stream: true,
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullResponse += delta;
      updateStreamingMessage(assistantBubble, fullResponse);
    }

    finalizeStreamingMessage(assistantBubble, fullResponse, ragResults);

    // Push to history
    state.messages.push(
      { role: 'user', content: text },
      { role: 'assistant', content: fullResponse }
    );

    // Keep history bounded
    if (state.messages.length > 20) state.messages = state.messages.slice(-20);

  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage('assistant', `⚠️ Generation error: ${err.message}`);
    console.error('[sendMessage]', err);
    showToast('Generation failed', 'error');
  } finally {
    state.generating = false;
    el.sendBtn.disabled = false;
    el.chatInput.disabled = false;
    el.chatInput.focus();
  }
}

function buildSystemPrompt(ragContext) {
  let base = `You are NEURON, a helpful AI assistant running entirely in the user's browser using WebLLM. You are private, fast, and capable. Be concise and helpful.`;
  if (ragContext) {
    base += `\n\nYou have access to the following document context retrieved from the user's uploaded files. Use this information to answer the question accurately:\n\n${ragContext}\n\nBase your answer primarily on the provided context when relevant. If the context doesn't contain enough information, say so clearly.`;
  }
  return base;
}

function buildApiMessages(systemPrompt, userText) {
  const msgs = [{ role: 'system', content: systemPrompt }];
  // Include recent history (last 8 exchanges)
  for (const m of state.messages.slice(-8)) msgs.push(m);
  msgs.push({ role: 'user', content: userText });
  return msgs;
}

// ─────────────────────────────────────────────
// Message rendering
// ─────────────────────────────────────────────
function hideWelcome() {
  if (el.welcomeCard) {
    el.welcomeCard.style.display = 'none';
  }
}

function appendMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🧠';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = renderMarkdown(text);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const inner = document.createElement('div');
  inner.style.maxWidth = 'calc(100% - 44px)';
  inner.appendChild(bubble);
  inner.appendChild(meta);

  wrap.appendChild(avatar);
  wrap.appendChild(inner);
  el.chatMessages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendStreamingMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🧠';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble streaming-cursor';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const inner = document.createElement('div');
  inner.style.maxWidth = 'calc(100% - 44px)';
  inner.appendChild(bubble);
  inner.appendChild(meta);

  wrap.appendChild(avatar);
  wrap.appendChild(inner);
  el.chatMessages.appendChild(wrap);
  scrollToBottom();
  return { wrap, bubble };
}

function updateStreamingMessage({ bubble }, text) {
  bubble.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

function finalizeStreamingMessage({ bubble, wrap }, text, ragResults) {
  bubble.classList.remove('streaming-cursor');
  bubble.innerHTML = renderMarkdown(text);

  if (ragResults.length > 0) {
    const sources = document.createElement('div');
    sources.className = 'rag-sources';
    sources.innerHTML = `<strong>📎 Sources:</strong> `;
    const chips = ragResults.map(r =>
      `<span class="rag-source-chip">📄 ${r.filename} <span style="opacity:0.5">${Math.round(r.score * 100)}%</span></span>`
    ).join('');
    sources.innerHTML += chips;
    bubble.appendChild(sources);
  }
  scrollToBottom();
}

function appendTypingIndicator() {
  const id = 'typing-' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'message assistant typing-indicator';
  wrap.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🧠';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  el.chatMessages.appendChild(wrap);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  el.chatMessages.scrollTo({ top: el.chatMessages.scrollHeight, behavior: 'smooth' });
}

// Simple markdown renderer (no external deps)
function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bullets
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────
// RAG preview
// ─────────────────────────────────────────────
function updateRagPreview(results) {
  if (results.length === 0) {
    el.ragContextPrev.classList.add('hidden');
  } else {
    el.ragContextPrev.classList.remove('hidden');
    el.ragPreviewDetail.textContent =
      `${results.length} chunk${results.length > 1 ? 's' : ''} from: ${[...new Set(results.map(r => r.filename))].join(', ')}`;
  }
}

// ─────────────────────────────────────────────
// Document management
// ─────────────────────────────────────────────
async function handleFiles(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['txt','md','pdf','csv','json'].includes(ext)) {
      showToast(`⚠️ Unsupported file type: .${ext}`, 'error');
      continue;
    }
    try {
      showToast(`⏳ Processing ${file.name}…`, 'info');
      const chunkCount = await window.ragEngine.addDocument(file);
      state.documents.push({ name: file.name, size: file.size, chunkCount });
      renderDocList();
      updateRagStatus();
      showToast(`✓ ${file.name} indexed (${chunkCount} chunks)`, 'success');
    } catch (e) {
      showToast(`✗ Failed to process ${file.name}`, 'error');
      console.error(e);
    }
  }
}

function removeDoc(filename) {
  window.ragEngine.removeDocument(filename);
  state.documents = state.documents.filter(d => d.name !== filename);
  renderDocList();
  updateRagStatus();
  showToast(`🗑 Removed ${filename}`, 'info');
}

function renderDocList() {
  el.docList.innerHTML = '';
  for (const doc of state.documents) {
    const item = document.createElement('div');
    item.className = 'doc-item';
    item.innerHTML = `
      <span class="doc-item-icon">${fileIcon(doc.name)}</span>
      <span class="doc-item-name" title="${doc.name}">${doc.name}</span>
      <span class="doc-item-size">${formatSize(doc.size)}</span>
      <button class="doc-remove" data-name="${doc.name}" aria-label="Remove">✕</button>
    `;
    el.docList.appendChild(item);
  }
}

function updateRagStatus() {
  const count = window.ragEngine.chunkCount;
  if (count > 0) {
    el.ragStats.style.display = 'block';
    el.ragChunkCount.textContent = `${count} chunk${count !== 1 ? 's' : ''}`;
    el.ragIndicator.classList.remove('hidden');
  } else {
    el.ragStats.style.display = 'none';
    el.ragIndicator.classList.add('hidden');
  }
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  return { pdf: '📕', md: '📝', csv: '📊', json: '🗂️', txt: '📄' }[ext] || '📄';
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)}KB`;
  return `${(bytes/1048576).toFixed(1)}MB`;
}

// ─────────────────────────────────────────────
// Toast notifications
// ─────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ─────────────────────────────────────────────
// Service Worker registration
// ─────────────────────────────────────────────
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('[SW] registered:', reg.scope);
    } catch (e) {
      console.warn('[SW] registration failed:', e);
    }
  }
}

// ─────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────
function bindEvents() {
  // Model
  el.loadModelBtn.addEventListener('click', loadModel);

  // Sidebar toggle (mobile)
  el.sidebarOpen?.addEventListener('click', () => el.sidebar.classList.add('open'));
  el.sidebarClose?.addEventListener('click', () => el.sidebar.classList.remove('open'));

  // Temperature slider
  el.tempSlider.addEventListener('input', () => {
    el.tempVal.textContent = el.tempSlider.value;
    // Update range background gradient
    const pct = el.tempSlider.value * 100;
    el.tempSlider.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, var(--surface2) ${pct}%)`;
  });

  // Clear chat
  el.clearChatBtn.addEventListener('click', () => {
    state.messages = [];
    el.chatMessages.innerHTML = '';
    if (el.welcomeCard) {
      el.chatMessages.appendChild(el.welcomeCard);
      el.welcomeCard.style.display = '';
    }
    el.ragContextPrev.classList.add('hidden');
    showToast('Chat cleared', 'info');
  });

  // File upload
  el.fileInput.addEventListener('change', e => handleFiles([...e.target.files]));

  el.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    el.dropZone.classList.add('drag-over');
  });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('drag-over'));
  el.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    el.dropZone.classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files]);
  });

  // Doc remove (event delegation)
  el.docList.addEventListener('click', e => {
    if (e.target.classList.contains('doc-remove')) {
      removeDoc(e.target.dataset.name);
    }
  });

  // Chat input
  el.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  el.chatInput.addEventListener('input', () => {
    el.chatInput.style.height = 'auto';
    el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 160) + 'px';
  });

  el.sendBtn.addEventListener('click', sendMessage);
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
(async () => {
  registerSW();
  bindEvents();
  await boot();
})();
