/**
 * Audio pré-généré pour les messages d'interface FIXES (menus, prompts,
 * erreurs...) — voir scripts/pregenerate-audio.ts, qui écrit ces fichiers
 * dans public/audio/ une fois pour toutes (déployés avec le reste de l'app,
 * jamais purgés). But : un usager ne doit JAMAIS attendre la génération TTS
 * pour un message dont le texte est déjà connu à l'avance ; seule une
 * réponse imprévisible (réponse Gemini à une vraie question) justifie une
 * génération à la demande (voir lib/audioCache.ts, toujours utilisé en
 * repli si le fichier pré-généré est absent).
 */
import { getEnv } from "./env";

export function pregeneratedAudioPath(key: string, lang: string): string {
  return `/audio/${key}-${lang}.wav`;
}

/**
 * URL de CE déploiement pour se relire soi-même (public/audio/*.wav). Utilise
 * VERCEL_URL en priorité : Vercel le définit automatiquement sur CHAQUE
 * déploiement (prod ou preview), sans configuration manuelle -- contrairement
 * à DEMO_BASE_URL (variable configurée à la main dans les Secrets du projet,
 * qui pourrait rester sur son défaut localhost si on oublie de la renseigner
 * en prod, ce qui casserait silencieusement ce fallback en prod). Ne retombe
 * sur DEMO_BASE_URL que hors Vercel (dev local).
 */
function ownBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return getEnv().DEMO_BASE_URL.replace(/\/$/, "");
}

/** Tente de récupérer un audio pré-généré ; renvoie null si absent (l'appelant doit alors générer en direct). */
export async function fetchPregeneratedAudio(key: string, lang: string): Promise<Buffer | null> {
  const baseUrl = ownBaseUrl();
  try {
    const res = await fetch(`${baseUrl}${pregeneratedAudioPath(key, lang)}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
