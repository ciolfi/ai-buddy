// app.js
import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import { Vault } from './vault.js';

/**
 * GLOBAL DEBUGGER
 * Since you're clearing site data, we catch errors during 
 * the silent WASM loading phase.
 */
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled Promise Rejection:", event.reason);
    alert("AI Engine Error: " + event.reason);
});

const vault = new Vault();
let engine = null;

// UI Selectors
const downloadBtn = document.getElementById('download-btn');
const fileInput = document.getElementById('file-input');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

/**
 * 1. APP INITIALIZATION
 */
async function init() {
    console.log("Checking WebGPU support...");
    if (!navigator.gpu) {
        progressText.innerText = "Error: WebGPU not supported in this browser.";
        downloadBtn.disabled = true;
        return;
    }
    
    try {
        await vault.init();
        document.getElementById('gpu-status').innerText = "Vault Active | WebGPU Ready";
    } catch (e) {
        console.error("Vault Init Error:", e);
    }
}

/**
 * 2. LOAD ENGINE (REINFORCED)
 */
downloadBtn.addEventListener('click', async () => {
    const modelId = document.getElementById('model-select').value;
    
    // UI Reset
    downloadBtn.disabled = true;
    if (progressBar) progressBar.style.width = "5%"; 
    progressText.innerText = "Initializing WASM Runtime...";

    try {
        console.log(`Starting engine load for ${modelId}...`);

        // Create the engine
        // Note: Using CreateMLCEngine is the standard factory for 2026
        engine = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (report) => {
                // report.progress is a float 0.0 to 1.0
                const pct = Math.floor(report.progress * 100);
                
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressText) progressText.innerText = report.text;
                
                // Detailed logging to verify progress is happening
                console.log(`[${pct}%] ${report.text}`);
            }
        });

        downloadBtn.innerText = "AI Ready";
        progressText.innerText = "Engine Loaded. Chat is active.";

    } catch (err) {
        console.error("MLC Engine Load Failed:", err);
        progressText.innerText = "Load Failed. See Console (F12).";
        downloadBtn.disabled = false;
        alert("GPU Error: " + err.message);
    }
});

/**
 * 3. VAULT FILE INDEXING
 */
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const progressDiv = document.getElementById('index-progress');
    const progressPercent = document.getElementById('index-percent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    
    try {
        await vault.addText(text, (p) => {
            if (progressPercent) progressPercent.innerText = p;
        });
        document.getElementById('vault-status').innerText = `Vault: ${file.name} (Active)`;
    } catch (err) {
        console.error("Vault Indexing Error:", err);
        alert("Could not index file. Check if Vault is initialized.");
    }
});

/**
 * 4. STREAMING CHAT (RAG)
 */
async function handleChat() {
    const query = document.getElementById('prompt').value.trim();
    if (!engine) {
        alert("Please load the AI Engine first!");
        return;
    }
    if (!query) return;

    document.getElementById('prompt').value = "";
    appendMessage(query, 'user-msg');

    const aiMsgDiv = appendMessage("Thinking...", 'ai-msg');
    let fullReply = "";

    try {
        // Query the local Vector DB (Vault)
        const context = await vault.query(query);
        console.log("Context Found:", context);

        const messagesArr = [
            { 
                role: "system", 
                content: "You are a private AI. Use the provided context to answer. If none, answer generally." 
            },
            { 
                role: "user", 
                content: context ? `Context: ${context}\n\nQuestion: ${query}` : query 
            }
        ];

        // START STREAMING
        const chunks = await engine.chat.completions.create({
            messages: messagesArr,
            stream: true,
        });

        aiMsgDiv.innerText = ""; // Clear indicator

        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullReply += content;
            aiMsgDiv.innerText = fullReply;
            messages.scrollTop = messages.scrollHeight;
        }

    } catch (err) {
        console.error("Chat Error:", err);
        aiMsgDiv.innerText = "Error: " + err.message;
    }
}

function appendMessage(txt, cls) {
    const d = document.createElement('div');
    d.className = `message ${cls}`;
    d.innerText = txt;
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
    return d;
}

sendBtn.addEventListener('click', handleChat);
init();