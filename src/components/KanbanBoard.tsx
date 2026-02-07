"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useMemo } from "react";

const COLUMNS = ["inbox", "assigned", "in_progress", "review", "done"];
const LABELS: Record<string, string> = {
  inbox: "Inbox",
  assigned: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

interface Task {
  _id: Id<"tasks">;
  title: string;
  description: string;
  status: string;
  priority: string;
}

function SortableItem({ task }: { task: Task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task._id, data: { ...task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-4 bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors cursor-grab active:cursor-grabbing group mb-3"
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
          task.priority === 'urgent' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
          task.priority === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
          'bg-blue-500/10 text-blue-400 border-blue-500/20'
        } uppercase font-medium`}>
          {task.priority}
        </span>
      </div>
      <h4 className="font-medium text-zinc-200 text-sm leading-snug mb-1 group-hover:text-white">
        {task.title}
      </h4>
      <p className="text-xs text-zinc-500 line-clamp-2">
        {task.description}
      </p>
    </div>
  );
}

export default function KanbanBoard() {
  const tasks = useQuery(api.tasks.list) || [];
  const updateStatus = useMutation(api.tasks.updateStatus);
  const [activeId, setActiveId] = useState<Id<"tasks"> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeTask = useMemo(
    () => tasks.find((t) => t._id === activeId),
    [activeId, tasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as Id<"tasks">);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Optional: Add visual feedback for dropping into column
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Check if dropped on a column container (which has ID = status)
    if (COLUMNS.includes(over.id as string)) {
      const newStatus = over.id as string;
      const taskId = active.id as Id<"tasks">;
      
      // Update local state optimistic UI could go here, but convex is fast enough
      await updateStatus({ id: taskId, status: newStatus });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto">
        <div className="flex gap-6 h-full min-w-max pb-4">
          {COLUMNS.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            
            return (
              <div key={status} className="w-80 flex flex-col h-full">
                {/* Column Header */}
                <div className="flex items-center justify-between p-1 mb-2">
                  <h3 className="font-bold text-zinc-400 uppercase tracking-wider text-sm">
                    {LABELS[status]}
                  </h3>
                  <span className="bg-white/10 text-zinc-500 text-xs px-2 py-0.5 rounded-full font-mono">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Droppable Area */}
                <SortableContext
                  id={status}
                  items={columnTasks.map((t) => t._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div 
                    id={status} // This ID is crucial for detecting drop on column
                    className="flex-1 bg-white/5 rounded-2xl border border-white/5 p-3 overflow-y-auto"
                  >
                    {columnTasks.map((task) => (
                      <SortableItem key={task._id} task={task} />
                    ))}
                    {columnTasks.length === 0 && (
                      <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl pointer-events-none">
                        <p className="text-xs text-zinc-600">Drop here</p>
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
           <div className="p-4 bg-black/80 rounded-xl border border-blue-500/50 shadow-2xl w-80 cursor-grabbing backdrop-blur-xl">
             <div className="flex justify-between items-start mb-2">
               <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 uppercase font-medium">
                 {activeTask.priority}
               </span>
             </div>
             <h4 className="font-medium text-white text-sm leading-snug mb-1">
               {activeTask.title}
             </h4>
           </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
