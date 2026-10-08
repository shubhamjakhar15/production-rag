const { Pinecone } = require("@pinecone-database/pinecone");
const { generateEmbedding, generateEmbeddingsBatch } = require("./embeddingService");

let pineconeClient = null;

function getPineconeClient() {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY is missing from environment variables.");
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || "voice-chatbot";
const INDEX_HOST = process.env.PINECONE_HOST;
const NAMESPACE = process.env.PINECONE_NAMESPACE || "municipal_policies";

/**
 * Returns the configured Pinecone index namespace.
 */
function getIndex() {
  const pc = getPineconeClient();
  const index = INDEX_HOST ? pc.index(INDEX_NAME, INDEX_HOST) : pc.index(INDEX_NAME);
  return index.namespace(NAMESPACE);
}

/**
 * Batch-upserts policy chunks into Pinecone.
 *
 * @param {Array<Object>} chunks - Structure-aware chunks from chunkingService
 * @param {Function} onProgress - Optional progress callback (pct: number)
 * @returns {Promise<number>} Count of upserted vectors
 */
async function upsertPolicyChunks(chunks, onProgress) {
  if (!chunks || chunks.length === 0) return 0;

  const index = getIndex();
  const texts = chunks.map((c) => c.text);

  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  const embeddings = await generateEmbeddingsBatch(texts, 5);

  const records = chunks.map((chunk, idx) => ({
    id: chunk.chunkId,
    values: embeddings[idx],
    metadata: {
      chunkId: chunk.chunkId,
      documentId: String(chunk.documentId),
      versionId: String(chunk.versionId),
      versionNumber: Number(chunk.versionNumber || 1),
      documentTitle: chunk.documentTitle || "Municipal Policy",
      category: chunk.category || "General",
      status: chunk.status || "active",
      pageNumber: Number(chunk.pageNumber || 1),
      paragraphNumber: Number(chunk.paragraphNumber || 1),
      section: chunk.section || "General",
      text: chunk.text,
    },
  }));

  // Upsert in batches of 25 to ensure reliable network transfer
  const BATCH_SIZE = 25;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await index.upsert({ records: batch });

    if (onProgress) {
      const progress = Math.min(100, Math.round(((i + batch.length) / records.length) * 100));
      onProgress(progress);
    }
  }

  console.log(`Successfully upserted ${records.length} chunks to Pinecone namespace [${NAMESPACE}].`);
  return records.length;
}

/**
 * Searches Pinecone for semantic matches with metadata filtering.
 *
 * @param {string} query - Employee natural language question
 * @param {Object} options - { topK: 10, filter: { status: { $eq: "active" } } }
 * @returns {Promise<Array<Object>>} Ranked matches with scores and metadata
 */
async function searchPolicyVectors(query, options = {}) {
  const { topK = 10, filter = { status: { $eq: "active" } } } = options;

  try {
    const index = getIndex();
    const queryEmbedding = await generateEmbedding(query);

    const queryParams = {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    };

    if (filter && Object.keys(filter).length > 0) {
      queryParams.filter = filter;
    }

    const response = await index.query(queryParams);

    return (response.matches || []).map((match) => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text || "",
      documentId: match.metadata?.documentId,
      versionId: match.metadata?.versionId,
      versionNumber: match.metadata?.versionNumber,
      documentTitle: match.metadata?.documentTitle,
      category: match.metadata?.category,
      pageNumber: match.metadata?.pageNumber,
      paragraphNumber: match.metadata?.paragraphNumber,
      section: match.metadata?.section,
      status: match.metadata?.status,
    }));
  } catch (error) {
    console.error("Pinecone vector search error:", error);
    throw error;
  }
}

/**
 * Updates status of vectors in Pinecone by chunk IDs.
 *
 * @param {Array<string>} chunkIds
 * @param {string} status - "active" | "inactive"
 */
async function updateChunksStatus(chunkIds, status) {
  const index = getIndex();
  for (const id of chunkIds) {
    try {
      await index.update({
        id,
        metadata: { status },
      });
    } catch (e) {
      console.warn(`Failed to update status for chunk ${id}:`, e.message);
    }
  }
}

/**
 * Deletes vectors belonging to a specific document.
 *
 * @param {string} documentId
 */
async function deleteChunksByDocument(documentId) {
  try {
    const index = getIndex();
    await index.deleteMany({
      filter: {
        documentId: { $eq: String(documentId) },
      },
    });
    console.log(`Deleted Pinecone vectors for documentId: ${documentId}`);
  } catch (error) {
    console.error(`Error deleting Pinecone vectors for document ${documentId}:`, error);
  }
}

/**
 * Deletes vectors belonging to a specific document version.
 *
 * @param {string} versionId
 */
async function deleteChunksByVersion(versionId) {
  try {
    const index = getIndex();
    await index.deleteMany({
      filter: {
        versionId: { $eq: String(versionId) },
      },
    });
    console.log(`Deleted Pinecone vectors for versionId: ${versionId}`);
  } catch (error) {
    console.error(`Error deleting Pinecone vectors for version ${versionId}:`, error);
  }
}

module.exports = {
  upsertPolicyChunks,
  searchPolicyVectors,
  updateChunksStatus,
  deleteChunksByDocument,
  deleteChunksByVersion,
  // Maintain backward-compatible aliases
  vectorSearch: searchPolicyVectors,
  addDocuments: upsertPolicyChunks,
};