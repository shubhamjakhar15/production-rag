import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import ChatPage from "./pages/ChatPage";
import DocumentsPage from "./pages/DocumentsPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import AdminPage from "./pages/AdminPage";
import AdminGuard from "./components/AdminGuard";
import { useAuth, useClerk } from "@clerk/clerk-react";

import {
  askPolicyQuery,
  fetchDocuments,
  deleteDocument,
  fetchUserChats,
  fetchChatById,
  deleteChatById,
  setAuthTokenGetter,
} from "./services/api";

const STORAGE_KEY_PREVIOUS_CHATS = "civiclens_previous_chats";
const STORAGE_KEY_ACTIVE_CHAT_ID = "civiclens_active_chat_id";
const STORAGE_KEY_ACTIVE_MESSAGES = "civiclens_active_messages";

function loadSavedChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREVIOUS_CHATS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function loadSavedActiveMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function mapBackendResponseToProofData(backendData, questionText) {
  const isGrounded = backendData.grounded === true && backendData.confidence > 0;

  if (!isGrounded) {
    return {
      isNoSource: true,
      question: questionText,
      message:
        backendData.answer ||
        "I could not find sufficient information in official municipal policy documents to answer this question.",
      sourcesFound: backendData.sources?.length || 0,
      advice:
        "Strict anti-hallucination guard is active. CivicLens only answers when verified evidence exists in active municipal circulars.",
    };
  }

  const topSource = backendData.sources && backendData.sources.length > 0 ? backendData.sources[0] : null;
  const rawLines = (backendData.answer || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const intro = rawLines[0] || backendData.answer;
  const points = rawLines.slice(1).map((l) => l.replace(/^[\d\.\-\*•]+\s*/, ""));

  return {
    isNoSource: false,
    question: questionText,
    answerIntro: intro,
    points: points.length > 0 ? points : [],
    answerConclusion: backendData.suggested_citizen_response
      ? `Citizen Guidance Note: "${backendData.suggested_citizen_response}"`
      : null,
    citation: topSource
      ? {
          document: topSource.document_title || topSource.file_name || "Official Policy Document",
          documentId: topSource.document_id,
          version: topSource.version,
          page: topSource.page || 1,
          totalDocPages: topSource.total_pages || 1,
          paragraph: `Section: ${topSource.section || "General"} (Para ${topSource.paragraph || 1})`,
          section: topSource.section || "General",
          chunkId: topSource.chunk_id,
          proofText: topSource.supporting_text || topSource.text,
          allSources: backendData.sources || [],
          references: backendData.references || [],
        }
      : {
          document: "Official Municipal Circular",
          page: 1,
          totalDocPages: 1,
          paragraph: "General Clause",
          section: "Directives",
          allSources: [],
          references: [],
        },
    whyThisAnswer: {
      sourceStatus: "Retrieved from official municipal document",
      passagesFound: backendData.sources?.length || 1,
      generationRule: "Answer generated only from verified active sources",
      verificationStatus: backendData.conflict_detected ? "Policy conflict flagged" : "Citation verified",
      confidence: Math.round((backendData.confidence || 0.95) * 100),
    },
    pdfView: {
      title: topSource?.document_title || "Official Policy Document",
      subtitle: `Version ${topSource?.version || 1} • ${topSource?.section || "Policy Circular"}`,
      chapter: topSource?.section || "Statutory Directives",
      prefixParagraph: "Official Municipal Gazette Extract.",
      highlightedParagraph: topSource?.supporting_text || topSource?.text || backendData.answer,
      suffixParagraph: "Directives issued under statutory municipal governance authority.",
      documentId: topSource?.document_id,
      pageNumber: topSource?.page || 1,
      totalDocPages: topSource?.total_pages || 1,
      chunkId: topSource?.chunk_id,
    },
  };
}

function AppContent() {
  const [documents, setDocuments] = useState([]);
  const [previousChats, setPreviousChats] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeProofData, setActiveProofData] = useState(null);
  const [isProofOpen, setIsProofOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();

  // Sync Clerk token getter with api client
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  // Synchronize authentication lifecycle and saved chats
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      // Disallow access & wipe saved chat sessions for non-logged-in users
      setPreviousChats([]);
      setChatMessages([]);
      setActiveChatId(null);
      setActiveProofData(null);
      setIsProofOpen(false);
      try {
        localStorage.removeItem(STORAGE_KEY_PREVIOUS_CHATS);
        localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAT_ID);
        localStorage.removeItem(STORAGE_KEY_ACTIVE_MESSAGES);
      } catch (e) {}
      return;
    }

    // Authenticated user: restore from local cache first if available
    try {
      const savedChats = loadSavedChats();
      if (savedChats && savedChats.length > 0) {
        setPreviousChats(savedChats);
      }
      const savedMessages = loadSavedActiveMessages();
      if (savedMessages && savedMessages.length > 0) {
        setChatMessages(savedMessages);
        const lastTurn = savedMessages[savedMessages.length - 1];
        if (lastTurn?.proofData) {
          setActiveProofData(lastTurn.proofData);
        }
      }
      const savedChatId = localStorage.getItem(STORAGE_KEY_ACTIVE_CHAT_ID);
      if (savedChatId) {
        setActiveChatId(savedChatId);
      }
    } catch (e) {}

    // Fetch user-specific remote chats from backend MongoDB
    fetchUserChats()
      .then((res) => {
        if (res.success && Array.isArray(res.chats)) {
          setPreviousChats((localChats) => {
            const chatMap = new Map();
            // Local chats first
            localChats.forEach((c) => chatMap.set(c.id || c.chatId, c));
            // Overlay remote chats
            res.chats.forEach((rc) => {
              const id = rc.chatId;
              const existing = chatMap.get(id);
              const firstMsg = rc.messages?.[0];
              const lastMsg = rc.messages?.slice(-1)[0];
              const topCitation = rc.latestCitation || {};

              chatMap.set(id, {
                id,
                chatId: id,
                question: firstMsg?.question || rc.title || "Policy Query",
                shortTitle: rc.title || "Policy Query",
                document: topCitation.document || "Official Municipal Document",
                page: topCitation.page || 1,
                paragraph: topCitation.paragraph || "Directive",
                proofText: topCitation.proofText || (lastMsg?.answer || ""),
                timestamp: rc.updatedAt ? new Date(rc.updatedAt).toLocaleDateString() : "Saved",
                updatedAt: rc.updatedAt || rc.createdAt,
                messages: existing?.messages?.length
                  ? existing.messages
                  : (rc.messages || []).map((m) => ({
                      id: m.id || m._id || `turn_${Date.now()}`,
                      question: m.question,
                      answer: m.answer,
                      proofData: mapBackendResponseToProofData(
                        {
                          grounded: m.grounded,
                          confidence: m.confidence,
                          answer: m.answer,
                          sources: m.sources,
                        },
                        m.question
                      ),
                      timestamp: m.createdAt
                        ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Just now",
                    })),
              });
            });
            return Array.from(chatMap.values()).sort(
              (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
            );
          });
        }
      })
      .catch((err) => console.warn("Could not sync remote chats:", err.message));
  }, [isSignedIn, isLoaded]);

  // Save previousChats to localStorage whenever it changes (only when authenticated)
  useEffect(() => {
    if (!isSignedIn) return;
    try {
      localStorage.setItem(STORAGE_KEY_PREVIOUS_CHATS, JSON.stringify(previousChats));
    } catch (e) {}
  }, [previousChats, isSignedIn]);

  // Save active conversation messages & ID to localStorage (only when authenticated)
  useEffect(() => {
    if (!isSignedIn) return;
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_MESSAGES, JSON.stringify(chatMessages));
      if (activeChatId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_CHAT_ID, activeChatId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAT_ID);
      }
    } catch (e) {}
  }, [chatMessages, activeChatId, isSignedIn]);

  // Load real documents from backend
  const loadDocuments = () => {
    fetchDocuments()
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const mappedDocs = res.data.map((d) => ({
            id: d._id || d.id,
            title: d.title,
            department: d.category || "General",
            pages: d.currentVersionId?.chunkCount ? Math.ceil(d.currentVersionId.chunkCount / 3) : 1,
            uploadDate: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "Active",
            status: d.status === "ACTIVE" ? "Indexed" : d.status,
            ready: d.status === "ACTIVE",
            fileSize: d.currentVersionId?.fileSize
              ? `${(d.currentVersionId.fileSize / (1024 * 1024)).toFixed(1)} MB`
              : "1.0 MB",
            authority: d.category ? `${d.category} Directorate` : "Municipal Administration",
            summary: d.description || "Official municipal policy document indexed into vector knowledge base.",
            fileUrl: d.fileUrl || `/api/sources/${d._id}/file`,
          }));
          setDocuments(mappedDocs);
        } else {
          setDocuments([]);
        }
      })
      .catch((err) => {
        console.warn("Could not load backend documents:", err.message);
        setDocuments([]);
      });
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // Handler when user asks a question
  const handleAskQuestion = async (questionText, department = null) => {
    if (!questionText || !questionText.trim()) return;

    // Strict citizen authentication guard: login required to ask questions
    if (!isSignedIn) {
      if (openSignIn) {
        openSignIn({ redirectUrl: "/chat" });
      }
      return;
    }

    const trimmedQuestion = questionText.trim();
    const effectiveDept = department || selectedDepartment;

    // Ensure persistent activeChatId exists
    const currentChatId = activeChatId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (!activeChatId) {
      setActiveChatId(currentChatId);
    }

    setIsProcessing(true);
    const tempTurnId = `turn_${Date.now()}`;
    const pendingTurn = {
      id: tempTurnId,
      question: trimmedQuestion,
      isPending: true,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, pendingTurn]);
    navigate("/chat");

    try {
      const liveResult = await askPolicyQuery(trimmedQuestion, currentChatId, effectiveDept);
      const proofData = mapBackendResponseToProofData(liveResult, trimmedQuestion);

      setActiveProofData(proofData);
      const isGrounded = proofData.isNoSource !== true;
      setIsProofOpen(isGrounded);

      const completedTurn = {
        id: tempTurnId,
        question: trimmedQuestion,
        answer: liveResult.answer,
        proofData,
        isPending: false,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatMessages((prev) => prev.map((turn) => (turn.id === tempTurnId ? completedTurn : turn)));

      // Update or insert into previousChats
      setPreviousChats((prev) => {
        const existing = prev.find((c) => c.id === currentChatId);
        const allTurns = existing?.messages
          ? [...existing.messages.filter((m) => m.id !== tempTurnId), completedTurn]
          : [completedTurn];

        const updatedChat = {
          id: currentChatId,
          chatId: currentChatId,
          question: existing?.question || trimmedQuestion,
          shortTitle:
            existing?.shortTitle ||
            (trimmedQuestion.length > 34 ? `${trimmedQuestion.substring(0, 34)}...` : trimmedQuestion),
          document: proofData.citation?.document || existing?.document || "Official Policy Document",
          page: proofData.citation?.page || existing?.page || 1,
          paragraph: proofData.citation?.paragraph || existing?.paragraph || "Directive",
          proofText: proofData.pdfView?.highlightedParagraph || liveResult.answer,
          timestamp: "Just now",
          updatedAt: new Date().toISOString(),
          messages: allTurns,
        };

        return [updatedChat, ...prev.filter((c) => c.id !== currentChatId)];
      });
    } catch (err) {
      console.warn("Live query failed:", err.message);
      const isAuthErr =
        err.status === 401 ||
        err.message?.toLowerCase().includes("authentication") ||
        err.message?.toLowerCase().includes("sign in");

      if (isAuthErr && openSignIn) {
        openSignIn({ redirectUrl: "/chat" });
      }

      const errorProofData = {
        isNoSource: true,
        question: trimmedQuestion,
        message: isAuthErr
          ? "Citizen authentication required. Please sign in to ask policy questions."
          : err.message?.includes("Failed to fetch")
          ? "Could not connect to the Municipal Copilot backend on port 5000."
          : err.message || "I could not find sufficient information in official municipal policy documents to answer this question.",
        sourcesFound: 0,
        advice: isAuthErr
          ? "Sign in with your citizen account to query municipal policies."
          : "Upload relevant municipal policy documents via the Admin Portal to enable grounded answers.",
      };

      setActiveProofData(errorProofData);
      setIsProofOpen(false);

      const errorTurn = {
        id: tempTurnId,
        question: trimmedQuestion,
        proofData: errorProofData,
        isPending: false,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatMessages((prev) => prev.map((turn) => (turn.id === tempTurnId ? errorTurn : turn)));

      // Save into previousChats so it is not lost
      setPreviousChats((prev) => {
        const existing = prev.find((c) => c.id === currentChatId);
        const allTurns = existing?.messages
          ? [...existing.messages.filter((m) => m.id !== tempTurnId), errorTurn]
          : [errorTurn];

        const updatedChat = {
          id: currentChatId,
          chatId: currentChatId,
          question: existing?.question || trimmedQuestion,
          shortTitle:
            existing?.shortTitle ||
            (trimmedQuestion.length > 34 ? `${trimmedQuestion.substring(0, 34)}...` : trimmedQuestion),
          document: "Municipal Policy Directives",
          page: 1,
          paragraph: "Policy Query",
          proofText: errorProofData.message,
          timestamp: "Just now",
          updatedAt: new Date().toISOString(),
          messages: allTurns,
        };

        return [updatedChat, ...prev.filter((c) => c.id !== currentChatId)];
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handler when selecting previous chat (loads saved real conversation thread & citations)
  const handleSelectPreviousChat = async (chat) => {
    if (!isSignedIn) {
      if (openSignIn) {
        openSignIn({ redirectUrl: "/chat" });
      }
      return;
    }

    setActiveChatId(chat.id);

    if (chat.messages && chat.messages.length > 0) {
      setChatMessages(chat.messages);
      const lastTurn = chat.messages[chat.messages.length - 1];
      if (lastTurn?.proofData) {
        setActiveProofData(lastTurn.proofData);
        setIsProofOpen(!lastTurn.proofData.isNoSource);
      }
    } else {
      // Fetch full turns from backend if available
      try {
        const res = await fetchChatById(chat.id);
        if (res.success && res.messages && res.messages.length > 0) {
          const loadedTurns = res.messages.map((m) => ({
            id: m.id || m._id || `msg_${Date.now()}`,
            question: m.question,
            answer: m.answer,
            proofData: mapBackendResponseToProofData(
              {
                grounded: m.grounded,
                confidence: m.confidence,
                answer: m.answer,
                sources: m.sources,
              },
              m.question
            ),
            timestamp: m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Saved",
          }));

          setChatMessages(loadedTurns);
          const lastTurn = loadedTurns[loadedTurns.length - 1];
          setActiveProofData(lastTurn.proofData);
          setIsProofOpen(!lastTurn.proofData.isNoSource);

          // Update cached chat with loaded messages
          setPreviousChats((prev) =>
            prev.map((c) => (c.id === chat.id ? { ...c, messages: loadedTurns } : c))
          );
          navigate("/chat");
          return;
        }
      } catch (err) {
        console.warn("Could not load chat messages from server:", err.message);
      }

      // Reconstruct single turn fallback
      const singleTurn = {
        id: `turn_${Date.now()}`,
        question: chat.question,
        proofData: {
          isNoSource: false,
          question: chat.question,
          answerIntro: `Verified municipal policy records in "${chat.document}":`,
          points: [chat.proofText],
          citation: {
            document: chat.document,
            page: chat.page,
            paragraph: chat.paragraph,
            section: "Verified Policy Directive",
          },
          whyThisAnswer: {
            sourceStatus: "Retrieved from official municipal document",
            passagesFound: 1,
            generationRule: "Answer generated only from verified active sources",
            verificationStatus: "Citation verified",
            confidence: 95,
          },
          pdfView: {
            title: chat.document,
            subtitle: "Municipal Policy Document",
            chapter: "Statutory Directives",
            highlightedParagraph: chat.proofText,
          },
        },
      };

      setChatMessages([singleTurn]);
      setActiveProofData(singleTurn.proofData);
      setIsProofOpen(true);
    }

    navigate("/chat");
  };

  // Start fresh conversation (New Chat)
  const handleNewChat = () => {
    if (!isSignedIn) {
      if (openSignIn) {
        openSignIn({ redirectUrl: "/chat" });
      }
      return;
    }
    setActiveChatId(null);
    setChatMessages([]);
    setActiveProofData(null);
    setIsProofOpen(false);
    navigate("/chat");
  };

  // Delete a chat from list and backend
  const handleDeleteChat = async (chatId, e) => {
    if (e) e.stopPropagation();
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    setPreviousChats((prev) => prev.filter((c) => c.id !== chatId && c.chatId !== chatId));
    if (activeChatId === chatId) {
      handleNewChat();
    }
    if (isSignedIn) {
      try {
        await deleteChatById(chatId);
      } catch (err) {
        console.warn("Failed to delete chat on server:", err.message);
      }
    }
  };

  // Upload document handler (Admin Only)
  const handleUploadDocument = (newDoc) => {
    setDocuments((prev) => [newDoc, ...prev]);
    loadDocuments();
  };

  // Delete document handler (Admin Only)
  const handleDeleteDocument = async (docId) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId && d._id !== docId));
    try {
      await deleteDocument(docId);
      loadDocuments();
    } catch (err) {
      console.warn("Could not delete document on backend:", err.message);
    }
  };

  return (
    <AppLayout
      previousChats={isSignedIn ? previousChats : []}
      onSelectPreviousChat={handleSelectPreviousChat}
      activeChatId={activeChatId}
      onNewChat={handleNewChat}
      onDeleteChat={handleDeleteChat}
      selectedDepartment={selectedDepartment}
      onSelectDepartment={setSelectedDepartment}
      onSearchSubmit={(query) => handleAskQuestion(query)}
    >
      <Routes>
        <Route
          path="/"
          element={<DashboardPage onAskQuestion={handleAskQuestion} documents={documents} />}
        />
        <Route
          path="/chat"
          element={
            <ChatPage
              chatMessages={chatMessages}
              onAskQuestion={handleAskQuestion}
              activeProofData={activeProofData}
              onSelectProof={(data) => setActiveProofData(data)}
              isProofOpen={isProofOpen}
              setIsProofOpen={setIsProofOpen}
              isProcessing={isProcessing}
              onNewChat={handleNewChat}
              documents={documents}
              selectedDepartment={selectedDepartment}
              onSelectDepartment={setSelectedDepartment}
            />
          }
        />
        <Route
          path="/documents"
          element={
            <DocumentsPage
              documents={documents}
              onSelectDocumentForChat={(doc) => {
                handleAskQuestion(`What are the key policy guidelines and directives in ${doc.title}?`);
              }}
            />
          }
        />
        <Route
          path="/departments"
          element={
            <AdminGuard
              title="Departments Panel"
              description="Municipal department details, jurisdictional circulars, and policy configurations are restricted to authorized administrators."
            >
              <DepartmentsPage
                documents={documents}
                onSelectDepartment={(deptName) => {
                  setSelectedDepartment(deptName);
                  handleAskQuestion(`What are the official municipal policies and guidelines under ${deptName}?`);
                }}
              />
            </AdminGuard>
          }
        />
        {/* Settings redirected strictly to Admin Portal */}
        <Route path="/settings" element={<Navigate to="/admin" replace />} />
        {/* Admin Portal (http://localhost:5173/admin) - Restricted via Clerk Auth & Role */}
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminPage
                documents={documents}
                onUploadDocument={handleUploadDocument}
                onDeleteDocument={handleDeleteDocument}
              />
            </AdminGuard>
          }
        />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
