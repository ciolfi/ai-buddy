// app.js - v2.5 (Final CDN Sync + Nuclear Clean)
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";

const MY_APP_CONFIG = {
    model_list: [
        {
            model_id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
            // FIXED: Stable CDN path that is case-insensitive and optimized for browser caching
            model_lib: "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/smollm2-135m-instruct-q4f16_1-mlc/smollm2-135m-instruct-q4f16_1-mlc-webgpu.wasm", 
            model: "https://huggingface.co/mlc-ai/SmolLM2-135M-Instruct-q4f16_1-MLC/resolve/main/",
            low_resource_required: true
        }
    ]
};

const getEl = (id) => document.getElementById(id);
const downloadBtn = getEl("download-btn");
const sendBtn = getEl("send-btn");
const gpuStatus = getEl("gpu-status");
const progressText = getEl("progress-text");
const progressBar = getEl("progress-bar");

function updateStatus(msg) {
    if (progressText) progressText.innerText = msg;
    console.log("AI Status:", msg);
}

// THE NUCLEAR CLEAN: Run this via your Clear Cache button
async function nuclearReset() {
    updateStatus("Purging all corrupted caches...");
    if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    }
    const dbs = await window.indexedDB.databases();
    dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
    localStorage.clear();
    updateStatus("Cleaned. Reloading...");
    setTimeout(() => location.reload(), 1000);
}

getEl("clear-cache-btn")?.addEventListener("click", nuclearReset);

if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
        try {
            updateStatus("Connecting to engine...");
            downloadBtn.disabled = true;

            const engine = await webllm.CreateMLCEngine(
                "SmolLM2-135M-Instruct-q4f16_1-MLC", 
                { 
                    appConfig: MY_APP_CONFIG,
                    // Bypass broken local cache records
                    cacheConfig: { scope: "model", notebook: false }, 
                    low_resource_required: true,
                    context_window_size: 1024,
                    initProgressCallback: (report) => {
                        updateStatus(report.text);
                        if (progressBar) progressBar.style.width = `${report.progress * 100}%`;
                    }
                }
            );

            window.aiEngine = engine;
            updateStatus("Ready.");
            if (sendBtn) sendBtn.disabled = false;
        } catch (err) {
            updateStatus("Critical Error: See Console");
            console.error("LOAD ERROR:", err);
        }
    });
}
// ... [Keep your existing Chat Handler Block below] ...

// 5. Chat Handler Block
if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
        const prompt = userInput?.value.trim();
        if (!prompt || !window.aiEngine) return;

        appendMessage("user", prompt);
        userInput.value = "";
        sendBtn.disabled = true;

        try {
            let aiResponse = "";
            const msgDiv = document.createElement("div");
            msgDiv.className = "message ai-msg";
            chatHistory.appendChild(msgDiv);

            const chunks = await window.aiEngine.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
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

// Add this to your Helper Functions section
async function deepCleanWebLLMCache() {
    updateStatus("Performing deep cache purge...");
    try {
        // 1. Delete all Cache Storage buckets
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
                await caches.delete(name);
                console.log(`Deleted cache: ${name}`);
            }
        }
        
        // 2. Clear IndexedDB (WebLLM often uses this for internal state)
        const dbs = await window.indexedDB.databases();
        dbs.forEach(db => {
            window.indexedDB.deleteDatabase(db.name);
            console.log(`Deleted DB: ${db.name}`);
        });

        // 3. Clear Storage
        localStorage.clear();
        sessionStorage.clear();

        updateStatus("Deep clean complete. Reloading...");
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        console.error("Deep clean failed:", err);
        updateStatus("Clean failed: " + err.message);
    }
}

// Attach it to your existing button
getEl("clear-cache-btn")?.addEventListener("click", deepCleanWebLLMCache);