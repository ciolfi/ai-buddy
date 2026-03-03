/**
 * vault.js: A client-side "knowledge base" for RAG.
 * Stores text in IndexedDB and provides a basic search mechanism.
 */
export class Vault {
    constructor() {
        this.dbName = "VaultDB";
        this.storeName = "KnowledgeBase";
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { autoIncrement: true });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async addText(content, onProgress) {
        // Simple chunking logic to keep context relevant
        const chunks = content.split(/\n\n+/); 
        const transaction = this.db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);

        for (let i = 0; i < chunks.length; i++) {
            if (chunks[i].trim().length > 10) {
                store.add({ text: chunks[i], timestamp: Date.now() });
            }
            if (onProgress) onProgress(Math.floor(((i + 1) / chunks.length) * 100));
        }
        return new Promise((res) => transaction.oncomplete = () => res());
    }

    async query(userInput) {
        // Keywords-based retrieval for edge-case performance
        const keywords = userInput.toLowerCase().split(' ').filter(w => w.length > 3);
        const transaction = this.db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        return new Promise((resolve) => {
            request.onsuccess = () => {
                const results = request.result;
                // Basic scoring based on keyword frequency
                const scored = results.map(item => {
                    let score = 0;
                    keywords.forEach(word => {
                        if (item.text.toLowerCase().includes(word)) score++;
                    });
                    return { ...item, score };
                }).filter(item => item.score > 0)
                  .sort((a, b) => b.score - a.score);

                // Return top 3 chunks as context
                resolve(scored.slice(0, 3).map(s => s.text).join("\n\n"));
            };
        });
    }

    async clear() {
        const transaction = this.db.transaction(this.storeName, "readwrite");
        transaction.objectStore(this.storeName).clear();
        return new Promise((res) => transaction.oncomplete = () => res());
    }
}