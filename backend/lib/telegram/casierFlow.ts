/**
 * Flux conversationnel "demande de casier judiciaire" (voir memory
 * demo-ecasier-flow-status.md pour le contexte complet) :
 *   1. upload acte de naissance -> extraction (lib/llm.ts extractIdentityFields)
 *   2. upload pièce d'identité   -> extraction, fusion des champs
 *   3. questions une par une pour les champs non extractibles (casierFields.ts)
 *   4. remplissage + soumission automatique du site DEMO (lib/demoAutomation.ts)
 *   5. livraison fiable du récépissé PDF (sendDocumentReliably, bot.ts)
 *
 * État de session en mémoire process (Map), PAS en base de données : suffit
 * pour une démo (une session par chat, courte durée de vie), à remplacer par
 * une table Prisma si ce flux doit survivre à un redémarrage du serveur ou
 * fonctionner sur plusieurs instances.
 */
import type { LocalLang } from "../modelService";
import { extractIdentityFields } from "../llm";
import { submitCasierDemande, type CasierDocument } from "../demoAutomation";
import { EMPTY_FORM_STATE, type DemoFormState } from "../demo/types";
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
  lastActivityAt: number;
}

// Une session abandonnée (usager qui ne répond plus) ne doit ni fuiter en
// mémoire indéfiniment, ni intercepter éternellement les photos/documents
// suivants de ce chat comme s'ils faisaient partie du flux casier.
const SESSION_TTL_MS = 20 * 60 * 1000;

const sessions = new Map<string, CasierSession>();

function sessionKey(chatId: number | string): string {
  return String(chatId);
}

/** Purge la session si elle a expiré (inactive depuis SESSION_TTL_MS). */
function pruneIfExpired(key: string): void {
  const session = sessions.get(key);
  if (session && Date.now() - session.lastActivityAt > SESSION_TTL_MS) {
    sessions.delete(key);
  }
}

// La purge "à l'accès" (pruneIfExpired ci-dessus) ne nettoie que la session
// du chat qui redevient actif — une session abandonnée pour de bon (l'usager
// ne revient jamais) ne serait donc JAMAIS purgée : elle retient potentiellement
// les buffers bruts des documents uploadés (plusieurs Mo chacun) indéfiniment.
// Ce balayage périodique parcourt TOUTES les sessions, pas seulement celle
// consultée.
const GLOBAL_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}, GLOBAL_SWEEP_INTERVAL_MS).unref();

export function hasActiveCasierSession(chatId: number | string): boolean {
  const key = sessionKey(chatId);
  pruneIfExpired(key);
  return sessions.has(key);
}

export function getCasierSession(chatId: number | string): CasierSession | undefined {
  const key = sessionKey(chatId);
  pruneIfExpired(key);
  return sessions.get(key);
}

export function startCasierSession(chatId: number | string, lang: LocalLang): void {
  sessions.set(sessionKey(chatId), {
    lang,
    step: "awaiting_doc1",
    fields: {},
    pendingField: null,
    doc1: null,
    doc2: null,
    lastActivityAt: Date.now(),
  });
}

/** Annule une session en cours (ex. sur /start ou /annuler) — no-op si aucune session active. */
export function cancelCasierSession(chatId: number | string): void {
  clearSession(chatId);
}

function clearSession(chatId: number | string): void {
  sessions.delete(sessionKey(chatId));
}

function touch(session: CasierSession): void {
  session.lastActivityAt = Date.now();
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
export const CASIER_ASK_DOC1_CATALOG: Trilingual = {
  fr:
    "Pour votre demande de casier judiciaire, envoyez d'abord une photo ou un PDF de votre extrait/jugement " +
    "supplétif d'acte de naissance.\n(Répondez ANNULER à tout moment pour arrêter cette démarche.)",
  mos:
    "Fo sẽn dat kasiye judisiyɛɛr yellã yĩnga, tʋm-y pipi fotow bɩ PDF fo rogem sɛbɛo (acte de naissance). " +
    "(Leb-y ANNULER wakat fãa n sa demarsã.)",
  dyu:
    "I ka kasiyɛ jidisyɛr ɲinini kama, fɔlɔ i ka fɔtɔ wala PDF ci i wolo sɛbɛn (acte de naissance) ta kan. " +
    "(I bɛ se ka ANNULER fɔ tuma o tuma walisa ka baara in dabila.)",
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
    "Répondez CONFIRMER pour valider et recevoir votre récépissé, ou ANNULER pour arrêter.",
  mos:
    "Ne kãnga la fo zãmsã kɩbayã. Ges-y kibayã sõma.\n" +
    "(Leb-y CONFIRMER n paase n paam y sɛbɛo, bɩ ANNULER n sa.)",
  dyu:
    "Nin ye i ka ɲinini kunnafoni ye. I ka lajɛ a la ka a dafa.\n" +
    "(I ka CONFIRMER fɔ walisa ka i ka sɛbɛn sɔrɔ, walima ANNULER walisa ka dabila.)",
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
}

export interface CasierFieldResult {
  reply: string;
  done: false;
  audioKey?: string;
  audioText?: string;
}

export interface CasierFinalResult {
  reply: string;
  done: true;
  referenceCode: string;
  pdfBuffer: Buffer;
  audioKey?: string;
  audioText?: string;
}

export type CasierStepResult = CasierDocumentResult | CasierFieldResult | CasierFinalResult;

/** Appelé quand un document (photo ou fichier) arrive pendant une session active. */
export async function handleCasierDocument(
  chatId: number | string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<CasierStepResult> {
  const session = sessions.get(sessionKey(chatId));
  if (!session) throw new Error("Aucune session casier active pour ce chat.");
  touch(session);

  if (session.step === "awaiting_doc1") {
    session.doc1 = { buffer, mimeType, fileName };
    const extracted = await extractIdentityFields(buffer, mimeType);
    mergeExtracted(session, extracted as unknown as Record<string, unknown>);
    session.step = "awaiting_doc2";
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
    return advanceToNextFieldOrRecap(session);
  }

  throw new Error(`Document reçu hors séquence (étape actuelle: ${session.step}).`);
}

/** Appelé quand un message texte arrive pendant une session active en attente de champ. */
export async function handleCasierTextAnswer(
  chatId: number | string,
  rawAnswer: string,
): Promise<CasierStepResult> {
  const session = sessions.get(sessionKey(chatId));
  if (!session) {
    throw new Error("Aucune session casier active pour ce chat.");
  }
  touch(session);

  if (session.step === "awaiting_confirmation") {
    return handleConfirmationAnswer(chatId, session, rawAnswer);
  }

  if (session.step !== "awaiting_field" || !session.pendingField) {
    throw new Error(`Aucun champ en attente de réponse pour ce chat (étape actuelle: ${session.step}).`);
  }

  const spec = session.pendingField;
  const matched = matchFieldAnswer(spec, rawAnswer, session.fields);
  if (matched === null) {
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

  return advanceToNextFieldOrRecap(session);
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
    return {
      reply: `${tBilingual(CASIER_ANSWER_NOT_RECOGNIZED, session.lang)}\n${buildRecapText(session.fields)}\n\n${tBilingual(CASIER_CONFIRM_PROMPT, session.lang)}`,
      done: false,
      audioKey: CASIER_ANSWER_NOT_RECOGNIZED_AUDIO_KEY,
      audioText: t(CASIER_ANSWER_NOT_RECOGNIZED, session.lang),
    };
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
async function advanceToNextFieldOrRecap(session: CasierSession): Promise<CasierStepResult> {
  const next = getNextMissingField(session.fields);
  if (next) {
    session.step = "awaiting_field";
    session.pendingField = next;
    const reply = formatFieldPrompt(next, session.fields, session.lang);
    const audioKey = casierFieldAudioKey(next.key);
    return {
      reply,
      done: false,
      // audioKey est null pour un champ dynamique (province/commune/
      // arrondissement, voir casierFieldAudioKey) : ne peut pas être
      // pré-généré une fois pour toutes puisqu'il change selon les réponses
      // précédentes -- laissé texte-seul intentionnellement. Quand présent,
      // audioText utilise la variante AUDIO (langue locale seule, voir
      // formatFieldPromptAudio) et PAS `reply` (qui contient le français
      // entre parenthèses, prévu pour l'écran, jamais pour être prononcé).
      ...(audioKey ? { audioKey, audioText: formatFieldPromptAudio(next, session.fields, session.lang) } : {}),
    };
  }

  session.step = "awaiting_confirmation";
  session.pendingField = null;
  return {
    reply: `${buildRecapText(session.fields)}\n\n${tBilingual(CASIER_CONFIRM_PROMPT, session.lang)}`,
    done: false,
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
    clearSession(chatId);
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
    clearSession(chatId);
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
