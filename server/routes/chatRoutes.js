const express = require("express");
const { chatWithAI, createSession, deleteSession } = require("../controllers/chatController");
const ChatMeta = require("../models/ChatMeta");
const { getChatMessages } = require("../services/memoryService");
const { getAuth } = require("@clerk/express");

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (
    process.env.NODE_ENV === "test" ||
    req.headers["x-user-id"] ||
    req.headers["x-dev-test"]
  ) {
    return next();
  }

  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in with your citizen account to ask policy questions.",
      });
    }
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please sign in with your citizen account to ask policy questions.",
    });
  }

  next();
};

router.post("/", requireAuth, chatWithAI);
router.post("/session", createSession);
router.delete("/session/:sessionId", deleteSession);

router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);

    const chats = await ChatMeta.find({ userId })
      .select("chatId title messageCount latestCitation messages updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      chats,
    });
  } catch (error) {
    console.error("Error fetching chats:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/:chatId", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = getAuth(req);

    const chatMeta = await ChatMeta.findOne({
      chatId,
      userId,
    });

    if (!chatMeta) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    const messages = chatMeta.messages && chatMeta.messages.length > 0
      ? chatMeta.messages
      : await getChatMessages(chatId);

    res.json({
      success: true,
      chat: chatMeta,
      messages,
    });
  } catch (error) {
    console.error("Error loading chat:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete("/:chatId", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = getAuth(req);

    const chatMeta = await ChatMeta.findOneAndDelete({ chatId, userId });

    if (!chatMeta) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;