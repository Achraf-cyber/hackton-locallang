/**
 * Orchestrateur — le cœur métier du backend.
 *
 * Combine la couche LLM (lib/llm.ts, Gemini) et le client du service modèles
 * (lib/modelService.ts, dyu/mos). Chaque fonction renvoie { result, steps,
 * timings } pour alimenter l'affichage "détails techniques" côté client.
 */

import { answerQuestion, readDocumentImage, simplify } from "./llm";
import type { LocalLang } from "./modelService";
import { localize, toFrench, transcribe } from "./modelService";

export interface OrchestratorResult {
  result: { translated: string; audioUrl: string; transcript?: string };
  steps: string[];
  timings: Record<string, number>;
}

async function timed<T>(
  label: string,
  steps: string[],
  timings: Record<string, number>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    timings[label] = ms;
    steps.push(label);
     
    console.log(`[orchestrator] ${label}: ${ms}ms`);
  }
}

/** Document français à simplifier -> réponse simplifiée + audio en langue locale. */
export async function explainDocument(
  textFr: string,
  lang: LocalLang,
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  const simplified = await timed("simplify", steps, timings, () => simplify(textFr));
  const local = await timed("localize", steps, timings, () => localize(simplified, lang));

  return { result: local, steps, timings };
}

/** Question française -> réponse simple + audio en langue locale. */
export async function answerInLanguage(
  questionFr: string,
  lang: LocalLang,
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  const answer = await timed("answer", steps, timings, () => answerQuestion(questionFr));
  const local = await timed("localize", steps, timings, () => localize(answer, lang));

  return { result: local, steps, timings };
}

/** Photo de document -> explication + audio en langue locale. */
export async function explainPhoto(
  imageBuffer: Buffer,
  mimeType: string,
  lang: LocalLang,
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  const explanation = await timed("readImage", steps, timings, () =>
    readDocumentImage(imageBuffer, mimeType),
  );
  const local = await timed("localize", steps, timings, () => localize(explanation, lang));

  return { result: local, steps, timings };
}

/** Voix (langue locale) -> réponse vocale (langue locale). */
export async function voiceToVoice(
  audioBuffer: Buffer,
  filename: string,
  userLang: LocalLang,
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  const { text } = await timed("transcribe", steps, timings, () =>
    transcribe(audioBuffer, filename, userLang),
  );
  const { textFr } = await timed("toFrench", steps, timings, () =>
    toFrench(text, userLang),
  );
  const answer = await timed("answer", steps, timings, () => answerQuestion(textFr));
  const local = await timed("localize", steps, timings, () => localize(answer, userLang));

  return {
    result: { ...local, transcript: text },
    steps,
    timings,
  };
}
