import { describe, it, expect, beforeAll } from 'vitest';
import { loadCorpus, chunkText } from '../src/ingestion.js';
import { embed, addChunks, clear, retrieveContext } from '../src/retrieval.js';
import config from '../src/config.js';

// Golden set: a handful of questions against the bundled sample corpus, each
// with the clause number that must come back in the top-3 results. This is a
// small regression gate on the naive chunker + hashing embedding, not a
// claim about production-grade retrieval quality.
const GOLDEN_SET = [
  { query: 'How many days does a complainant have to file a complaint?', expectClause: 'Clause 1' },
  {
    query: 'How long does the authority have to acknowledge a complaint?',
    expectClause: 'Clause 2',
  },
  {
    query: 'How many days does the respondent get to respond to a notice?',
    expectClause: 'Clause 4',
  },
  { query: 'How many days to appeal a final order?', expectClause: 'Clause 8' },
  { query: 'What is the limitation period for starting a proceeding?', expectClause: 'Clause 9' },
];

beforeAll(async () => {
  clear();
  const documents = await loadCorpus(config.corpusDir);
  for (const doc of documents) {
    const chunks = chunkText(doc.text, {
      chunkSize: config.chunkSize,
      overlap: config.chunkOverlap,
    });
    addChunks(
      chunks.map((chunk) => ({
        id: chunk.id,
        source: doc.source,
        text: chunk.text,
        vector: embed(chunk.text),
      })),
    );
  }
});

describe('retrieval golden set (regression gate)', () => {
  for (const { query, expectClause } of GOLDEN_SET) {
    it(`retrieves "${expectClause}" in the top 3 for: ${query}`, () => {
      const results = retrieveContext(query, 3);
      const hit = results.some((r) => r.text.includes(expectClause));
      expect(hit).toBe(true);
    });
  }

  it('scores the top hit above zero for an in-corpus question', () => {
    const results = retrieveContext('How is confidentiality of the complainant handled?', 1);
    expect(results[0].score).toBeGreaterThan(0);
  });
});
