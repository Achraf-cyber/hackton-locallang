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

/**
 * Cherche un statusCode HTTP dans une erreur du Vercel AI SDK, en descendant
 * dans les causes imbriquées (AI_RetryError -> AI_APICallError -> ...).
 */
function findStatusCode(err: unknown, depth = 0): number | undefined {
  if (!err || typeof err !== "object" || depth > 5) return undefined;
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.statusCode === "number") return anyErr.statusCode;
  if (Array.isArray(anyErr.errors)) {
    for (const nested of anyErr.errors) {
      const found = findStatusCode(nested, depth + 1);
      if (found) return found;
    }
  }
  if (anyErr.cause) return findStatusCode(anyErr.cause, depth + 1);
  return undefined;
}

/** Vrai si l'erreur (ou une de ses causes imbriquées) est un 429 (quota Gemini). */
export function isRateLimitError(err: unknown): boolean {
  return findStatusCode(err) === 429;
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

const READ_IMAGE_SYSTEM = `Tu es un médiateur administratif. On te montre un document (photo ou PDF).
Réponds en français très simple (phrases courtes, zéro jargon), dans cet ordre :
1) Cite les informations les plus importantes ecrites sur le document (maximum
   8 : noms, dates, numeros, montants, adresses, durees de validite...). Une
   information par phrase courte. Si le document contient plus de 8 donnees,
   garde seulement les plus utiles pour la personne.
2) Explique ensuite en 2-3 phrases ce qu'est ce document et ce que la personne
   doit faire.
Reste concis : la reponse totale doit rester courte, elle sera lue a voix haute.
Si le document est illisible ou n'est pas exploitable, dis-le honnêtement au
lieu d'inventer une information.`;

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

/**
 * Extrait les informations et explique le contenu d'un document (photo ou
 * PDF) en français très simple. `mimeType` peut être une image (image/*)
 * ou "application/pdf" — Gemini comprend les deux nativement.
 */
export async function readDocumentImage(
  fileBuffer: Buffer,
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
              text: "Lis ce document et explique-le en français très simple.",
            },
            { type: "file", mediaType: mimeType, data: fileBuffer },
          ],
        },
      ],
      temperature: 0.3,
      // Garde-fou : un document tres dense ne doit pas produire un texte si
      // long que la synthese vocale (segment par segment) prenne des minutes.
      // thinkingBudget: 0 desactive le raisonnement interne de Gemini 2.5,
      // qui sinon consomme une partie du budget maxOutputTokens avant meme
      // de generer le texte visible (reponse tronquee sinon).
      maxOutputTokens: 700,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });
    return text.trim();
  } catch (err) {
    throw new LLMError("Échec de la lecture du document.", err);
  }
}
