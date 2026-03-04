//Add this at the VERY top of app.js
console.log("App.js has started loading...");
if (!navigator.gpu) {
    document.getElementById("gpu-status").innerText = "WebGPU Status: Not Supported";
} else {
    document.getElementById("gpu-status").innerText = "WebGPU Status: Supported";
}

// app.js - v2.2 (Integrated Fixes for SmolLM2 16-bit)
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";

// 1. Configuration: Mapping the Model ID to the Logic (WASM) and Weights (Hugging Face)
const MY_APP_CONFIG = {
    model_list: [
        {
            model_id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
            model_lib: "/public/models/smollm2.wasm", 
            model: "https://huggingface.co/mlc-ai/SmolLM2-135M-Instruct-q4f16_1-MLC/resolve/main/",
            low_resource_required: true
        }
    ]
};

// 2. UI Elements
const downloadBtn = document.getElementById("download-btn");
const sendBtn = document.getElementById("send-btn");
const userInput = document.getElementById("user-input");
const chatHistory = document.getElementById("chat-history");

// I changed this text from the commented-out line to the current one
// const statusText = document.getElementById("status-text");
const statusText = document.getElementById("gpu-status");
const progressBar = document.getElementById("progress-bar-inner");

// 3. Helper Functions
function updateStatus(msg) {
    statusText.innerText = msg;
    console.log("Status:", msg);
}

function updateProgressBar(value) {
    progressBar.style.width = `${value}%`;
}

function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}-message`;
    msgDiv.innerText = text;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// 4. Load AI Engine Block
downloadBtn.addEventListener("click", async () => {
    try {
        updateStatus("Initializing local AI...");
        downloadBtn.disabled = true;
        updateProgressBar(0);

        // Initialize the Engine with the 16-bit model and memory safety
        const engine = await webllm.CreateMLCEngine(
            "SmolLM2-135M-Instruct-q4f16_1-MLC", 
            { 
                appConfig: MY_APP_CONFIG,
                low_resource_required: true,
                context_window_size: 1024, // Prevents VRAM overflow exit(1)
                initProgressCallback: (report) => {
                    updateStatus(report.text);
                    updateProgressBar(report.progress * 100); 
                }
            }
        );

        // Store globally for the Chat handler
        window.aiEngine = engine;
        updateStatus("Model logic and weights ready.");
        sendBtn.disabled = false;

    } catch (err) {
        // If this still says 'q0f32', the PWA Service Worker is still ghosting old code
        updateStatus("Critical Load Failure: " + err);
        console.error("Initialization Error:", err);
        downloadBtn.disabled = false;
    }
});

// 5. Chat Handler Block
sendBtn.addEventListener("click", async () => {
    const prompt = userInput.value.trim();
    if (!prompt || !window.aiEngine) return;

    appendMessage("user", prompt);
    userInput.value = "";
    sendBtn.disabled = true;

    try {
        let aiResponse = "";
        const msgDiv = document.createElement("div");
        msgDiv.className = "message ai-message";
        chatHistory.appendChild(msgDiv);

        // Stream the response to the UI
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

// 6. Clear Cache Utility
document.getElementById("clear-cache-btn")?.addEventListener("click", async () => {
    if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (let name of cacheNames) {
            await caches.delete(name);
        }
        alert("Cache cleared. Please refresh the page.");
        location.reload();
    }
});