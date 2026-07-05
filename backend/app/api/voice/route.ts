import { NextRequest } from "next/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { handleApiError } from "../../../lib/apiError";
import { voiceToVoice } from "../../../lib/orchestrator";
import { prisma } from "../../../lib/db";
import { checkAndConsumeQuota, QUOTA_REACHED_MESSAGES } from "../../../lib/quota";
import { SESSION_COOKIE_NAME, verifySession } from "../../../lib/session";
import { getChatContext } from "../../../lib/identity";

const langSchema = z.enum(["dyu", "mos"], {
  message: "lang doit être 'dyu' ou 'mos'",
});

// Contrairement à app/api/photo/route.ts (limite déjà en place), ce fichier
// n'avait aucune limite de taille : un fichier audio arbitrairement gros
// était transmis tel quel au service ASR (coût, temps de traitement, risque
// d'abus). Même ordre de grandeur que la photo, un peu plus large car un
// message vocal légitime peut dépasser quelques minutes.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Résout l'utilisateur web courant à partir du cookie de session.
 * Anonyme (pas de cookie valide) -> pseudo-utilisateur non persisté, quota
 * non suivi. Voir app/api/text/route.ts pour le détail de cette limitation
 * connue (acceptable pour le hackathon).
 */
async function resolveWebUser(request: NextRequest): Promise<{ user: User; anonymous: boolean }> {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = cookie ? verifySession(cookie) : null;

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return { user, anonymous: false };
  }

  const anonymousUser: User = {
    id: "anonymous",
    organizationId: null,
    preferredLang: null,
    tier: "free",
    requestsToday: 0,
    quotaResetAt: new Date(),
    paidCreditsLeft: 0,
    createdAt: new Date(),
  };
  return { user: anonymousUser, anonymous: true };
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart/form-data attendu." }, { status: 400 });
  }

  const rawLang = form.get("lang");
  let finalLang: "dyu" | "mos" | undefined = undefined;

  if (rawLang !== null && rawLang !== "") {
    const parsedLang = langSchema.safeParse(rawLang);
    if (!parsedLang.success) {
      return Response.json(
        { error: parsedLang.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    finalLang = parsedLang.data;
  }

  const { user, anonymous } = await resolveWebUser(request);

  if (!finalLang) {
    finalLang = (user.preferredLang as "dyu" | "mos" | null | undefined) ?? undefined;
  } else if (!anonymous) {
    await prisma.user.update({ where: { id: user.id }, data: { preferredLang: finalLang } });
  }

  if (!finalLang) {
    return Response.json({ needLanguage: true }, { status: 400 });
  }

  if (!anonymous) {
    const quota = await checkAndConsumeQuota(user);
    if (!quota.allowed) {
      const message = QUOTA_REACHED_MESSAGES[finalLang] ?? QUOTA_REACHED_MESSAGES.fr;
      return Response.json(
        { error: "quota_reached", message, payUrl: "/api/pay" },
        { status: 402 },
      );
    }
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Fichier audio manquant (champ 'file')." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "Fichier audio trop volumineux (20 Mo maximum)." }, { status: 400 });
  }

  const filename = file instanceof File && file.name ? file.name : "audio.webm";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const history = await getChatContext(user.id);
    const out = await voiceToVoice(buffer, filename, finalLang, history);

    // Fire-and-forget interaction logging
    const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
    const transcriptText = out.result.transcript || "";
    prisma.interaction.create({
      data: {
        channel: "web",
        lang: finalLang,
        type: "voice",
        inputSummary: transcriptText ? transcriptText : `voice:${filename}`,
        outputSummary: out.result.translated,
        durationMs,
        userId: anonymous ? undefined : user.id,
      },
    }).catch((dbErr) => {
      console.error("DB Log interaction failed:", dbErr);
    });

    return Response.json({
      translated: out.result.translated,
      audioUrl: out.result.audioUrl,
      transcript: out.result.transcript,
      timings: out.timings,
    });
  } catch (err) {
    return handleApiError("api/voice", err);
  }
}
