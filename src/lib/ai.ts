/**
 * AI features backed by Groq (https://console.groq.com):
 *  - summarize(): one-line summary + tags for a file, stored on the Node
 *  - chatAboutFile(): streaming Q&A about a file (text/PDF/code, or images via a vision model)
 *  - diffVersions(): plain-English summary of what changed between two versions
 *
 * Groq has no native document input, so text is extracted here (PDF via unpdf)
 * and images are sent as data URLs to a vision model. All features are disabled
 * when GROQ_API_KEY is unset.
 */
import Groq from "groq-sdk";
import type { Node, FileVersion } from "@/generated/prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { previewKind } from "@/lib/format";
import { HttpError } from "@/lib/errors";

export const aiEnabled = !!process.env.GROQ_API_KEY;

// Fast model with strict JSON-schema structured outputs (summaries / tags).
const PARSE_MODEL = process.env.GROQ_PARSE_MODEL || "openai/gpt-oss-20b";
// Larger model for writing and reasoning (chat, version diffs).
const REASON_MODEL = process.env.GROQ_REASON_MODEL || "openai/gpt-oss-120b";
// Multimodal model for images.
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
// The gpt-oss models reason before answering; the budget must cover both. "low" keeps summaries snappy.
const REASONING = { low: "low", medium: "medium" } as const;

/** Rough token guard: ~4 chars/token, keep well under the 128k context. */
const MAX_TEXT_CHARS = Number(process.env.AI_MAX_TEXT_CHARS || 120_000);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Groq base64 image limit

let client: Groq | null = null;
function groq(): Groq {
  if (!process.env.GROQ_API_KEY) throw new HttpError(503, "AI features are not configured (GROQ_API_KEY missing)");
  return (client ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

export type Extracted =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "image"; dataUrl: string }
  | { kind: "unsupported"; reason: string };

async function readAll(key: string): Promise<Buffer> {
  const stream = await getStorage().getStream(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Pulls the model-readable content out of a stored file (a specific version if given). */
export async function extractContent(node: Pick<Node, "name" | "mimeType" | "storageKey" | "size">, version?: Pick<FileVersion, "storageKey" | "mimeType" | "size">): Promise<Extracted> {
  const key = version?.storageKey ?? node.storageKey;
  const mime = version?.mimeType ?? node.mimeType ?? "";
  const size = version?.size ?? node.size;
  if (!key) return { kind: "unsupported", reason: "No stored content" };

  const kind = previewKind(mime, node.name);

  if (kind === "image") {
    if (size > MAX_IMAGE_BYTES) return { kind: "unsupported", reason: "Image is larger than 4 MB" };
    const buf = await readAll(key);
    return { kind: "image", dataUrl: `data:${mime || "image/png"};base64,${buf.toString("base64")}` };
  }

  if (kind === "pdf") {
    const { extractText } = await import("unpdf");
    const buf = await readAll(key);
    const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
    const cleaned = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!cleaned) return { kind: "unsupported", reason: "This PDF has no extractable text (scanned image?)" };
    return clip(cleaned);
  }

  if (kind === "text") {
    const buf = await readAll(key);
    return clip(buf.toString("utf8"));
  }

  return { kind: "unsupported", reason: `AI can read text, PDF, code and image files — not ${mime || "this type"}` };
}

function clip(text: string): Extracted {
  const truncated = text.length > MAX_TEXT_CHARS;
  return { kind: "text", text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, truncated };
}

// ---------------------------------------------------------------------------
// Summary + tags
// ---------------------------------------------------------------------------

const summarySchema = z.object({
  summary: z.string().min(1).max(400),
  tags: z.array(z.string().min(1).max(30)).max(8),
});

const summaryJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two sentences describing what the file is and what it contains." },
    tags: { type: "array", items: { type: "string" }, description: "Up to 8 short lowercase keywords useful for search (topics, people, companies, document type, year)." },
  },
  required: ["summary", "tags"],
  additionalProperties: false,
} as const;

/**
 * Generates and stores a summary + tags for the node's current version.
 * Safe to call repeatedly; skips unsupported files and records why.
 */
export async function summarize(nodeId: string): Promise<{ status: string; summary?: string; tags?: string[]; reason?: string }> {
  groq(); // fail fast (503) when not configured, before recording any status
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node || node.type !== "FILE" || !node.uploadComplete) throw new HttpError(400, "Not an uploaded file");

  await prisma.node.update({ where: { id: nodeId }, data: { aiStatus: "pending" } });
  try {
    const content = await extractContent(node);
    if (content.kind === "unsupported") {
      await prisma.node.update({ where: { id: nodeId }, data: { aiStatus: "skipped", aiSummary: null, aiTags: null, aiVersion: node.currentVersion } });
      return { status: "skipped", reason: content.reason };
    }

    const instruction = `Describe the file "${node.name}" for a file-search index. Respond with JSON only.`;
    const completion =
      content.kind === "image"
        ? await groq().chat.completions.create({
            model: VISION_MODEL,
            temperature: 0.2,
            max_tokens: 1500,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: `${instruction} Return {"summary": string, "tags": string[]} — summary is 1-2 sentences about what the image shows (include any visible text); tags are up to 8 lowercase keywords.` },
                  { type: "image_url", image_url: { url: content.dataUrl } },
                ],
              },
            ],
          })
        : await groq().chat.completions.create({
            model: PARSE_MODEL,
            temperature: 0.2,
            max_tokens: 1500,
            reasoning_effort: REASONING.low,
            response_format: { type: "json_schema", json_schema: { name: "file_summary", strict: true, schema: summaryJsonSchema } },
            messages: [
              { role: "system", content: "You index files for search. Be factual and concise." },
              { role: "user", content: `${instruction}\n\nFILE CONTENT${content.truncated ? " (truncated)" : ""}:\n${content.text}` },
            ],
          });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from AI model");
    const parsed = summarySchema.parse(JSON.parse(raw));
    const tags = [...new Set(parsed.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

    await prisma.node.update({
      where: { id: nodeId },
      data: { aiStatus: "done", aiSummary: parsed.summary, aiTags: JSON.stringify(tags), aiVersion: node.currentVersion },
    });
    return { status: "done", summary: parsed.summary, tags };
  } catch (e) {
    console.error("summarize failed", nodeId, e);
    await prisma.node.update({ where: { id: nodeId }, data: { aiStatus: "failed" } }).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Chat about a file (streaming)
// ---------------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Streams an answer about the file. Yields text deltas. */
export async function* chatAboutFile(node: Node, history: ChatTurn[]): AsyncGenerator<string> {
  const content = await extractContent(node);
  if (content.kind === "unsupported") throw new HttpError(400, content.reason);

  const system =
    `You are a helpful assistant inside a file-storage app. The user is asking about the file "${node.name}". ` +
    `Answer using only the file's content; if the answer is not in the file, say so. Be concise and use Markdown (short paragraphs, lists, or a table when it helps).`;

  const stream =
    content.kind === "image"
      ? await groq().chat.completions.create({
          model: VISION_MODEL,
          temperature: 0.3,
          max_tokens: 3000,
          stream: true,
          messages: [
            { role: "system", content: system },
            // The vision model receives the image once, alongside the first user turn.
            ...history.map((t, i) =>
              t.role === "user" && i === 0
                ? { role: "user" as const, content: [{ type: "text" as const, text: t.content }, { type: "image_url" as const, image_url: { url: content.dataUrl } }] }
                : t,
            ),
          ],
        })
      : await groq().chat.completions.create({
          model: REASON_MODEL,
          temperature: 0.3,
          max_tokens: 6000,
          reasoning_effort: REASONING.medium,
          stream: true,
          messages: [
            { role: "system", content: `${system}\n\nFILE CONTENT${content.truncated ? " (truncated — the file is longer than what you see)" : ""}:\n${content.text}` },
            ...history,
          ],
        });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ---------------------------------------------------------------------------
// Version diff
// ---------------------------------------------------------------------------

export async function diffVersions(node: Node, from: FileVersion, to: FileVersion): Promise<string> {
  const [a, b] = await Promise.all([extractContent(node, from), extractContent(node, to)]);
  if (a.kind !== "text" || b.kind !== "text") throw new HttpError(400, "Version comparison works for text, code and PDF files");

  const completion = await groq().chat.completions.create({
    model: REASON_MODEL,
    temperature: 0.2,
    max_tokens: 4000,
    reasoning_effort: REASONING.low,
    messages: [
      { role: "system", content: "You compare two versions of a document and explain what changed for a busy reader. Use Markdown bullet points grouped as Added / Removed / Changed; skip empty groups. If the versions are identical, say so in one line." },
      { role: "user", content: `File: "${node.name}"\n\n=== VERSION ${from.version} ===\n${a.text}\n\n=== VERSION ${to.version} ===\n${b.text}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "No differences found.";
}

export { parseTags } from "@/lib/ai-tags";
