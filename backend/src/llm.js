import config from './config.js';
import logger from './logger.js';

const NO_INFO_MESSAGE = "I don't have enough information in the ingested documents to answer that.";

function templateAnswer(contextChunks) {
  if (!contextChunks || contextChunks.length === 0) {
    return NO_INFO_MESSAGE;
  }

  const top = contextChunks[0];
  if (!top.score || top.score <= 0) {
    return NO_INFO_MESSAGE;
  }

  return `Based on the retrieved passages:\n\n${top.text}`;
}

async function geminiAnswer(query, contextChunks) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const contextBlock = contextChunks.map((chunk, i) => `[${i + 1}] ${chunk.text}`).join('\n\n');

  const prompt = [
    'You are a helpful assistant that answers questions using ONLY the',
    'provided context passages. If the context does not contain the',
    'answer, say "I don\'t know based on the given documents".',
    '',
    'Context:',
    contextBlock,
    '',
    `Question: ${query}`,
  ].join('\n');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini API response did not contain any text');
  }

  return text.trim();
}

// Uses Gemini when configured, otherwise falls back to a template answer.
export async function generateAnswer(query, contextChunks) {
  if (config.llmProvider === 'gemini' && config.geminiApiKey) {
    try {
      return await geminiAnswer(query, contextChunks);
    } catch (err) {
      logger.warn({ err }, 'Gemini call failed, falling back to template answer');
      return templateAnswer(contextChunks);
    }
  }

  return templateAnswer(contextChunks);
}
