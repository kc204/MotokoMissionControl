"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";

export default function HQChat() {
  const messages = useQuery(api.messages.list, { channel: "hq" }) || [];
  const sendMessage = useMutation(api.messages.send);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    await sendMessage({
      channel: "hq",
      text: inputText,
      // agentId: undefined (sent by User/System)
    });
    
    setInputText("");
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col bg-black/20 rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5 backdrop-blur-md">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🏢</span> Headquarters
        </h2>
        <p className="text-xs text-zinc-400">Agent Collaboration Channel</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isSystem = !msg.agent;
          return (
            <div key={msg._id} className={`flex gap-3 ${isSystem ? "justify-end" : "justify-start"}`}>
              {!isSystem && (
                <div className="h-8 w-8 rounded-full bg-zinc-800 overflow-hidden border border-white/10 flex-shrink-0">
                  <img src={msg.agent!.avatar} alt={msg.agent!.name} className="h-full w-full object-cover" />
                </div>
              )}
              
              <div className={`max-w-[70%] rounded-2xl p-3 ${
                isSystem 
                  ? "bg-blue-600/20 border border-blue-500/20 text-white rounded-tr-sm" 
                  : "bg-white/10 border border-white/10 text-zinc-200 rounded-tl-sm"
              }`}>
                {!isSystem && (
                  <p className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">
                    {msg.agent!.name} • {msg.agent!.role}
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <span className="text-[10px] text-zinc-600 mt-1 block text-right opacity-50">
                  {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-md">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Broadcast message to all agents..."
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          <button 
            type="submit"
            className="bg-white text-black font-bold px-6 py-2 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
