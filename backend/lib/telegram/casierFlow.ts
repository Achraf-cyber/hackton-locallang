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
import { NATIONALITE_OPTIONS } from "../demo/data";
import {
  getNextMissingField,
  formatFieldPrompt,
  matchFieldAnswer,
  matchOptionValue,
  type CasierFields,
  type FieldSpec,
} from "./casierFields";

type CasierStep = "awaiting_doc1" | "awaiting_doc2" | "awaiting_field" | "processing" | "done";

interface CasierSession {
  lang: LocalLang;
  step: CasierStep;
  fields: CasierFields;
  pendingField: FieldSpec | null;
  doc1: CasierDocument | null;
  doc2: CasierDocument | null;
}

const sessions = new Map<string, CasierSession>();

function sessionKey(chatId: number | string): string {
  return String(chatId);
}

export function hasActiveCasierSession(chatId: number | string): boolean {
  return sessions.has(sessionKey(chatId));
}

export function getCasierSession(chatId: number | string): CasierSession | undefined {
  return sessions.get(sessionKey(chatId));
}

export function startCasierSession(chatId: number | string, lang: LocalLang): void {
  sessions.set(sessionKey(chatId), {
    lang,
    step: "awaiting_doc1",
    fields: {},
    pendingField: null,
    doc1: null,
    doc2: null,
  });
}

function clearSession(chatId: number | string): void {
  sessions.delete(sessionKey(chatId));
}

export const CASIER_ASK_DOC1 =
  "Pour votre demande de casier judiciaire, envoyez d'abord une photo ou un PDF de votre extrait/jugement supplétif d'acte de naissance.";
export const CASIER_ASK_DOC2 =
  "Merci. Envoyez maintenant une photo ou un PDF de votre CNIB ou passeport.";

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

export interface CasierDocumentResult {
  reply: string;
  done: false;
}

export interface CasierFieldResult {
  reply: string;
  done: false;
}

export interface CasierFinalResult {
  reply: string;
  done: true;
  referenceCode: string;
  pdfBuffer: Buffer;
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

  if (session.step === "awaiting_doc1") {
    session.doc1 = { buffer, mimeType, fileName };
    const extracted = await extractIdentityFields(buffer, mimeType);
    mergeExtracted(session, extracted as unknown as Record<string, unknown>);
    session.step = "awaiting_doc2";
    return { reply: CASIER_ASK_DOC2, done: false };
  }

  if (session.step === "awaiting_doc2") {
    session.doc2 = { buffer, mimeType, fileName };
    const extracted = await extractIdentityFields(buffer, mimeType);
    mergeExtracted(session, extracted as unknown as Record<string, unknown>);
    return advanceToNextFieldOrFinalize(chatId, session);
  }

  throw new Error(`Document reçu hors séquence (étape actuelle: ${session.step}).`);
}

/** Appelé quand un message texte arrive pendant une session active en attente de champ. */
export async function handleCasierTextAnswer(
  chatId: number | string,
  rawAnswer: string,
): Promise<CasierStepResult> {
  const session = sessions.get(sessionKey(chatId));
  if (!session || session.step !== "awaiting_field" || !session.pendingField) {
    throw new Error("Aucun champ en attente de réponse pour ce chat.");
  }

  const spec = session.pendingField;
  const matched = matchFieldAnswer(spec, rawAnswer, session.fields);
  if (matched === null) {
    return { reply: `Réponse non reconnue.\n${formatFieldPrompt(spec, session.fields)}`, done: false };
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

  return advanceToNextFieldOrFinalize(chatId, session);
}

async function advanceToNextFieldOrFinalize(
  chatId: number | string,
  session: CasierSession,
): Promise<CasierStepResult> {
  const next = getNextMissingField(session.fields);
  if (next) {
    session.step = "awaiting_field";
    session.pendingField = next;
    return { reply: formatFieldPrompt(next, session.fields), done: false };
  }

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
    clearSession(chatId);
    return {
      reply: `Demande soumise avec succès (démonstration). Référence : ${result.referenceCode}.`,
      done: true,
      referenceCode: result.referenceCode,
      pdfBuffer: result.pdfBuffer,
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
