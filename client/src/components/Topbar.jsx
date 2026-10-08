import { useUser, useAuth, SignInButton, UserButton } from "@clerk/clerk-react";
import {
  Menu,
  Shield,
  LogIn,
} from "lucide-react";
import { isUserAdmin } from "./AdminGuard";

export default function Topbar({ onToggleSidebar }) {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const isAdmin = isUserAdmin(user);

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Citizen";

  return (
    <header className="h-16 bg-white border-b border-[#DDE7E2] px-4 sm:px-6 flex items-center justify-between z-20 shrink-0 select-none">
      <div className="flex items-center space-x-3">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-[#17302F] hover:bg-[#EFF8F3] rounded-lg transition-colors cursor-pointer"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right Controls: User Profile / Authentication */}
      <div className="flex items-center space-x-3 ml-3">
        {isSignedIn ? (
          <div className="flex items-center space-x-2 pl-2 py-1 pr-1.5 bg-[#F7F8F5] border border-[#DDE7E2] rounded-xl">
            <div className="hidden sm:block text-right pr-1">
              <div className="text-xs font-bold text-[#0E3030] leading-tight">
                {displayName}
              </div>
              <div className="text-[10px] font-semibold text-[#197A63] flex items-center justify-end gap-1">
                {isAdmin ? (
                  <>
                    <Shield className="w-2.5 h-2.5 text-[#F4D35E]" />
                    <span>Officer (Admin)</span>
                  </>
                ) : (
                  <span>Citizen User</span>
                )}
              </div>
            </div>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8 rounded-lg",
                },
              }}
            />
          </div>
        ) : (
          <SignInButton mode="modal">
            <button className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#197A63] hover:bg-[#0E3030] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer">
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          </SignInButton>
        )}
      </div>
    </header>
  );
}

