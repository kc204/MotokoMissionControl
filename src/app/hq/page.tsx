"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";

export default function HQChat() {
  const messages = useQuery(api.messages.list, { channel: "hq" }) || [];
  const sendMessage = useMutation(api.messages.send);
  const setSetting = useMutation(api.settings.set);
  const [inputText, setInputText] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const triggerDispatch = async () => {
    await setSetting({
      key: "orchestrator:manual_dispatch",
      value: Date.now().toString(),
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    await sendMessage({
      channel: "hq",
      text: inputText,
    });
    await triggerDispatch();
    setInputText("");
  };

  const handleDispatchNow = async () => {
    setIsDispatching(true);
    try {
      await triggerDispatch();
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span>HQ</span> Headquarters
          </h2>
          <p className="text-xs text-zinc-400">Agent Collaboration Channel</p>
        </div>
        <button
          onClick={handleDispatchNow}
          disabled={isDispatching}
          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {isDispatching ? "Dispatching..." : "Dispatch Now"}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg) => {
          const isSystem = !msg.agent;
          return (
            <div
              key={msg._id}
              className={`flex gap-3 ${isSystem ? "justify-end" : "justify-start"}`}
            >
              {!isSystem && (
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-800">
                  <img
                    src={msg.agent!.avatar}
                    alt={msg.agent!.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div
                className={`max-w-[70%] rounded-2xl p-3 ${
                  isSystem
                    ? "rounded-tr-sm border border-blue-500/20 bg-blue-600/20 text-white"
                    : "rounded-tl-sm border border-white/10 bg-white/10 text-zinc-200"
                }`}
              >
                {!isSystem && (
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {msg.agent!.name} - {msg.agent!.role}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                <span className="mt-1 block text-right text-[10px] text-zinc-600 opacity-50">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Broadcast message to all agents..."
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500/50 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-white px-6 py-2 font-bold text-black transition-colors hover:bg-zinc-200"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
