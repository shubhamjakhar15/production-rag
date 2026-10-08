/**
 * Fast in-memory session context cache with 1-hour TTL.
 * Holds short-term conversation context without consuming embedding quota.
 */
const sessionCache = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Prunes expired sessions.
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessionCache.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessionCache.delete(id);
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupExpiredSessions, 15 * 60 * 1000).unref();

/**
 * Retrieves recent message context for a session.
 *
 * @param {string} sessionId
 * @param {number} maxMessages - Maximum recent turns to return (default: 4)
 * @returns {string} Formatted context string
 */
function getSessionContext(sessionId, maxMessages = 4) {
  if (!sessionId || !sessionCache.has(sessionId)) {
    return "";
  }

  const session = sessionCache.get(sessionId);
  session.lastActive = Date.now();

  const recent = session.messages.slice(-maxMessages);
  if (recent.length === 0) return "";

  return recent
    .map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.text}`)
    .join("\n");
}

/**
 * Enriches a follow-up query with previous conversation topic if necessary.
 *
 * @param {string} query
 * @param {string} sessionId
 * @returns {string} Effective query for retrieval
 */
function enrichQueryWithContext(query, sessionId) {
  if (!sessionId || !sessionCache.has(sessionId)) {
    return query;
  }

  const session = sessionCache.get(sessionId);
  const userMessages = session.messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) return query;

  const lastUserMsg = userMessages[userMessages.length - 1].text;

  // Check if query is anaphoric/follow-up (e.g. contains "they", "it", "these", "those", "this scheme", "what documents")
  const followUpPattern = /\b(they|it|these|those|this|their|he|she|documents required|eligibility criteria)\b/i;
  if (followUpPattern.test(query) && !query.toLowerCase().includes("water") && !query.toLowerCase().includes("scheme")) {
    // Append the previous question topic as context
    return `${query} (Context: ${lastUserMsg})`;
  }

  return query;
}

/**
 * Records a message exchange in the session.
 *
 * @param {string} sessionId
 * @param {string} role - "user" | "assistant"
 * @param {string} text
 */
function addSessionMessage(sessionId, role, text) {
  if (!sessionId) return;

  if (!sessionCache.has(sessionId)) {
    sessionCache.set(sessionId, {
      id: sessionId,
      messages: [],
      lastActive: Date.now(),
    });
  }

  const session = sessionCache.get(sessionId);
  session.messages.push({
    role,
    text,
    timestamp: Date.now(),
  });
  session.lastActive = Date.now();

  // Keep at most 10 recent messages in memory
  if (session.messages.length > 10) {
    session.messages = session.messages.slice(-10);
  }
}

/**
 * Clears a session.
 *
 * @param {string} sessionId
 */
function clearSession(sessionId) {
  if (sessionId) {
    sessionCache.delete(sessionId);
  }
}

module.exports = {
  getSessionContext,
  enrichQueryWithContext,
  addSessionMessage,
  clearSession,
};
