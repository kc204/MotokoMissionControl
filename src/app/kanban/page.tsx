"use client";

import KanbanBoard from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";
import { useState } from "react";

export default function KanbanPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="h-[calc(100vh-6rem)]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Project Board</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors"
        >
          + New Task
        </button>
      </header>
      
      <KanbanBoard />
      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
