const express = require("express");
const fs = require("fs");
const path = require("path");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const PolicyChunk = require("../models/PolicyChunk");

const router = express.Router();

/**
 * Streams the authoritative PDF file for in-browser PDF viewer.
 * Supports HTTP Range requests and inline display so browsers jump directly to #page=N.
 */
router.get("/:documentId/file", async (req, res) => {
  try {
    const { documentId } = req.params;
    const { version } = req.query;

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    let targetVersion;
    if (version) {
      targetVersion = await DocumentVersion.findOne({
        documentId: document._id,
        versionNumber: parseInt(version),
      });
    } else if (document.currentVersionId) {
      targetVersion = await DocumentVersion.findById(document.currentVersionId);
    } else {
      targetVersion = await DocumentVersion.findOne({ documentId: document._id }).sort({
        versionNumber: -1,
      });
    }

    if (!targetVersion || !targetVersion.filePath) {
      return res.status(404).json({
        success: false,
        message: "No policy PDF file found for this document.",
      });
    }

    const filePath = path.resolve(targetVersion.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "The requested policy document file is missing from server storage.",
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Handle HTTP Range Requests for smooth PDF streaming
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${targetVersion.fileName}"`,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${targetVersion.fileName}"`,
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Stream PDF error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Returns structured paragraphs and metadata for an exact PDF page.
 * Highlights the cited paragraph when ?highlight=chunk_id is passed.
 */
router.get("/:documentId/page/:pageNumber", async (req, res) => {
  try {
    const { documentId, pageNumber } = req.params;
    const { highlight, version } = req.query;

    const pageNum = parseInt(pageNumber, 10);
    const filter = {
      documentId,
      pageNumber: pageNum,
    };

    if (version) {
      filter.versionNumber = parseInt(version, 10);
    } else {
      filter.status = "ACTIVE";
    }

    const chunks = await PolicyChunk.find(filter).sort({ paragraphNumber: 1 });

    if (!chunks || chunks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No content found for document ${documentId} on page ${pageNumber}.`,
      });
    }

    // Calculate actual total pages for this document/version
    const allDocChunks = await PolicyChunk.find({
      documentId,
      ...(version ? { versionNumber: parseInt(version, 10) } : { status: "ACTIVE" }),
    }).select("pageNumber").lean();

    const maxPage = allDocChunks.reduce((max, c) => Math.max(max, c.pageNumber || 1), 1);

    const paragraphs = chunks.map((c) => ({
      chunk_id: c.chunkId,
      paragraph_number: c.paragraphNumber,
      section: c.section,
      text: c.text,
      is_highlighted: highlight ? c.chunkId === highlight : false,
    }));

    res.json({
      success: true,
      data: {
        document_id: documentId,
        document_title: chunks[0].documentTitle,
        version: chunks[0].versionNumber,
        page_number: pageNum,
        total_pages: maxPage,
        section: chunks[0].section,
        paragraphs,
      },
    });
  } catch (error) {
    console.error("Get page content error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Returns evidence details for an exact cited chunk ID.
 */
router.get("/chunk/:chunkId", async (req, res) => {
  try {
    const chunk = await PolicyChunk.findOne({ chunkId: req.params.chunkId });
    if (!chunk) {
      return res.status(404).json({ success: false, message: "Evidence chunk not found." });
    }

    const docChunks = await PolicyChunk.find({ documentId: chunk.documentId, status: "ACTIVE" }).select("pageNumber").lean();
    const maxPage = docChunks.reduce((max, c) => Math.max(max, c.pageNumber || 1), 1);

    res.json({
      success: true,
      data: {
        chunk_id: chunk.chunkId,
        document_id: chunk.documentId,
        document_title: chunk.documentTitle,
        version: chunk.versionNumber,
        page: chunk.pageNumber,
        total_pages: maxPage,
        paragraph: chunk.paragraphNumber,
        section: chunk.section,
        text: chunk.text,
        file_url: `/api/sources/${chunk.documentId}/file#page=${chunk.pageNumber}`,
      },
    });
  } catch (error) {
    console.error("Get chunk error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
