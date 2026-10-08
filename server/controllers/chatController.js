const { executeHybridSearch } = require("../services/hybridSearch");
const { generateGroundedAnswer } = require("../services/groundingService");
const {
  getSessionContext,
  enrichQueryWithContext,
  addSessionMessage,
  clearSession,
} = require("../services/sessionService");
const QueryLog = require("../models/QueryLog");
const ChatMeta = require("../models/ChatMeta");
const PolicyChunk = require("../models/PolicyChunk");
const { getAuth } = require("@clerk/express");

const chatWithAI = async (req, res) => {
  const startTime = Date.now();

  try {
    const auth = getAuth(req);
    let userId = auth?.userId;

    if (!userId && process.env.NODE_ENV === "test") {
      userId = req.headers["x-user-id"] || "dev_employee_user";
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in with your citizen account to ask policy questions.",
      });
    }

    const question = (req.body.question || req.body.message || req.body.prompt || "").trim();
    let chatId = req.body.session_id || req.body.chatId || req.body.sessionId;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "A question or message is required.",
      });
    }

    if (!chatId) {
      chatId = `session_${userId}_${Date.now()}`;
    }

    const department = (req.body.department || req.body.category || "").trim();

    // Step 1: Context enrichment for conversational follow-ups
    const effectiveQuery = enrichQueryWithContext(question, chatId);
    const recentContext = getSessionContext(chatId, 4);

    console.log(
      `Query: "${question}" -> Effective Retrieval Query: "${effectiveQuery}" ${
        department ? `[Department: ${department}]` : "[All Departments]"
      }`
    );

    // Step 2: Hybrid Search (Pinecone Vector + BM25 Keyword + RRF Fusion scoped by department)
    const candidates = await executeHybridSearch(effectiveQuery, {
      topK: 15,
      department: department && department !== "All" ? department : null,
      filter: { status: { $eq: "active" } },
    });

    // Step 3: Grounded LLM Generation with Anti-Hallucination & Citations
    const groundedResult = await generateGroundedAnswer(question, candidates, {
       recentContext,
     });

    // Enrich sources with actual document total page count
    if (groundedResult.sources && groundedResult.sources.length > 0) {
      for (const src of groundedResult.sources) {
        if (src.document_id) {
          try {
            const docPages = await PolicyChunk.find({ documentId: src.document_id, status: "ACTIVE" })
              .select("pageNumber")
              .lean();
            src.total_pages = docPages.reduce((max, c) => Math.max(max, c.pageNumber || 1), 1);
          } catch (e) {
            src.total_pages = 1;
          }
        } else {
          src.total_pages = 1;
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    // Step 4: Record conversation turn in fast memory
    addSessionMessage(chatId, "user", question);
    addSessionMessage(chatId, "assistant", groundedResult.answer);

    // Step 5: Persist conversation turn and latest citation in MongoDB ChatMeta
    try {
      const topSrc = groundedResult.sources && groundedResult.sources[0];
      const latestCitation = topSrc
        ? {
            document: topSrc.document_title || topSrc.file_name || "Official Policy Document",
            page: topSrc.page || 1,
            paragraph: `Section: ${topSrc.section || "General"} (Para ${topSrc.paragraph || 1})`,
            proofText: topSrc.supporting_text || topSrc.text || groundedResult.answer,
          }
        : {
            document: "Official Municipal Circular",
            page: 1,
            paragraph: "General Directives",
            proofText: groundedResult.answer,
          };

      const messageTurn = {
        id: `turn_${Date.now()}`,
        question,
        answer: groundedResult.answer,
        grounded: groundedResult.grounded,
        confidence: groundedResult.confidence,
        sources: groundedResult.sources || [],
        department: department || null,
        createdAt: new Date(),
      };

      await ChatMeta.findOneAndUpdate(
        { chatId, userId },
        {
          $inc: { messageCount: 2 },
          $set: {
            latestCitation,
            updatedAt: new Date(),
          },
          $push: { messages: messageTurn },
          $setOnInsert: {
            title: question.substring(0, 45) + (question.length > 45 ? "..." : ""),
          },
        },
        { upsert: true, new: true }
      );
    } catch (chatMetaErr) {
      console.warn("Could not persist ChatMeta:", chatMetaErr.message);
    }

    // Step 5: Log query for governance and quality evaluation
    try {
      await QueryLog.create({
        employeeId: userId,
        question,
        answer: groundedResult.answer,
        confidence: groundedResult.confidence,
        grounded: groundedResult.grounded,
        conflictDetected: groundedResult.conflict_detected,
        sourceIds: groundedResult.sources.map((s) => s.chunk_id),
        sources: groundedResult.sources,
        latencyMs,
      });
    } catch (logErr) {
      console.warn("Failed to save QueryLog:", logErr.message);
    }

    // Step 6: Return structured response
    res.json({
      success: true,
      session_id: chatId,
      chatId,
      question,
      answer: groundedResult.answer,
      confidence: groundedResult.confidence,
      grounded: groundedResult.grounded,
      conflict_detected: groundedResult.conflict_detected,
      conflict_notes: groundedResult.conflict_notes,
      sources: groundedResult.sources,
      citations: groundedResult.citations || groundedResult.sources,
      references: groundedResult.references || [],
      suggested_citizen_response: groundedResult.suggested_citizen_response,
      latency_ms: latencyMs,
    });
  } catch (error) {
    console.error("Policy Query Error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while answering your municipal policy query.",
      error: error.message,
    });
  }
};

const createSession = (req, res) => {
  const userId = req.headers["x-user-id"] || "employee";
  const sessionId = `session_${userId}_${Date.now()}`;
  res.json({ success: true, session_id: sessionId });
};

const deleteSession = (req, res) => {
  const sessionId = req.params.sessionId || req.params.chatId;
  clearSession(sessionId);
  res.json({ success: true, message: `Session ${sessionId} cleared.` });
};

module.exports = {
  chatWithAI,
  handlePolicyQuery: chatWithAI,
  createSession,
  deleteSession,
};