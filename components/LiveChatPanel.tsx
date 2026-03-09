"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Draggable, {
  type DraggableData,
  type DraggableEvent,
} from "react-draggable";
import { ChatBubbleOutline, Close, Send } from "@mui/icons-material";

type ChatMessage = {
  id: string;
  socketId: string;
  name: string;
  text: string;
  ts: number;
};

type LiveChatPanelProps = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  mySocketId: string;
  onSend: (text: string) => void;
  connected: boolean;
  onlineCount: number;
};

type StoredPos = { x: number; y: number };
const POS_KEY = "flopper_livechat_pos_v1";

export default function LiveChatPanel({
  open,
  onClose,
  messages,
  mySocketId,
  onSend,
  connected,
  onlineCount,
}: LiveChatPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<StoredPos>({ x: 390, y: 90 });
  const [draft, setDraft] = useState("");

  const nodeRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.ts - b.ts);
  }, [messages]);

  useEffect(() => {
    let x = Math.max(24, Math.floor(window.innerWidth * 0.24));
    let y = 90;

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(POS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<StoredPos>;
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            x = parsed.x;
            y = parsed.y;
          }
        } catch {}
      }
    }

    setPos({ x, y });
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, sortedMessages]);

  const onStop = (_e: DraggableEvent, data: DraggableData) => {
    const nextPos = { x: data.x, y: data.y };
    setPos(nextPos);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(POS_KEY, JSON.stringify(nextPos));
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1001 }}>
      <Draggable
        nodeRef={nodeRef}
        handle=".livechat-handle"
        cancel=".livechat-cancel"
        defaultPosition={pos}
        onStop={onStop}
      >
        <section
          ref={nodeRef as React.RefObject<HTMLElement>}
          className="pointer-events-auto rounded-lg border border-[#2f4553] bg-[#0f212e] shadow-lg w-72 xl:w-96"
        >
          <header className="livechat-handle cursor-move flex items-center justify-between gap-3 rounded-t-lg border-b border-[#213743] bg-[#1a2c38] px-2 py-1 xl:py-2">
            <div className="text-white font-bold text-sm xl:text-base">
              <div className="flex items-center gap-2">
                <ChatBubbleOutline sx={{ fontSize: 20 }} />
                <div>Live Chat</div>{" "}
                <div
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                    connected
                      ? "bg-green-500/20 text-green-500"
                      : "bg-yellow-500/20 text-yellow-500"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
                  />
                  {connected ? "LIVE" : "CONNECTING"}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="livechat-cancel rounded-md px-2 py-1 text-[#b1bad3] hover:bg-[#213743] hover:text-white"
              aria-label="Close live chat"
            >
              <Close sx={{ fontSize: 18 }} />
            </button>
          </header>

          <div className="px-2">
            <div className="flex items-center gap-1 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <div className="text-[10px] font-normal text-gray-400">
                {onlineCount} online
              </div>
            </div>

            <div
              ref={listRef}
              className="h-80 overflow-y-auto rounded-md border border-[#213743] bg-[#132635] p-2 space-y-1"
            >
              {sortedMessages.length === 0 && (
                <div className="text-xs text-[#8399aa] italic text-center py-4">
                  {connected ? "No messages yet" : "Connecting to chat..."}
                </div>
              )}

              {sortedMessages.map((msg) => {
                const mine = msg.socketId === mySocketId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-md px-2 py-1 text-xs leading-snug border ${
                        mine
                          ? "bg-[#0b3b1c] text-white border-[#2f4553]"
                          : "bg-[#1a2c38] text-white border-[#2f4553]"
                      }`}
                    >
                      {!mine && (
                        <div className="text-[10px] text-[#00e701] font-bold mb-0.5">
                          {msg.name}
                        </div>
                      )}
                      <div className="break-words">{msg.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              className="flex items-stretch gap-2 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={280}
                disabled={!connected}
                placeholder={connected ? "Type a message..." : "Connecting..."}
                className="livechat-cancel flex-1 rounded-md border border-[#2f4553] bg-[#0f212e] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e701] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!connected || !draft.trim()}
                className="livechat-cancel rounded-md border border-[#2f4553] bg-[#1a2c38] px-4 py-2 text-white hover:bg-[#213743] disabled:opacity-50 flex items-center justify-center"
                aria-label="Send message"
              >
                <Send sx={{ fontSize: 16 }} />
              </button>
            </form>
          </div>
        </section>
      </Draggable>
    </div>,
    document.body,
  );
}
