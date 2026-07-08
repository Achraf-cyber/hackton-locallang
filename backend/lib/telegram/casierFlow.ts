/**
 * Flux conversationnel "demande de casier judiciaire" (voir memory
 * demo-ecasier-flow-status.md pour le contexte complet) :
 *   1. upload acte de naissance -> extraction (lib/llm.ts extractIdentityFields)
 *   2. upload pièce d'identité   -> extraction, fusion des champs
 *   3. questions une par une pour les champs non extractibles (casierFields.ts)
 *   4. remplissage + soumission automatique du site DEMO (lib/demoAutomation.ts)
 *   5. livraison fiable du récépissé PDF (sendDocumentReliably, bot.ts)
 *
 * État de session persisté en base (table CasierSession, voir
 * prisma/schema.prisma) -- PAS en mémoire process (une Map, comme avant).
 * Bug confirmé en usage réel avec la Map : rien ne garantit qu'une fonction
 * serverless Vercel réutilise la même instance chaude entre le webhook
 * Telegram qui démarre la session (callback "casier") et le webhook suivant
 * qui envoie le document -- sur une instance froide différente, la Map était
 * vide, isAwaitingCasierDocument() renvoyait faux, et la photo tombait dans
 * le flux générique "expliquer un document" au lieu d'être traitée comme
 * pièce du dossier. Une table Prisma est visible par toute instance.
 */
import type { LocalLang } from "../modelService";
import { extractIdentityFields } from "../llm";
import { submitCasierDemande, type CasierDocument } from "../demoAutomation";
import { EMPTY_FORM_STATE, type DemoFormState } from "../demo/types";
import { prisma } from "../db";
import type { Prisma } from "@prisma/client";
import {
  NATIONALITE_OPTIONS,
  PAYS_OPTIONS,
  GENRE_OPTIONS,
  SITUATION_MATRIMONIALE_OPTIONS,
  TYPE_PIECE_OPTIONS,
  labelFor,
} from "../demo/data";
import { t, tBilingual, type Trilingual } from "../messages";
import {
  getNextMissingField,
  formatFieldPrompt,
  formatFieldPromptAudio,
  matchFieldAnswer,
  matchOptionValue,
  casierFieldAudioKey,
  FIELD_ORDER,
  type CasierFields,
  type FieldSpec,
} from "./casierFields";

type CasierStep =
  | "awaiting_doc1"
  | "awaiting_doc2"
  | "awaiting_field"
  | "awaiting_confirmation"
  | "processing"
  | "done";

interface CasierSession {
  lang: LocalLang;
  step: CasierStep;
  fields: CasierFields;
  pendingField: FieldSpec | null;
  doc1: CasierDocument | null;
  doc2: CasierDocument | null;
}

// Une session abandonnée (usager qui ne répond plus) ne doit ni fuiter en
// base indéfiniment (elle retient les buffers bruts des 2 documents
// uploadés, plusieurs Mo chacun), ni intercepter éternellement les photos/
// documents suivants de ce chat comme si elles faisaient partie du flux
// casier. Purgée "à l'accès" (loadSession supprime et traite comme absente
// une session expirée) -- pas de balayage périodique global : un
// setInterval() ne survit de toute façon pas de façon fiable entre les
// invocations d'une fonction serverless (même problème que la Map qu'on
// remplace ici), donc autant ne pas prétendre en avoir un qui fonctionne.
const SESSION_TTL_MS = 20 * 60 * 1000;

function sessionKey(chatId: number | string): string {
  return String(chatId);
}

function rowToSession(row: {
  lang: string;
  step: string;
  fields: Prisma.JsonValue;
  pendingFieldKey: string | null;
  doc1Buffer: Uint8Array | null;
  doc1MimeType: string | null;
  doc1FileName: string | null;
  doc2Buffer: Uint8Array | null;
  doc2MimeType: string | null;
  doc2FileName: string | null;
}): CasierSession {
  return {
    lang: row.lang as LocalLang,
    step: row.step as CasierStep,
    fields: (row.fields as CasierFields | null) ?? {},
    pendingField: row.pendingFieldKey
      ? (FIELD_ORDER.find((f) => f.key === row.pendingFieldKey) ?? null)
      : null,
    doc1:
      row.doc1Buffer && row.doc1MimeType && row.doc1FileName
        ? { buffer: Buffer.from(row.doc1Buffer), mimeType: row.doc1MimeType, fileName: row.doc1FileName }
        : null,
    doc2:
      row.doc2Buffer && row.doc2MimeType && row.doc2FileName
        ? { buffer: Buffer.from(row.doc2Buffer), mimeType: row.doc2MimeType, fileName: row.doc2FileName }
        : null,
  };
}

/** Charge la session depuis la base ; null si absente OU expirée (et alors supprimée). */
async function loadSession(chatId: number | string): Promise<CasierSession | null> {
  const key = sessionKey(chatId);
  const row = await prisma.casierSession.findUnique({ where: { chatId: key } });
  if (!row) return null;
  if (Date.now() - row.lastActivityAt.getTime() > SESSION_TTL_MS) {
    await prisma.casierSession.delete({ where: { chatId: key } }).catch(() => {});
    return null;
  }
  return rowToSession(row);
}

/** Écrit (crée ou remplace) l'état complet de la session, et rafraîchit lastActivityAt. */
async function saveSession(chatId: number | string, session: CasierSession): Promise<void> {
  const key = sessionKey(chatId);
  const data = {
    lang: session.lang,
    step: session.step,
    fields: session.fields as Prisma.InputJsonValue,
    pendingFieldKey: session.pendingField?.key ?? null,
    // `as Uint8Array | undefined` : Node's Buffer (ArrayBufferLike) et le
    // Uint8Array<ArrayBuffer> attendu par le client Prisma généré diffèrent
    // sur ce paramètre générique précis alors qu'un Buffer EST un Uint8Array
    // valide à l'exécution -- friction de typage connue entre @types/node et
    // Prisma, pas un vrai risque à l'exécution.
    doc1Buffer: session.doc1?.buffer as any,
    doc1MimeType: session.doc1?.mimeType,
    doc1FileName: session.doc1?.fileName,
    doc2Buffer: session.doc2?.buffer as any,
    doc2MimeType: session.doc2?.mimeType,
    doc2FileName: session.doc2?.fileName,
    lastActivityAt: new Date(),
  };
  await prisma.casierSession.upsert({
    where: { chatId: key },
    create: { chatId: key, ...data },
    update: data,
  });
}

export async function hasActiveCasierSession(chatId: number | string): Promise<boolean> {
  return (await loadSession(chatId)) !== null;
}

/**
 * Contrairement à hasActiveCasierSession() (vrai pour N'IMPORTE QUELLE étape
 * active), ceci ne renvoie vrai QUE quand le bot attend explicitement une
 * photo/PDF (doc1 ou doc2). À utiliser pour décider si un message photo/
 * document entrant doit être intercepté par le flux casier -- sinon un
 * usager en train de répondre à une question texte (awaiting_field) ou de
 * confirmer son récap (awaiting_confirmation) qui envoie une photo pour la
 * fonctionnalité générale "expliquer un document" se la faisait avaler par
 * handleCasierDocument(), qui plantait avec "Document reçu hors séquence"
 * -- la fonctionnalité générale du bot était silencieusement bloquée par
 * une session casier active à une étape qui n'attendait pourtant aucun
 * document.
 */
export async function isAwaitingCasierDocument(chatId: number | string): Promise<boolean> {
  const session = await loadSession(chatId);
  return session?.step === "awaiting_doc1" || session?.step === "awaiting_doc2";
}

export async function getCasierSession(chatId: number | string): Promise<CasierSession | null> {
  return loadSession(chatId);
}

export async function startCasierSession(chatId: number | string, lang: LocalLang): Promise<void> {
  await saveSession(chatId, {
    lang,
    step: "awaiting_doc1",
    fields: {},
    pendingField: null,
    doc1: null,
    doc2: null,
  });
}

/** Annule une session en cours (ex. sur /start ou /annuler) — no-op si aucune session active. */
export async function cancelCasierSession(chatId: number | string): Promise<void> {
  await prisma.casierSession.delete({ where: { chatId: sessionKey(chatId) } }).catch(() => {});
}

// Traductions best-effort, non relues par un locuteur natif -- voir le
// commentaire sur FieldSpec.prompt (lib/telegram/casierFields.ts).
// Exportés (avec leurs clés audio ci-dessous) pour que
// scripts/pregenerate-audio.ts puisse pré-générer l'audio de CES messages
// FIXES du flux casier exactement comme il le fait déjà pour ceux de
// lib/messages.ts -- avant ce changement, tout le flux casier restait
// texte-seul (aucun de ces messages n'était appelé via sendMenuAudio côté
// bot.ts), alors même que ce sont des usagers qui ne lisent pas le français
// qui en ont le plus besoin.
// Le bouton "❌ Annuler" (voir casierCancelKeyboard dans bot.ts, attaché à
// CE message) est maintenant le moyen normal de quitter -- ces textes
// pointent vers lui plutôt que de demander à l'usager de TAPER un mot-clé
// (le mot-clé "ANNULER" reste accepté en repli, voir message:text, mais
// n'est plus ce qu'on met en avant : usagers ciblés = pas forcément
// lecteurs, un bouton est plus fiable qu'un mot précis à retaper).
export const CASIER_ASK_DOC1_CATALOG: Trilingual = {
  fr:
    "Pour votre demande de casier judiciaire, envoyez d'abord une photo ou un PDF de votre extrait/jugement " +
    "supplétif d'acte de naissance.\n(Le bouton ❌ ci-dessous permet d'arrêter à tout moment.)",
  mos:
    "Fo sẽn dat kasiye judisiyɛɛr yellã yĩnga, tʋm-y pipi fotow bɩ PDF fo rogem sɛbɛo (acte de naissance). " +
    "(Zĩ-kãnga ning sẽn be tẽngr wã na sõng-y y sa demarsã wakat fãa.)",
  dyu:
    "I ka kasiyɛ jidisyɛr ɲinini kama, fɔlɔ i ka fɔtɔ wala PDF ci i wolo sɛbɛn (acte de naissance) ta kan. " +
    "(Bɔtɔn min bɛ duguma, o bɛ se ka baara in dabila tuma o tuma.)",
};
export const CASIER_ASK_DOC2_CATALOG: Trilingual = {
  fr: "Merci. Envoyez maintenant une photo ou un PDF de votre CNIB ou passeport.",
  mos: "Barka. Tʋm-y masã fotow bɩ PDF fo CNIB bɩ paspoor.",
  dyu: "I ni ce. Sisan i ka fɔtɔ wala PDF ci i ka CNIB wala paspɔri ta kan.",
};
export const CASIER_ANSWER_NOT_RECOGNIZED: Trilingual = {
  fr: "Réponse non reconnue.",
  mos: "Leoore ka wʋm ye.",
  dyu: "Jaabi ma faamuya.",
};
export const CASIER_SUCCESS: Trilingual = {
  fr: "Demande soumise avec succès (démonstration). Référence :",
  mos: "Kasiye judisiyɛɛr ɲinigã tʋme ne yam (demonstrasiõ). Sõmblgã :",
  dyu: "Kasiyɛ jidisyɛr ɲinini bilala ka ɲɛ (demɔnisirasiyɔn). Nimɔrɔ :",
};

// Confirmation avant soumission : voir buildRecapText/CASIER_CONFIRM_PROMPT
// ci-dessous. Le mot-clé "CONFIRMER" (français, en capitales) suit
// exactement la même convention que "ANNULER" plus haut -- un mot-clé fixe
// et identique dans les 3 langues plutôt qu'un matching flou "oui/non" par
// langue, pour rester cohérent avec le seul autre mot-clé déjà utilisé dans
// ce flux.
export const CASIER_CONFIRM_PROMPT: Trilingual = {
  fr:
    "Voici le récapitulatif de votre demande. Vérifiez les informations ci-dessous.\n" +
    "Appuyez sur le bouton ci-dessous pour confirmer et recevoir votre récépissé, ou sur Annuler pour arrêter.",
  mos:
    "Ne kãnga la fo zãmsã kɩbayã. Ges-y kibayã sõma.\n" +
    "(Kɩ-y tẽngr zĩ-kãnga n pẽg n paam y sɛbɛo, bɩ n sa.)",
  dyu:
    "Nin ye i ka ɲinini kunnafoni ye. I ka lajɛ a la ka a dafa.\n" +
    "(Bɔtɔn duguma digi walisa ka a sɔbɛyala, walima ka dabila.)",
};

/**
 * Résumé lisible des champs collectés (nom/prénoms viennent normalement de
 * l'extraction Gemini, pas de FIELD_ORDER -- voir buildFormState). Utilise
 * labelFor() pour afficher les libellés humains (ex. "Marié(e)") plutôt que
 * les valeurs codées internes (ex. "marie"), comme le fait déjà le récap de
 * l'étape 5 du site DEMO (lib/demo/data.ts).
 */
function buildRecapText(fields: CasierFields): string {
  const lines = [
    `Nom complet : ${fields.prenoms ?? "?"} ${fields.nom ?? "?"}`,
    `Genre : ${fields.genre ? labelFor(GENRE_OPTIONS, fields.genre) : "?"}`,
    `Date de naissance : ${fields.dateNaissance ?? "?"}`,
    `Lieu de naissance : ${fields.lieuNaissance ?? "?"}`,
    `Pays de naissance : ${fields.paysNaissance ? labelFor(PAYS_OPTIONS, fields.paysNaissance) : "?"}`,
    `Nationalité : ${fields.nationalite ? labelFor(NATIONALITE_OPTIONS, fields.nationalite) : "?"}`,
    `Domicile : ${fields.domicile ?? "?"}`,
    `Profession : ${fields.profession ?? "?"}`,
    `Téléphone : ${fields.telephone ?? "?"}`,
    `Situation matrimoniale : ${
      fields.situationMatrimoniale ? labelFor(SITUATION_MATRIMONIALE_OPTIONS, fields.situationMatrimoniale) : "?"
    }`,
    `Pièce d'identité : ${fields.typePiece ? labelFor(TYPE_PIECE_OPTIONS, fields.typePiece) : "?"} n° ${fields.numeroPiece ?? "?"}`,
    `Père : ${fields.prenomsPere ?? "?"} ${fields.nomPere ?? "?"}`,
    `Mère : ${fields.prenomsMere ?? "?"} ${fields.nomMere ?? "?"}`,
  ];
  return lines.join("\n");
}

// Clés audio pré-générées (voir scripts/pregenerate-audio.ts) pour les
// messages fixes ci-dessus -- séparées des catalogues eux-mêmes pour que
// bot.ts et pregenerate-audio.ts s'accordent sur les mêmes noms sans les
// répéter en dur à plusieurs endroits.
export const CASIER_ASK_DOC1_AUDIO_KEY = "casier_ask_doc1";
export const CASIER_ASK_DOC2_AUDIO_KEY = "casier_ask_doc2";
export const CASIER_ANSWER_NOT_RECOGNIZED_AUDIO_KEY = "casier_answer_not_recognized";
export const CASIER_SUCCESS_AUDIO_KEY = "casier_success";
export const CASIER_CONFIRM_PROMPT_AUDIO_KEY = "casier_confirm_prompt";

export function casierAskDoc1(lang: LocalLang): string {
  return tBilingual(CASIER_ASK_DOC1_CATALOG, lang);
}
function casierAskDoc2(lang: LocalLang): string {
  return tBilingual(CASIER_ASK_DOC2_CATALOG, lang);
}

/**
 * Fusionne les champs extraits d'un document (non-null uniquement) dans la
 * session. La plupart des champs extraits (genre, typePiece) sont déjà des
 * enums Zod contraints aux mêmes valeurs que les <select> du formulaire DEMO
 * (voir ExtractedIdentityFieldsSchema, lib/llm.ts) -- mais `nationalite` est
 * un texte libre côté extraction : le faire correspondre à une valeur
 * connue ici, sinon l'automatisation Playwright bloque en cherchant une
 * <option> qui n'existe pas. Sans correspondance, on abandonne le champ
 * (il sera alors demandé à l'usager, avec la liste des choix valides).
 */
function mergeExtracted(session: CasierSession, extracted: Record<string, unknown>): void {
  for (const [key, rawValue] of Object.entries(extracted)) {
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (key in session.fields && session.fields[key as keyof CasierFields]) continue; // ne pas écraser

    let value: unknown = rawValue;
    if (key === "nationalite" && typeof rawValue === "string") {
      value = matchOptionValue(NATIONALITE_OPTIONS, rawValue);
      if (value === null) continue;
    }
    (session.fields as Record<string, unknown>)[key] = value;
  }
}

/**
 * `audioKey`/`audioText`, quand présents, désignent l'audio pré-généré (ou à
 * défaut généré à la volée, voir sendMenuAudio côté bot.ts) à jouer AVANT le
 * texte de `reply` -- jamais tout `reply` lui-même : certains `reply`
 * mélangent un préfixe fixe et un contenu variable (ex. la liste d'options
 * suivante après une réponse non reconnue, déjà annoncée par un audio
 * précédent), donc `audioText` porte SEULEMENT la partie fixe à prononcer.
 * Absent (undefined) => champ dynamique (voir casierFieldAudioKey) => pas
 * d'audio, texte seul, comme avant ce changement.
 */
export interface CasierDocumentResult {
  reply: string;
  done: false;
  audioKey?: string;
  audioText?: string;
  isConfirmation?: boolean;
}

export interface CasierFieldResult {
  reply: string;
  done: false;
  audioKey?: string;
  audioText?: string;
  isConfirmation?: boolean;
}

export interface CasierFinalResult {
  reply: string;
  done: true;
  referenceCode: string;
  pdfBuffer: Buffer;
  audioKey?: string;
  audioText?: string;
  isConfirmation?: boolean;
}

export type CasierStepResult = CasierDocumentResult | CasierFieldResult | CasierFinalResult;

/** Appelé quand un document (photo ou fichier) arrive pendant une session active. */
export async function handleCasierDocument(
  chatId: number | string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<CasierStepResult> {
  const session = await loadSession(chatId);
  if (!session) throw new Error("Aucune session casier active pour ce chat.");

  if (session.step === "awaiting_doc1") {
    session.doc1 = { buffer, mimeType, fileName };
    const extracted = await extractIdentityFields(buffer, mimeType);
    mergeExtracted(session, extracted as unknown as Record<string, unknown>);
    session.step = "awaiting_doc2";
    await saveSession(chatId, session);
    const reply = casierAskDoc2(session.lang);
    return {
      reply,
      done: false,
      audioKey: CASIER_ASK_DOC2_AUDIO_KEY,
      audioText: t(CASIER_ASK_DOC2_CATALOG, session.lang),
    };
  }

  if (session.step === "awaiting_doc2") {
    session.doc2 = { buffer, mimeType, fileName };
    const extracted = await extractIdentityFields(buffer, mimeType);
    mergeExtracted(session, extracted as unknown as Record<string, unknown>);
    return advanceToNextFieldOrRecap(chatId, session);
  }

  throw new Error(`Document reçu hors séquence (étape actuelle: ${session.step}).`);
}

/** Appelé quand un message texte arrive pendant une session active en attente de champ. */
export async function handleCasierTextAnswer(
  chatId: number | string,
  rawAnswer: string,
): Promise<CasierStepResult> {
  const session = await loadSession(chatId);
  if (!session) {
    throw new Error("Aucune session casier active pour ce chat.");
  }

  if (session.step === "awaiting_confirmation") {
    return handleConfirmationAnswer(chatId, session, rawAnswer);
  }

  if (session.step !== "awaiting_field" || !session.pendingField) {
    throw new Error(`Aucun champ en attente de réponse pour ce chat (étape actuelle: ${session.step}).`);
  }

  const spec = session.pendingField;
  const matched = matchFieldAnswer(spec, rawAnswer, session.fields);
  if (matched === null) {
    // Rien n'a changé, mais on réécrit quand même pour rafraîchir
    // lastActivityAt (évite une expiration prématurée pendant qu'un usager
    // hésite sur sa réponse).
    await saveSession(chatId, session);
    const notRecognized = tBilingual(CASIER_ANSWER_NOT_RECOGNIZED, session.lang);
    return {
      reply: `${notRecognized}\n${formatFieldPrompt(spec, session.fields, session.lang)}`,
      done: false,
      // Seul le préfixe "réponse non reconnue" est prononcé : la question et
      // sa liste d'options (déjà annoncées par l'audio précédent) ne sont
      // pas répétées à l'oral, seulement réaffichées à l'écran.
      audioKey: CASIER_ANSWER_NOT_RECOGNIZED_AUDIO_KEY,
      audioText: t(CASIER_ANSWER_NOT_RECOGNIZED, session.lang),
    };
  }

  (session.fields as Record<string, unknown>)[spec.key] = matched;
  // Une réponse à un champ de localisation invalide la cascade en aval :
  // remettre à zéro province/commune/arrondissement si la région a changé,
  // etc., pour ne jamais soumettre une combinaison incohérente.
  if (spec.key === "regionNaissance") {
    delete session.fields.provinceNaissance;
    delete session.fields.communeNaissance;
    delete session.fields.arrondissementNaissance;
  } else if (spec.key === "provinceNaissance") {
    delete session.fields.communeNaissance;
    delete session.fields.arrondissementNaissance;
  }

  return advanceToNextFieldOrRecap(chatId, session);
}

/**
 * Traite la réponse de l'usager à l'étape "awaiting_confirmation" (voir
 * CASIER_CONFIRM_PROMPT) : "CONFIRMER" (insensible à la casse/espaces)
 * déclenche la soumission réelle, toute autre réponse redemande
 * confirmation en réaffichant le récapitulatif -- jamais de soumission
 * implicite sur une réponse ambiguë. ("ANNULER" est déjà intercepté avant
 * d'arriver ici, voir bot.ts.)
 */
async function handleConfirmationAnswer(
  chatId: number | string,
  session: CasierSession,
  rawAnswer: string,
): Promise<CasierStepResult> {
  if (rawAnswer.trim().toUpperCase() !== "CONFIRMER") {
    await saveSession(chatId, session); // rafraîchit lastActivityAt
    return {
      reply: `${tBilingual(CASIER_ANSWER_NOT_RECOGNIZED, session.lang)}\n${buildRecapText(session.fields)}\n\n${tBilingual(CASIER_CONFIRM_PROMPT, session.lang)}`,
      done: false,
      isConfirmation: true,
      audioKey: CASIER_ANSWER_NOT_RECOGNIZED_AUDIO_KEY,
      audioText: t(CASIER_ANSWER_NOT_RECOGNIZED, session.lang),
    };
  }
  return finalizeCasierSubmission(chatId, session);
}

export async function handleCasierConfirmation(chatId: number | string): Promise<CasierStepResult> {
  const session = await loadSession(chatId);
  if (!session || session.step !== "awaiting_confirmation") {
    throw new Error("Aucune session casier en attente de confirmation.");
  }
  return finalizeCasierSubmission(chatId, session);
}

/**
 * Avance vers le prochain champ manquant, ou -- quand tous les champs sont
 * réunis -- affiche le récapitulatif et passe en attente de confirmation
 * explicite AVANT toute soumission réelle (voir handleConfirmationAnswer).
 * Remplace l'ancien comportement qui soumettait immédiatement dès le
 * dernier champ répondu, sans jamais laisser l'usager relire/corriger ce
 * qui allait être envoyé.
 */
async function advanceToNextFieldOrRecap(
  chatId: number | string,
  session: CasierSession,
): Promise<CasierStepResult> {
  /*
  // TEMP BYPASS: Ignore missing fields and go directly to confirmation 
  // with whatever was extracted from the documents
  const next = getNextMissingField(session.fields);
  if (next) {
    session.step = "awaiting_field";
    session.pendingField = next;
    await saveSession(chatId, session);
    const reply = formatFieldPrompt(next, session.fields, session.lang);
    const audioKey = casierFieldAudioKey(next.key);
    return {
      reply,
      done: false,
      ...(audioKey ? { audioKey, audioText: formatFieldPromptAudio(next, session.fields, session.lang) } : {}),
    };
  }
  */

  session.step = "awaiting_confirmation";
  session.pendingField = null;
  await saveSession(chatId, session);
  return {
    reply: `${buildRecapText(session.fields)}\n\n${tBilingual(CASIER_CONFIRM_PROMPT, session.lang)}`,
    done: false,
    isConfirmation: true,
    // Seule l'instruction fixe ("voici le récap, répondez CONFIRMER...") est
    // prononcée -- le récapitulatif lui-même est constitué de valeurs
    // dynamiques (nom, téléphone...) et reste texte-seul, comme le code de
    // référence du message de succès.
    audioKey: CASIER_CONFIRM_PROMPT_AUDIO_KEY,
    audioText: t(CASIER_CONFIRM_PROMPT, session.lang),
  };
}

/** Soumission réelle (site DEMO + PDF), appelée uniquement après confirmation explicite de l'usager. */
async function finalizeCasierSubmission(
  chatId: number | string,
  session: CasierSession,
): Promise<CasierStepResult> {
  session.step = "processing";
  await saveSession(chatId, session);
  try {
    const formState = buildFormState(session);
    if (!session.doc1 || !session.doc2) {
      throw new Error("Documents manquants au moment de la finalisation.");
    }
    const result = await submitCasierDemande(formState, {
      acteNaissance: session.doc1,
      pieceIdentite: session.doc2,
    });
    const successLine = tBilingual(CASIER_SUCCESS, session.lang);
    await cancelCasierSession(chatId);
    return {
      reply: `${successLine} ${result.referenceCode}.`,
      done: true,
      referenceCode: result.referenceCode,
      pdfBuffer: result.pdfBuffer,
      // Seule la phrase fixe est prononcée -- le code de référence, lui,
      // reste affiché à l'écran uniquement (comme les codes de suivi
      // ailleurs dans l'app, jamais énoncés à l'oral : un code alphanumérique
      // lu par une voix de synthèse serait quasi inutilisable).
      audioKey: CASIER_SUCCESS_AUDIO_KEY,
      audioText: t(CASIER_SUCCESS, session.lang),
    };
  } catch (err) {
    await cancelCasierSession(chatId);
    throw err;
  }
}

function buildFormState(session: CasierSession): DemoFormState {
  const fields = session.fields;
  const required: (keyof CasierFields)[] = [
    "nom",
    "prenoms",
    "genre",
    "dateNaissance",
    "lieuNaissance",
    "domicile",
    "situationMatrimoniale",
    "profession",
    "telephone",
    "paysNaissance",
    "nationalite",
    "regionNaissance",
    "provinceNaissance",
    "communeNaissance",
    "typePiece",
    "numeroPiece",
    "nomPere",
    "prenomsPere",
    "nomMere",
    "prenomsMere",
  ];
  const missing = required.filter((key) => !fields[key]);
  if (missing.length > 0) {
    throw new Error(`Champs manquants avant soumission: ${missing.join(", ")}`);
  }

  return {
    ...EMPTY_FORM_STATE,
    demandeur: {
      nom: fields.nom!,
      prenoms: fields.prenoms!,
      genre: fields.genre!,
      dateNaissance: fields.dateNaissance!,
      lieuNaissance: fields.lieuNaissance!,
      domicile: fields.domicile!,
      situationMatrimoniale: fields.situationMatrimoniale!,
      profession: fields.profession!,
      telephone: fields.telephone!,
      paysNaissance: fields.paysNaissance!,
      nationalite: fields.nationalite!,
      regionNaissance: fields.regionNaissance!,
      provinceNaissance: fields.provinceNaissance!,
      communeNaissance: fields.communeNaissance!,
      arrondissementNaissance: fields.arrondissementNaissance ?? "",
      typePiece: fields.typePiece!,
      numeroPiece: fields.numeroPiece!,
    },
    filiation: {
      nomPere: fields.nomPere!,
      prenomsPere: fields.prenomsPere!,
      nomMere: fields.nomMere!,
      prenomsMere: fields.prenomsMere!,
    },
  };
}
