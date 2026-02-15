"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";

export default function HQChat() {
  const messages = useQuery(api.messages.list, { channel: "hq" }) || [];
  const agents = useQuery(api.agents.list) || [];
  const sendMessage = useMutation(api.messages.send);
  const setSetting = useMutation(api.settings.set);
  const [inputText, setInputText] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const onlineCount = agents.filter((a) => a.status === "active").length;

  return (
    <main className="min-h-[calc(100vh-7rem)]">
      <header className="mb-6 border-b border-white/10 pb-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Headquarters</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Team-wide communications, rapid dispatch, and autonomous coordination.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold leading-none text-emerald-300">{onlineCount}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Agents Active</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex h-[72vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,21,0.94),rgba(5,8,13,0.94))]">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">HQ Channel</h2>
              <p className="mt-1 text-xs text-zinc-500">Messages are routed to specialists in real-time.</p>
            </div>
            <button
              onClick={handleDispatchNow}
              disabled={isDispatching}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {isDispatching ? "Dispatching..." : "Dispatch Now"}
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
                    className={`max-w-[78%] rounded-2xl px-3.5 py-3 ${
                      isSystem
                        ? "rounded-tr-sm border border-cyan-500/20 bg-cyan-500/12 text-zinc-100"
                        : "rounded-tl-sm border border-white/10 bg-white/[0.05] text-zinc-200"
                    }`}
                  >
                    {!isSystem && (
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                        {msg.agent!.name} - {msg.agent!.role}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                    <span className="mt-1.5 block text-right font-mono text-[10px] text-zinc-600">
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

          <div className="border-t border-white/10 bg-white/[0.03] p-3">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Broadcast to all agents... Use @mentions for routing."
                className="flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-cyan-400/40 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-5 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        <aside className="h-[72vh] overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,13,21,0.95),rgba(6,9,14,0.95))]">
          <div className="border-b border-white/10 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Agent Roster</h3>
          </div>
          <div className="space-y-2 p-3">
            {agents.map((agent) => (
              <div
                key={agent._id}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{agent.name}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      agent.status === "active"
                        ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                        : agent.status === "blocked"
                        ? "border-red-500/40 bg-red-500/20 text-red-200"
                        : "border-zinc-600/60 bg-zinc-700/30 text-zinc-300"
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{agent.role}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
