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

/** Tente de récupérer un audio pré-généré ; renvoie null si absent (l'appelant doit alors générer en direct). */
export async function fetchPregeneratedAudio(key: string, lang: string): Promise<Buffer | null> {
  const baseUrl = getEnv().DEMO_BASE_URL.replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}${pregeneratedAudioPath(key, lang)}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
