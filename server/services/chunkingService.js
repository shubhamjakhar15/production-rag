/**
 * Splits text into discrete sentences based on punctuation and capitalization.
 * Protects abbreviations (e.g., e.g., i.e., Dr., vs., Sec., No., ₹).
 */
function splitIntoSentences(text) {
  if (!text) return [];

  const protectedText = text
    .replace(/(e\.g|i\.e|etc|no|sec|vol|dept|mr|mrs|ms|dr|rs|inr)\./gi, "$1__DOT__")
    .replace(/(\d+)\.(\d+)/g, "$1__DECIMAL__$2");

  const rawSentences = protectedText
    .split(/(?<=[.?!])\s+/)
    .map((s) =>
      s
        .replace(/__DOT__/g, ".")
        .replace(/__DECIMAL__/g, ".")
        .trim()
    )
    .filter((s) => s.length > 0);

  return rawSentences;
}

/**
 * Consolidates fragmented short lines on a page into coherent paragraphs.
 * Prevents over-splitting of bullet points, sub-items, and headings.
 */
function consolidateParagraphs(paragraphs) {
  const consolidated = [];
  let current = null;

  for (const para of paragraphs) {
    const text = (para.text || "").trim();
    if (!text) continue;

    if (!current) {
      current = { ...para, text };
      continue;
    }

    // Merge if current block is short (< 180 chars) and within the same section
    if (current.text.length < 180 && current.section === para.section) {
      current.text += " " + text;
    } else {
      consolidated.push(current);
      current = { ...para, text };
    }
  }

  if (current) {
    consolidated.push(current);
  }

  // Re-index consolidated paragraphs
  return consolidated.map((p, idx) => ({
    ...p,
    paragraphIndex: idx + 1,
  }));
}

/**
 * Creates structure-aware, zero-meaning-loss chunks based on paragraphs.
 *
 * Rules:
 * 1. Short adjacent lines are consolidated so bullet points and headers don't detach.
 * 2. Standard coherent paragraphs (≤ 1200 characters) are kept whole as single semantic units.
 * 3. Exceptionally long paragraphs (> 1200 characters) are chunked using sentence windows
 *    with a 1-sentence overlap.
 * 4. Every chunk preserves page, section, paragraph index, and version metadata.
 *
 * @param {Array<{ pageNumber: number, paragraphs: Array<{ text: string, section: string, paragraphIndex: number }> }>} pages
 * @param {Object} docMeta - { documentId, versionId, versionNumber, documentTitle, category, status }
 * @returns {Array<Object>} Array of chunks ready for embedding and indexing
 */
function createParagraphChunks(pages, docMeta) {
  const {
    documentId = "doc_unknown",
    versionId = "v1",
    versionNumber = 1,
    documentTitle = "Municipal Policy",
    fileName = "document.pdf",
    category = "General",
    status = "active",
  } = docMeta || {};

  const chunks = [];
  const MAX_PARAGRAPH_CHARS = 1200; // ~200-250 words
  const MIN_CHUNK_CHARS = 40;

  for (const page of pages) {
    const { pageNumber, paragraphs } = page;
    const consolidated = consolidateParagraphs(paragraphs);

    for (let i = 0; i < consolidated.length; i++) {
      const currentPara = consolidated[i];
      const text = currentPara.text.trim();

      if (text.length < MIN_CHUNK_CHARS) {
        continue;
      }

      const baseChunkId = `${documentId}_v${versionNumber}_p${pageNumber}_para${currentPara.paragraphIndex}`;

      // Case 1: Standard coherent paragraph (Zero meaning loss - preserved whole)
      if (text.length <= MAX_PARAGRAPH_CHARS) {
        chunks.push({
          chunkId: baseChunkId,
          documentId: String(documentId),
          versionId: String(versionId),
          versionNumber: Number(versionNumber),
          documentTitle,
          fileName,
          category,
          status,
          pageNumber,
          paragraphNumber: currentPara.paragraphIndex,
          section: currentPara.section || "General",
          text: text,
        });
      } else {
        // Case 2: Unusually long paragraph — split by sentence windows with overlap
        const sentences = splitIntoSentences(text);

        if (sentences.length <= 2) {
          chunks.push({
            chunkId: baseChunkId,
            documentId: String(documentId),
            versionId: String(versionId),
            versionNumber: Number(versionNumber),
            documentTitle,
            fileName,
            category,
            status,
            pageNumber,
            paragraphNumber: currentPara.paragraphIndex,
            section: currentPara.section || "General",
            text: text,
          });
        } else {
          const WINDOW_SIZE = 3;
          const OVERLAP = 1;
          let subIndex = 1;

          for (let sIdx = 0; sIdx < sentences.length; sIdx += WINDOW_SIZE - OVERLAP) {
            const windowSentences = sentences.slice(sIdx, sIdx + WINDOW_SIZE);
            if (windowSentences.length === 0) break;

            const windowText = windowSentences.join(" ");

            chunks.push({
              chunkId: `${baseChunkId}_s${subIndex++}`,
              documentId: String(documentId),
              versionId: String(versionId),
              versionNumber: Number(versionNumber),
              documentTitle,
              fileName,
              category,
              status,
              pageNumber,
              paragraphNumber: currentPara.paragraphIndex,
              section: currentPara.section || "General",
              text: windowText,
            });

            if (sIdx + WINDOW_SIZE >= sentences.length) {
              break;
            }
          }
        }
      }
    }
  }

  return chunks;
}

module.exports = {
  splitIntoSentences,
  consolidateParagraphs,
  createParagraphChunks,
};
