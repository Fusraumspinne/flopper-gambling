"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Draggable, {
  type DraggableData,
  type DraggableEvent,
} from "react-draggable";
import { AttachFile, ChatBubbleOutline, Close, Send } from "@mui/icons-material";

type ChatAttachment = {
  kind: "image";
  mimeType: string;
  data: string;
  fileName: string;
  width?: number;
  height?: number;
};

type ChatMessage = {
  id: string;
  socketId: string;
  name: string;
  text: string;
  ts: number;
  attachment?: ChatAttachment;
  reactions: string[];
};

type LiveChatPanelProps = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  mySocketId: string;
  onSend: (text: string, attachment?: ChatAttachment) => void;
  onReact: (messageId: string, emoji: string) => void;
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
  onReact,
  connected,
  onlineCount,
}: LiveChatPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<StoredPos>({ x: 390, y: 90 });
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | undefined>(undefined);
  const [attachmentError, setAttachmentError] = useState("");
  const [reactMenuMessageId, setReactMenuMessageId] = useState<string | null>(null);
  const [reactionInput, setReactionInput] = useState("");
  const reactionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (reactMenuMessageId) {
      setTimeout(() => reactionInputRef.current?.focus(), 50);
    }
  }, [reactMenuMessageId]);

  const nodeRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!text && !attachment) return;
    onSend(text, attachment);
    setDraft("");
    setAttachment(undefined);
    setAttachmentError("");
  };

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Failed to read file."));
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image."));
      image.src = src;
    });

  const downscaleImage = async (file: File): Promise<ChatAttachment> => {
    const sourceData = await readAsDataUrl(file);
    const sourceImage = await loadImage(sourceData);
    const maxDimension = 1280;
    const width = sourceImage.naturalWidth || sourceImage.width;
    const height = sourceImage.naturalHeight || sourceImage.height;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");

    context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

    let quality = 0.9;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    
    while (dataUrl.length > 250000 && quality > 0.1) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    return {
      kind: "image",
      mimeType: "image/jpeg",
      data: dataUrl,
      fileName: file.name.replace(/\.[^.]+$/, ".jpg"),
      width: targetWidth,
      height: targetHeight,
    };
  };

  const handleAttachmentPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachmentError("");

    try {
      if (file.type.startsWith("image/")) {
        const nextAttachment = await downscaleImage(file);
        setAttachment(nextAttachment);
      } else {
        setAttachment(undefined);
        setAttachmentError("Only image files are allowed.");
      }
    } catch {
      setAttachment(undefined);
      setAttachmentError("Attachment could not be processed.");
    }

    event.target.value = "";
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
              onClick={() => {
                setReactMenuMessageId(null);
                setReactionInput("");
              }}
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
                      onClick={(e) => {
                        if (true) {
                          e.stopPropagation();
                          if ((msg.reactions?.length || 0) >= 5) {
                            setReactMenuMessageId(null);
                            return;
                          }
                          setReactMenuMessageId((prev) => (prev === msg.id ? null : msg.id));
                        }
                      }}
                      className={`max-w-[78%] rounded-md px-2 py-1 text-xs leading-snug border ${
                        mine
                          ? "bg-[#0b3b1c] text-white border-[#2f4553]"
                          : `bg-[#1a2c38] text-white border-[#2f4553] ${
                              (msg.reactions?.length || 0) < 5 ? "cursor-pointer" : "cursor-default opacity-90"
                            }`
                      } relative`}
                    >
                      {!mine && (
                        <div className="text-[10px] text-[#00e701] font-bold mb-0.5">
                          {msg.name}
                        </div>
                      )}
                      {!!msg.text && <div className="wrap-break-word">{msg.text}</div>}

                      {msg.attachment?.kind === "image" && (
                        <img
                          src={msg.attachment.data}
                          alt={msg.attachment.fileName || "Chat image"}
                          className="my-1 max-h-48 w-auto rounded border border-[#2f4553]"
                        />
                      )}

                      {msg.reactions.length > 0 && (
                        <div className="absolute bottom-0 left-2 transform translate-y-1/2 flex -space-x-2 pointer-events-none text-[12px]">
                          {msg.reactions.map((emoji, idx) => (
                            <span
                              key={`${msg.id}-${emoji}`}
                              className="flex items-center justify-center w-5 h-5 rounded-full bg-[#1a2c38] text-[10px] leading-none"
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      )}

                      {reactMenuMessageId === msg.id && (
                        <div
                          className="absolute top-full left-0 mt-1 z-20 livechat-cancel flex items-center gap-1 rounded border border-[#2f4553] bg-[#132635] px-2 py-1 shadow-lg"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center gap-1">
                            <input
                              ref={reactionInputRef}
                              value={reactionInput}
                              onChange={(e) => setReactionInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const val = reactionInput.trim();
                                  if (!val) return;
                                  
                                  const segments = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(val));
                                  if (segments.length !== 1) return;

                                  const isNew = !msg.reactions.includes(val);
                                  if (isNew && (msg.reactions?.length || 0) >= 5) return;
                                  onReact(msg.id, val);
                                  setReactMenuMessageId(null);
                                  setReactionInput("");
                                } else if (e.key === "Escape") {
                                  setReactMenuMessageId(null);
                                  setReactionInput("");
                                }
                              }}
                              placeholder="Emoji"
                              className="w-16 rounded px-1 py-0.5 text-xs bg-[#0f212e] border border-[#2f4553]"
                              onFocus={() => setTimeout(() => reactionInputRef.current?.select(), 0)}
                              aria-label="Emoji input"
                            />
                            <button
                              type="button"
                              className="rounded px-2 py-0.5 bg-[#1a2c38] hover:bg-[#213743] text-xs"
                              onClick={() => {
                                const val = reactionInput.trim();
                                if (!val) return;
                                
                                const segments = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(val));
                                if (segments.length !== 1) return;

                                const isNew = !msg.reactions.includes(val);
                                if (isNew && (msg.reactions?.length || 0) >= 5) return;
                                onReact(msg.id, val);
                                setReactMenuMessageId(null);
                                setReactionInput("");
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {(attachment || attachmentError) && (
              <div className="pt-2">
                {attachment && (
                  <div className="flex items-center justify-between rounded border border-[#2f4553] bg-[#132635] px-2 py-1 text-[11px] text-[#b1bad3]">
                    <span className="truncate pr-2">{attachment.fileName}</span>
                    <button
                      type="button"
                      className="livechat-cancel rounded px-1 text-white hover:bg-[#213743]"
                      onClick={() => setAttachment(undefined)}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {attachmentError && (
                  <div className="text-[11px] text-yellow-500 mt-1">{attachmentError}</div>
                )}
              </div>
            )}

            <form
              className="flex items-stretch gap-2 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAttachmentPick}
              />
              <button
                type="button"
                className="livechat-cancel rounded-md border border-[#2f4553] bg-[#1a2c38] px-3 py-2 text-white hover:bg-[#213743] disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={!connected}
                aria-label="Attach image"
              >
                <AttachFile sx={{ fontSize: 16 }} />
              </button>
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
                disabled={!connected || (!draft.trim() && !attachment)}
                className="livechat-cancel rounded-md border border-[#2f4553] bg-[#1a2c38] px-3 py-2 text-white hover:bg-[#213743] disabled:opacity-50 flex items-center justify-center"
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
