import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pdfParse from 'pdf-parse';

// Naive fixed-size chunker: slides a window over the text, nudging the
// boundary back to nearby whitespace so it doesn't cut a word in half.
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize ?? 900;
  const overlap = options.overlap ?? 150;

  const clean = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  if (chunkSize <= 0) {
    throw new Error('chunkSize must be a positive number');
  }
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error('overlap must be >= 0 and smaller than chunkSize');
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);

    if (end < clean.length) {
      const lookbackLimit = Math.max(start, end - 40);
      const spaceIdx = clean.lastIndexOf(' ', end);
      if (spaceIdx > lookbackLimit) {
        end = spaceIdx;
      }
    }

    const piece = clean.slice(start, end).trim();
    if (piece) {
      chunks.push({ id: randomUUID(), text: piece, index });
      index += 1;
    }

    if (end >= clean.length) break;

    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

export async function loadCorpus(corpusDir) {
  let entries;
  try {
    entries = await readdir(corpusDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = entries.filter(
    (entry) => entry.isFile() && /\.(txt|pdf)$/i.test(entry.name) && !entry.name.startsWith('.'),
  );

  const documents = [];
  for (const file of files) {
    const filePath = path.join(corpusDir, file.name);
    let text;
    if (/\.pdf$/i.test(file.name)) {
      const buffer = await readFile(filePath);
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      text = await readFile(filePath, 'utf-8');
    }
    documents.push({ source: file.name, text: text.trim() });
  }

  return documents;
}
