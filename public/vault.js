import {
  create,
  insert,
  search,
  save,
  load
} from "https://cdn.jsdelivr.net/npm/@orama/orama@2.0.21/+esm";

export class Vault {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.DB_KEY = "orama-vault-storage-v1";
  }

  async init() {
    if (this.isInitialized) return;

    const savedData = localStorage.getItem(this.DB_KEY);

    if (savedData) {
      try {
        console.log("Vault: Found saved data, restoring...");
        const data = JSON.parse(savedData);
        // Create an empty DB first
        this.db = await create({
          schema: { content: "string" },
        });
        // Use 'load' to populate it
        await load(this.db, data);
        this.isInitialized = true;
        console.log("Vault: Restored successfully.");
        return;
      } catch (e) {
        console.error("Vault: Restore failed, starting fresh.", e);
      }
    }

    this.db = await create({
      schema: { content: "string" },
    });
    this.isInitialized = true;
    console.log("Vault: Ready (New).");
  }

  async addText(text, onProgress) {
    if (!this.db) await this.init();
    
    const chunks = text.split(/\n+/).filter((t) => t.trim().length > 20);

    for (let i = 0; i < chunks.length; i++) {
      await insert(this.db, { content: chunks[i] });
      if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
    }

    await this.persist();
  }

  async persist() {
    const data = await save(this.db);
    localStorage.setItem(this.DB_KEY, JSON.stringify(data));
    console.log("Vault: Saved to Browser Storage.");
  }

  async query(text) {
    if (!this.db) return "";
    
    const results = await search(this.db, {
      term: text,
      properties: ["content"],
      limit: 3,
    });

    return results.hits.map((h) => h.document.content).join("\n---\n");
  }
}