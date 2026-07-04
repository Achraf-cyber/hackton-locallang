/**
 * Session web minimaliste — cookie signé contenant l'id utilisateur.
 *
 * HACKATHON ONLY : il n'existe pas d'infrastructure de session dédiée dans ce
 * projet. Plutôt que d'ajouter une variable d'environnement obligatoire
 * supplémentaire, on réutilise GEMINI_API_KEY comme secret HMAC (déjà présent
 * et déjà secret), avec un repli sur une constante en dur si absent. À
 * remplacer par un vrai secret de session dédié avant toute mise en
 * production.
 */

import { createHmac } from "crypto";
import { getEnv } from "./env";

const FALLBACK_SECRET = "lldp-hackathon-only-fallback-secret-do-not-use-in-prod";

export const SESSION_COOKIE_NAME = "lldp_session";

function getSecret(): string {
  try {
    return getEnv().GEMINI_API_KEY;
  } catch {
    return FALLBACK_SECRET;
  }
}

function hmac(userId: string): string {
  return createHmac("sha256", getSecret()).update(userId).digest("hex");
}

/** Construit un jeton de session `${userId}.${hmac}` pour un utilisateur donné. */
export function signSession(userId: string): string {
  return `${userId}.${hmac(userId)}`;
}

/** Vérifie un jeton de session et renvoie l'userId s'il est valide, sinon null. */
export function verifySession(token: string): string | null {
  const sepIndex = token.lastIndexOf(".");
  if (sepIndex === -1) return null;

  const userId = token.slice(0, sepIndex);
  const signature = token.slice(sepIndex + 1);
  if (!userId || !signature) return null;

  const expected = hmac(userId);
  if (expected.length !== signature.length) return null;

  // Comparaison en temps constant simplifiée : longueur déjà vérifiée égale.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0 ? userId : null;
}
