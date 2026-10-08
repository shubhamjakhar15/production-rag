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

const RERANKER_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/**
 * Cross-Encoder / Neural Semantic Reranker.
 * Evaluates candidate passages against the query using cross-attention relevance scoring.
 * Re-orders the top candidates from RRF and filters out false positives.
 *
 * @param {string} query - The employee's search query
 * @param {Array<Object>} candidates - Candidates from Reciprocal Rank Fusion (RRF)
 * @param {Object} options - { topK: 5, minRelevanceScore: 0.3 }
 * @returns {Promise<Array<Object>>} Reranked and filtered candidates
 */
async function rerankCandidates(query, candidates, options = {}) {
  const { topK = 5, minRelevanceScore = 0.25 } = options;

  if (!candidates || candidates.length === 0) {
    return [];
  }

  // If only 1 candidate, no reranking needed
  if (candidates.length === 1) {
    return candidates;
  }

  // Take top-10 candidates from RRF for deep cross-encoder reranking
  const poolToRerank = candidates.slice(0, 10);

  try {
    const ai = getAiClient();

    // Prepare candidate passages for scoring
    const passagesText = poolToRerank
      .map((c, idx) => {
        const title = c.documentTitle || c.document_title || "Policy Document";
        const sec = c.section || "General";
        return `[Candidate ${idx + 1}] (Document: ${title}, Section: ${sec})\n${c.text || c.content || ""}`;
      })
      .join("\n\n");

    const prompt = `You are a high-precision Cross-Encoder Neural Reranker for municipal policy documents.
Evaluate how relevant each candidate passage is for answering the employee's query.

Query: "${query}"

Candidate Passages:
${passagesText}

Instructions:
1. For each Candidate (1 to ${poolToRerank.length}), assign a relevance score between 0.0 (completely irrelevant) and 1.0 (directly answers the query).
2. Consider exact policy numbers, conditions, eligibility criteria, and factual relevance.
3. Return ONLY a valid JSON array of objects with "index" (1-based integer) and "relevanceScore" (float 0.0 to 1.0).

Example output format:
[
  {"index": 1, "relevanceScore": 0.95},
  {"index": 2, "relevanceScore": 0.10}
]`;

    const response = await ai.models.generateContent({
      model: RERANKER_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.0,
      },
    });

    const parsedScores = JSON.parse(response.text.trim());

    if (Array.isArray(parsedScores)) {
      const scoreMap = new Map();
      parsedScores.forEach((item) => {
        if (typeof item.index === "number" && typeof item.relevanceScore === "number") {
          scoreMap.set(item.index, item.relevanceScore);
        }
      });

      // Combine RRF score with neural cross-encoder score
      const maxRrf = poolToRerank[0].rrfScore || 1.0;
      const reranked = poolToRerank.map((candidate, idx) => {
        const candidateIndex = idx + 1;
        const neuralScore = scoreMap.has(candidateIndex)
          ? scoreMap.get(candidateIndex)
          : 0.5;

        const normalizedRrf = (candidate.rrfScore || 0) / (maxRrf || 1);
        // Weighted blend: 60% neural cross-attention + 40% RRF retrieval rank
        const blendedScore = 0.6 * neuralScore + 0.4 * normalizedRrf;

        return {
          ...candidate,
          rerankScore: neuralScore,
          blendedScore,
        };
      });

      // Sort by blended score descending
      reranked.sort((a, b) => b.blendedScore - a.blendedScore);

      // Filter out low-relevance noise
      const filtered = reranked.filter((c) => c.rerankScore >= minRelevanceScore);

      // If filtering removed everything but original pool had high-RRF items, preserve top 1
      const finalResults = filtered.length > 0 ? filtered : [reranked[0]];

      console.log(
        `[Reranker] Evaluated ${poolToRerank.length} candidates -> Top candidate rerankScore: ${finalResults[0]?.rerankScore?.toFixed(2)}`
      );

      return finalResults.slice(0, topK);
    }
  } catch (error) {
    console.warn("[Reranker] Neural reranking fallback to RRF order:", error.message);
  }

  // Fallback: return candidates in original RRF order
  return poolToRerank.slice(0, topK);
}

module.exports = {
  rerankCandidates,
};
