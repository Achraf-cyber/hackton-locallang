/**
 * Client HTTP typé du service modèles (Python/FastAPI).
 *
 * Le backend ne connaît le service modèles QUE par son URL (MODEL_SERVICE_URL) :
 * changer d'hébergeur (local -> HF Spaces -> Modal) = changer cette variable
 * d'env, jamais ce code. Contrat d'API figé :
 *   POST /transcribe (multipart audio + lang) -> { text }
 *   POST /to-french   (JSON texte langue locale) -> { text_fr }
 *   POST /localize    (JSON texte fr + lang)   -> { translated, audio_url }
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

/** Rend l'audio_url renvoyé par le service (chemin relatif) absolu. */
export function toAbsoluteAudioUrl(audioUrl: string): string {
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return `${baseUrl()}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
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
    res = await fetch(`${baseUrl()}/transcribe`, { method: "POST", body: form });
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

/** Texte français -> langue locale + audio. */
export async function localize(
  textFr: string,
  lang: LocalLang,
): Promise<{ translated: string; audioUrl: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/localize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_fr: textFr, lang }),
    });
  } catch (err) {
    throw new ModelServiceError(
      `Impossible de joindre le service modèles (/localize): ${(err as Error).message}`,
    );
  }
  if (!res.ok) await readError(res);
  const data = (await res.json()) as { translated: string; audio_url: string };
  return { translated: data.translated, audioUrl: toAbsoluteAudioUrl(data.audio_url) };
}
