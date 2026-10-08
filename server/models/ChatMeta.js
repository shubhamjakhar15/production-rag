const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  id: { type: String },
  question: { type: String, required: true },
  answer: { type: String },
  grounded: { type: Boolean, default: false },
  confidence: { type: Number, default: 0 },
  sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
  department: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const chatMetaSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    isSummarized: {
      type: Boolean,
      default: false,
    },
    latestCitation: {
      document: { type: String, default: "" },
      page: { type: Number, default: 1 },
      paragraph: { type: String, default: "" },
      proofText: { type: String, default: "" },
    },
    messages: [chatMessageSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMeta", chatMetaSchema);
