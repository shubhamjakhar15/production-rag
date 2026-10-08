const mongoose = require("mongoose");

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "ARCHIVED", "PROCESSING", "FAILED"],
      default: "PROCESSING",
      index: true,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    processingJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProcessingJob",
      default: null,
    },
    uploadedBy: {
      type: String,
      required: true,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Composite index to ensure unique version numbers per document
documentVersionSchema.index({ documentId: 1, versionNumber: 1 }, { unique: true });

module.exports = mongoose.model("DocumentVersion", documentVersionSchema);
