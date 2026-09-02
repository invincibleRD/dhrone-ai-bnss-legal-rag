import express from 'express';
import cors from 'cors';
import config from './config.js';
import logger from './logger.js';
import apiRouter from './routes.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'rag-backend',
    description: 'A simple RAG chat API',
    endpoints: [
      'GET /api/health',
      'POST /api/documents/upload',
      'GET /api/documents',
      'POST /api/chat',
      'POST /api/search',
    ],
  });
});

app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

export default app;
