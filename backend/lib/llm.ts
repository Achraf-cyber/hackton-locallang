/**
 * Couche LLM — TOUT appel au modèle de langage passe par ici.
 *
 * On utilise le Vercel AI SDK (`ai` + `@ai-sdk/google`) et jamais le SDK Google
 * natif ailleurs : changer de fournisseur = changer le provider importé ici et
 * process.env.LLM_MODEL, rien d'autre. Le service modèles (Python) ne parle
 * JAMAIS à Gemini ; seul ce fichier le fait.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { getEnv } from "./env";

export class LLMError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

function model(): LanguageModel {
  const env = getEnv();
  const provider = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  // LLM_MODEL peut être préfixé "google/" (format gateway) — on le retire pour
  // le provider natif @ai-sdk/google.
  const modelId = env.LLM_MODEL.replace(/^google\//, "");
  return provider(modelId);
}

const SIMPLIFY_SYSTEM = `Tu es un médiateur administratif ouest-africain. Tu réécris un texte
administratif en français très simple, destiné à une personne peu lettrée.
Règles strictes :
- Phrases de 10 mots maximum.
- Zéro jargon administratif ; explique chaque terme par des mots du quotidien.
- Structure la réponse ainsi :
  1) C'est quoi (une phrase).
  2) Les démarches, numérotées (1., 2., 3., ...).
  3) À apporter (liste courte).
Réponds uniquement avec le texte simplifié, sans préambule.`;

const ANSWER_SYSTEM = `Tu es un agent d'accueil des services publics en Afrique de l'Ouest.
Tu réponds en français très simple (phrases courtes, concrètes, zéro jargon) à
la question d'un usager sur une démarche administrative. Si la question sort du
domaine administratif/services publics, recentre poliment vers ce domaine sans
inventer d'information.`;

const READ_IMAGE_SYSTEM = `Tu es un médiateur administratif. On te montre la photo d'un document.
Explique en français très simple ce que dit ce document et ce que la personne
doit faire (phrases courtes, zéro jargon). Si l'image est illisible ou n'est pas
un document exploitable, dis-le honnêtement au lieu d'inventer.`;

/** Réécrit un texte administratif français en français très simple. */
export async function simplify(textFr: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: model(),
      system: SIMPLIFY_SYSTEM,
      prompt: textFr,
      temperature: 0.3,
    });
    return text.trim();
  } catch (err) {
    throw new LLMError("Échec de la simplification du texte.", err);
  }
}

/** Répond en français très simple à une question d'usager. */
export async function answerQuestion(questionFr: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: model(),
      system: ANSWER_SYSTEM,
      prompt: questionFr,
      temperature: 0.3,
    });
    return text.trim();
  } catch (err) {
    throw new LLMError("Échec de la génération de la réponse.", err);
  }
}

/** Explique en français très simple le contenu d'une photo de document. */
export async function readDocumentImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  try {
    const { text } = await generateText({
      model: model(),
      system: READ_IMAGE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Explique ce document en français très simple.",
            },
            { type: "file", mediaType: mimeType, data: imageBuffer },
          ],
        },
      ],
      temperature: 0.3,
    });
    return text.trim();
  } catch (err) {
    throw new LLMError("Échec de la lecture du document.", err);
  }
}
