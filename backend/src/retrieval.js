const VECTOR_DIM = 256;

// djb2 string hash.
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Deterministic hashing-trick bag-of-words embedding, L2-normalized.
export function embed(text) {
  const vector = new Array(VECTOR_DIM).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const bucket = hashString(token) % VECTOR_DIM;
    vector[bucket] += 1;
  }

  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0) return vector;

  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export const EMBEDDING_DIM = VECTOR_DIM;

let chunks = [];

export function addChunks(newChunks) {
  chunks.push(...newChunks);
}

// Brute-force cosine similarity over every stored chunk.
export function search(queryVector, topK = 4) {
  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryVector, chunk.vector),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

export function clear() {
  chunks = [];
}

export function size() {
  return chunks.length;
}

export function listSources() {
  const counts = new Map();
  for (const chunk of chunks) {
    counts.set(chunk.source, (counts.get(chunk.source) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([source, count]) => ({
    source,
    chunks: count,
  }));
}

export function retrieveContext(query, topK) {
  return search(embed(query), topK);
}
