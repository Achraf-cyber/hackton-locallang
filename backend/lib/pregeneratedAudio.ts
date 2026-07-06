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
  return `/audio/${key}-${lang}.ogg`;
}

/**
 * URL de CE déploiement pour se relire soi-même (public/audio/*.ogg).
 *
 * IMPORTANT : VERCEL_URL pointe vers le nom d'hôte *spécifique à ce
 * déploiement* (ex. hackton-locallang-<hash>-<team>.vercel.app), qui est
 * couvert par la "Vercel Authentication" (Deployment Protection) de ce
 * projet -- confirmé en prod : une requête vers cette URL renvoie une 302
 * vers vercel.com/sso-api (page de login), jamais le fichier audio. Résultat
 * AVANT ce fix : fetchPregeneratedAudio() échouait silencieusement à CHAQUE
 * appel en prod (res.ok faux, ou pire, un flux HTML de login confondu avec
 * de l'audio), et le bot retombait systématiquement sur la génération TTS
 * à la volée -- gaspillant tout le travail de pré-génération.
 *
 * VERCEL_PROJECT_PRODUCTION_URL, également défini automatiquement par
 * Vercel, pointe lui vers le domaine assigné au projet (l'alias
 * *.vercel.app ou domaine custom), qui n'est PAS derrière ce mur
 * d'authentification (confirmé : réponse 200 directe). À utiliser en
 * priorité ; VERCEL_URL reste un repli pour les cas où seule cette variable
 * serait définie (ne devrait plus arriver sur Vercel récent), et
 * DEMO_BASE_URL le dernier repli pour le dev local hors Vercel.
 */
function ownBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return getEnv().DEMO_BASE_URL.replace(/\/$/, "");
}

const OGG_MAGIC = Buffer.from("OggS");

/** Tente de récupérer un audio pré-généré ; renvoie null si absent (l'appelant doit alors générer en direct). */
export async function fetchPregeneratedAudio(key: string, lang: string): Promise<Buffer | null> {
  const baseUrl = ownBaseUrl();
  try {
    const res = await fetch(`${baseUrl}${pregeneratedAudioPath(key, lang)}`);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Garde-fou : un mur d'auth/redirect mal configuré peut renvoyer une
    // page HTML avec un statut 200 (ex. après avoir suivi une redirection de
    // login) -- vérifier l'en-tête OGG réel plutôt que de faire confiance à
    // res.ok seul, pour ne jamais transmettre autre chose que de l'audio.
    if (!buffer.subarray(0, 4).equals(OGG_MAGIC)) return null;
    return buffer;
  } catch {
    return null;
  }
}
