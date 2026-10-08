const { GoogleGenAI } = require("@google/genai");

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2";

/**
 * Generates a 768-dimensional embedding for a single text string with quota retry handling.
 *
 * @param {string} text
 * @returns {Promise<Array<number>>} Vector embedding (768 numbers)
 */
const generateEmbedding = async (text) => {
  if (!text || !text.trim()) {
    throw new Error("Cannot generate embedding for empty text.");
  }

  const ai = getAiClient();
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: 768,
        },
      });

      return response.embeddings[0].values;
    } catch (error) {
      const errMsg = error.message || "";

      // Handle 429 Quota Exceeded with explicit backoff
      if (
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("quota")
      ) {
        const match = errMsg.match(/retry in ([\d\.]+)s/i);
        const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1500 : 14000;
        console.warn(`[EmbeddingService] Rate limit hit. Pausing for ${(waitMs / 1000).toFixed(1)}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue; // Retry without incrementing fatal attempt counter
      }

      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Gemini embedding failed after ${maxRetries} attempts:`, errMsg);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
};

/**
 * Generates embeddings for an array of texts with pacing to stay within free-tier quotas.
 *
 * @param {Array<string>} texts
 * @param {number} concurrency - Number of parallel calls (default: 3)
 * @returns {Promise<Array<Array<number>>>}
 */
const generateEmbeddingsBatch = async (texts, concurrency = 3) => {
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const batchPromises = batch.map((text, idx) =>
      generateEmbedding(text).then((vec) => {
        results[i + idx] = vec;
      })
    );
    await Promise.all(batchPromises);

    // Smooth pacing between batches (200ms) to respect rate limits
    if (i + concurrency < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
};

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
};