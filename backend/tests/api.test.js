import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../src/app.js';
import config from '../src/config.js';
import { clear } from '../src/retrieval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleFile = path.join(__dirname, '..', 'data', 'corpus', 'sample-procedures.txt');

describe('config', () => {
  it('defaults LLM_PROVIDER to template when GEMINI_API_KEY is unset', () => {
    expect(config.llmProvider).toBe('template');
  });
});

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.chunks).toBe('number');
  });
});

describe('POST /api/chat', () => {
  it('returns 400 when message is missing', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when message is empty', async () => {
    const res = await request(app).post('/api/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('document upload + chat', () => {
  beforeEach(() => {
    clear();
  });

  it('uploads the sample corpus file and then answers a relevant question referencing it', async () => {
    const uploadRes = await request(app).post('/api/documents/upload').attach('file', sampleFile);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.source).toBe('sample-procedures.txt');
    expect(uploadRes.body.chunks).toBeGreaterThan(0);

    const docsRes = await request(app).get('/api/documents');
    expect(docsRes.status).toBe(200);
    expect(docsRes.body.documents).toEqual([
      { source: 'sample-procedures.txt', chunks: uploadRes.body.chunks },
    ]);

    const chatRes = await request(app)
      .post('/api/chat')
      .send({ message: 'How many days does a complainant have to file a complaint?' });

    expect(chatRes.status).toBe(200);
    expect(typeof chatRes.body.answer).toBe('string');
    expect(chatRes.body.answer.length).toBeGreaterThan(0);
    expect(chatRes.body.sources.length).toBeGreaterThan(0);
    expect(chatRes.body.sources[0].source).toBe('sample-procedures.txt');
  });
});

describe('POST /api/search', () => {
  beforeEach(() => {
    clear();
  });

  it('returns retrieval results without calling an LLM', async () => {
    await request(app).post('/api/documents/upload').attach('file', sampleFile);

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'appeal within sixty days', top_k: 2 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeLessThanOrEqual(2);
  });
});
