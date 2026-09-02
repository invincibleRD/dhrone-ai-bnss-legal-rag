import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pdfParse from 'pdf-parse';
import { chunkText } from './ingestion.js';
import { embed, retrieveContext, addChunks, listSources, size } from './retrieval.js';
import { generateAnswer } from './llm.js';
import config from './config.js';

const router = Router();

function trimText(text, maxLen = 300) {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.txt' && ext !== '.pdf') {
      cb(new Error('Only .txt and .pdf files are supported'));
      return;
    }
    cb(null, true);
  },
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', chunks: size() });
});

router.post('/documents/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text;
    if (ext === '.pdf') {
      const parsed = await pdfParse(req.file.buffer);
      text = parsed.text;
    } else {
      text = req.file.buffer.toString('utf-8');
    }

    const source = req.file.originalname;
    const chunks = chunkText(text, {
      chunkSize: config.chunkSize,
      overlap: config.chunkOverlap,
    });

    const storedChunks = chunks.map((chunk) => ({
      id: randomUUID(),
      source,
      text: chunk.text,
      vector: embed(chunk.text),
    }));

    addChunks(storedChunks);

    res.json({ source, chunks: storedChunks.length });
  } catch (err) {
    next(err);
  }
});

router.get('/documents', (req, res) => {
  res.json({ documents: listSources() });
});

router.post('/chat', async (req, res, next) => {
  try {
    const message = req.body?.message;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res
        .status(400)
        .json({ error: '"message" is required and must be a non-empty string' });
    }

    const results = retrieveContext(message, config.topK);
    const answer = await generateAnswer(message, results);

    res.json({
      answer,
      sources: results.map((r) => ({
        source: r.source,
        text: trimText(r.text),
        score: r.score,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/search', (req, res, next) => {
  try {
    const query = req.body?.query;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: '"query" is required and must be a non-empty string' });
    }

    const topK = Number.isInteger(req.body?.top_k) ? req.body.top_k : config.topK;
    const results = retrieveContext(query, topK);

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
