const mongoose = require("mongoose");

const queryLogSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      default: 0,
    },
    grounded: {
      type: Boolean,
      default: false,
    },
    conflictDetected: {
      type: Boolean,
      default: false,
    },
    sourceIds: {
      type: [String],
      default: [],
    },
    sources: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("QueryLog", queryLogSchema);
