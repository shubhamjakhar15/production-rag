const PolicyChunk = require("../models/PolicyChunk");
const { searchPolicyVectors } = require("./vectorService");
const { rerankCandidates } = require("./rerankerService");

/**
 * Tokenizes text into search terms suitable for municipal policy documents.
 * Preserves currency signs, section numbers, amounts, and dates.
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[₹$€]/g, " curr ")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((token) => token.length > 0);
}

/**
 * Computes BM25 Okapi score for a single document against query tokens.
 */
function computeBM25Score(queryTokens, docTokens, docLength, avgDocLength, totalDocs, docFrequencies) {
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;

  // Calculate term frequency in current document
  const termFreq = {};
  for (const token of docTokens) {
    termFreq[token] = (termFreq[token] || 0) + 1;
  }

  for (const term of queryTokens) {
    const tf = termFreq[term] || 0;
    if (tf === 0) continue;

    const df = docFrequencies[term] || 0;
    // Standard Robertson-Spärck Jones IDF
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));

    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / (avgDocLength || 1)));

    score += idf * (numerator / denominator);
  }

  return score;
}

/**
 * Executes BM25 keyword search over all currently ACTIVE policy chunks in MongoDB.
 *
 * @param {string} query
 * @param {number} topK - Number of keyword matches to return (default: 15)
 * @returns {Promise<Array<Object>>}
 */
async function searchBM25(query, topK = 15, options = {}) {
  const queryFilter = { status: "ACTIVE" };
  if (options.department && options.department !== "All") {
    queryFilter.category = new RegExp(`^${options.department}$`, "i");
  }

  const activeChunks = await PolicyChunk.find(queryFilter).lean();
  if (!activeChunks || activeChunks.length === 0) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Pre-tokenize active chunks
  const tokenizedCorpus = activeChunks.map((chunk) => tokenize(chunk.text));
  const totalDocs = activeChunks.length;
  const totalLength = tokenizedCorpus.reduce((sum, tokens) => sum + tokens.length, 0);
  const avgDocLength = totalLength / totalDocs;

  // Calculate document frequencies (DF) for query terms across corpus
  const docFrequencies = {};
  for (const term of queryTokens) {
    let count = 0;
    for (const docTokens of tokenizedCorpus) {
      if (docTokens.includes(term)) count++;
    }
    docFrequencies[term] = count;
  }

  // Score all chunks
  const scored = [];
  for (let i = 0; i < activeChunks.length; i++) {
    const chunk = activeChunks[i];
    const docTokens = tokenizedCorpus[i];
    const score = computeBM25Score(
      queryTokens,
      docTokens,
      docTokens.length,
      avgDocLength,
      totalDocs,
      docFrequencies
    );

    if (score > 0) {
      scored.push({
        id: chunk.chunkId,
        score,
        chunkId: chunk.chunkId,
        documentId: String(chunk.documentId),
        versionId: String(chunk.versionId),
        versionNumber: chunk.versionNumber,
        documentTitle: chunk.documentTitle,
        category: chunk.category,
        pageNumber: chunk.pageNumber,
        paragraphNumber: chunk.paragraphNumber,
        section: chunk.section,
        text: chunk.text,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Combines semantic (Pinecone) and keyword (BM25) search using Reciprocal Rank Fusion (RRF).
 * Deduplicates results and returns top merged candidates.
 *
 * Formula: RRF_score(d) = (w_semantic / (k + rank_semantic)) + (w_bm25 / (k + rank_bm25))
 *
 * @param {Array<Object>} semanticResults - Results from Pinecone
 * @param {Array<Object>} keywordResults - Results from BM25
 * @param {Object} options - { k: 60, topK: 20, wSemantic: 1.0, wBM25: 0.8 }
 * @returns {Array<Object>}
 */
function reciprocalRankFusion(semanticResults, keywordResults, options = {}) {
  const { k = 60, topK = 20, wSemantic = 1.0, wBM25 = 0.8 } = options;

  const candidateMap = new Map();

  // 1. Process Semantic Results
  semanticResults.forEach((item, index) => {
    const id = item.id || item.chunkId;
    const rrfScore = wSemantic / (k + index + 1);

    candidateMap.set(id, {
      ...item,
      chunkId: item.chunkId || id,
      rrfScore,
      semanticRank: index + 1,
      semanticScore: item.score || 0,
      bm25Rank: null,
      bm25Score: 0,
    });
  });

  // 2. Process Keyword Results
  keywordResults.forEach((item, index) => {
    const id = item.id || item.chunkId;
    const rrfContribution = wBM25 / (k + index + 1);

    if (candidateMap.has(id)) {
      const existing = candidateMap.get(id);
      existing.rrfScore += rrfContribution;
      existing.bm25Rank = index + 1;
      existing.bm25Score = item.score;
    } else {
      candidateMap.set(id, {
        ...item,
        chunkId: item.chunkId || id,
        rrfScore: rrfContribution,
        semanticRank: null,
        semanticScore: 0,
        bm25Rank: index + 1,
        bm25Score: item.score,
      });
    }
  });

  // 3. Sort by combined RRF score descending
  const merged = Array.from(candidateMap.values());
  merged.sort((a, b) => b.rrfScore - a.rrfScore);

  return merged.slice(0, topK);
}

/**
 * Executes full Hybrid Search: Pinecone Vector Search + BM25 Keyword Search + RRF Fusion.
 *
 * @param {string} query - Employee natural language question
 * @param {Object} options - { topK: 15, filter: { status: { $eq: "active" } } }
 * @returns {Promise<Array<Object>>} Top deduplicated, ranked candidates with scores and citations
 */
async function executeHybridSearch(query, options = {}) {
  const { topK = 15, filter = { status: { $eq: "active" } }, department = null } = options;

  let vectorFilter = filter;
  if (department && department !== "All") {
    vectorFilter = {
      status: { $eq: "active" },
      category: { $eq: department },
    };
  }

  const [semanticResults, keywordResults] = await Promise.all([
    searchPolicyVectors(query, { topK, filter: vectorFilter }).catch((err) => {
      console.warn("Vector search failed, falling back to BM25:", err.message);
      return [];
    }),
    searchBM25(query, topK, { department }).catch((err) => {
      console.warn("BM25 search failed, falling back to Vector:", err.message);
      return [];
    }),
  ]);

  console.log(
    `Hybrid Search: Query="${query}" | Vector Matches=${semanticResults.length} | BM25 Matches=${keywordResults.length}`
  );

  // Stage 1 & 2: Reciprocal Rank Fusion (RRF) over dense + sparse pools
  const fusedCandidates = reciprocalRankFusion(semanticResults, keywordResults, {
    k: 60,
    topK: Math.max(topK * 2, 10),
  });

  // Stage 3: Cross-Encoder Neural Reranking over merged candidates
  const rerankedCandidates = await rerankCandidates(query, fusedCandidates, {
    topK,
    minRelevanceScore: options.minRelevanceScore || 0.25,
  });

  return rerankedCandidates;
}

module.exports = {
  tokenize,
  searchBM25,
  reciprocalRankFusion,
  executeHybridSearch,
  hybridSearch: executeHybridSearch,
};