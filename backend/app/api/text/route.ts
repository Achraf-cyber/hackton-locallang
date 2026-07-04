import { NextRequest } from "next/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { handleApiError } from "../../../lib/apiError";
import { answerInLanguage, explainDocument } from "../../../lib/orchestrator";
import { prisma } from "../../../lib/db";
import { checkAndConsumeQuota, QUOTA_REACHED_MESSAGES } from "../../../lib/quota";
import { SESSION_COOKIE_NAME, verifySession } from "../../../lib/session";
import { getChatContext } from "../../../lib/identity";

const bodySchema = z.object({
  text: z.string().min(1, "text requis"),
  lang: z.enum(["dyu", "mos"], { message: "lang doit être 'dyu' ou 'mos'" }).optional(),
  mode: z.enum(["explain", "answer"]).default("answer"),
  userId: z.string().optional(),
});

/**
 * Résout l'utilisateur web courant à partir du cookie de session.
 *
 * Si le cookie est absent ou invalide, on traite la requête comme anonyme :
 * un pseudo-utilisateur "free" non persisté est renvoyé et AUCUN suivi de
 * quota n'est effectué. Limite connue acceptée pour le hackathon : un
 * utilisateur anonyme contourne totalement le quota. À corriger avant un
 * vrai lancement en exigeant l'enregistrement par email.
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
  const { user, anonymous } = await resolveWebUser(request);

  const finalLang = lang ?? (user.preferredLang as "dyu" | "mos" | null | undefined) ?? undefined;

  if (lang && !anonymous) {
    await prisma.user.update({ where: { id: user.id }, data: { preferredLang: lang } });
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

  try {
    const history = await getChatContext(user.id);
    const out =
      mode === "explain"
        ? await explainDocument(text, finalLang)
        : await answerInLanguage(text, finalLang, history);

    // Fire-and-forget interaction logging
    const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
    prisma.interaction.create({
      data: {
        channel: "web",
        lang: finalLang,
        type: "text",
        inputSummary: text.slice(0, 80),
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
    return handleApiError("api/text", err);
  }
}
