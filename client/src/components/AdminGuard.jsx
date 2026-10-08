import { useUser, useAuth, SignInButton, SignOutButton } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Shield, ShieldAlert, ArrowLeft, Loader2, LogIn, LogOut } from "lucide-react";

export function isUserAdmin(user) {
  if (!user) return false;
  const role = user.publicMetadata?.role;
  if (role === "admin" || role === "ADMIN") return true;

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  const configuredAdmins = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (configuredAdmins.length > 0 && email && configuredAdmins.includes(email)) {
    return true;
  }

  return false;
}

export default function AdminGuard({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  // 1. Loading state
  if (!isLoaded) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#6B7C7A]">
        <Loader2 className="w-8 h-8 animate-spin text-[#197A63] mb-3" />
        <p className="text-xs font-semibold">Verifying administrative security credentials...</p>
      </div>
    );
  }

  // 2. Not signed in state
  if (!isSignedIn) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-[#DDE7E2] rounded-3xl p-8 sm:p-10 max-w-md w-full text-center shadow-lg animate-in fade-in zoom-in-95 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#0E3030] text-[#F4D35E] border-2 border-[#197A63] flex items-center justify-center mx-auto shadow-md">
            <Shield className="w-8 h-8" />
          </div>

          <div>
            <div className="inline-block px-3 py-1 rounded-full bg-[#E7F3ED] border border-[#DDE7E2] text-[#197A63] text-[11px] font-bold uppercase tracking-wider mb-2">
              Officer Clearance Required
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0E3030] tracking-tight">
              Admin Portal
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7C7A] mt-2 leading-relaxed">
              This area is restricted to authorized municipal officers. Document uploads, version control, and vector index audits require sign-in.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <SignInButton mode="modal">
              <button className="w-full py-3 px-4 bg-[#197A63] hover:bg-[#0E3030] text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center space-x-2">
                <LogIn className="w-4 h-4" />
                <span>Sign In with Clerk</span>
              </button>
            </SignInButton>

            <Link
              to="/chat"
              className="w-full py-2.5 px-4 bg-[#F7F8F5] hover:bg-[#EFF8F3] border border-[#DDE7E2] text-[#17302F] text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Public Citizen Chat</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Signed in, but NOT an admin
  const userIsAdmin = isUserAdmin(user);

  if (!userIsAdmin) {
    const userEmail = user?.primaryEmailAddress?.emailAddress || "Current Account";

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center shadow-lg animate-in fade-in zoom-in-95 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 border-2 border-red-200 flex items-center justify-center mx-auto shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div>
            <div className="inline-block px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold uppercase tracking-wider mb-2">
              403 Forbidden
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0E3030] tracking-tight">
              Access Restricted
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7C7A] mt-2 leading-relaxed">
              Signed in as <span className="font-semibold text-[#17302F]">{userEmail}</span>.
              This account does not have municipal officer or administrator credentials.
            </p>
          </div>

          <div className="p-3.5 bg-[#F7F8F5] border border-[#DDE7E2] rounded-xl text-left text-xs text-[#6B7C7A] space-y-1">
            <p className="font-semibold text-[#17302F]">How to gain admin access:</p>
            <p>1. In Clerk Dashboard: set user metadata <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-[#197A63]">role: &quot;admin&quot;</code></p>
            <p>2. Or add your email to <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-[#197A63]">VITE_ADMIN_EMAILS</code> in your environment file.</p>
          </div>

          <div className="space-y-2.5 pt-2">
            <Link
              to="/chat"
              className="w-full py-2.5 px-4 bg-[#197A63] hover:bg-[#0E3030] text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Public Citizen Chat</span>
            </Link>

            <SignOutButton>
              <button className="w-full py-2.5 px-4 bg-[#F7F8F5] hover:bg-red-50 hover:text-red-700 border border-[#DDE7E2] text-[#6B7C7A] text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1.5">
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out / Switch Account</span>
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized admin
  return children;
}
