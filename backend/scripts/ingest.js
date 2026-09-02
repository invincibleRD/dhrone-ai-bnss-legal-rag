#!/usr/bin/env node
// Sanity-check script for a corpus directory.
//
// NOTE: This server keeps its vector store purely in memory (see
// src/retrieval/store.js), and this script runs as a separate, one-off
// process. Because of that, running this script does NOT populate the
// running server's store -- ingestion for the live server happens at
// runtime via POST /api/documents/upload.
//
// What this script IS useful for: loading every .txt/.pdf file in
// CORPUS_DIR, chunking them with the same settings the server would use,
// and printing stats -- so you can sanity-check a corpus (file counts,
// chunk counts, chunk size distribution, any files that failed to load)
// before you upload it.

import { loadCorpus, chunkText } from '../src/ingestion.js';
import config from '../src/config.js';
import logger from '../src/logger.js';

async function main() {
  logger.info(`Loading corpus from: ${config.corpusDir}`);

  const documents = await loadCorpus(config.corpusDir);

  if (documents.length === 0) {
    logger.warn('No .txt or .pdf files found in the corpus directory.');
    return;
  }

  let totalChunks = 0;
  let totalChars = 0;

  for (const doc of documents) {
    const chunks = chunkText(doc.text, {
      chunkSize: config.chunkSize,
      overlap: config.chunkOverlap,
    });

    totalChunks += chunks.length;
    totalChars += doc.text.length;

    const avgChunkLen = chunks.length
      ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)
      : 0;

    console.log(
      `- ${doc.source}: ${doc.text.length} chars -> ${chunks.length} chunks (avg ${avgChunkLen} chars/chunk)`,
    );

    if (chunks.some((c) => !c.text.trim())) {
      console.warn(`  warning: ${doc.source} produced at least one empty chunk`);
    }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Files found:    ${documents.length}`);
  console.log(`Total chars:    ${totalChars}`);
  console.log(`Total chunks:   ${totalChunks}`);
  console.log(`Chunk size:     ${config.chunkSize} (overlap ${config.chunkOverlap})`);
  console.log('');
  console.log(
    'This script only validates the corpus. To make these documents queryable, ' +
      'start the server and POST each file to /api/documents/upload.',
  );
}

main().catch((err) => {
  logger.error({ err }, 'Failed to ingest corpus');
  process.exitCode = 1;
});
