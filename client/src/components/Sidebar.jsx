import { Link, useLocation } from "react-router-dom";
import { useAuth, useUser, useClerk, SignInButton } from "@clerk/clerk-react";
import { isUserAdmin } from "./AdminGuard";
import {
  MessageSquare,
  FileText,
  Building2,
  ShieldCheck,
  Shield,
  ChevronRight,
  X,
  FileCheck,
  Plus,
  Trash2,
  Lock,
  LogIn,
} from "lucide-react";

export default function Sidebar({
  previousChats = [],
  onSelectPreviousChat,
  isOpen,
  onClose,
  activeChatId,
  onNewChat,
  onDeleteChat,
}) {
  const location = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const isAdmin = isUserAdmin(user);

  const navLinks = [
    { path: "/chat", label: "Chat", icon: MessageSquare },
    { path: "/documents", label: "Documents", icon: FileText },
    { path: "/departments", label: "Departments", icon: Building2, badge: "Private" },
    { path: "/admin", label: "Admin Portal", icon: Shield, badge: "Private" },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-[#0E3030]/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-[280px] bg-[#0E3030] text-[#EFF8F3] flex flex-col justify-between transition-transform duration-300 ease-in-out border-r border-[#163F3D] select-none ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Top Header: CivicLens Brand */}
        <div>
          <div className="p-5 border-b border-[#163F3D] flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-xl bg-[#197A63] text-white flex items-center justify-center shadow-sm group-hover:bg-[#163F3D] transition-colors">
                <ShieldCheck className="w-5 h-5 text-[#F4D35E]" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <h1 className="font-bold text-base tracking-tight text-white">
                    CivicLens
                  </h1>
                  <span className="text-[10px] font-semibold bg-[#197A63]/50 text-[#F4D35E] px-1.5 py-0.5 rounded border border-[#197A63]">
                    Verified
                  </span>
                </div>
                <p className="text-[11px] text-[#A2B8B5] leading-tight font-medium">
                  Policy Answers. Verified Sources.
                </p>
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-[#A2B8B5] hover:text-white hover:bg-[#163F3D] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Navigation Links */}
          <nav className="p-3 space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-[#197A63] text-white shadow-sm font-bold"
                      : "text-[#A2B8B5] hover:text-white hover:bg-[#163F3D]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#F4D35E]" : "text-[#6B7C7A]"}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-mono text-[#F4D35E] bg-[#163F3D] px-1.5 py-0.5 rounded border border-[#197A63]/40">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* PREVIOUS CHATS: Persistent Conversations & Citation History */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 mt-2">
          {onNewChat && (
            <button
              type="button"
              onClick={() => {
                if (isLoaded && !isSignedIn) {
                  if (openSignIn) openSignIn();
                  return;
                }
                onNewChat();
                if (window.innerWidth < 1024) onClose();
              }}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-[#197A63] hover:bg-[#163F3D] text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer mb-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Policy Query</span>
            </button>
          )}

          <div className="px-2 pt-1 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A2B8B5]">
              Previous Chats
            </span>
            {!isLoaded ? (
              <span className="text-[10px] font-mono text-[#A2B8B5] bg-[#163F3D] px-1.5 py-0.5 rounded">
                ...
              </span>
            ) : !isSignedIn ? (
              <span className="text-[10px] font-mono text-[#F4D35E] bg-[#163F3D] px-1.5 py-0.5 rounded flex items-center space-x-1">
                <Lock className="w-2.5 h-2.5 mr-0.5 inline" />
                <span>Locked</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono text-[#F4D35E] bg-[#163F3D] px-1.5 py-0.5 rounded">
                {previousChats.length} {previousChats.length === 1 ? "Query" : "Queries"}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {!isLoaded ? (
              <div className="p-3 rounded-xl bg-[#163F3D]/30 border border-[#163F3D] text-left animate-pulse">
                <p className="text-[11px] text-[#A2B8B5]">Loading chat history...</p>
              </div>
            ) : !isSignedIn ? (
              <div className="p-3.5 rounded-xl bg-[#163F3D]/40 border border-[#163F3D] text-center space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#163F3D] text-[#F4D35E] flex items-center justify-center mx-auto shadow-xs border border-[#197A63]/30">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white tracking-tight">Citizen Sign-In Required</p>
                  <p className="text-[10px] text-[#A2B8B5] mt-1 leading-snug">
                    Previous policy queries and citations are restricted to authenticated citizen accounts.
                  </p>
                </div>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center space-x-1.5 px-3 py-2 bg-[#197A63] hover:bg-[#163F3D] text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Access</span>
                  </button>
                </SignInButton>
              </div>
            ) : previousChats.length === 0 ? (
              <div className="p-3 rounded-xl bg-[#163F3D]/40 border border-[#163F3D] text-left">
                <p className="text-[11px] text-[#A2B8B5]">No previous queries yet.</p>
                <p className="text-[10px] text-[#6B7C7A] mt-0.5">Verified citations will appear here as you ask questions.</p>
              </div>
            ) : (
              previousChats.map((chat) => {
                const isSelected = activeChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    onClick={() => {
                      onSelectPreviousChat(chat);
                      if (window.innerWidth < 1024) onClose();
                    }}
                    className={`p-3 rounded-xl cursor-pointer transition-all border text-left group relative ${
                      isSelected
                        ? "bg-[#163F3D] border-[#197A63] shadow-xs"
                        : "bg-[#0E3030]/80 border-[#163F3D]/60 hover:bg-[#163F3D]/70 hover:border-[#197A63]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p
                        className={`text-xs font-medium leading-snug line-clamp-1 pr-6 ${
                          isSelected ? "text-[#F4D35E] font-semibold" : "text-white group-hover:text-[#EFF8F3]"
                        }`}
                      >
                        {chat.shortTitle || chat.question}
                      </p>
                      {onDeleteChat ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id, e);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-[#A2B8B5] transition-opacity p-0.5 rounded hover:bg-[#0E3030] absolute right-2.5 top-2.5 cursor-pointer"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#6B7C7A] group-hover:text-white shrink-0 mt-0.5 ml-1" />
                      )}
                    </div>

                    {/* Metadata display: Document Name, Page, Paragraph */}
                    <div className="mt-1.5 flex items-center space-x-1.5 text-[11px] text-[#A2B8B5]">
                      <FileCheck className="w-3 h-3 text-[#197A63] shrink-0" />
                      <span className="truncate max-w-[140px] text-slate-200">
                        {chat.document || "Official Municipal Document"}
                      </span>
                    </div>

                    <div className="mt-1 text-[10px] font-mono text-[#F4D35E]/90 flex items-center space-x-2">
                      <span>Page {chat.page || 1}</span>
                      <span>•</span>
                      <span>{chat.paragraph || "Directive"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

