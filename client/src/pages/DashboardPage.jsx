import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShieldCheck, ArrowRight, Lock } from "lucide-react";
import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { isUserAdmin } from "../components/AdminGuard";
import { departmentsList } from "../data/mockCivicData";
import { fetchDashboardStats } from "../services/api";

export default function DashboardPage({ onAskQuestion, documents = [] }) {
  const [queryInput, setQueryInput] = useState("");
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const isAdmin = isUserAdmin(user);
  const [stats, setStats] = useState({
    totalDocuments: documents.length || 0,
    totalVersions: 0,
    activeDocuments: documents.length || 0,
    accuracy: "100%",
  });
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    fetchDashboardStats()
      .then((res) => {
        if (isMounted && res.success && res.data) {
          setStats({
            totalDocuments: res.data.totalDocuments ?? (documents.length || 0),
            totalVersions: res.data.totalVersions ?? 0,
            activeDocuments: res.data.activeDocuments ?? (documents.length || 0),
            accuracy: "100%",
          });
        }
      })
      .catch((err) => {
        console.warn("Could not fetch live dashboard stats:", err.message);
      });

  return () => {
      isMounted = false;
    };
  }, [documents.length]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    onAskQuestion(queryInput.trim());
    navigate("/chat");
  };

  const docCount = stats.totalDocuments || documents.length || 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#E7F3ED] border border-[#DDE7E2] text-[#197A63] text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Source-Grounded Municipal Intelligence</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#0E3030] tracking-tight leading-tight">
          Ask the policy. <br className="hidden sm:block" />
          <span className="text-[#197A63]">Get the source.</span>
        </h1>

        <p className="text-xs sm:text-sm md:text-base text-[#6B7C7A] max-w-2xl mx-auto leading-relaxed">
          Search municipal schemes, circulars and policies — with every answer backed by official document evidence.
        </p>

        {/* Large Central Search Input */}
        <form
          onSubmit={handleSearch}
          className="pt-2 max-w-2xl mx-auto relative flex items-center shadow-lg shadow-[#0E3030]/5 rounded-2xl"
        >
          <div className="absolute left-4 text-[#6B7C7A] pointer-events-none">
            <Search className="w-5 h-5 text-[#197A63]" />
          </div>
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask any question about your uploaded municipal policies and circulars..."
            className="w-full pl-12 pr-28 py-3.5 sm:py-4 bg-white border-2 border-[#DDE7E2] focus:border-[#197A63] rounded-2xl text-xs sm:text-sm text-[#17302F] placeholder-[#6B7C7A] focus:outline-none focus:ring-4 focus:ring-[#197A63]/10 transition-all font-medium"
          />
          <button
            type="submit"
            className="absolute right-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#197A63] hover:bg-[#0E3030] text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
          >
            <span>Search</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {!isSignedIn && (
          <div className="flex items-center justify-center pt-1">
            <span className="inline-flex items-center space-x-1.5 text-xs text-[#6B7C7A] bg-[#EFF8F3] px-3.5 py-1 rounded-full border border-[#DDE7E2]">
              <Lock className="w-3 h-3 text-[#197A63]" />
              <span>Sign in required to ask questions and view verified proofs</span>
            </span>
          </div>
        )}

        {/* Quick Access Department Pills */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7C7A] mr-1">
            Quick Access:
          </span>
          {departmentsList.slice(0, 6).map((dept) => (
            <button
              key={dept.id}
              onClick={() => {
                if (isAdmin) {
                  navigate("/departments");
                } else {
                  if (!isSignedIn && openSignIn) {
                    openSignIn();
                    return;
                  }
                  onAskQuestion(`What are the official municipal policies and guidelines under ${dept.name}?`, dept.name);
                  navigate("/chat");
                }
              }}
              className="px-3 py-1 bg-white hover:bg-[#EFF8F3] border border-[#DDE7E2] hover:border-[#197A63] rounded-full text-xs font-medium text-[#17302F] transition-colors cursor-pointer"
            >
              {dept.name}
            </button>
          ))}
        </div>
      </div>

      {/* Statistics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 text-center shadow-xs">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0E3030] font-mono">
            {docCount}
          </div>
          <div className="text-xs font-bold text-[#17302F] uppercase tracking-wider mt-1">
            Municipal Documents
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-0.5">
            Active indexed circulars
          </p>
        </div>

        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 text-center shadow-xs">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#197A63] font-mono">
            {stats.totalVersions || docCount}
          </div>
          <div className="text-xs font-bold text-[#17302F] uppercase tracking-wider mt-1">
            Indexed Versions & Chunks
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-0.5">
            Active vector entries
          </p>
        </div>

        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 text-center shadow-xs">
          <div className="text-2xl sm:text-3xl font-extrabold text-[#2E8B6D] font-mono">
            100%
          </div>
          <div className="text-xs font-bold text-[#17302F] uppercase tracking-wider mt-1">
            Strict Grounding Guard
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-0.5">
            Anti-hallucination threshold
          </p>
        </div>
      </div>
    </div>
  );
}


