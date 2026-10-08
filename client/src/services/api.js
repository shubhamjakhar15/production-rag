/**
 * Municipal Policy AI Copilot — API Client Service
 * Centralizes all communication between React frontend and Express backend.
 */

const API_BASE = "/api";

let customTokenGetter = null;

export function setAuthTokenGetter(getter) {
  customTokenGetter = getter;
}

/**
 * Common headers for all API requests.
 * Includes development bypass fallback and retrieves active Clerk JWT session token.
 */
async function getHeaders(isFormData = false) {
  const headers = {};

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // Retrieve Clerk session token
  try {
    let token = null;
    if (customTokenGetter) {
      token = await customTokenGetter();
    } else if (window.Clerk?.session) {
      token = await window.Clerk.session.getToken();
    } else {
      token = window.__clerk_session_token || localStorage.getItem("clerk_session_token");
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch (e) {
    // Ignore in non-browser environments
  }

  return headers;
}

/**
 * Generic response handler.
 */
async function handleResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`HTTP ${response.status}: Failed to parse response.`);
  }

  if (!response.ok || data.success === false) {
    const message = data.message || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// =========================================================================
// 1. CHAT & POLICY QUERY APIS
// =========================================================================

/**
 * Ask a grounded policy question.
 * Calls the full hybrid search (Pinecone + BM25 + RRF + Neural Reranker) and Gemini synthesis.
 *
 * @param {string} question - Natural language question
 * @param {string} sessionId - Unique session ID for conversation memory
 * @returns {Promise<Object>} Grounded response with answer, citations, confidence, and citizen response
 */
export async function askPolicyQuery(question, sessionId = null, department = null) {
  const payload = {
    question,
    session_id: sessionId || `session_${Date.now()}`,
  };

  if (department && department !== "All") {
    payload.department = department;
  }

  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

/**
 * Ask a grounded policy question with real-time SSE streaming.
 * Yields status updates, source evidence candidates, live token deltas, and final verified response.
 *
 * @param {string} question - Natural language question
 * @param {string} sessionId - Unique session ID for conversation memory
 * @param {string} department - Optional department filter
 * @param {Object} callbacks - { onStatus, onSources, onDelta, onDone, onError, signal }
 * @returns {Promise<Object>} Final grounded response
 */
export async function askPolicyQueryStream(
  question,
  sessionId = null,
  department = null,
  { onStatus, onSources, onDelta, onDone, onError, signal } = {}
) {
  const payload = {
    question,
    session_id: sessionId || `session_${Date.now()}`,
    stream: true,
  };

  if (department && department !== "All") {
    payload.department = department;
  }

  const headers = await getHeaders(false);
  headers["Accept"] = "text/event-stream";

  const response = await fetch(`${API_BASE}/query?stream=true`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errorMsg;
    } catch (e) {}
    const error = new Error(errorMsg);
    error.status = response.status;
    if (onError) onError(error);
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalResult = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split("\n");
        let eventType = "message";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }

        if (!dataStr) continue;

        let parsedData;
        try {
          parsedData = JSON.parse(dataStr);
        } catch (e) {
          continue;
        }

        if (eventType === "status" && onStatus) {
          onStatus(parsedData);
        } else if (eventType === "sources" && onSources) {
          onSources(parsedData);
        } else if (eventType === "delta" && onDelta) {
          onDelta(parsedData.delta || "");
        } else if (eventType === "done") {
          finalResult = parsedData;
          if (onDone) onDone(parsedData);
        } else if (eventType === "error") {
          const err = new Error(parsedData.message || "Streaming error occurred");
          if (onError) onError(err);
          throw err;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalResult;
}


/**
 * Fetches all saved chat sessions for the authenticated citizen/user.
 */
export async function fetchUserChats() {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/chat`, {
    headers,
  });
  return handleResponse(response);
}

/**
 * Fetches complete messages and citation history for a specific chat ID.
 */
export async function fetchChatById(chatId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/chat/${chatId}`, {
    headers,
  });
  return handleResponse(response);
}

/**
 * Deletes a chat session from MongoDB.
 */
export async function deleteChatById(chatId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/chat/${chatId}`, {
    method: "DELETE",
    headers,
  });
  return handleResponse(response);
}

// =========================================================================
// 2. EVIDENCE & PDF VIEWER APIS
// =========================================================================

/**
 * Retrieves page text paragraphs and flags the cited paragraph with is_highlighted: true.
 *
 * @param {string} documentId
 * @param {number} pageNumber
 * @param {string} highlightChunkId
 */
export async function fetchPageEvidence(documentId, pageNumber = 1, highlightChunkId = null) {
  let url = `${API_BASE}/sources/${documentId}/page/${pageNumber}`;
  if (highlightChunkId) {
    url += `?highlight=${encodeURIComponent(highlightChunkId)}`;
  }

  const headers = await getHeaders(false);
  const response = await fetch(url, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Returns the streamable PDF URL with byte-range support.
 *
 * @param {string} documentId
 * @returns {string} Streamable PDF URL
 */
export function getPdfStreamUrl(documentId) {
  return `${API_BASE}/sources/${documentId}/file`;
}

// =========================================================================
// 3. ADMIN & INGESTION APIS
// =========================================================================

/**
 * Fetches real-time dashboard analytics (active docs, processing docs, total versions).
 */
export async function fetchDashboardStats() {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/admin/dashboard`, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Fetches the municipal policy documents list with optional category / status filters.
 */
export async function fetchDocuments(params = {}) {
  const query = new URLSearchParams();
  if (params.category && params.category !== "All") query.append("category", params.category);
  if (params.status) query.append("status", params.status);
  if (params.search) query.append("search", params.search);

  const qs = query.toString();
  const url = `${API_BASE}/admin/documents${qs ? `?${qs}` : ""}`;

  const headers = await getHeaders(false);
  const response = await fetch(url, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Fetches a single document's metadata and complete version history.
 */
export async function fetchDocumentById(documentId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}`, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Uploads a new municipal policy PDF document (initial Version 1) and triggers background ingestion.
 *
 * @param {FormData} formData - Contains file, title, category, description
 */
export async function uploadPolicyDocument(formData) {
  const headers = await getHeaders(true);
  const response = await fetch(`${API_BASE}/admin/documents`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse(response);
}

/**
 * Uploads a new version / amendment for an existing document.
 *
 * @param {string} documentId
 * @param {FormData} formData - Contains file
 */
export async function uploadDocumentVersion(documentId, formData) {
  const headers = await getHeaders(true);
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}/versions`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse(response);
}

/**
 * Polls the background ingestion job status (VALIDATING -> EXTRACTING -> CHUNKING -> EMBEDDING -> INDEXED -> READY).
 *
 * @param {string} jobId
 */
export async function pollIngestionJob(jobId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/admin/jobs/${jobId}`, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Activates a specific document version and deactivates older versions.
 *
 * @param {string} documentId
 * @param {string} versionId
 */
export async function activateVersion(documentId, versionId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}/versions/${versionId}/activate`, {
    method: "PATCH",
    headers,
  });

  return handleResponse(response);
}

/**
 * Deletes a document and cascades deletion across MongoDB, Pinecone, and disk.
 *
 * @param {string} documentId
 */
export async function deleteDocument(documentId) {
  const headers = await getHeaders(false);
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}`, {
    method: "DELETE",
    headers,
  });

  return handleResponse(response);
}
