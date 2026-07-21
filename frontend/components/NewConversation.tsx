"use client";

import { useState } from "react";
import type { ChannelKey } from "@/lib/types";
import { CHANNELS } from "@/lib/channels";
import { outbox } from "@/lib/outbox";
import { ChannelBadge } from "./ChannelIcon";

// Channels that let you initiate a DM. LinkedIn (no DM API) and Google
// (reviews) are excluded.
const DM_CHANNELS: ChannelKey[] = ["whatsapp", "instagram", "facebook", "tiktok", "x"];

export function NewConversationButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow"
      >
        <PlusIcon /> New message
      </button>
      {open && <NewConversationModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewConversationModal({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<ChannelKey>("whatsapp");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);

  function send() {
    if (!handle.trim() || !body.trim()) return;
    outbox.send({
      channel,
      body: body.trim(),
      recipient_handle: handle.trim(),
      recipient_display_name: name.trim(),
    });
    setDone(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <span className="font-semibold text-white">New conversation</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="mb-2 text-3xl">📨</div>
            <p className="text-sm text-slate-300">
              Queued. It sends the moment the channel is reachable — you can watch it in the outbox.
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Platform
              </label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.filter((c) => DM_CHANNELS.includes(c.key)).map((c) => {
                  const on = c.key === channel;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setChannel(c.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                        on ? "border-transparent text-white" : "border-white/10 text-slate-400"
                      }`}
                      style={on ? { background: `${c.color}22`, boxShadow: `inset 0 0 0 1px ${c.color}66` } : undefined}
                    >
                      <ChannelBadge channel={c.key} size={20} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Recipient handle
                </label>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder={channel === "whatsapp" ? "+234…" : "@username"}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Name (optional)
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write your message…"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-100 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <button
              onClick={send}
              disabled={!handle.trim() || !body.trim()}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send message
            </button>
            <p className="text-center text-[11px] text-slate-500">
              Quiet hours (08:00–20:00 WAT) apply to new outreach — outside them it waits in the queue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
