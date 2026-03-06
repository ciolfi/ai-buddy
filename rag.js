/**
 * rag.js — Client-side RAG engine
 * Implements: document ingestion → chunking → TF-IDF embedding → cosine similarity search
 * Pure JavaScript — no WASM dependency.
 */

class RAGEngine {
  constructor() {
    this.chunks = [];    // { id, text, filename, vector: Float32Array }
    this.vocab  = new Map();  // term → index
    this.idf    = [];         // idf weight per term
    console.log('[RAG] engine ready (JS cosine-sim)');
  }

  // ── Cosine similarity (pure JS, Float32Array) ──────────────────────────
  _cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na  += a[i] * a[i];
      nb  += b[i] * b[i];
    }
    return dot / (Math.sqrt(na * nb) + 1e-9);
  }

  // ── Text processing ────────────────────────────────────────────────────
  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));
  }

  _chunkText(text, chunkSize = 400, overlap = 60) {
    const words  = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ').trim();
      if (chunk.length > 30) chunks.push(chunk);
      if (i + chunkSize >= words.length) break;
    }
    return chunks;
  }

  // ── TF-IDF ─────────────────────────────────────────────────────────────
  _buildTFIDF(documents) {
    this.vocab.clear();
    let idx = 0;
    for (const doc of documents) {
      for (const term of this._tokenize(doc)) {
        if (!this.vocab.has(term)) this.vocab.set(term, idx++);
      }
    }

    const N  = documents.length;
    const df = new Float32Array(this.vocab.size);
    for (const doc of documents) {
      const seen = new Set(this._tokenize(doc));
      for (const t of seen) {
        if (this.vocab.has(t)) df[this.vocab.get(t)]++;
      }
    }

    this.idf = new Float32Array(this.vocab.size);
    for (let i = 0; i < this.idf.length; i++) {
      this.idf[i] = Math.log((N + 1) / (df[i] + 1)) + 1;
    }
  }

  _vectorize(text) {
    if (this.vocab.size === 0) return new Float32Array(0);

    const vec    = new Float32Array(this.vocab.size);
    const tokens = this._tokenize(text);
    if (tokens.length === 0) return vec;

    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    for (const [t, count] of tf) {
      if (this.vocab.has(t)) {
        const i = this.vocab.get(t);
        vec[i]  = (count / tokens.length) * this.idf[i];
      }
    }

    // L2-normalise
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) + 1e-9;
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;

    return vec;
  }

  // ── File extraction ─────────────────────────────────────────────────────
  async _extractPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
      return `[PDF: ${file.name} — PDF.js not available]`;
    }
    const buf  = await file.arrayBuffer();
    const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
    let text   = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    return text;
  }

  async _extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return this._extractPDF(file);
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsText(file);
    });
  }

  // ── Rebuild all vectors after vocab changes ────────────────────────────
  _rebuildVectors() {
    this._buildTFIDF(this.chunks.map(c => c.text));
    for (const chunk of this.chunks) {
      chunk.vector = this._vectorize(chunk.text);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────
  async addDocument(file) {
    const text      = await this._extractText(file);
    const rawChunks = this._chunkText(text);

    const newChunks = rawChunks.map((c, i) => ({
      id:       `${file.name}::${i}`,
      text:     c,
      filename: file.name,
      vector:   null,
    }));

    this.chunks.push(...newChunks);
    this._rebuildVectors();
    return newChunks.length;
  }

  removeDocument(filename) {
    this.chunks = this.chunks.filter(c => c.filename !== filename);
    if (this.chunks.length > 0) {
      this._rebuildVectors();
    } else {
      this.vocab.clear();
      this.idf = [];
    }
  }

  query(queryText, topK = 3) {
    if (this.chunks.length === 0 || this.vocab.size === 0) return [];
    const qvec   = this._vectorize(queryText);
    const scored = this.chunks.map(c => ({ ...c, score: this._cosineSim(qvec, c.vector) }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(c => c.score > 0.05);
  }

  buildContext(results) {
    if (results.length === 0) return null;
    return results
      .map((r, i) => `[Document: ${r.filename}, chunk ${i + 1}]\n${r.text}`)
      .join('\n\n---\n\n');
  }

  get chunkCount()    { return this.chunks.length; }
  get documentNames() { return [...new Set(this.chunks.map(c => c.filename))]; }
  hasDocuments()      { return this.chunks.length > 0; }
}

// ── English stopwords ───────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','is','in','it','of','to','and','or','for','with','on','at',
  'by','from','this','that','was','are','be','as','but','not','have','had',
  'his','her','they','we','you','he','she','its','our','their','what','which',
  'who','will','can','do','did','has','more','also','were','been','than','any',
  'all','one','two','there','when','about','up','out','if','so','no','my','your',
]);

window.ragEngine = new RAGEngine();
