/**
 * Spécification des champs du formulaire "e-casier" DEMO (voir
 * lib/demo/types.ts DemandeurState/FiliationState) qui NE sont PAS
 * extractibles d'un document et doivent donc être demandés à l'usager, un
 * par un, en conversation (voir lib/telegram/casierFlow.ts).
 *
 * Les champs extractibles (nom, prénoms, genre, date/lieu de naissance,
 * nationalité, type/numéro de pièce, filiation) sont couverts par
 * `extractIdentityFields` (lib/llm.ts) et ne passent PAS par ce module, sauf
 * si l'extraction a échoué à les lire (voir `getNextMissingField`).
 */
import {
  NATIONALITE_OPTIONS,
  PAYS_OPTIONS,
  SITUATION_MATRIMONIALE_OPTIONS,
  arrondissementOptions,
  communeOptions,
  provinceOptions,
  regionOptions,
  type SelectOption,
} from "../demo/data";
import type { DemandeurState, FiliationState } from "../demo/types";

export type CasierFields = Partial<DemandeurState & FiliationState>;

export type FieldKey = keyof DemandeurState | keyof FiliationState;

interface FieldSpec {
  key: FieldKey;
  prompt: string;
  /** Sous-ensemble depuis lequel il faut choisir, ou null si texte libre. */
  options: (fields: CasierFields) => SelectOption[] | null;
  /** Peut être laissé vide (ex. arrondissement) sans bloquer la suite. */
  optional?: boolean;
}

const FIELD_ORDER: FieldSpec[] = [
  { key: "domicile", prompt: "Quel est votre lieu de domicile actuel (ville, quartier) ?", options: () => null },
  { key: "profession", prompt: "Quelle est votre profession ?", options: () => null },
  { key: "telephone", prompt: "Quel est votre numéro de téléphone ?", options: () => null },
  {
    key: "situationMatrimoniale",
    prompt: "Quelle est votre situation matrimoniale ?",
    options: () => SITUATION_MATRIMONIALE_OPTIONS,
  },
  { key: "paysNaissance", prompt: "Dans quel pays êtes-vous né(e) ?", options: () => PAYS_OPTIONS },
  { key: "nationalite", prompt: "Quelle est votre nationalité ?", options: () => NATIONALITE_OPTIONS },
  { key: "regionNaissance", prompt: "Dans quelle région êtes-vous né(e) ?", options: () => regionOptions() },
  {
    key: "provinceNaissance",
    prompt: "Dans quelle province êtes-vous né(e) ?",
    options: (fields) => provinceOptions(fields.regionNaissance ?? ""),
  },
  {
    key: "communeNaissance",
    prompt: "Dans quelle commune êtes-vous né(e) ?",
    options: (fields) => communeOptions(fields.regionNaissance ?? "", fields.provinceNaissance ?? ""),
  },
  {
    key: "arrondissementNaissance",
    prompt: "Dans quel arrondissement êtes-vous né(e) ?",
    options: (fields) =>
      arrondissementOptions(
        fields.regionNaissance ?? "",
        fields.provinceNaissance ?? "",
        fields.communeNaissance ?? "",
      ),
    optional: true,
  },
];

/** Enlève les accents et met en minuscules, pour un matching tolérant. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Fait correspondre un texte libre (ex. extrait par Gemini d'un document, qui
 * n'est pas garanti de matcher exactement une valeur d'option) à la `value`
 * d'une option connue, par comparaison tolérante (accents/casse) sur le
 * libellé ou la valeur. Renvoie null sans correspondance fiable -- ne JAMAIS
 * deviner, l'appelant doit alors traiter le champ comme manquant.
 */
export function matchOptionValue(options: SelectOption[], rawText: string): string | null {
  const normalized = normalize(rawText);
  const byValue = options.find((o) => normalize(o.value) === normalized);
  if (byValue) return byValue.value;
  const byLabel = options.find((o) => normalize(o.label) === normalized);
  if (byLabel) return byLabel.value;
  return null;
}

/**
 * Trouve le prochain champ requis manquant, dans l'ordre de FIELD_ORDER.
 * Un champ optionnel (arrondissement) est sauté automatiquement s'il n'a
 * aucune option disponible (toutes les communes n'en ont pas).
 */
export function getNextMissingField(fields: CasierFields): FieldSpec | null {
  for (const spec of FIELD_ORDER) {
    const value = fields[spec.key];
    if (value && String(value).trim() !== "") continue;

    if (spec.optional) {
      const options = spec.options(fields);
      if (!options || options.length === 0) continue; // rien à choisir, on saute
    }
    return spec;
  }
  return null;
}

/** Construit le texte de prompt (question + options numérotées si applicable). */
export function formatFieldPrompt(spec: FieldSpec, fields: CasierFields): string {
  const options = spec.options(fields);
  if (!options || options.length === 0) return spec.prompt;

  const listText = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return `${spec.prompt}\n${listText}\n(Répondez avec le numéro ou le nom.)`;
}

/**
 * Tente de faire correspondre la réponse de l'usager à une valeur valide
 * pour ce champ. Accepte : le numéro de l'option, son libellé (tolérant aux
 * accents/casse), ou -- pour les champs texte libre -- la réponse telle
 * quelle. Renvoie null si aucune correspondance (l'appelant doit redemander).
 */
export function matchFieldAnswer(spec: FieldSpec, rawAnswer: string, fields: CasierFields): string | null {
  const options = spec.options(fields);
  const trimmed = rawAnswer.trim();
  if (!options || options.length === 0) {
    return trimmed === "" ? null : trimmed;
  }

  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1].value;
  }

  const matched = matchOptionValue(options, trimmed);
  if (matched) return matched;

  return null;
}

export { FIELD_ORDER };
export type { FieldSpec };
