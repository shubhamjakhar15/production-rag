const mongoose = require("mongoose");

const policyChunkSchema = new mongoose.Schema(
  {
    chunkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentVersion",
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    documentTitle: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
    },
    category: {
      type: String,
      default: "General",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    pageNumber: {
      type: Number,
      required: true,
      index: true,
    },
    paragraphNumber: {
      type: Number,
      required: true,
    },
    section: {
      type: String,
      default: "General",
    },
    text: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PolicyChunk", policyChunkSchema);
