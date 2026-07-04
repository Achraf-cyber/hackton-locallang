/**
 * Orchestrateur — le cœur métier du backend.
 *
 * Combine la couche LLM (lib/llm.ts, Gemini) et le client du service modèles
 * (lib/modelService.ts, dyu/mos). Chaque fonction renvoie { result, steps,
 * timings } pour alimenter l'affichage "détails techniques" côté client.
 */

import {
  answerQuestion,
  readDocumentImage,
  simplify,
  translateInputToFrench,
  resolveDualTranscription,
} from "./llm";
import type { ChatContextMessage } from "./llm";
import type { LocalLang } from "./modelService";
import { localize, transcribe } from "./modelService";

export interface OrchestratorResult {
  result: { translated: string; audioUrl: string; transcript?: string; sourceFr: string };
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

  return { result: { ...local, sourceFr: simplified }, steps, timings };
}

/** Question écrite (français ou langue locale) -> réponse simple + audio en langue locale. */
export async function answerInLanguage(
  questionRaw: string,
  lang: LocalLang,
  history?: ChatContextMessage[],
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  // Étape 1 : S'assurer que le texte est traduit en français
  const questionFr = await timed("translate_input", steps, timings, () =>
    translateInputToFrench(questionRaw, lang),
  );

  // Étape 2 : Répondre à la question avec le contexte de conversation
  const answer = await timed("answer", steps, timings, () =>
    answerQuestion(questionFr, history),
  );

  // Étape 3 : Traduire et synthétiser la réponse en langue locale
  const local = await timed("localize", steps, timings, () => localize(answer, lang));

  return { result: { ...local, sourceFr: answer }, steps, timings };
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

  return { result: { ...local, sourceFr: explanation }, steps, timings };
}

/** Voix (français ou langue locale) -> réponse vocale (langue locale). */
export async function voiceToVoice(
  audioBuffer: Buffer,
  filename: string,
  userLang: LocalLang,
  history?: ChatContextMessage[],
): Promise<OrchestratorResult> {
  const steps: string[] = [];
  const timings: Record<string, number> = {};

  // Transcription en parallèle (langue locale et français)
  const [resLocal, resFr] = await timed("transcribe_dual", steps, timings, () =>
    Promise.all([
      transcribe(audioBuffer, filename, userLang).catch((err) => {
        console.error("Local ASR failed:", err);
        return { text: "" };
      }),
      transcribe(audioBuffer, filename, "fra").catch((err) => {
        console.error("French ASR failed:", err);
        return { text: "" };
      }),
    ]),
  );

  const localText = resLocal.text;
  const frText = resFr.text;

  // Arbitrage et traduction de l'audio en français
  const textFr = await timed("resolve_transcription", steps, timings, () =>
    resolveDualTranscription(localText, frText, userLang),
  );

  // Répondre à la question avec le contexte de conversation
  const answer = await timed("answer", steps, timings, () =>
    answerQuestion(textFr, history),
  );

  // Traduire et synthétiser la réponse en langue locale
  const local = await timed("localize", steps, timings, () => localize(answer, userLang));

  return {
    result: { ...local, transcript: textFr, sourceFr: answer },
    steps,
    timings,
  };
}
