const pdf = require("pdf-parse");

/**
 * Checks if a string looks like a section or clause header in a policy document.
 */
function isHeader(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;

  // Numbered sections like: 1. Introduction, Section 2:, 3.1 Eligibility Criteria, Clause 4:
  const sectionRegex = /^(section|clause|chapter|rule|article|part|annexure|guideline|scheme)\s*[\d\.\w\-_:]+/i;
  const numberedHeaderRegex = /^\d+(\.\d+)*\s+[A-Z]/;
  const uppercaseHeaderRegex = /^[A-Z0-9\s\-_:,\.]{4,60}$/;

  return (
    sectionRegex.test(trimmed) ||
    numberedHeaderRegex.test(trimmed) ||
    (uppercaseHeaderRegex.test(trimmed) && !trimmed.includes("."))
  );
}

/**
 * Extracts page-by-page text and paragraph structures from a PDF buffer.
 * Preserves page numbering and vertical spacing between paragraphs.
 *
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<Array<{ pageNumber: number, paragraphs: Array<{ text: string, section: string, paragraphIndex: number }> }>>}
 */
async function extractPagesFromPdf(buffer) {
  const pages = [];

  const pagerender = (pageData) => {
    return pageData.getTextContent().then((textContent) => {
      let lastY = null;
      let pageText = "";

      for (const item of textContent.items) {
        if (!item.str) continue;
        const currentY = item.transform[5];

        if (lastY !== null && Math.abs(currentY - lastY) > 5) {
          // Large vertical gap indicates paragraph break
          if (Math.abs(currentY - lastY) > 13) {
            pageText += "\n\n" + item.str;
          } else {
            pageText += "\n" + item.str;
          }
        } else {
          pageText +=
            pageText.endsWith("\n") || pageText.endsWith(" ") || pageText === ""
              ? item.str
              : " " + item.str;
        }
        lastY = currentY;
      }

      pages.push({
        pageNumber: pageData.pageIndex + 1,
        rawText: pageText.trim(),
      });

      return pageText;
    });
  };

  // Handle sliced buffers (e.g. from multipart streams / multer)
  // PDF.js v1.10 requires a clean standalone Uint8Array with byteOffset === 0
  const standalone = new Uint8Array(buffer.length);
  standalone.set(buffer);

  await pdf(standalone, { pagerender });

  // Now process each page into structured paragraphs and detect section headers
  let currentSection = "General";

  const structuredPages = pages.map((page) => {
    const rawParagraphs = page.rawText
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/[ \t]+/g, " ").trim())
      .filter((p) => p.length > 0);

    const paragraphs = [];
    let pIndex = 1;

    for (const para of rawParagraphs) {
      // Check if this paragraph is or begins with a section heading
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && isHeader(lines[0])) {
        currentSection = lines[0];
      }

      paragraphs.push({
        text: para.replace(/\n+/g, " ").trim(),
        section: currentSection,
        paragraphIndex: pIndex++,
      });
    }

    return {
      pageNumber: page.pageNumber,
      paragraphs,
    };
  });

  return structuredPages;
}

module.exports = {
  extractPagesFromPdf,
  isHeader,
};
