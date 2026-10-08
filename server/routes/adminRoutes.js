const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const ProcessingJob = require("../models/ProcessingJob");
const AuditLog = require("../models/AuditLog");

const { requireAdmin } = require("../middleware/adminAuth");
const { processDocumentVersion } = require("../services/ingestionService");
const { deleteChunksByDocument, deleteChunksByVersion } = require("../services/vectorService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Protect all admin routes
router.use(requireAdmin);

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, "../uploads/documents");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// =========================================================================
// 1. ADMIN DASHBOARD STATS
// =========================================================================
router.get("/dashboard", async (req, res) => {
  try {
    const [totalDocs, activeDocs, processingDocs, failedDocs, totalVersions, recentDocs] =
      await Promise.all([
        Document.countDocuments(),
        Document.countDocuments({ status: "ACTIVE" }),
        Document.countDocuments({ status: "PROCESSING" }),
        Document.countDocuments({ status: "FAILED" }),
        DocumentVersion.countDocuments(),
        Document.find()
          .sort({ updatedAt: -1 })
          .limit(5)
          .populate("currentVersionId"),
      ]);

    res.json({
      success: true,
      data: {
        totalDocuments: totalDocs,
        activeDocuments: activeDocs,
        processingDocuments: processingDocs,
        failedDocuments: failedDocs,
        archivedDocuments: totalDocs - (activeDocs + processingDocs + failedDocs),
        totalVersions,
        recentDocuments: recentDocs,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 2. LIST ALL DOCUMENTS (WITH ACTIVE VERSION AND STATUS)
// =========================================================================
router.get("/documents", async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("currentVersionId"),
      Document.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: documents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("List documents error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 3. GET SINGLE DOCUMENT WITH COMPLETE VERSION HISTORY
// =========================================================================
router.get("/documents/:id", async (req, res) => {
  try {
    const document = await Document.findById(req.params.id).populate("currentVersionId");
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    const versions = await DocumentVersion.find({ documentId: document._id })
      .sort({ versionNumber: -1 })
      .populate("processingJobId");

    res.json({
      success: true,
      data: {
        document,
        versions,
      },
    });
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 4. UPLOAD NEW POLICY DOCUMENT (INITIAL VERSION 1)
// =========================================================================
router.post("/documents", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "A PDF file is required." });
    }

    const isPdf =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return res.status(400).json({
        success: false,
        message: "Only official PDF documents are accepted.",
      });
    }

    const title = req.body.title ? req.body.title.trim() : req.file.originalname.replace(/\.[^/.]+$/, "");
    const description = req.body.description ? req.body.description.trim() : "";
    const category = req.body.category ? req.body.category.trim() : "General";
    const uploadedBy = req.adminUserId || "admin_user";

    // 1. Create Document
    const newDoc = new Document({
      title,
      description,
      category,
      status: "PROCESSING",
      currentVersionNumber: 1,
      uploadedBy,
    });
    await newDoc.save();

    // 2. Save physical PDF to disk
    const safeFileName = `${newDoc._id}_v1_${Date.now()}.pdf`;
    const savedFilePath = path.join(UPLOADS_DIR, safeFileName);
    fs.writeFileSync(savedFilePath, req.file.buffer);

    newDoc.fileUrl = `/api/sources/${newDoc._id}/file`;
    await newDoc.save();

    // 3. Create DocumentVersion v1
    const newVersion = new DocumentVersion({
      documentId: newDoc._id,
      versionNumber: 1,
      fileName: req.file.originalname,
      filePath: savedFilePath,
      fileSize: req.file.size,
      status: "PROCESSING",
      uploadedBy,
    });
    await newVersion.save();

    // 4. Create ProcessingJob
    const newJob = new ProcessingJob({
      documentId: newDoc._id,
      versionId: newVersion._id,
      status: "UPLOADED",
      stage: "VALIDATING",
      progressPct: 0,
    });
    await newJob.save();

    newVersion.processingJobId = newJob._id;
    await newVersion.save();

    newDoc.currentVersionId = newVersion._id;
    await newDoc.save();

    // 5. Trigger Background Ingestion (non-blocking)
    processDocumentVersion(newJob._id, newVersion._id, req.file.buffer).catch((err) => {
      console.error(`Background ingestion error for doc ${newDoc._id}:`, err);
    });

    // 6. Audit Log
    await AuditLog.create({
      userId: uploadedBy,
      action: "UPLOAD_DOCUMENT",
      resourceType: "DOCUMENT",
      resourceId: String(newDoc._id),
      metadata: { title, versionNumber: 1, fileName: req.file.originalname },
    });

    res.status(201).json({
      success: true,
      message: `Document "${title}" uploaded. Ingestion processing has started.`,
      data: {
        documentId: newDoc._id,
        versionId: newVersion._id,
        versionNumber: 1,
        jobId: newJob._id,
        status: "PROCESSING",
      },
    });
  } catch (error) {
    console.error("Upload document error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 5. UPLOAD NEW VERSION FOR AN EXISTING DOCUMENT (e.g., v2, v3)
// =========================================================================
router.post("/documents/:id/versions", upload.single("file"), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Target document not found." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "A PDF file is required." });
    }

    const isPdf =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return res.status(400).json({
        success: false,
        message: "Only official PDF documents are accepted.",
      });
    }

    // Determine next version number
    const highestVersion = await DocumentVersion.findOne({ documentId: document._id })
      .sort({ versionNumber: -1 });
    const nextVersionNumber = highestVersion ? highestVersion.versionNumber + 1 : 1;

    const uploadedBy = req.adminUserId || "admin_user";

    // Save physical file
    const safeFileName = `${document._id}_v${nextVersionNumber}_${Date.now()}.pdf`;
    const savedFilePath = path.join(UPLOADS_DIR, safeFileName);
    fs.writeFileSync(savedFilePath, req.file.buffer);

    // Create new Version record (status: PROCESSING, initially inactive until ready/activated)
    const newVersion = new DocumentVersion({
      documentId: document._id,
      versionNumber: nextVersionNumber,
      fileName: req.file.originalname,
      filePath: savedFilePath,
      fileSize: req.file.size,
      status: "PROCESSING",
      uploadedBy,
    });
    await newVersion.save();

    // Create ProcessingJob
    const newJob = new ProcessingJob({
      documentId: document._id,
      versionId: newVersion._id,
      status: "UPLOADED",
      stage: "VALIDATING",
      progressPct: 0,
    });
    await newJob.save();

    newVersion.processingJobId = newJob._id;
    await newVersion.save();

    // Trigger background ingestion
    processDocumentVersion(newJob._id, newVersion._id, req.file.buffer).catch((err) => {
      console.error(`Background ingestion error for doc ${document._id} v${nextVersionNumber}:`, err);
    });

    // Audit Log
    await AuditLog.create({
      userId: uploadedBy,
      action: "UPLOAD_VERSION",
      resourceType: "VERSION",
      resourceId: String(newVersion._id),
      metadata: {
        documentId: String(document._id),
        versionNumber: nextVersionNumber,
        fileName: req.file.originalname,
      },
    });

    res.status(201).json({
      success: true,
      message: `Version ${nextVersionNumber} for "${document.title}" uploaded. Ingestion processing has started.`,
      data: {
        documentId: document._id,
        versionId: newVersion._id,
        versionNumber: nextVersionNumber,
        jobId: newJob._id,
        status: "PROCESSING",
      },
    });
  } catch (error) {
    console.error("Upload version error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 6. ACTIVATE A SPECIFIC DOCUMENT VERSION (VERSION SWITCHING)
// =========================================================================
router.patch("/documents/:id/versions/:versionId/activate", async (req, res) => {
  try {
    const { id, versionId } = req.params;

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    const targetVersion = await DocumentVersion.findOne({
      _id: versionId,
      documentId: id,
    });

    if (!targetVersion) {
      return res.status(404).json({ success: false, message: "Target version not found." });
    }

    if (targetVersion.chunkCount === 0 || targetVersion.status === "FAILED") {
      return res.status(400).json({
        success: false,
        message: "Cannot activate a version that has failed or has not completed indexing.",
      });
    }

    // 1. Deactivate all existing versions of this document
    await DocumentVersion.updateMany(
      { documentId: id, _id: { $ne: targetVersion._id } },
      { status: "INACTIVE", deactivatedAt: new Date() }
    );

    const PolicyChunk = require("../models/PolicyChunk");
    await PolicyChunk.updateMany(
      { documentId: id, versionId: { $ne: targetVersion._id } },
      { status: "INACTIVE" }
    );

    // 2. Activate target version
    targetVersion.status = "ACTIVE";
    targetVersion.activatedAt = new Date();
    targetVersion.deactivatedAt = null;
    await targetVersion.save();

    await PolicyChunk.updateMany(
      { documentId: id, versionId: targetVersion._id },
      { status: "ACTIVE" }
    );

    // 3. Update parent Document active version pointer
    document.currentVersionId = targetVersion._id;
    document.currentVersionNumber = targetVersion.versionNumber;
    document.status = "ACTIVE";
    document.fileUrl = `/api/sources/${document._id}/file`;
    await document.save();

    // 4. Audit Log
    await AuditLog.create({
      userId: req.adminUserId || "admin_user",
      action: "ACTIVATE_VERSION",
      resourceType: "VERSION",
      resourceId: String(targetVersion._id),
      metadata: {
        documentId: String(document._id),
        activatedVersionNumber: targetVersion.versionNumber,
      },
    });

    res.json({
      success: true,
      message: `Version ${targetVersion.versionNumber} is now the ACTIVE authoritative policy.`,
      data: {
        documentId: document._id,
        activeVersionId: targetVersion._id,
        versionNumber: targetVersion.versionNumber,
        status: "ACTIVE",
      },
    });
  } catch (error) {
    console.error("Activate version error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 7. CHANGE DOCUMENT OVERALL STATUS (ACTIVE / INACTIVE / ARCHIVED)
// =========================================================================
router.patch("/documents/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be ACTIVE, INACTIVE, or ARCHIVED.",
      });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    document.status = status;
    await document.save();

    // If deactivated or archived, deactivate all its versions
    if (status !== "ACTIVE") {
      await DocumentVersion.updateMany(
        { documentId: document._id },
        { status: "INACTIVE", deactivatedAt: new Date() }
      );
    }

    await AuditLog.create({
      userId: req.adminUserId || "admin_user",
      action: "UPDATE_DOCUMENT_STATUS",
      resourceType: "DOCUMENT",
      resourceId: String(document._id),
      metadata: { newStatus: status },
    });

    res.json({
      success: true,
      message: `Document status changed to ${status}.`,
      data: document,
    });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 8. DELETE DOCUMENT (CASCADING PURGE: MONGO + PINECONE + FILES)
// =========================================================================
router.delete("/documents/:id", async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }

    const docId = String(document._id);

    // 1. Delete all Pinecone vectors for this document
    console.log(`Cascading purge: Deleting Pinecone vectors for doc ${docId}...`);
    await deleteChunksByDocument(docId);

    // 2. Delete all physical files for this document's versions
    const versions = await DocumentVersion.find({ documentId: docId });
    for (const ver of versions) {
      if (ver.filePath && fs.existsSync(ver.filePath)) {
        try {
          fs.unlinkSync(ver.filePath);
        } catch (e) {
          console.warn(`Could not delete file ${ver.filePath}:`, e.message);
        }
      }
    }

    // 3. Delete DocumentVersion, ProcessingJob, and PolicyChunk records
    await DocumentVersion.deleteMany({ documentId: docId });
    await ProcessingJob.deleteMany({ documentId: docId });
    const PolicyChunk = require("../models/PolicyChunk");
    await PolicyChunk.deleteMany({ documentId: docId });

    // 4. Delete the Document
    await Document.findByIdAndDelete(docId);

    // 5. Audit Log
    await AuditLog.create({
      userId: req.adminUserId || "admin_user",
      action: "DELETE_DOCUMENT",
      resourceType: "DOCUMENT",
      resourceId: docId,
      metadata: { title: document.title },
    });

    console.log(`Document ${docId} purged from MongoDB, Pinecone, and disk.`);
    res.json({
      success: true,
      message: `Document "${document.title}" and all versions successfully deleted across all databases and vector stores.`,
    });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 9. POLL PROCESSING JOB STATUS
// =========================================================================
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const job = await ProcessingJob.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Processing job not found." });
    }

    res.json({
      success: true,
      data: {
        jobId: job._id,
        documentId: job.documentId,
        versionId: job.versionId,
        status: job.status,
        stage: job.stage,
        progressPct: job.progressPct,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
