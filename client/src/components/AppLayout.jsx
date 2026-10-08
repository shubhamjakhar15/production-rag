import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({
  children,
  previousChats,
  onSelectPreviousChat,
  activeChatId,
  selectedDepartment,
  onSelectDepartment,
  onSearchSubmit,
  onNewChat,
  onDeleteChat,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F7F8F5] text-[#17302F] font-sans">
      {/* Left Sidebar */}
      <Sidebar
        previousChats={previousChats}
        onSelectPreviousChat={onSelectPreviousChat}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeChatId={activeChatId}
        onNewChat={onNewChat}
        onDeleteChat={onDeleteChat}
      />

      {/* Main Right Content Section */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <Topbar
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          selectedDepartment={selectedDepartment}
          onSelectDepartment={onSelectDepartment}
          onSearchSubmit={onSearchSubmit}
        />

        {/* Dynamic Route View Content */}
        <div className="flex-1 flex overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
