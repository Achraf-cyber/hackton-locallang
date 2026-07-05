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
import type { LanguageModel, ModelMessage } from "ai";
import { getEnv } from "./env";
import type { LocalLang } from "./modelService";

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

// IMPORTANT : le texte genere ici est ensuite traduit en Dioula/Moore par
// NLLB-200-3.3B (voir model-service), qui reste peu performant sur ces deux
// langues (tres peu de donnees d'entrainement, majoritairement issues de
// corpus religieux, meme dans la plus grosse variante de NLLB). Verifie
// empiriquement (sur la variante distilled-600M, avant migration) : des
// formules de politesse/adieu ("Au revoir.", "Prenez soin de vous.") sont
// systematiquement mal traduites en Moore en invoquant "Zeova"/"Zeeze"
// (Jehovah/Jesus, artefact du corpus d'entrainement). On evite donc de
// GENERER ce type de formule cote Gemini, plutot que d'essayer de corriger
// la traduction en aval.
const NO_SIGNOFF_RULE =
  "Ne termine jamais par une formule de politesse, un souhait, un remerciement " +
  "ou une invitation a revenir (pas de \"n'hesitez pas\", \"bonne journee\", " +
  "\"a bientot\", \"n'hesitez pas a revenir\", etc.). Arrete-toi juste apres " +
  "l'information utile.";

// Le texte produit ici est ensuite traduit automatiquement en Dioula/Mooré
// par NLLB-200 (voir NLLB_MODEL_NAME dans model-service), un modele qui perd
// beaucoup en fidelite sur des phrases longues, ambigues ou idiomatiques.
// Ces regles rendent le francais "facile a traduire machine" : sujet/verbe/
// complement explicites dans chaque phrase, une seule idee par phrase, zero
// figure de style.
const MT_FRIENDLY_RULE =
  "Pour faciliter la traduction automatique qui suit, ecris des phrases " +
  "courtes et grammaticalement completes : sujet + verbe + complement " +
  "explicites (jamais de sujet sous-entendu ou de pronom sans antecedent " +
  "clair dans la meme phrase). Une seule idee par phrase, phrases juxtaposees " +
  "plutot que subordonnees. N'utilise aucune expression idiomatique, " +
  "metaphore ou tournure figuree (pas de \"il ne faut pas tarder\", " +
  "\"du jour au lendemain\", etc.) : dis les choses de maniere litterale. " +
  "N'utilise aucune abreviation ni sigle sans l'ecrire en toutes lettres.";

const SIMPLIFY_SYSTEM = `Tu es un médiateur administratif ouest-africain. Tu réécris un texte
administratif en français très simple, destiné à une personne peu lettrée.
Règles strictes :
- Phrases de 10 mots maximum.
- Zéro jargon administratif ; explique chaque terme par des mots du quotidien.
- Structure la réponse ainsi :
  1) C'est quoi (une phrase).
  2) Les démarches, numérotées (1., 2., 3., ...).
  3) À apporter (liste courte).
- ${NO_SIGNOFF_RULE}
- ${MT_FRIENDLY_RULE}
Réponds uniquement avec le texte simplifié, sans préambule.`;

const ANSWER_SYSTEM = `Tu es un agent d'accueil chaleureux des services publics en Afrique de
l'Ouest. Tu réponds en français très simple (phrases courtes, concrètes,
zéro jargon).
- Salutations, remerciements, politesses ou petite conversation (ex :
  "bonjour", "ça va ?", "merci") : réponds naturellement et brièvement, sans
  rediriger vers un sujet administratif.
- Question sur une démarche administrative : réponds avec des informations
  concrètes, sans inventer.
- Question totalement hors sujet (ex : aide en programmation, culture
  générale sans lien avec les services publics) : recentre poliment vers les
  services publics.
- ${NO_SIGNOFF_RULE}
- ${MT_FRIENDLY_RULE}`;

const READ_IMAGE_SYSTEM = `Tu es un médiateur administratif. On te montre un document (photo ou PDF).
Réponds en français très simple (phrases courtes, zéro jargon), dans cet ordre :
1) Cite les informations les plus importantes ecrites sur le document (maximum
   8 : noms, dates, numeros, montants, adresses, durees de validite...). Une
   information par phrase courte. Si le document contient plus de 8 donnees,
   garde seulement les plus utiles pour la personne.
2) Explique ensuite en 2-3 phrases ce qu'est ce document et ce que la personne
   doit faire.
Reste concis : la reponse totale doit rester courte, elle sera lue a voix haute.
${NO_SIGNOFF_RULE}
${MT_FRIENDLY_RULE}
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

export interface ChatContextMessage {
  role: "user" | "assistant";
  content: string;
}

/** Répond en français très simple à une question d'usager avec historique. */
export async function answerQuestion(
  questionFr: string,
  history?: ChatContextMessage[],
): Promise<string> {
  try {
    const messages: ModelMessage[] = [];
    if (history && history.length > 0) {
      messages.push(...history);
    }
    messages.push({ role: "user", content: questionFr });

    const { text } = await generateText({
      model: model(),
      system: ANSWER_SYSTEM,
      messages,
      temperature: 0.3,
    });
    return text.trim();
  } catch (err) {
    throw new LLMError("Échec de la génération de la réponse.", err);
  }
}

/** Détecte la langue de l'input et la traduit en français standard si nécessaire. */
export async function translateInputToFrench(text: string, lang: LocalLang): Promise<string> {
  const langLabel = lang === "dyu" ? "Dioula" : "Mooré";
  try {
    const { text: result } = await generateText({
      model: model(),
      system: `Tu es un traducteur intelligent. L'usager parle normalement en ${langLabel}. Si le texte suivant est rédigé en Dioula, Bambara, Mooré ou une autre langue locale africaine, traduis-le fidèlement en français standard simple. S'il est déjà en français, renvoie-le mot pour mot sans aucune modification ni ajout de politesse/commentaire.`,
      prompt: text,
      temperature: 0.1,
    });
    return result.trim();
  } catch (err) {
    console.error("Erreur lors de la traduction de l'input par Gemini, utilisation du texte brut:", err);
    return text;
  }
}

/**
 * Arbitre entre deux transcriptions (l'une locale, l'autre française)
 * et produit la version finale consolidée en français standard.
 */
export async function resolveDualTranscription(
  localTranscript: string,
  frenchTranscript: string,
  lang: LocalLang,
): Promise<string> {
  const prompt = `Voici deux transcriptions possibles issues d'un même enregistrement audio d'un utilisateur d'Afrique de l'Ouest :
1) Transcription par un modèle de langue locale (${lang === "dyu" ? "Dioula/Bambara" : "Mossi/Mooré"}) : "${localTranscript}"
2) Transcription par un modèle de langue française : "${frenchTranscript}"

Détermine laquelle des deux transcriptions est cohérente et correspond à un vrai discours (l'autre contenant probablement du charabia/bruit).
- Si l'utilisateur a parlé en français (transcription 2 cohérente), renvoie directement cette version en français standard.
- Si l'utilisateur a parlé en langue locale (transcription 1 cohérente), traduis-la fidèlement en français standard.
Renvoie UNIQUEMENT le texte final traduit ou transcrit en français standard, sans aucun commentaire ou préambule.`;

  try {
    const { text } = await generateText({
      model: model(),
      system: "Tu es un arbitre et traducteur linguistique intelligent.",
      prompt,
      temperature: 0.1,
    });
    return text.trim();
  } catch (err) {
    console.error("Erreur lors de l'arbitrage des transcriptions:", err);
    return frenchTranscript.length > localTranscript.length ? frenchTranscript : localTranscript;
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
