import { useState } from "react";
import { Send, Lock, LogIn } from "lucide-react";
import { useAuth, useClerk, SignInButton } from "@clerk/clerk-react";

export default function ChatInput({
  onSendMessage,
  isProcessing,
}) {
  const [inputText, setInputText] = useState("");
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const handleInputClick = () => {
    if (!isSignedIn && openSignIn) {
      openSignIn();
    }
  };

  return (
    <div className="pt-2 pb-4 space-y-3">

      {/* Input Box */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white border border-[#DDE7E2] rounded-2xl shadow-xs focus-within:border-[#197A63] focus-within:ring-2 focus-within:ring-[#197A63]/15 transition-all p-2 flex items-center"
      >

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onClick={!isSignedIn ? handleInputClick : undefined}
          placeholder={
            isSignedIn
              ? "Ask another question about municipal policies..."
              : "Sign in with your citizen account to ask questions..."
          }
          disabled={isProcessing}
          className="flex-1 px-3 py-2 text-xs sm:text-sm text-[#17302F] placeholder-[#6B7C7A] bg-transparent focus:outline-none"
        />

        {isSignedIn ? (
          <button
            type="submit"
            disabled={isProcessing || !inputText.trim()}
            className="p-2.5 bg-[#197A63] hover:bg-[#163F3D] disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
            title="Send question"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <SignInButton mode="modal">
            <button
              type="button"
              className="flex items-center space-x-1.5 px-3 py-2 bg-[#197A63] hover:bg-[#0E3030] text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
              title="Sign in to ask questions"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign In to Ask</span>
            </button>
          </SignInButton>
        )}
      </form>
    </div>
  );
}

