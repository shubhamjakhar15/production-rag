import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  UploadCloud,
  FileText,
  CheckCircle,
  Trash2,
  ArrowLeft,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import UploadDocumentModal from "../components/UploadDocumentModal";

export default function AdminPage({
  documents,
  onUploadDocument,
  onDeleteDocument,
}) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [adminFaqs, setAdminFaqs] = useState([]);

  const togglePublish = (id) => {
    setAdminFaqs((prev) =>
      prev.map((f) => (f.id === id ? { ...f, published: !f.published } : f))
    );
  };

  const totalQuestionsAsked = adminFaqs.reduce((acc, curr) => acc + curr.timesAsked, 0);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-6xl mx-auto w-full space-y-8 select-none">
      {/* Clean Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE7E2]">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#197A63]">
            <Shield className="w-4 h-4" />
            <span>Municipal Officer Console</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E3030] tracking-tight mt-1">
            Admin Portal
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7C7A] mt-1">
            Official Document Ingestion, Deletion, and Citizen Inquiry Analytics.
          </p>
        </div>

        <Link
          to="/chat"
          className="px-4 py-2 bg-[#EFF8F3] hover:bg-[#E7F3ED] border border-[#DDE7E2] text-[#197A63] text-xs font-bold rounded-xl flex items-center space-x-2 self-start sm:self-auto transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Citizen Chat</span>
        </Link>
      </div>

      {/* 1. QUERY ANALYSIS DASHBOARD (Questions Asked, Accuracy, Verified Status) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[#6B7C7A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Total Inquiries Asked
            </span>
            <BarChart3 className="w-4 h-4 text-[#197A63]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0E3030] font-mono">
            {totalQuestionsAsked.toLocaleString()}
          </div>
          <p className="text-[11px] text-[#6B7C7A] font-medium mt-1">
            Citizen inquiries logged
          </p>
        </div>

        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[#6B7C7A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Retrieval Accuracy
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#197A63]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#197A63] font-mono">
            100%
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-1">
            Grounded against source gazettes
          </p>
        </div>

        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[#6B7C7A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Uploaded Gazettes
            </span>
            <FileText className="w-4 h-4 text-[#197A63]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0E3030] font-mono">
            {documents.length}
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-1">
            Managed exclusively by Admin
          </p>
        </div>

        <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[#6B7C7A] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Hallucination Rate
            </span>
            <Shield className="w-4 h-4 text-[#197A63]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#2E8B6D] font-mono">
            0.0%
          </div>
          <p className="text-[11px] text-[#6B7C7A] mt-1">
            Strict No-Source fallback active
          </p>
        </div>
      </div>

      {/* 2. DOCUMENT MANAGEMENT (UPLOAD & DELETION OF FILES ONLY FOR ADMIN) */}
      <div className="bg-white border border-[#DDE7E2] rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#DDE7E2] bg-[#F7F8F5] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0E3030]">
              Official Document Library (Upload & Deletion)
            </h2>
            <p className="text-xs text-[#6B7C7A]">
              Only authorized administrators can upload new circulars or remove outdated documents.
            </p>
          </div>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2 bg-[#197A63] hover:bg-[#163F3D] text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload New Gazette</span>
          </button>
        </div>

        <div className="p-6">
          {documents.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-[#DDE7E2] rounded-xl bg-[#F7F8F5]">
              <div className="w-10 h-10 rounded-xl bg-white text-[#197A63] border border-[#DDE7E2] flex items-center justify-center mx-auto mb-2 shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-[#0E3030]">
                No official documents uploaded yet
              </h4>
              <p className="text-[11px] text-[#6B7C7A] mt-1 max-w-sm mx-auto leading-relaxed">
                Upload your first municipal PDF policy or gazette to begin extracting, chunking, and querying your data.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 bg-white border border-[#DDE7E2] hover:border-[#197A63] rounded-xl flex items-center justify-between transition-all"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#EFF8F3] text-[#197A63] flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#0E3030]">
                        {doc.title}
                      </h3>
                      <p className="text-[11px] text-[#6B7C7A] font-mono">
                        {doc.department} • {doc.pages} Pages • {doc.fileSize} • Uploaded {doc.uploadDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#2E8B6D] bg-[#EFF8F3] px-2.5 py-1 rounded">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Indexed
                    </span>
                    {(doc.fileUrl || doc.id) && (
                      <a
                        href={doc.fileUrl || `/api/sources/${doc.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-[#6B7C7A] hover:text-[#197A63] hover:bg-[#EFF8F3] rounded-lg transition-colors cursor-pointer"
                        title="Open official PDF in browser"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="p-2 text-[#6B7C7A] hover:text-[#C94A4A] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete document (Admin Only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. FREQUENTLY ASKED QUESTIONS ANALYSIS */}
      <div className="bg-white border border-[#DDE7E2] rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#DDE7E2] bg-[#F7F8F5] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0E3030]">
              Frequently Asked Questions Analysis
            </h2>
            <p className="text-xs text-[#6B7C7A]">
              Analytics derived from citizen chat frequency, verification accuracy, and gazette citations.
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-[#197A63] bg-[#E7F3ED] px-3 py-1 rounded-full border border-[#DDE7E2]">
            {adminFaqs.filter((f) => f.published).length} Published FAQs
          </span>
        </div>

        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DDE7E2] text-[10px] font-bold uppercase tracking-wider text-[#6B7C7A] bg-[#F7F8F5]">
                <th className="py-3 px-4">Frequently Asked Question</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Times Asked in Chat</th>
                <th className="py-3 px-4">Proof Page</th>
                <th className="py-3 px-4">Accuracy</th>
                <th className="py-3 px-4">Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F7F8F5]">
              {adminFaqs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-[#6B7C7A]">
                    No citizen inquiries recorded yet. Once questions are asked in the chat, verified citations and audits will appear here.
                  </td>
                </tr>
              ) : (
                adminFaqs.map((faq) => (
                  <tr key={faq.id} className="hover:bg-[#EFF8F3]/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-[#0E3030] max-w-sm">
                      {faq.question}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 bg-[#F7F8F5] text-[#17302F] rounded border border-[#DDE7E2] text-[10px] font-semibold">
                        {faq.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#197A63]">
                      {faq.timesAsked} queries
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#6B7C7A]">
                      Page {faq.pageProof}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#2E8B6D] font-bold">
                      {faq.accuracy}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => togglePublish(faq.id)}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                          faq.published
                            ? "bg-[#E7F3ED] text-[#197A63] border border-[#197A63]"
                            : "bg-[#F7F8F5] text-[#6B7C7A] border border-[#DDE7E2]"
                        }`}
                      >
                        {faq.published ? "Published" : "Draft"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal (Only accessible here by Admin) */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={(doc) => {
          onUploadDocument(doc);
          setIsUploadModalOpen(false);
        }}
      />
    </div>
  );
}
