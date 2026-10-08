const fs = require("fs");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const ProcessingJob = require("../models/ProcessingJob");
const { extractPagesFromPdf } = require("./pdfService");
const { createParagraphChunks } = require("./chunkingService");
const { upsertPolicyChunks } = require("./vectorService");

/**
 * Runs the full background ingestion pipeline for a policy document version:
 * VALIDATING -> EXTRACTING -> CHUNKING -> EMBEDDING -> INDEXED -> READY
 *
 * @param {string} jobId - MongoDB ID of the ProcessingJob
 * @param {string} versionId - MongoDB ID of the DocumentVersion
 * @param {Buffer} fileBuffer - The PDF file in memory
 */
async function processDocumentVersion(jobId, versionId, fileBuffer) {
  let job;
  let version;

  try {
    job = await ProcessingJob.findById(jobId);
    version = await DocumentVersion.findById(versionId).populate("documentId");

    if (!job || !version) {
      console.error(`Ingestion error: Job (${jobId}) or Version (${versionId}) not found.`);
      return;
    }

    const document = version.documentId;

    // Stage 1: VALIDATING
    job.status = "PROCESSING";
    job.stage = "VALIDATING";
    job.startedAt = new Date();
    job.progressPct = 10;
    await job.save();

    let activeBuffer = null;
    if (version.filePath && fs.existsSync(version.filePath)) {
      activeBuffer = fs.readFileSync(version.filePath);
    } else if (fileBuffer && fileBuffer.length > 0) {
      activeBuffer = fileBuffer;
    }

    if (!activeBuffer || activeBuffer.length === 0) {
      throw new Error("Uploaded file buffer is empty or corrupted.");
    }

    // Stage 2: EXTRACTING
    job.stage = "EXTRACTING";
    job.progressPct = 30;
    await job.save();

    console.log(`[Job ${jobId}] Extracting text from ${version.fileName}...`);
    const pages = await extractPagesFromPdf(activeBuffer);

    if (!pages || pages.length === 0) {
      throw new Error("No readable pages could be extracted from the PDF.");
    }

    // Stage 3: CHUNKING
    job.stage = "CHUNKING";
    job.progressPct = 50;
    await job.save();

    const docMeta = {
      documentId: String(document._id),
      versionId: String(version._id),
      versionNumber: version.versionNumber,
      documentTitle: document.title,
      fileName: version.fileName || `${document.title}.pdf`,
      category: document.category,
      // If version is ACTIVE, its chunks are searchable immediately
      status: version.status === "ACTIVE" ? "active" : "inactive",
    };

    console.log(`[Job ${jobId}] Creating structure-aware paragraph chunks...`);
    const chunks = createParagraphChunks(pages, docMeta);

    if (chunks.length === 0) {
      throw new Error("Could not extract any meaningful paragraph chunks from the document.");
    }

    // Save PolicyChunks to MongoDB
    const PolicyChunk = require("../models/PolicyChunk");
    const chunkDocs = chunks.map((c) => ({
      chunkId: c.chunkId,
      documentId: document._id,
      versionId: version._id,
      versionNumber: version.versionNumber,
      documentTitle: document.title,
      category: document.category,
      status: "ACTIVE",
      pageNumber: c.pageNumber,
      paragraphNumber: c.paragraphNumber,
      section: c.section,
      text: c.text,
    }));
    await PolicyChunk.deleteMany({ versionId: version._id });
    await PolicyChunk.insertMany(chunkDocs);

    // Stage 4: EMBEDDING & INDEXING TO PINECONE
    job.stage = "EMBEDDING";
    job.progressPct = 70;
    await job.save();

    await upsertPolicyChunks(chunks, async (progress) => {
      const currentPct = Math.min(95, 70 + Math.round(progress * 0.25));
      await ProcessingJob.findByIdAndUpdate(jobId, { progressPct: currentPct }).catch(() => {});
    });

    // Stage 5: FINALIZING & SAVING STATUS
    await ProcessingJob.findByIdAndUpdate(jobId, {
      stage: "INDEXED",
      progressPct: 100,
      status: "READY",
      completedAt: new Date(),
    });

    // Update Version metadata
    version.chunkCount = chunks.length;
    version.status = "ACTIVE"; // Mark active when ready
    version.activatedAt = new Date();
    await version.save();

    // Update parent Document
    document.currentVersionId = version._id;
    document.currentVersionNumber = version.versionNumber;
    document.status = "ACTIVE";
    await document.save();

    console.log(`[Job ${jobId}] Ingestion completed successfully! Document "${document.title}" is READY.`);
  } catch (error) {
    console.error(`[Job ${jobId}] Ingestion failed:`, error.message);

    if (job) {
      await ProcessingJob.findByIdAndUpdate(jobId, {
        status: "FAILED",
        stage: "FAILED",
        error: error.message,
        completedAt: new Date(),
      }).catch(console.error);
    }

    if (version) {
      await DocumentVersion.findByIdAndUpdate(versionId, {
        status: "FAILED",
      }).catch(console.error);
    }
  }
}

module.exports = {
  processDocumentVersion,
};
