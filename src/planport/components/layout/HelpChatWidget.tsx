"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { runHelpAssistantChat } from "@/ai/flows/help-assistant-chat";
import {
  HELP_ASSISTANT_FALLBACK,
  HELP_ASSISTANT_OPENING,
  PLANPORT_HELP_FAQ,
} from "@/lib/planport-help-knowledge";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreMatch(question: string, keywords: string[]): number {
  const q = normalize(question);
  const qTokens = new Set(q.split(" "));
  let score = 0;

  for (const rawKeyword of keywords) {
    const keyword = normalize(rawKeyword);
    if (!keyword) continue;

    if (q.includes(keyword)) {
      score += keyword.includes(" ") ? 5 : 3;
      continue;
    }

    const keyTokens = keyword.split(" ");
    const overlap = keyTokens.filter((t) => qTokens.has(t)).length;
    if (overlap > 0) {
      score += overlap;
    }
  }

  return score;
}

/** Minimum aggregate keyword score to return a curated answer (not the fallback). */
const MATCH_THRESHOLD = 2;

function getHelpResponse(question: string): string {
  let best: { score: number; answer: string } = { score: 0, answer: "" };
  for (const item of PLANPORT_HELP_FAQ) {
    const score = scoreMatch(question, item.keywords);
    if (score > best.score) {
      best = { score, answer: item.answer };
    }
  }

  if (best.score >= MATCH_THRESHOLD) return best.answer;

  return HELP_ASSISTANT_FALLBACK;
}

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: HELP_ASSISTANT_OPENING },
  ]);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, messages, isSending]);

  const quickPrompts = useMemo(
    () => [
      "What is the Client Onboarding Packet?",
      "How do fees and billing work?",
      "How do I view blueprints?",
      "Tell me about Designer's Ink services",
    ],
    []
  );

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const historyForServer = [
      ...messages.map((m) => ({ role: m.role, content: m.text } as const)),
      { role: "user" as const, content: trimmed },
    ];

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      let reply: string;
      try {
        const result = await runHelpAssistantChat({ messages: historyForServer });
        reply = result.ok ? result.reply : getHelpResponse(trimmed);
      } catch {
        reply = getHelpResponse(trimmed);
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        className="fixed bottom-6 right-6 z-[999] rounded-full shadow-xl h-12 px-4"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="w-4 h-4 mr-2" /> : <MessageCircleQuestion className="w-4 h-4 mr-2" />}
        Help
      </Button>

      {open && (
        <div className="fixed bottom-20 right-6 z-[999] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-background shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-primary text-primary-foreground">
            <p className="font-semibold uppercase tracking-wide">PlanPort Help Assistant</p>
            <p className="text-[11px] text-white/85 mt-0.5 leading-snug">
              In-app FAQs + PlanPort tips + web search (designersink.us)
            </p>
          </div>

          <ScrollArea className="h-[360px] px-3 py-3">
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn(
                    "max-w-[90%] rounded-xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-secondary text-foreground"
                  )}
                >
                  {m.text}
                </div>
              ))}
              {isSending && (
                <div className="mr-auto max-w-[90%] rounded-xl px-3 py-2 text-sm bg-secondary text-muted-foreground italic">
                  Thinking…
                </div>
              )}
              <div ref={scrollAnchorRef} className="h-px w-full shrink-0" aria-hidden />
            </div>
          </ScrollArea>

          <div className="px-3 pb-2 flex flex-wrap gap-2">
            {quickPrompts.map((p) => (
              <button
                key={p}
                type="button"
                disabled={isSending}
                className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1.5 rounded-md border hover:bg-secondary text-left disabled:opacity-50"
                onClick={() => void send(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <form
            className="p-3 border-t flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
              placeholder="Ask about PlanPort or Designer's Ink…"
            />
            <Button type="submit" size="icon" disabled={isSending}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
