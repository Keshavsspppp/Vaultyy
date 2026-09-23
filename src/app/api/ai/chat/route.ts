import { z } from "zod";
import { route } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { chatAboutFile } from "@/lib/ai";

const schema = z.object({
  nodeId: z.string(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

/** Streams a plain-text answer about a file (chunks of Markdown). */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  await rateLimit("ai", userId);
  const { nodeId, messages } = schema.parse(await req.json());
  const { node } = await loadNode(nodeId, userId, "VIEWER");

  const encoder = new TextEncoder();
  const gen = chatAboutFile(node, messages);
  // Pull the first chunk before responding so extraction/model errors surface as JSON errors, not a broken stream.
  const first = await gen.next();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const delta of gen) controller.enqueue(encoder.encode(delta));
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n_Error: ${(e as Error).message}_`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      gen.return(undefined);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
