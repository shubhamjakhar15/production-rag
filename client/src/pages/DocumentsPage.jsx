import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/clerk-react";
import {
  FileText,
  Search,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { departmentsList } from "../data/mockCivicData";

export default function DocumentsPage({
  documents,
  onSelectDocumentForChat,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("All");
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.authority.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.summary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept =
      selectedDeptFilter === "All" || doc.department === selectedDeptFilter;
    return matchesSearch && matchesDept;
  });

  const handleAskAboutDoc = (doc) => {
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    if (onSelectDocumentForChat) {
      onSelectDocumentForChat(doc);
    }
    navigate("/chat");
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[#DDE7E2]">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#197A63]">
          <ShieldCheck className="w-4 h-4" />
          <span>Verified Source Corpora</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0E3030] tracking-tight mt-1">
          Municipal Knowledge Base
        </h1>
        <p className="text-xs sm:text-sm text-[#6B7C7A] mt-1">
          Official documents used by CivicLens to answer policy questions.
        </p>
      </div>

      {/* Search and Department Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#6B7C7A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search documents by title, circular, or keywords..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#DDE7E2] rounded-xl text-xs sm:text-sm text-[#17302F] placeholder-[#6B7C7A] focus:outline-none focus:border-[#197A63]"
          />
        </div>

        {/* Department Filter Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none py-1">
          <button
            onClick={() => setSelectedDeptFilter("All")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
              selectedDeptFilter === "All"
                ? "bg-[#0E3030] text-white"
                : "bg-white border border-[#DDE7E2] text-[#6B7C7A] hover:text-[#17302F]"
            }`}
          >
            All ({documents.length})
          </button>
          {departmentsList.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDeptFilter(d.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                selectedDeptFilter === d.name
                  ? "bg-[#197A63] text-white"
                  : "bg-white border border-[#DDE7E2] text-[#6B7C7A] hover:text-[#17302F]"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Document Cards Grid / Empty States */}
      {documents.length === 0 ? (
        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs my-8">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF8F3] text-[#197A63] flex items-center justify-center mx-auto mb-4 border border-[#DDE7E2]">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0E3030]">No Municipal Documents Yet</h3>
          <p className="text-xs sm:text-sm text-[#6B7C7A] mt-2 leading-relaxed">
            You haven't uploaded any municipal policies or circulars yet. Upload PDF gazettes via the Admin Portal to begin testing grounded queries.
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate("/admin")}
              className="px-5 py-2.5 bg-[#197A63] hover:bg-[#163F3D] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center space-x-2 cursor-pointer shadow-xs"
            >
              <span>Go to Admin Portal & Upload</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-8 text-center max-w-md mx-auto shadow-xs my-8">
          <p className="text-sm font-semibold text-[#0E3030]">No matching documents found</p>
          <p className="text-xs text-[#6B7C7A] mt-1">Try clearing your search query or department filter.</p>
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedDeptFilter("All");
            }}
            className="mt-4 px-3.5 py-1.5 bg-[#EFF8F3] text-[#197A63] hover:bg-[#E7F3ED] border border-[#DDE7E2] rounded-lg text-xs font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-[#DDE7E2] hover:border-[#197A63] rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Card Top Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EFF8F3] text-[#197A63] border border-[#DDE7E2] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E7F3ED] text-[#197A63] px-2 py-0.5 rounded border border-[#DDE7E2]">
                      {doc.department}
                    </span>
                    <span className="text-[10px] font-mono text-[#2E8B6D] bg-[#EFF8F3] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                      <CheckCircle className="w-3 h-3 text-[#2E8B6D]" />
                      Ready
                    </span>
                  </div>
                </div>

                {/* Title & Metadata */}
                <h3 className="text-sm font-bold text-[#0E3030] group-hover:text-[#197A63] leading-snug">
                  {doc.title}
                </h3>
                <p className="text-[11px] text-[#6B7C7A] font-mono mt-1">
                  {doc.authority}
                </p>
                <p className="text-xs text-[#6B7C7A] mt-2 line-clamp-2 leading-relaxed">
                  {doc.summary}
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 pt-3 border-t border-[#F7F8F5] flex items-center justify-between text-[11px]">
                <div className="text-[#6B7C7A] font-mono">
                  <span>{doc.pages} pages</span>
                  <span className="mx-1.5">•</span>
                  <span>{doc.fileSize}</span>
                </div>

                <div className="flex items-center space-x-2">
                  {(doc.fileUrl || doc.id) && (
                    <a
                      href={doc.fileUrl || `/api/sources/${doc.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#6B7C7A] hover:text-[#197A63] hover:bg-[#EFF8F3] rounded-lg transition-colors cursor-pointer"
                      title="Open official PDF in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => handleAskAboutDoc(doc)}
                    className="px-3 py-1.5 bg-[#EFF8F3] hover:bg-[#197A63] text-[#197A63] hover:text-white rounded-lg font-semibold transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Ask Policy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
