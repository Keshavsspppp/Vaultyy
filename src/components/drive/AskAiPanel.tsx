"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Sparkles, Square, X } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { previewKind } from "@/lib/format";
import type { NodeDTO } from "@/lib/nodes";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS: Record<string, string[]> = {
  text: ["Summarize this file", "What are the key points?", "List any dates, names or amounts", "Explain this like I'm new to it"],
  pdf: ["Summarize this document", "What are the key takeaways?", "List any dates, names or amounts", "What action items are mentioned?"],
  image: ["What's in this image?", "Transcribe any text in it", "Describe it in one sentence", "Is there anything unusual here?"],
};

/** Chat sidebar for the preview modal: ask questions about the open file, answers stream in. */
export function AskAiPanel({ node, onClose }: { node: NodeDTO; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const kind = previewKind(node.mimeType, node.name);
  const supported = kind === "text" || kind === "pdf" || kind === "image";
  const suggestions = SUGGESTIONS[kind] ?? [];

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Stop any in-flight request when the panel closes or the file changes.
  useEffect(() => () => abort.current?.abort(), [node.id]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: q }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(err.error);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const snapshot = answer;
        setTurns([...history, { role: "assistant", content: snapshot }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setTurns([...history, { role: "assistant", content: `_${(e as Error).message}_` }]);
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <aside className="flex h-full w-[380px] max-w-full shrink-0 flex-col border-l border-border bg-surface text-foreground" onMouseDown={(e) => e.stopPropagation()}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles size={18} className="text-primary" />
        <h2 className="font-display flex-1 text-base">Ask about this file</h2>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground" aria-label="Close AI panel">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        {!supported ? (
          <p className="text-muted">AI can read text, code, PDF and image files. This file type is not supported yet.</p>
        ) : turns.length === 0 ? (
          <div className="space-y-2">
            <p className="mb-3 text-muted">Ask anything about <span className="font-medium text-foreground">{node.name}</span>, or try:</p>
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} className="block w-full rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-hover">
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-8 rounded-md border border-border bg-background px-3 py-2">
                  {t.content}
                </div>
              ) : (
                <div key={i} className="mr-4">
                  {t.content ? <Markdown>{t.content}</Markdown> : <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-muted/40" aria-label="Thinking" />}
                </div>
              ),
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {supported && (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Ask a question…"
            className="max-h-32 min-h-[40px] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="rounded-md bg-hover p-2.5" aria-label="Stop">
              <Square size={16} />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="rounded-md bg-foreground p-2.5 text-background hover:bg-primary disabled:opacity-40" aria-label="Send">
              <Send size={16} />
            </button>
          )}
        </form>
      )}
    </aside>
  );
}
