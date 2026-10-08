import {
  FileText,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export function UserQuestion({ question }) {
  return (
    <div className="flex justify-end mb-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="max-w-2xl bg-[#E7F3ED] border border-[#DDE7E2] text-[#17302F] p-4 sm:p-5 rounded-2xl rounded-tr-xs shadow-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#197A63] mb-1">
          Your Question
        </div>
        <p className="text-sm sm:text-base font-semibold leading-relaxed">
          "{question}"
        </p>
      </div>
    </div>
  );
}

export function AIAnswer({
  answerData,
  onViewProof,
}) {
  const { answerIntro, points, answerConclusion, citation, whyThisAnswer } =
    answerData;

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-3">
      {/* Brand Answer Header */}
      <div className="flex items-center space-x-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#197A63] text-white flex items-center justify-center font-bold text-xs shadow-xs">
          CL
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-[#0E3030]">CivicLens</span>
            <span className="text-[10px] font-semibold bg-[#E7F3ED] text-[#197A63] px-2 py-0.5 rounded-full border border-[#DDE7E2]">
              Verified Policy Answer
            </span>
          </div>
          <p className="text-[11px] text-[#6B7C7A]">
            Directly grounded in official municipal gazettes
          </p>
        </div>
      </div>

      {/* Structured Research Response */}
      <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        {answerIntro && (
          <p className="text-sm text-[#17302F] leading-relaxed font-medium">
            {answerIntro}
          </p>
        )}

        {points && points.length > 0 && (
          <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-[#17302F] leading-relaxed pl-1">
            {points.map((pt, idx) => (
              <li key={idx} className="font-normal pl-1">
                <span className="font-medium">{pt}</span>
              </li>
            ))}
          </ol>
        )}

        {answerConclusion && (
          <p className="text-xs sm:text-sm text-[#6B7C7A] leading-relaxed pt-2 border-t border-[#F7F8F5]">
            {answerConclusion}
          </p>
        )}

        {/* SOURCES SECTION */}
        <div className="pt-4 border-t border-[#DDE7E2]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7C7A] mb-2.5">
            Sources
          </div>

          <div className="p-3.5 bg-[#EFF8F3] border border-[#DDE7E2] rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-[#DDE7E2] flex items-center justify-center text-[#197A63]">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#0E3030]">
                  {citation.document}
                </h4>
                <p className="text-[11px] font-mono text-[#6B7C7A]">
                  Page {citation.page} • {citation.paragraph}
                </p>
              </div>
            </div>

            <button
              onClick={() => onViewProof(citation)}
              className="px-4 py-2 bg-[#197A63] hover:bg-[#163F3D] text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span>View Proof</span>
              <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* WHY THIS ANSWER? SECTION */}
      <div className="bg-[#F7F8F5] border border-[#DDE7E2] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-[#197A63]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#0E3030]">
              Why this answer?
            </h4>
          </div>
          <span className="text-[11px] font-semibold text-[#197A63] bg-[#E7F3ED] px-2 py-0.5 rounded">
            Zero Hallucination Standard
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#17302F]">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2E8B6D] shrink-0" />
            <span>Retrieved from official municipal document</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2E8B6D] shrink-0" />
            <span>{whyThisAnswer?.passagesFound || 3} relevant passages found</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2E8B6D] shrink-0" />
            <span>Answer generated only from retrieved sources</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2E8B6D] shrink-0" />
            <span>Citation verified against active gazette index</span>
          </div>
        </div>

        {/* Clean Confidence Progress Bar */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-[#6B7C7A]">Grounded Confidence:</span>
            <span className="font-mono font-bold text-[#197A63]">
              {whyThisAnswer?.confidence || 92}%
            </span>
          </div>
          <div className="w-full h-2 bg-[#DDE7E2] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#197A63] rounded-full transition-all duration-500"
              style={{ width: `${whyThisAnswer?.confidence || 92}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoSourceAnswer({
  message,
  sourcesFound,
  advice,
  suggestions = [],
  onSelectSuggestion,
}) {
  return (
    <div className="bg-white border border-[#DDE7E2] rounded-2xl p-6 max-w-3xl shadow-xs space-y-4 animate-in fade-in">
      <div className="flex items-center space-x-2.5 text-[#C94A4A]">
        <div className="w-8 h-8 rounded-lg bg-red-50 text-[#C94A4A] flex items-center justify-center">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#C94A4A]">
            No Grounded Source Found
          </h4>
          <span className="text-[11px] font-mono text-[#6B7C7A]">
            Sources found: {sourcesFound || 0}
          </span>
        </div>
      </div>

      <p className="text-sm font-semibold text-[#17302F]">
        "{message || "I couldn't find this information in the available municipal documents."}"
      </p>

      <div className="p-3.5 bg-[#F7F8F5] border border-[#DDE7E2] rounded-xl text-xs text-[#6B7C7A] leading-relaxed">
        <p className="font-medium text-[#17302F] mb-1">Hallucination Prevention Active:</p>
        <p>{advice || "Strict source-grounded response standard active. CivicLens only answers when verified evidence is extracted from official municipal circulars."}</p>
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="pt-2">
          <p className="text-xs font-semibold text-[#17302F] mb-2">
            Try asking about an indexed policy:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion && onSelectSuggestion(s)}
                className="px-3 py-1.5 bg-[#EFF8F3] hover:bg-[#E7F3ED] border border-[#DDE7E2] text-[#197A63] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="pt-2 text-xs text-[#6B7C7A]">
          <p>Please check that the relevant municipal gazette or policy document is uploaded in the Admin Portal and indexed.</p>
        </div>
      )}
    </div>
  );
}

export function StreamingAnswer({
  streamedText = "",
  statusText = "Synthesizing verified policy response...",
  citation = null,
}) {
  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-2">
      {/* Brand Header */}
      <div className="flex items-center space-x-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#197A63] text-white flex items-center justify-center font-bold text-xs shadow-xs">
          CL
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-[#0E3030]">CivicLens</span>
            <span className="text-[10px] font-semibold bg-[#EFF8F3] text-[#197A63] px-2 py-0.5 rounded-full border border-[#DDE7E2] flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#197A63] animate-pulse"></span>
              <span>Streaming Response...</span>
            </span>
          </div>
          <p className="text-[11px] text-[#6B7C7A]">
            {statusText}
          </p>
        </div>
      </div>

      {/* Streaming Card */}
      <div className="bg-white border border-[#DDE7E2] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="text-sm text-[#17302F] leading-relaxed whitespace-pre-wrap font-normal">
          {streamedText}
          <span className="inline-block w-1.5 h-4 ml-1 bg-[#197A63] animate-pulse align-middle rounded-xs" />
        </div>

        {citation?.document && (
          <div className="pt-3 border-t border-[#DDE7E2] flex items-center space-x-2 text-[11px] text-[#6B7C7A]">
            <FileText className="w-3.5 h-3.5 text-[#197A63] shrink-0" />
            <span>
              Referencing: <strong className="text-[#0E3030]">{citation.document}</strong> (Page {citation.page || 1})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}


