import { NextRequest } from "next/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { handleApiError } from "../../../lib/apiError";
import { explainPhoto } from "../../../lib/orchestrator";
import { prisma } from "../../../lib/db";
import { checkAndConsumeQuota, QUOTA_REACHED_MESSAGES } from "../../../lib/quota";
import { SESSION_COOKIE_NAME, verifySession } from "../../../lib/session";

const langSchema = z.enum(["dyu", "mos"], {
  message: "lang doit être 'dyu' ou 'mos'",
});

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function isAcceptedType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

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
    return Response.json(
      { error: "Fichier manquant (champ 'file'), image ou PDF." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "Fichier trop volumineux (15 Mo maximum)." }, { status: 400 });
  }

  const mimeType = file.type || "image/jpeg";
  if (!isAcceptedType(mimeType)) {
    return Response.json(
      { error: "Format non supporté : envoyez une image ou un PDF." },
      { status: 400 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const out = await explainPhoto(buffer, mimeType, finalLang);

    // Fire-and-forget interaction logging
    const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
    const fileNameStr = file instanceof File && file.name ? file.name : mimeType;
    prisma.interaction.create({
      data: {
        channel: "web",
        lang: finalLang,
        type: "photo",
        inputSummary: `photo:${fileNameStr} (${file.size} octets)`,
        outputSummary: out.result.translated.slice(0, 80),
        durationMs,
        userId: anonymous ? undefined : user.id,
      },
    }).catch((dbErr) => {
      console.error("DB Log interaction failed:", dbErr);
    });

    return Response.json({
      translated: out.result.translated,
      audioUrl: out.result.audioUrl,
      timings: out.timings,
    });
  } catch (err) {
    return handleApiError("api/photo", err);
  }
}
