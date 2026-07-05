/**
 * Client HTTP typé du service modèles (Python/FastAPI).
 *
 * Le backend ne connaît le service modèles QUE par ses URL (MODEL_SERVICE_URL /
 * ASR_SERVICE_URL / TTS_SERVICE_URL) : changer d'hébergeur (local -> HF Spaces
 * -> Modal) ou re-répartir les modèles entre Spaces = changer ces variables
 * d'env, jamais ce code. Contrat d'API figé :
 *   POST /transcribe (multipart audio + lang) -> { text }              [ASR_SERVICE_URL]
 *   POST /to-french   (JSON texte langue locale) -> { text_fr }        [MODEL_SERVICE_URL]
 *   POST /translate   (JSON texte fr + lang)   -> { translated }       [MODEL_SERVICE_URL]
 *   POST /speak       (JSON texte DÉJÀ en langue locale + lang) -> { audio_url } [TTS_SERVICE_URL]
 *   POST /localize    (JSON texte fr + lang)   -> { translated, audio_url } (legacy,
 *                      traduction+TTS dans le même appel — conservé côté
 *                      model-service pour le dev local "un seul Space", plus
 *                      utilisé par ce client depuis le split translate/speak)
 */

import { getEnv } from "./env";

export type LocalLang = "dyu" | "mos";
export type AsrLang = LocalLang | "fra";

export class ModelServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ModelServiceError";
  }
}

function baseUrl(): string {
  return getEnv().MODEL_SERVICE_URL.replace(/\/$/, "");
}

/** URL du Space ASR (voir model-service/Dockerfile.asr), separe du Space
 * traduction/TTS. Retombe sur MODEL_SERVICE_URL si ASR_SERVICE_URL n'est pas
 * defini (mode "un seul Space"). */
function asrBaseUrl(): string {
  const env = getEnv();
  return (env.ASR_SERVICE_URL ?? env.MODEL_SERVICE_URL).replace(/\/$/, "");
}

/** URL du Space TTS (voir model-service/Dockerfile.omnivoice), separe du
 * Space traduction. Retombe sur MODEL_SERVICE_URL si TTS_SERVICE_URL n'est
 * pas defini (mode "un seul Space"). */
function ttsBaseUrl(): string {
  const env = getEnv();
  return (env.TTS_SERVICE_URL ?? env.MODEL_SERVICE_URL).replace(/\/$/, "");
}

/** Rend l'audio_url renvoyé par un service (chemin relatif) absolu, en le
 * résolvant contre l'URL de CE service (l'audio est servi par le service qui
 * l'a généré, pas forcément MODEL_SERVICE_URL). */
export function toAbsoluteAudioUrl(audioUrl: string, base: string = baseUrl()): string {
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return `${base}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
}

async function readError(res: Response): Promise<never> {
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  throw new ModelServiceError(
    `model-service ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    res.status,
  );
}

/** Voix (langue locale) -> texte. */
export async function transcribe(
  audio: Buffer | Uint8Array,
  filename: string,
  lang: AsrLang,
): Promise<{ text: string }> {
  const form = new FormData();
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  form.append("file", new Blob([bytes as BlobPart]), filename);
  form.append("lang", lang);

  let res: Response;
  try {
    res = await fetch(`${asrBaseUrl()}/transcribe`, { method: "POST", body: form });
  } catch (err) {
    throw new ModelServiceError(
      `Impossible de joindre le service modèles (/transcribe): ${(err as Error).message}`,
    );
  }
  if (!res.ok) await readError(res);
  return (await res.json()) as { text: string };
}

/** Texte en langue locale -> français. */
export async function toFrench(
  text: string,
  fromLang: LocalLang,
): Promise<{ textFr: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/to-french`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: fromLang }),
    });
  } catch (err) {
    throw new ModelServiceError(
      `Impossible de joindre le service modèles (/to-french): ${(err as Error).message}`,
    );
  }
  if (!res.ok) await readError(res);
  const data = (await res.json()) as { text_fr: string };
  return { textFr: data.text_fr };
}

/** Texte français -> langue locale + audio.
 *
 * Fait DEUX appels HTTP (traduction puis TTS) au lieu d'un seul /localize :
 * NLLB-200-3.3B (traduction) et OmniVoice (TTS dyu) vivent dans deux Spaces
 * séparés (16 Go de RAM chacun) depuis que les charger ensemble faisait
 * dépasser la RAM disponible et crasher le Space (OOM). Si TTS_SERVICE_URL
 * n'est pas défini, les deux appels retombent sur le même Space.
 */
export async function localize(
  textFr: string,
  lang: LocalLang,
): Promise<{ translated: string; audioUrl: string }> {
  let translateRes: Response;
  try {
    translateRes = await fetch(`${baseUrl()}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_fr: textFr, lang }),
    });
  } catch (err) {
    throw new ModelServiceError(
      `Impossible de joindre le service modèles (/translate): ${(err as Error).message}`,
    );
  }
  if (!translateRes.ok) await readError(translateRes);
  const { translated } = (await translateRes.json()) as { translated: string };

  const { audioUrl } = await speak(translated, lang);
  return { translated, audioUrl };
}

/**
 * Synthèse vocale PURE (pas de traduction) pour du texte déjà écrit dans la
 * langue cible. À utiliser pour les messages d'interface fixes (menus,
 * accueil...) déjà rédigés/relus en dyu/mos — surtout PAS `localize()`, qui
 * traduit systématiquement depuis le français et produirait un résultat
 * incorrect si le texte d'entrée est déjà en langue locale.
 */
export async function speak(text: string, lang: LocalLang): Promise<{ audioUrl: string }> {
  let res: Response;
  try {
    res = await fetch(`${ttsBaseUrl()}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
  } catch (err) {
    throw new ModelServiceError(
      `Impossible de joindre le service modèles (/speak): ${(err as Error).message}`,
    );
  }
  if (!res.ok) await readError(res);
  const data = (await res.json()) as { audio_url: string };
  return { audioUrl: toAbsoluteAudioUrl(data.audio_url, ttsBaseUrl()) };
}
