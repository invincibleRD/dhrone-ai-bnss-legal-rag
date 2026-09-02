import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chunkText } from '../src/ingestion.js';
import {
  embed,
  cosineSimilarity,
  EMBEDDING_DIM,
  addChunks,
  search,
  clear,
  size,
  listSources,
} from '../src/retrieval.js';
import { generateAnswer } from '../src/llm.js';
import config from '../src/config.js';

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('produces no empty chunks', () => {
    const text = 'word '.repeat(1000);
    const chunks = chunkText(text, { chunkSize: 200, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('respects roughly the requested chunk size', () => {
    const text = 'a'.repeat(50) + ' word'.repeat(300);
    const chunkSize = 100;
    const chunks = chunkText(text, { chunkSize, overlap: 20 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(chunkSize + 5);
    }
  });

  it('assigns sequential indices', () => {
    const text = 'word '.repeat(500);
    const chunks = chunkText(text, { chunkSize: 150, overlap: 30 });
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });

  it('gives each chunk a unique id', () => {
    const text = 'word '.repeat(500);
    const chunks = chunkText(text, { chunkSize: 150, overlap: 30 });
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });

  it('does not catastrophically lose text', () => {
    const tokens = Array.from({ length: 200 }, (_, i) => `token${i}`);
    const text = tokens.join(' ');
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    const joined = chunks.map((c) => c.text).join(' ');
    for (const token of tokens) {
      expect(joined).toContain(token);
    }
  });

  it('throws on invalid overlap', () => {
    expect(() => chunkText('hello world', { chunkSize: 10, overlap: 10 })).toThrow();
    expect(() => chunkText('hello world', { chunkSize: 10, overlap: -1 })).toThrow();
  });
});

describe('embed', () => {
  it('produces the same vector for the same text', () => {
    const a = embed('The quick brown fox jumps over the lazy dog.');
    const b = embed('The quick brown fox jumps over the lazy dog.');
    expect(a).toEqual(b);
  });

  it('produces different vectors for different text', () => {
    const a = embed('Filing a complaint requires written notice.');
    const b = embed('Appeals must be lodged within sixty days.');
    expect(a).not.toEqual(b);
  });

  it('has the expected fixed dimension', () => {
    expect(embed('hello world').length).toBe(EMBEDDING_DIM);
  });

  it('is unit-length for non-empty text', () => {
    const v = embed('some reasonably long piece of text to embed');
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('returns a zero vector for empty text', () => {
    expect(embed('').every((x) => x === 0)).toBe(true);
  });
});

describe('cosineSimilarity', () => {
  it('is ~1 for a vector compared with itself', () => {
    const v = embed('appeal to the appellate authority within sixty days');
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('is lower for unrelated texts than for near-duplicate texts', () => {
    const a = embed('The complainant must file within thirty days.');
    const aSimilar = embed('The complainant must file within thirty days of the event.');
    const bUnrelated = embed('Bananas are a good source of potassium.');
    expect(cosineSimilarity(a, aSimilar)).toBeGreaterThan(cosineSimilarity(a, bUnrelated));
  });

  it('returns 0 for mismatched-length vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe('store', () => {
  beforeEach(() => {
    clear();
  });

  it('starts empty', () => {
    expect(size()).toBe(0);
    expect(search(embed('anything'), 5)).toEqual([]);
  });

  it('adds chunks and reports size', () => {
    addChunks([
      { id: '1', source: 'a.txt', text: 'hello world', vector: embed('hello world') },
      { id: '2', source: 'a.txt', text: 'goodbye world', vector: embed('goodbye world') },
    ]);
    expect(size()).toBe(2);
  });

  it('search returns top-K results ordered by score descending', () => {
    addChunks([
      {
        id: '1',
        source: 'a.txt',
        text: 'appeal within sixty days of the order',
        vector: embed('appeal within sixty days of the order'),
      },
      {
        id: '2',
        source: 'a.txt',
        text: 'bananas are yellow fruit',
        vector: embed('bananas are yellow fruit'),
      },
      {
        id: '3',
        source: 'a.txt',
        text: 'file an appeal within sixty days please',
        vector: embed('file an appeal within sixty days please'),
      },
    ]);

    const results = search(embed('how many days to appeal an order'), 2);

    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
  });

  it('listSources reports distinct sources with chunk counts', () => {
    addChunks([
      { id: '1', source: 'a.txt', text: 'x', vector: embed('x') },
      { id: '2', source: 'a.txt', text: 'y', vector: embed('y') },
      { id: '3', source: 'b.txt', text: 'z', vector: embed('z') },
    ]);
    const sources = listSources().sort((a, b) => a.source.localeCompare(b.source));
    expect(sources).toEqual([
      { source: 'a.txt', chunks: 2 },
      { source: 'b.txt', chunks: 1 },
    ]);
  });

  it('clear empties the store', () => {
    addChunks([{ id: '1', source: 'a.txt', text: 'x', vector: embed('x') }]);
    clear();
    expect(size()).toBe(0);
  });
});

describe('generateAnswer', () => {
  const originalProvider = config.llmProvider;
  const originalKey = config.geminiApiKey;

  afterEach(() => {
    config.llmProvider = originalProvider;
    config.geminiApiKey = originalKey;
    vi.unstubAllGlobals();
  });

  it('falls back to the template when no provider is configured', async () => {
    const answer = await generateAnswer('how many days?', [{ text: 'thirty days', score: 0.9 }]);
    expect(answer).toContain('thirty days');
  });

  it('returns the no-info message when nothing was retrieved', async () => {
    const answer = await generateAnswer('anything', []);
    expect(answer).toMatch(/don't have enough information/);
  });

  it('calls Gemini when configured and returns its text', async () => {
    config.llmProvider = 'gemini';
    config.geminiApiKey = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'a gemini answer' }] } }] }),
      }),
    );

    const answer = await generateAnswer('a question', [{ text: 'context', score: 0.5 }]);
    expect(answer).toBe('a gemini answer');
  });

  it('falls back to the template when the Gemini call fails', async () => {
    config.llmProvider = 'gemini';
    config.geminiApiKey = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }),
    );

    const answer = await generateAnswer('a question', [{ text: 'fallback text', score: 0.5 }]);
    expect(answer).toContain('fallback text');
  });

  it('falls back to the template when Gemini returns no text', async () => {
    config.llmProvider = 'gemini';
    config.geminiApiKey = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }),
    );

    const answer = await generateAnswer('a question', [{ text: 'fallback text', score: 0.5 }]);
    expect(answer).toContain('fallback text');
  });
});
