const mongoose = require("mongoose");

const processingJobSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentVersion",
      default: null,
    },
    status: {
      type: String,
      enum: ["UPLOADED", "PROCESSING", "READY", "FAILED"],
      default: "UPLOADED",
      index: true,
    },
    stage: {
      type: String,
      enum: ["VALIDATING", "EXTRACTING", "CHUNKING", "EMBEDDING", "INDEXED", "FAILED"],
      default: "VALIDATING",
    },
    progressPct: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    error: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProcessingJob", processingJobSchema);
