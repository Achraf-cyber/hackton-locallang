/**
 * Quota gratuit quotidien — effectivement DÉSACTIVÉ (voir DAILY_FREE_LIMIT
 * ci-dessous) : la logique de comptage/reset reste en place (utile si on
 * veut réactiver une vraie limite plus tard), mais le plafond lui-même est
 * fixé en dur à une valeur qu'aucun usage réel ne peut atteindre, PLUTÔT que
 * lu depuis la variable d'env DAILY_FREE_LIMIT (voir lib/env.ts) -- on ne
 * peut pas garantir depuis ce dépôt quelle valeur est réellement configurée
 * sur le dashboard Vercel de prod (indépendante de .env.prod, qui n'est
 * qu'un fichier de référence local jamais poussé automatiquement), donc on
 * ne peut pas se fier à "juste augmenter la valeur par défaut" pour être sûr
 * que la limite ne sera jamais atteinte en prod. Un plafond en dur dans le
 * code, indépendant de toute config externe, est la seule garantie fiable.
 * Les utilisateurs rattachés à une Organization ne sont de toute façon
 * jamais bloqués (facturation gérée séparément) -- ceci s'applique aux
 * usagers "free" (widget web anonyme, chat Telegram sans organisation).
 */
import type { User } from "@prisma/client";
import { prisma } from "./db";

const DAILY_FREE_LIMIT = 1_000_000;

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
 *
 * Tout est fait via `updateMany` avec une condition `where` (increment/
 * decrement conditionnels atomiques), PAS via un read-then-write classique
 * (lire requestsToday, comparer en JS, puis écrire séparément) : deux
 * requêtes concurrentes du même utilisateur liraient toutes les deux la
 * même valeur avant que l'une ou l'autre n'écrive, et pourraient donc
 * toutes les deux passer le contrôle en ne comptant qu'un incrément au
 * final — laissant passer une requête de trop au-delà de la limite. Le
 * `count` de lignes affectées par `updateMany` dit si CET appel a
 * effectivement pu consommer le quota, sans cette fenêtre de course.
 */
export async function checkAndConsumeQuota(user: User): Promise<QuotaCheckResult> {
  if (user.organizationId) {
    return { allowed: true };
  }

  const midnight = utcMidnight();

  if (user.quotaResetAt < midnight) {
    // Reset conditionnel : le `where` sur quotaResetAt évite qu'un reset
    // concurrent ne réapplique le reset après qu'une autre requête l'a
    // déjà fait (et déjà potentiellement incrémenté requestsToday derrière).
    await prisma.user.updateMany({
      where: { id: user.id, quotaResetAt: { lt: midnight } },
      data: { requestsToday: 0, quotaResetAt: new Date() },
    });
  }

  const freeResult = await prisma.user.updateMany({
    where: { id: user.id, requestsToday: { lt: DAILY_FREE_LIMIT } },
    data: { requestsToday: { increment: 1 } },
  });
  if (freeResult.count > 0) {
    return { allowed: true };
  }

  const paidResult = await prisma.user.updateMany({
    where: { id: user.id, paidCreditsLeft: { gt: 0 } },
    data: { paidCreditsLeft: { decrement: 1 } },
  });
  if (paidResult.count > 0) {
    return { allowed: true };
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
