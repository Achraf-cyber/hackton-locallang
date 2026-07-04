/**
 * Quota gratuit quotidien — un utilisateur "free" (sans organisation) a droit
 * à `DAILY_FREE_LIMIT` requêtes par jour, puis peut consommer des crédits
 * payants (`paidCreditsLeft`) achetés via /api/pay. Les utilisateurs rattachés
 * à une Organization ne sont jamais bloqués (facturation gérée séparément).
 */

import type { User } from "@prisma/client";
import { getEnv } from "./env";
import { prisma } from "./db";

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Minuit UTC du jour courant. On reste en UTC pour rester simple et cohérent. */
function utcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Vérifie que `user` peut effectuer une requête, et consomme immédiatement
 * son quota (compteur gratuit puis crédits payants) si c'est le cas.
 */
export async function checkAndConsumeQuota(user: User): Promise<QuotaCheckResult> {
  if (user.organizationId) {
    return { allowed: true };
  }

  const { DAILY_FREE_LIMIT } = getEnv();

  let requestsToday = user.requestsToday;
  let quotaResetAt = user.quotaResetAt;
  const needsReset = quotaResetAt < utcMidnight();

  if (needsReset) {
    requestsToday = 0;
    quotaResetAt = new Date();
  }

  if (requestsToday < DAILY_FREE_LIMIT) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        requestsToday: requestsToday + 1,
        quotaResetAt,
      },
    });
    return { allowed: true };
  }

  if (user.paidCreditsLeft > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        paidCreditsLeft: { decrement: 1 },
        quotaResetAt,
      },
    });
    return { allowed: true };
  }

  if (needsReset) {
    // Le quota a été remis à zéro mais reste épuisé dans le même appel
    // (DAILY_FREE_LIMIT <= 0, cas limite) : on persiste quand même le reset.
    await prisma.user.update({
      where: { id: user.id },
      data: { requestsToday, quotaResetAt },
    });
  }

  return { allowed: false, reason: "quota_reached" };
}

/**
 * Messages localisés affichés quand le quota gratuit est épuisé.
 * NOTE : traductions dyu/mos "best-effort", à faire relire par un locuteur
 * natif avant tout usage réel (voir progress.md).
 */
export const QUOTA_REACHED_MESSAGES: Record<string, string> = {
  fr: "😕 Désolé, vous avez atteint votre limite gratuite de demandes aujourd'hui. Envoyez PAYER pour continuer, ou revenez demain.",
  dyu: "😕 Hakili, i ka fɛn kɛlen bɛ bi. I bɛ se ka PAYER ci walima ka segin sini.",
  mos: "😕 Pardon, y sɛgma zĩ-kãabgo rãmbã yʋʋgo. Tʋm PAYER n paas bɩ y lebg beoogo.",
};
