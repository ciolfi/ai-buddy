import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
import {
  create,
  insert,
  search,
} from "https://cdn.jsdelivr.net/npm/@orama/orama@2.0.21/+esm";

export class Vault {
  constructor() {
    this.db = null;
    this.embedder = null;
  }

  async init() {
    // 1. Create Orama Database
    this.db = await create({
      schema: { content: "string", embedding: "vector[384]" }, // 384 is size for all-MiniLM-L6-v2
    });

    // 2. Load Embedding Model (Small & Fast)
    this.embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
  }

  async addText(text, onProgress) {
    // Simple chunking: split by sentences or paragraphs
    const chunks = text.split(/\n+/).filter((t) => t.length > 20);

    for (let i = 0; i < chunks.length; i++) {
      const output = await this.embedder(chunks[i], {
        pooling: "mean",
        normalize: true,
      });
      const vector = Array.from(output.data);

      await insert(this.db, {
        content: chunks[i],
        embedding: vector,
      });
      if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
    }
  }

  async query(text) {
    const output = await this.embedder(text, {
      pooling: "mean",
      normalize: true,
    });
    const vector = Array.from(output.data);

    const results = await search(this.db, {
      mode: "vector",
      vector: vector,
      property: "embedding",
      similarity: 0.75, // Adjust sensitivity
      limit: 3,
    });

    return results.hits.map((h) => h.document.content).join("\n---\n");
  }
}
