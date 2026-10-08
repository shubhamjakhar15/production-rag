const { executeHybridSearch } = require("../services/hybridSearch");
const {
  generateGroundedAnswer,
  generateGroundedAnswerStream,
} = require("../services/groundingService");
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

/**
 * Enriches candidate sources with actual total page count of parent document.
 */
async function enrichSourcesWithTotalPages(sources) {
  if (!sources || sources.length === 0) return;
  for (const src of sources) {
    const docId = src.document_id || src.documentId;
    if (docId) {
      try {
        const docPages = await PolicyChunk.find({ documentId: docId, status: "ACTIVE" })
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

/**
 * Persists conversation turn in fast memory, ChatMeta (MongoDB), and QueryLog (MongoDB).
 */
async function persistTurnAndLog({
  userId,
  chatId,
  question,
  groundedResult,
  department,
  latencyMs,
}) {
  // Step 1: Record conversation turn in fast memory
  addSessionMessage(chatId, "user", question);
  addSessionMessage(chatId, "assistant", groundedResult.answer);

  // Step 2: Persist conversation turn and latest citation in MongoDB ChatMeta
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

  // Step 3: Log query for governance and quality evaluation
  try {
    await QueryLog.create({
      employeeId: userId,
      question,
      answer: groundedResult.answer,
      confidence: groundedResult.confidence,
      grounded: groundedResult.grounded,
      conflictDetected: groundedResult.conflict_detected,
      sourceIds: (groundedResult.sources || []).map((s) => s.chunk_id),
      sources: groundedResult.sources,
      latencyMs,
    });
  } catch (logErr) {
    console.warn("Failed to save QueryLog:", logErr.message);
  }
}

const chatWithAI = async (req, res) => {
  const startTime = Date.now();

  const isStream =
    req.body.stream === true ||
    req.query.stream === "true" ||
    req.headers.accept?.includes("text/event-stream");

  try {
    let userId =
      req.headers["x-user-id"] ||
      (req.headers["x-dev-test"] ? "dev_employee_user" : null);

    if (!userId) {
      try {
        const auth = getAuth(req);
        userId = auth?.userId;
      } catch (err) {
        if (process.env.NODE_ENV === "test" || req.headers["x-dev-test"]) {
          userId = "dev_employee_user";
        }
      }
    }

    if (!userId) {
      if (isStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.write(`event: error\ndata: ${JSON.stringify({ success: false, message: "Authentication required. Please sign in with your citizen account to ask policy questions." })}\n\n`);
        return res.end();
      }
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in with your citizen account to ask policy questions.",
      });
    }

    const question = (req.body.question || req.body.message || req.body.prompt || "").trim();
    let chatId = req.body.session_id || req.body.chatId || req.body.sessionId;

    if (!question) {
      if (isStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.write(`event: error\ndata: ${JSON.stringify({ success: false, message: "A question or message is required." })}\n\n`);
        return res.end();
      }
      return res.status(400).json({
        success: false,
        message: "A question or message is required.",
      });
    }

    if (!chatId) {
      chatId = `session_${userId}_${Date.now()}`;
    }

    const department = (req.body.department || req.body.category || "").trim();

    // -------------------------------------------------------------
    // STREAMING FLOW (Server-Sent Events)
    // -------------------------------------------------------------
    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      const sendSSE = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (typeof res.flush === "function") {
          res.flush();
        }
      };

      sendSSE("status", {
        stage: "retrieving",
        message: `Searching municipal policy database ${department && department !== "All" ? `for ${department}` : ""}...`,
      });

      // Context enrichment for conversational follow-ups
      const effectiveQuery = enrichQueryWithContext(question, chatId);
      const recentContext = getSessionContext(chatId, 4);

      console.log(
        `[Stream] Query: "${question}" -> Effective Retrieval Query: "${effectiveQuery}" ${
          department ? `[Department: ${department}]` : "[All Departments]"
        }`
      );

      // Hybrid Search (Pinecone Vector + BM25 Keyword + RRF Fusion scoped by department)
      const candidates = await executeHybridSearch(effectiveQuery, {
        topK: 15,
        department: department && department !== "All" ? department : null,
        filter: { status: { $eq: "active" } },
      });

      // Enrich top candidates with document page count
      await enrichSourcesWithTotalPages(candidates.slice(0, 5));

      // Build preliminary sources to immediately notify frontend
      const topCandidates = candidates.slice(0, 5);
      const initialSources = [];
      const seenChunks = new Set();
      topCandidates.forEach((cand) => {
        if (cand && !seenChunks.has(cand.chunkId)) {
          seenChunks.add(cand.chunkId);
          const fileName =
            cand.fileName ||
            (cand.documentTitle ? `${cand.documentTitle}.pdf` : "Policy_Document.pdf");
          const referenceLabel = `${fileName} (v${cand.versionNumber}) — Page ${cand.pageNumber}, ${cand.section || "General"}`;
          initialSources.push({
            document_id: cand.documentId,
            document_title: cand.documentTitle,
            file_name: fileName,
            version: cand.versionNumber,
            page: cand.pageNumber,
            section: cand.section || "General",
            paragraph: cand.paragraphNumber,
            chunk_id: cand.chunkId,
            reference: referenceLabel,
            reference_label: referenceLabel,
            supporting_text: cand.text,
            text: cand.text,
            total_pages: cand.total_pages || 1,
          });
        }
      });

      sendSSE("sources", {
        sources: initialSources,
        citations: initialSources,
        count: initialSources.length,
      });

      sendSSE("status", {
        stage: "generating",
        message: "Synthesizing verified policy response...",
      });

      // Stream generation with live token deltas
      const groundedResult = await generateGroundedAnswerStream(
        question,
        candidates,
        { recentContext },
        (deltaText) => {
          sendSSE("delta", { delta: deltaText });
        }
      );

      // Carry enriched total_pages over to groundedResult sources
      await enrichSourcesWithTotalPages(groundedResult.sources);

      const latencyMs = Date.now() - startTime;

      // Persist turn and evaluation logs
      await persistTurnAndLog({
        userId,
        chatId,
        question,
        groundedResult,
        department,
        latencyMs,
      });

      // Send final completion event
      sendSSE("done", {
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

      return res.end();
    }

    // -------------------------------------------------------------
    // NON-STREAMING FALLBACK (Standard JSON response)
    // -------------------------------------------------------------
    const effectiveQuery = enrichQueryWithContext(question, chatId);
    const recentContext = getSessionContext(chatId, 4);

    console.log(
      `Query: "${question}" -> Effective Retrieval Query: "${effectiveQuery}" ${
        department ? `[Department: ${department}]` : "[All Departments]"
      }`
    );

    const candidates = await executeHybridSearch(effectiveQuery, {
      topK: 15,
      department: department && department !== "All" ? department : null,
      filter: { status: { $eq: "active" } },
    });

    const groundedResult = await generateGroundedAnswer(question, candidates, {
      recentContext,
    });

    await enrichSourcesWithTotalPages(groundedResult.sources);

    const latencyMs = Date.now() - startTime;

    await persistTurnAndLog({
      userId,
      chatId,
      question,
      groundedResult,
      department,
      latencyMs,
    });

    return res.json({
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
    if (isStream) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
      }
      res.write(`event: error\ndata: ${JSON.stringify({ success: false, message: error.message || "An error occurred while answering your municipal policy query." })}\n\n`);
      return res.end();
    }
    return res.status(500).json({
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