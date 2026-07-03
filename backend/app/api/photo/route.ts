import { NextRequest } from "next/server";
import { z } from "zod";
import { explainPhoto } from "../../../lib/orchestrator";

const langSchema = z.enum(["dyu", "mos"], {
  message: "lang doit être 'dyu' ou 'mos'",
});

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart/form-data attendu." }, { status: 400 });
  }

  const parsedLang = langSchema.safeParse(form.get("lang"));
  if (!parsedLang.success) {
    return Response.json(
      { error: parsedLang.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Fichier image manquant (champ 'file')." }, { status: 400 });
  }

  const mimeType = file.type || "image/jpeg";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const out = await explainPhoto(buffer, mimeType, parsedLang.data);
    return Response.json({
      translated: out.result.translated,
      audioUrl: out.result.audioUrl,
      timings: out.timings,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
