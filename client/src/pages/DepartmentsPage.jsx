import { useNavigate } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/clerk-react";
import {
  Home,
  Droplets,
  Construction,
  Trash2,
  Receipt,
  FileCheck2,
  Trees,
  ShieldAlert,
  ArrowRight,
  FileText,
} from "lucide-react";
import { departmentsList } from "../data/mockCivicData";

export default function DepartmentsPage({ onSelectDepartment, documents = [] }) {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  // Icon mapping
  const iconMap = {
    Home: Home,
    Droplets: Droplets,
    Construction: Construction,
    Trash2: Trash2,
    Receipt: Receipt,
    FileCheck2: FileCheck2,
    Trees: Trees,
    ShieldAlert: ShieldAlert,
  };

  const handleAskDepartment = (deptName) => {
    if (!isSignedIn) {
      if (openSignIn) openSignIn();
      return;
    }
    if (onSelectDepartment) {
      onSelectDepartment(deptName);
    }
    navigate("/chat");
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[#DDE7E2]">
        <h1 className="text-xl sm:text-2xl font-bold text-[#0E3030] tracking-tight">
          Municipal Departments
        </h1>
        <p className="text-xs sm:text-sm text-[#6B7C7A] mt-1">
          Explore policies, circulars, and ask grounded questions filtered by municipal jurisdiction.
        </p>
      </div>

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {departmentsList.map((dept) => {
          const Icon = iconMap[dept.icon] || FileText;
          const matchingDocCount = (documents || []).filter(
            (d) =>
              (d.department && d.department.toLowerCase() === dept.name.toLowerCase()) ||
              (d.department && d.department.toLowerCase() === dept.id.toLowerCase())
          ).length;

          return (
            <div
              key={dept.id}
              className="bg-white border border-[#DDE7E2] hover:border-[#197A63] rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-[#EFF8F3] text-[#197A63] border border-[#DDE7E2] flex items-center justify-center mb-4 group-hover:bg-[#197A63] group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="text-sm font-bold text-[#0E3030]">
                  {dept.title}
                </h3>
                <span className="inline-block mt-1 text-[11px] font-mono font-semibold text-[#197A63] bg-[#E7F3ED] px-2 py-0.5 rounded">
                  {matchingDocCount} {matchingDocCount === 1 ? "document" : "documents"}
                </span>

                <p className="text-xs text-[#6B7C7A] mt-2.5 leading-relaxed line-clamp-3">
                  {dept.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#F7F8F5]">
                <button
                  onClick={() => handleAskDepartment(dept.name)}
                  className="w-full py-2 px-3 bg-[#F7F8F5] group-hover:bg-[#197A63] text-[#17302F] group-hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <span>Ask about {dept.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

