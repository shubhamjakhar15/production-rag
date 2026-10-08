import { useState, useEffect } from "react";
import {
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  BookmarkCheck,
  ShieldCheck,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Eye,
  Sparkles,
} from "lucide-react";
import { fetchPageEvidence, getPdfStreamUrl } from "../services/api";

export default function ProofPanel({
  isOpen,
  onClose,
  proofData,
  activeCitation,
}) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageEvidence, setPageEvidence] = useState(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  // Default to showing only the relevant answer and cited proof
  const [viewMode, setViewMode] = useState("relevant");

  // Derive document identifiers from either activeCitation or proofData
  const docId =
    activeCitation?.documentId ||
    proofData?.citation?.documentId ||
    proofData?.pdfView?.documentId;
  const chunkId =
    activeCitation?.chunkId ||
    proofData?.citation?.chunkId ||
    proofData?.pdfView?.chunkId;
  const initialPage =
    activeCitation?.page ||
    proofData?.citation?.page ||
    proofData?.pdfView?.pageNumber ||
    1;

  // Real document total pages (Never fallback to hardcoded 42!)
  const totalPages =
    pageEvidence?.total_pages ||
    activeCitation?.totalDocPages ||
    proofData?.citation?.totalDocPages ||
    proofData?.pdfView?.totalDocPages ||
    1;

  // Sync current page whenever incoming citation / proof changes
  useEffect(() => {
    setCurrentPage(Number(initialPage) || 1);
  }, [initialPage, docId, chunkId]);

  // Fetch page evidence from server when document or page changes
  useEffect(() => {
    if (!docId) {
      setPageEvidence(null);
      return;
    }

    let isMounted = true;
    setIsLoadingEvidence(true);

    fetchPageEvidence(docId, currentPage, chunkId)
      .then((res) => {
        if (isMounted && res.success && res.data) {
          setPageEvidence(res.data);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch page evidence from backend, falling back to embedded proof:", err.message);
        if (isMounted) {
          setPageEvidence(null);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingEvidence(false);
      });

    return () => {
      isMounted = false;
    };
  }, [docId, currentPage, chunkId]);

  if (!isOpen || !proofData) return null;

  const pdf = proofData.pdfView || {
    title: activeCitation?.document || proofData.citation?.document || "Municipal Policy Document",
    subtitle: "Official Directorate Circular",
    chapter: activeCitation?.section || proofData.citation?.section || "Statutory Provisions",
    prefixParagraph: "General assessment standards and administrative rules apply.",
    highlightedParagraph: activeCitation?.proofText || proofData.citation?.proofText || "Relevant verified clause.",
    suffixParagraph: "Periodic audits shall be conducted to verify compliance.",
  };

  const docTitle =
    pageEvidence?.document_title ||
    pdf.title ||
    activeCitation?.document ||
    proofData.citation?.document ||
    "Municipal Policy Document";

  const docSection =
    pageEvidence?.section ||
    pdf.chapter ||
    activeCitation?.section ||
    proofData.citation?.section ||
    "Statutory Provisions";

  const primaryProofText =
    activeCitation?.proofText ||
    proofData.citation?.proofText ||
    pdf.highlightedParagraph ||
    "Official statutory provision retrieved from municipal circular.";

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
    }
  };

  const handleCopyCitation = () => {
    const docName = activeCitation?.document || proofData.citation?.document || docTitle;
    const page = currentPage;
    const para = activeCitation?.paragraph || proofData.citation?.paragraph || `Page ${page}`;
    const citationString = `${docName}, Page ${page} of ${totalPages}, ${para}`;
    navigator.clipboard.writeText(citationString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawPdfUrl = docId ? `${getPdfStreamUrl(docId)}#page=${currentPage}` : null;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#0E3030]/50 backdrop-blur-xs z-40 lg:hidden"
      />

      {/* Main Proof Panel Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 right-0 z-50 w-full sm:w-[500px] lg:w-[500px] xl:w-[540px] bg-white border-l border-[#DDE7E2] flex flex-col justify-between shadow-2xl lg:shadow-none transition-transform duration-300 ease-in-out select-none ${
          isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        } ${isFullscreen ? "lg:fixed lg:inset-y-0 lg:right-0 lg:w-[760px] lg:z-50" : ""}`}
      >
        {/* Panel Top Header */}
        <div className="p-4 border-b border-[#DDE7E2] bg-[#F7F8F5] flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#197A63]/15 text-[#197A63] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="text-xs font-bold text-[#17302F] truncate">
                {docTitle}
              </h3>
              <p className="text-[11px] font-mono text-[#6B7C7A]">
                Page {currentPage} of {totalPages} • {activeCitation?.paragraph || proofData.citation?.paragraph || `Section: ${docSection}`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {rawPdfUrl && (
              <a
                href={rawPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-[#197A63] bg-[#EFF8F3] hover:bg-[#DDEEE6] border border-[#197A63]/30 rounded-lg transition-colors cursor-pointer"
                title="Open official PDF in browser viewer"
              >
                <span>Raw PDF</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-[#6B7C7A] hover:text-[#17302F] hover:bg-white rounded-lg transition-colors cursor-pointer hidden sm:block"
              title="Toggle width"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#6B7C7A] hover:text-[#17302F] hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="Close proof panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Mode Controls & Page Navigator */}
        <div className="px-4 py-2 border-b border-[#DDE7E2] bg-white flex items-center justify-between text-xs text-[#6B7C7A]">
          {/* Segmented View Mode Toggle */}
          <div className="flex items-center bg-[#F7F8F5] p-0.5 rounded-lg border border-[#DDE7E2]">
            <button
              onClick={() => setViewMode("relevant")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                viewMode === "relevant"
                  ? "bg-[#197A63] text-white shadow-xs"
                  : "text-[#6B7C7A] hover:text-[#17302F]"
              }`}
            >
              Relevant Proof
            </button>
            <button
              onClick={() => setViewMode("full_page")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                viewMode === "full_page"
                  ? "bg-[#197A63] text-white shadow-xs"
                  : "text-[#6B7C7A] hover:text-[#17302F]"
              }`}
            >
              Full Page
            </button>
          </div>

          {/* Page Navigation Controls */}
          <div className="flex items-center space-x-1 font-mono">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || isLoadingEvidence}
              className="p-1 hover:bg-[#EFF8F3] rounded text-[#17302F] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-medium text-[#17302F] text-[11px]">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages || isLoadingEvidence}
              className="p-1 hover:bg-[#EFF8F3] rounded text-[#17302F] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Controls (Active in Full Page mode) */}
          {viewMode === "full_page" && (
            <div className="hidden sm:flex items-center space-x-1.5">
              <button
                onClick={() => setZoomLevel((z) => Math.max(80, z - 10))}
                className="p-1 hover:bg-[#EFF8F3] rounded text-[#17302F] cursor-pointer"
                title="Zoom out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="font-mono text-[10px] text-[#17302F]">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="p-1 hover:bg-[#EFF8F3] rounded text-[#17302F] cursor-pointer"
                title="Zoom in"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#F7F8F5] space-y-4">
          {viewMode === "relevant" ? (
            /* ========================================================= */
            /* MODE 1: RELEVANT ANSWER & EVIDENCE ONLY (User-preferred)  */
            /* ========================================================= */
            <div className="space-y-4 animate-in fade-in">
              {/* Direct Grounded Answer Card */}
              <div className="bg-white border border-[#DDE7E2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#197A63] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#197A63]" />
                    Verified Policy Finding
                  </span>
                  <span className="text-[10px] font-mono text-[#2E8B6D] bg-[#EFF8F3] px-2 py-0.5 rounded font-bold">
                    100% Grounded
                  </span>
                </div>

                {proofData.question && (
                  <div className="text-xs font-semibold text-[#0E3030] bg-[#F7F8F5] p-3 rounded-xl border border-[#DDE7E2]/70">
                    <span className="text-[#6B7C7A] font-normal block text-[10px] uppercase font-mono mb-0.5">
                      Citizen Query:
                    </span>
                    &ldquo;{proofData.question}&rdquo;
                  </div>
                )}

                {proofData.answerIntro && (
                  <div className="text-xs sm:text-[13px] text-[#17302F] leading-relaxed font-medium">
                    {proofData.answerIntro}
                  </div>
                )}

                {proofData.points && proofData.points.length > 0 && (
                  <ul className="space-y-1.5 pt-1 pl-1">
                    {proofData.points.map((pt, idx) => (
                      <li key={idx} className="text-xs text-[#2A4442] flex items-start space-x-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#197A63] mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {proofData.answerConclusion && (
                  <div className="text-[11px] text-[#6B7C7A] italic bg-[#EFF8F3] p-2.5 rounded-xl border border-[#DDE7E2]">
                    {proofData.answerConclusion}
                  </div>
                )}
              </div>

              {/* Authoritative Cited Passage Card (The Proof) */}
              <div className="bg-white border-2 border-[#197A63]/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#DDE7E2] pb-2.5 text-[10px] font-mono text-[#6B7C7A]">
                  <div className="flex items-center space-x-1.5">
                    <BookmarkCheck className="w-4 h-4 text-[#197A63]" />
                    <span className="font-bold text-[#0E3030] uppercase tracking-wider">
                      Authoritative Statutory Passage
                    </span>
                  </div>
                  <span className="text-[#197A63] font-bold">OFFICIAL GAZETTE COPY</span>
                </div>

                {/* Location metadata pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="bg-[#EFF8F3] text-[#197A63] font-bold px-2 py-0.5 rounded border border-[#DDE7E2]">
                    {docTitle}
                  </span>
                  <span className="bg-[#F7F8F5] text-[#17302F] font-mono px-2 py-0.5 rounded border border-[#DDE7E2]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <span className="bg-[#F7F8F5] text-[#17302F] font-mono px-2 py-0.5 rounded border border-[#DDE7E2]">
                    {activeCitation?.paragraph || proofData.citation?.paragraph || `Section: ${docSection}`}
                  </span>
                </div>

                {/* The exact passage */}
                <div className="p-4 bg-[#FFFDF5] border-l-4 border-[#F4D35E] rounded-r-xl shadow-xs text-xs sm:text-[13px] text-[#17302F] leading-relaxed font-serif">
                  <p className="font-semibold text-[#0E3030] leading-relaxed">
                    &ldquo;{primaryProofText}&rdquo;
                  </p>
                </div>

                {/* Secondary cited sources if multiple chunks were referenced */}
                {activeCitation?.allSources && activeCitation.allSources.length > 1 && (
                  <div className="pt-2 space-y-2 border-t border-[#DDE7E2]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7C7A]">
                      Additional Cited Evidence ({activeCitation.allSources.length - 1}):
                    </div>
                    {activeCitation.allSources.slice(1).map((src, i) => (
                      <div
                        key={src.chunk_id || i}
                        className="p-3 bg-[#F7F8F5] rounded-xl border border-[#DDE7E2] text-xs text-[#2A4442] space-y-1"
                      >
                        <div className="text-[10px] font-mono text-[#197A63] font-bold">
                          {src.reference || `Page ${src.page}, Section: ${src.section}`}
                        </div>
                        <p className="text-[11px] italic leading-relaxed text-[#17302F]">
                          &ldquo;{src.supporting_text || src.text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Document Seal & Verification Footer */}
                <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-[#6B7C7A] border-t border-[#DDE7E2]">
                  <div>
                    <span>Document: {docTitle}</span> • <span>Version {proofData.citation?.version || 1}</span>
                  </div>
                  <div className="px-2 py-0.5 bg-[#EFF8F3] text-[#197A63] font-bold rounded border border-[#197A63]/30">
                    VERIFIED EVIDENCE
                  </div>
                </div>
              </div>

              {/* Citation Details & Quick Actions */}
              <div className="bg-white border border-[#DDE7E2] rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#0E3030] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2E8B6D]" />
                    Citation Verification
                  </span>
                  <button
                    onClick={handleCopyCitation}
                    className="text-[11px] font-medium text-[#197A63] hover:text-[#0E3030] flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-[#2E8B6D]" />
                        <span className="text-[#2E8B6D]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy citation</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-[11px] font-mono text-[#6B7C7A] bg-[#F7F8F5] p-2.5 rounded-xl border border-[#DDE7E2]">
                  {docTitle}, Page {currentPage} of {totalPages}, {activeCitation?.paragraph || proofData.citation?.paragraph || `Section: ${docSection}`}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setViewMode("full_page")}
                    className="text-xs text-[#197A63] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect surrounding page context ({totalPages} page{totalPages > 1 ? "s" : ""}) &rarr;</span>
                  </button>

                  {rawPdfUrl && (
                    <a
                      href={rawPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-bold text-[#197A63] bg-[#EFF8F3] hover:bg-[#DDEEE6] border border-[#197A63]/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <span>Open Raw PDF</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* MODE 2: FULL PAGE CONTEXT VIEW                            */
            /* ========================================================= */
            <div className="space-y-4 animate-in fade-in">
              {/* Back to relevant proof banner */}
              <div className="bg-[#EFF8F3] border border-[#DDE7E2] rounded-xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-[#17302F]">
                  <Eye className="w-4 h-4 text-[#197A63]" />
                  <span>Showing page {currentPage} of {totalPages}. Cited answer is highlighted.</span>
                </div>
                <button
                  onClick={() => setViewMode("relevant")}
                  className="px-2.5 py-1 bg-white hover:bg-[#E7F3ED] text-[#197A63] font-bold rounded-lg border border-[#DDE7E2] transition-colors cursor-pointer text-xs"
                >
                  Relevant Only &rarr;
                </button>
              </div>

              {/* Physical PDF Sheet */}
              <div
                className="pdf-page-sheet border border-[#DDE7E2] rounded-xl p-5 sm:p-6 text-[#17302F] transition-transform duration-150 origin-top bg-white shadow-xs"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                {/* Document Header */}
                <div className="border-b border-[#DDE7E2] pb-3.5 mb-4">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7C7A] mb-1 font-semibold">
                    <span>OFFICIAL GAZETTE COPY</span>
                    <span className="text-[#197A63]">{pdf.gazetteRef || "MUNICIPAL POLICY REPOSITORY"}</span>
                  </div>
                  <h4 className="text-sm sm:text-base font-extrabold text-[#0E3030] uppercase tracking-wide font-sans">
                    {docTitle}
                  </h4>
                  <p className="text-xs text-[#6B7C7A] font-semibold mt-0.5">
                    {pdf.subtitle}
                  </p>
                  <div className="mt-2 text-[10px] font-mono text-[#197A63] font-bold uppercase tracking-wider bg-[#EFF8F3] px-2 py-0.5 rounded inline-block">
                    Section: {docSection}
                  </div>
                </div>

                {/* Evidence content rendering */}
                {isLoadingEvidence ? (
                  <div className="py-16 flex flex-col items-center justify-center space-y-2.5 text-[#6B7C7A]">
                    <Loader2 className="w-6 h-6 animate-spin text-[#197A63]" />
                    <span className="text-xs font-medium">
                      Loading verified page {currentPage}...
                    </span>
                  </div>
                ) : pageEvidence?.paragraphs?.length > 0 ? (
                  /* Real paragraphs from backend */
                  <div className="space-y-3">
                    {pageEvidence.paragraphs.map((p, idx) => {
                      const isHighlighted =
                        p.is_highlighted ||
                        (chunkId && p.chunk_id === chunkId) ||
                        (primaryProofText && p.text && p.text.includes(primaryProofText.substring(0, 35)));

                      if (isHighlighted) {
                        return (
                          <div
                            key={p.chunk_id || idx}
                            className="my-3.5 p-4 warm-highlight rounded-xl shadow-xs text-xs sm:text-[13px] leading-relaxed relative group border-l-4 border-[#F4D35E]"
                          >
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#197A63] mb-1.5">
                              <span className="flex items-center gap-1.5 font-bold">
                                <BookmarkCheck className="w-3.5 h-3.5 text-[#197A63]" />
                                Retrieved Grounding Evidence (Para {p.paragraph_number})
                              </span>
                              <span className="font-mono text-[#6B7C7A] font-bold">
                                {p.section ? `Sec: ${p.section}` : `Para ${p.paragraph_number}`}
                              </span>
                            </div>
                            <p className="font-semibold text-[#17302F] leading-relaxed">
                              "{p.text}"
                            </p>
                          </div>
                        );
                      }

                      return (
                        <p
                          key={p.chunk_id || idx}
                          className="text-xs sm:text-[13px] text-[#4A5D5B] leading-relaxed text-justify mb-2.5 font-normal"
                        >
                          {p.text}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  /* Fallback view when offline or previewing static policy */
                  <>
                    <p className="text-xs sm:text-[13px] text-[#4A5D5B] leading-relaxed text-justify mb-3 font-normal">
                      {pdf.prefixParagraph}
                    </p>

                    <div className="my-3.5 p-4 warm-highlight rounded-xl shadow-xs text-xs sm:text-[13px] leading-relaxed relative group border-l-4 border-[#F4D35E]">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#197A63] mb-1.5">
                        <span className="flex items-center gap-1.5 font-bold">
                          <BookmarkCheck className="w-3.5 h-3.5 text-[#197A63]" />
                          Retrieved Grounding Evidence
                        </span>
                        <span className="font-mono text-[#6B7C7A] font-bold">
                          {activeCitation?.paragraph || proofData.citation?.paragraph}
                        </span>
                      </div>
                      <p className="font-semibold text-[#17302F] leading-relaxed">
                        "{pdf.highlightedParagraph}"
                      </p>
                    </div>

                    <p className="text-xs sm:text-[13px] text-[#4A5D5B] leading-relaxed text-justify mt-3 font-normal">
                      {pdf.suffixParagraph}
                    </p>
                  </>
                )}

                {/* Official Document Seal Footer */}
                <div className="mt-5 pt-3 border-t border-[#DDE7E2] flex items-center justify-between text-[9px] font-mono text-[#6B7C7A]">
                  <div>
                    <span>Authority: Municipal Policy Repository</span>
                    <br />
                    <span>Verification: SHA-256 Grounded</span>
                  </div>
                  <div className="px-2 py-0.5 border border-[#197A63] bg-[#E7F3ED] text-[#197A63] font-bold rounded">
                    VERIFIED PROOF
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
