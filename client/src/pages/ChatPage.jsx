import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, LogIn, Building2, Plus, Sparkles } from "lucide-react";
import { useAuth, useClerk, SignInButton } from "@clerk/clerk-react";
import { UserQuestion, AIAnswer, NoSourceAnswer } from "../components/ChatComponents";
import ChatInput from "../components/ChatInput";
import ProofPanel from "../components/ProofPanel";

// Official 8 Municipal Themes
export const EIGHT_CIVIC_THEMES = [
  "Housing",
  "Water & Sanitation",
  "Roads & Infrastructure",
  "Waste Management",
  "Property Tax",
  "Licensing & Permits",
  "Environment",
  "Emergency Services",
];

export default function ChatPage({
  chatMessages = [],
  activeQuestion = "",
  onAskQuestion,
  activeProofData,
  onSelectProof,
  isProofOpen,
  setIsProofOpen,
  isProcessing: parentProcessing = false,
  onNewChat = null,
  documents = [],
  selectedDepartment = null,
  onSelectDepartment = null,
}) {
  const [localProcessing, setLocalProcessing] = useState(false);
  const [deptScope, setDeptScope] = useState(selectedDepartment || null);
  const messagesEndRef = useRef(null);
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const isProcessing = parentProcessing || localProcessing;

  // Synchronize department scope if passed from parent
  useEffect(() => {
    if (selectedDepartment !== undefined) {
      setDeptScope(selectedDepartment);
    }
  }, [selectedDepartment]);

  // Auto-scroll to bottom whenever new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isProcessing]);

  const handleDepartmentSelect = (dept) => {
    const next = deptScope === dept ? null : dept;
    setDeptScope(next);
    if (onSelectDepartment) {
      onSelectDepartment(next);
    }
  };

  const handleSend = async (text, overrideDept = undefined) => {
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    setLocalProcessing(true);
    try {
      const deptToUse = overrideDept !== undefined ? overrideDept : deptScope;
      await onAskQuestion(text, deptToUse);
    } finally {
      setLocalProcessing(false);
    }
  };

  const handleViewProof = (proof) => {
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    const targetProof = proof || activeProofData;
    if (onSelectProof && targetProof) {
      onSelectProof(targetProof);
    }
    setIsProofOpen(true);
  };

  // Restrict access to previous/active chat messages for non-logged-in users
  const effectiveMessages = isSignedIn ? chatMessages : [];
  const hasMessages = isSignedIn && effectiveMessages.length > 0;
  const showWelcome = !isSignedIn || (!hasMessages && !activeQuestion && !activeProofData && !isProcessing);

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      {/* Central Chat Stream */}
      <div className="flex-1 flex flex-col justify-between overflow-y-auto px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full">
        {/* Messages Container */}
        <div className="space-y-6 pb-6">
          {/* Active Chat Header Bar (Shown when in a conversation) */}
          {hasMessages && (
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE7E2] text-xs">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-[#197A63]" />
                <span className="font-semibold text-[#17302F]">
                  Scope: <strong className="text-[#0E3030]">{deptScope || "All Municipal Departments"}</strong>
                </span>
              </div>
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isSignedIn && openSignIn) {
                      openSignIn();
                      return;
                    }
                    onNewChat();
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#EFF8F3] hover:bg-[#E7F3ED] border border-[#DDE7E2] hover:border-[#197A63] text-[#197A63] rounded-lg font-semibold transition-all cursor-pointer text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Query</span>
                </button>
              )}
            </div>
          )}

          {/* Welcome Screen when no questions have been asked yet */}
          {showWelcome && (
            <div className="py-8 text-center max-w-2xl mx-auto space-y-4 animate-in fade-in">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF8F3] text-[#197A63] border border-[#DDE7E2] flex items-center justify-center mx-auto shadow-xs">
                {isSignedIn ? <ShieldCheck className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0E3030] tracking-tight">
                CivicLens
              </h2>

              {!isSignedIn ? (
                /* Unauthenticated Sign-In Callout */
                <div className="pt-3 pb-2 max-w-md mx-auto">
                  <div className="bg-white border-2 border-[#197A63]/25 rounded-2xl p-5 shadow-sm text-center space-y-3">
                    <div className="text-xs font-bold text-[#0E3030] uppercase tracking-wider">
                      Citizen Sign-In Required
                    </div>
                    <p className="text-xs text-[#6B7C7A] max-w-xs mx-auto">
                      Please sign in with your citizen account to submit questions and inspect verified statutory proof citations.
                    </p>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="inline-flex items-center space-x-2 px-5 py-2.5 bg-[#197A63] hover:bg-[#0E3030] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign In to Ask Questions</span>
                      </button>
                    </SignInButton>
                  </div>
                </div>
              ) : (
                /* Authenticated User Experience: 8 Themes in Middle Only */
                <div className="space-y-4 pt-1">
                  {/* Department Scope & Cost-Saving Selector (8 Themes in Middle) */}
                  <div className="bg-white border border-[#DDE7E2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 text-center">
                    <div className="flex items-center justify-between border-b border-[#DDE7E2] pb-2.5">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-[#197A63]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#0E3030]">
                          Municipal Department Scope
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-[#197A63] bg-[#EFF8F3] px-2.5 py-0.5 rounded-full border border-[#DDE7E2]">
                        ⚡ Cost-Optimized Retrieval
                      </span>
                    </div>

                    <p className="text-xs text-[#6B7C7A] text-left leading-relaxed">
                      Select any of the 8 municipal themes to scope Pinecone vector queries, reduce compute costs, and eliminate cross-department noise:
                    </p>

                    {/* The 8 Themes + All Departments, Centered in the Middle */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDepartmentSelect(null)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          !deptScope
                            ? "bg-[#197A63] text-white border-[#197A63] shadow-xs"
                            : "bg-[#F7F8F5] text-[#17302F] border-[#DDE7E2] hover:border-[#197A63] hover:bg-[#EFF8F3]"
                        }`}
                      >
                        All Departments
                      </button>

                      {EIGHT_CIVIC_THEMES.map((theme) => {
                        const hasUploadedDocs = documents.some((d) => {
                          const dName = (d.department || "").toLowerCase().trim();
                          const target = theme.toLowerCase().trim();
                          return dName === target || dName.includes(target) || target.includes(dName);
                        });
                        const isSelected = deptScope === theme;

                        return (
                          <button
                            key={theme}
                            type="button"
                            onClick={() => handleDepartmentSelect(theme)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                              isSelected
                                ? "bg-[#197A63] text-white border-[#197A63] shadow-xs"
                                : "bg-[#F7F8F5] text-[#17302F] border-[#DDE7E2] hover:border-[#197A63] hover:bg-[#EFF8F3]"
                            }`}
                          >
                            <span>{theme}</span>
                            {hasUploadedDocs && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSelected ? "bg-[#F4D35E]" : "bg-[#197A63]"
                                }`}
                                title="Has uploaded circulars"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {deptScope && (
                      <div className="text-[11px] text-[#197A63] bg-[#EFF8F3] p-2 rounded-xl border border-[#DDE7E2] flex items-center justify-between text-left">
                        <span>
                          Vector &amp; BM25 queries scoped strictly to <strong>{deptScope}</strong>.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDepartmentSelect(null)}
                          className="text-[10px] font-bold text-[#6B7C7A] hover:text-[#0E3030] underline cursor-pointer shrink-0 ml-2"
                        >
                          Reset to All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conversation Thread: Render all turns in this session */}
          {hasMessages && (
            <div className="space-y-6">
              {effectiveMessages.map((turn, idx) => (
                <div key={turn.id || idx} className="space-y-4">
                  {/* User Question */}
                  <UserQuestion question={turn.question} />

                  {/* AI Response or Pending Loader */}
                  {turn.isPending ? (
                    <div className="bg-white border border-[#DDE7E2] rounded-2xl p-6 max-w-2xl shadow-xs flex items-center space-x-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#197A63] animate-ping"></span>
                      <span className="text-xs font-semibold text-[#17302F]">
                        Searching municipal vector index and extracting grounded proof...
                      </span>
                    </div>
                  ) : turn.proofData?.isNoSource ? (
                    <NoSourceAnswer
                      message={turn.proofData.message}
                      sourcesFound={turn.proofData.sourcesFound}
                      advice={turn.proofData.advice}
                      onSelectSuggestion={(q) => handleSend(q)}
                    />
                  ) : turn.proofData ? (
                    <AIAnswer
                      answerData={turn.proofData}
                      onViewProof={() => handleViewProof(turn.proofData)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Backwards compatibility: Fallback if single activeQuestion passed */}
          {!hasMessages && activeQuestion && (
            <div className="space-y-4">
              <UserQuestion question={activeQuestion} />
              {isProcessing ? (
                <div className="bg-white border border-[#DDE7E2] rounded-2xl p-6 max-w-2xl shadow-xs flex items-center space-x-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#197A63] animate-ping"></span>
                  <span className="text-xs font-semibold text-[#17302F]">
                    Searching municipal vector index and extracting grounded proof...
                  </span>
                </div>
              ) : activeProofData?.isNoSource ? (
                <NoSourceAnswer
                  message={activeProofData.message}
                  sourcesFound={activeProofData.sourcesFound}
                  advice={activeProofData.advice}
                  onSelectSuggestion={(q) => handleSend(q)}
                />
              ) : activeProofData ? (
                <AIAnswer
                  answerData={activeProofData}
                  onViewProof={() => handleViewProof(activeProofData)}
                />
              ) : null}
            </div>
          )}

          {/* Processing indicator when waiting for answer without optimistic turn */}
          {isProcessing && (!effectiveMessages.some((t) => t.isPending)) && (
            <div className="bg-white border border-[#DDE7E2] rounded-2xl p-6 max-w-2xl shadow-xs flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#197A63] animate-ping"></span>
              <span className="text-xs font-semibold text-[#17302F]">
                Searching municipal vector index and extracting grounded proof...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Fixed Chat Input */}
        <div className="mt-auto sticky bottom-0 bg-[#F7F8F5]/95 backdrop-blur-xs pt-2">
          <ChatInput
            onSendMessage={(text) => handleSend(text)}
            isProcessing={isProcessing}
          />
        </div>
      </div>

      {/* Right Document Proof Panel */}
      <ProofPanel
        isOpen={isProofOpen}
        onClose={() => setIsProofOpen(false)}
        proofData={activeProofData}
        activeCitation={activeProofData?.citation}
      />
    </div>
  );
}
