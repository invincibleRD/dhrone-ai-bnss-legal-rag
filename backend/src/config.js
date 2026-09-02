import 'dotenv/config';

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: toInt(process.env.PORT, 8000),
  corpusDir: process.env.CORPUS_DIR || 'data/corpus',
  llmProvider: process.env.LLM_PROVIDER || 'template',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  topK: toInt(process.env.TOP_K, 4),
  chunkSize: toInt(process.env.CHUNK_SIZE, 900),
  chunkOverlap: toInt(process.env.CHUNK_OVERLAP, 150),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

export default config;
