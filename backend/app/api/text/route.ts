import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/apiError";
import { answerInLanguage, explainDocument } from "../../../lib/orchestrator";

const bodySchema = z.object({
  text: z.string().min(1, "text requis"),
  lang: z.enum(["dyu", "mos"], { message: "lang doit être 'dyu' ou 'mos'" }),
  mode: z.enum(["explain", "answer"]).default("answer"),
});

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { text, lang, mode } = parsed.data;
  try {
    const out =
      mode === "explain"
        ? await explainDocument(text, lang)
        : await answerInLanguage(text, lang);
    return Response.json({
      translated: out.result.translated,
      audioUrl: out.result.audioUrl,
      timings: out.timings,
    });
  } catch (err) {
    return handleApiError("api/text", err);
  }
}
