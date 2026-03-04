// app.js - v2.4 (HTML-Synced + SmolLM2 16-bit)
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm";

console.log("App.js has started loading...");

// 1. Configuration
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

// 2. UI Elements - Synced with your specific HTML IDs
const getEl = (id) => document.getElementById(id);

const downloadBtn = getEl("download-btn");
const sendBtn = getEl("send-btn");
const userInput = getEl("prompt");      // Matches your <textarea id="prompt">
const chatHistory = getEl("messages");  // Matches your <div id="messages">
const gpuStatus = getEl("gpu-status");  // Matches your <div id="gpu-status">
const progressBar = getEl("progress-bar"); // Matches your <div id="progress-bar">
const progressText = getEl("progress-text"); // Matches your <span id="progress-text">

// Immediate WebGPU Check
if (gpuStatus) {
    gpuStatus.innerText = navigator.gpu ? "WebGPU Status: Supported" : "WebGPU Status: Not Supported";
}

// 3. Helper Functions
function updateStatus(msg) {
    if (progressText) progressText.innerText = msg;
    console.log("Status:", msg);
}

function updateProgressBar(value) {
    if (progressBar) {
        progressBar.style.width = `${value}%`;
    }
}

function appendMessage(role, text) {
    if (!chatHistory) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}-msg`; // Matches your CSS .user-msg and .ai-msg
    msgDiv.innerText = text;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// 4. Load AI Engine Block
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
            updateStatus("Critical Load Failure: " + err);
            console.error("Initialization Error:", err);
            downloadBtn.disabled = false;
        }
    });
}

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