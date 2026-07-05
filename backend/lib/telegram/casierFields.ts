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
import { tBilingual, type Trilingual } from "../messages";
import type { LocalLang } from "../modelService";

export type CasierFields = Partial<DemandeurState & FiliationState>;

export type FieldKey = keyof DemandeurState | keyof FiliationState;

interface FieldSpec {
  key: FieldKey;
  /**
   * Traductions "best-effort", PAS relues par un locuteur natif (même
   * réserve que QUOTA_REACHED_MESSAGES dans lib/messages.ts) : contexte
   * administratif/identité où une erreur de sens compte plus qu'ailleurs.
   * À faire relire avant un usage réel en production.
   */
  prompt: Trilingual;
  /** Sous-ensemble depuis lequel il faut choisir, ou null si texte libre. */
  options: (fields: CasierFields) => SelectOption[] | null;
  /** Peut être laissé vide (ex. arrondissement) sans bloquer la suite. */
  optional?: boolean;
}

const FIELD_ORDER: FieldSpec[] = [
  {
    key: "domicile",
    prompt: {
      fr: "Quel est votre lieu de domicile actuel (ville, quartier) ?",
      mos: "Yaa zĩ-bʋg la fo vɩɩ masã (tẽnga, sekitɛɛr) ?",
      dyu: "I sigilen bɛ min (dugu, kartie) ?",
    },
    options: () => null,
  },
  {
    key: "profession",
    prompt: {
      fr: "Quelle est votre profession ?",
      mos: "Yaa tʋʋm-bʋg la fo tʋmda ?",
      dyu: "I ka baara ye mun ye ?",
    },
    options: () => null,
  },
  {
    key: "telephone",
    prompt: {
      fr: "Quel est votre numéro de téléphone ?",
      mos: "Yaa bõe la fo telefõn nomorã ?",
      dyu: "I ka telefɔni nimɔrɔ ye jumɛn ye ?",
    },
    options: () => null,
  },
  {
    key: "situationMatrimoniale",
    prompt: {
      fr: "Quelle est votre situation matrimoniale ?",
      mos: "Yaa bõe la fo kãadem yellẽ ?",
      dyu: "I ka furu cogoya ye mun ye ?",
    },
    options: () => SITUATION_MATRIMONIALE_OPTIONS,
  },
  {
    key: "paysNaissance",
    prompt: {
      fr: "Dans quel pays êtes-vous né(e) ?",
      mos: "Fo dogame tẽng-bʋg pʋgẽ ?",
      dyu: "I wolola jamana jumɛn kɔnɔ ?",
    },
    options: () => PAYS_OPTIONS,
  },
  {
    key: "nationalite",
    prompt: {
      fr: "Quelle est votre nationalité ?",
      mos: "Yaa bõe la fo tẽng-yʋʋre ?",
      dyu: "I ka jamana ye mun ye ?",
    },
    options: () => NATIONALITE_OPTIONS,
  },
  {
    key: "regionNaissance",
    prompt: {
      fr: "Dans quelle région êtes-vous né(e) ?",
      mos: "Fo dogame rejiõ-bʋg pʋgẽ ?",
      dyu: "I wolola rejiɔn jumɛn kɔnɔ ?",
    },
    options: () => regionOptions(),
  },
  {
    key: "provinceNaissance",
    prompt: {
      fr: "Dans quelle province êtes-vous né(e) ?",
      mos: "Fo dogame porovẽs-bʋg pʋgẽ ?",
      dyu: "I wolola porovɛnsi jumɛn kɔnɔ ?",
    },
    options: (fields) => provinceOptions(fields.regionNaissance ?? ""),
  },
  {
    key: "communeNaissance",
    prompt: {
      fr: "Dans quelle commune êtes-vous né(e) ?",
      mos: "Fo dogame komiin-bʋg pʋgẽ ?",
      dyu: "I wolola komin jumɛn kɔnɔ ?",
    },
    options: (fields) => communeOptions(fields.regionNaissance ?? "", fields.provinceNaissance ?? ""),
  },
  {
    key: "arrondissementNaissance",
    prompt: {
      fr: "Dans quel arrondissement êtes-vous né(e) ?",
      mos: "Fo dogame arrõdisimã-bʋg pʋgẽ ?",
      dyu: "I wolola arɔndisiman jumɛn kɔnɔ ?",
    },
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

const CHOOSE_BY_NUMBER_OR_NAME: Trilingual = {
  fr: "(Répondez avec le numéro ou le nom.)",
  mos: "(Leb-y ne nomorã bɩ yʋʋrã.)",
  dyu: "(I ka jaabi ni nimɔrɔ walima tɔgɔ ye.)",
};

/** Construit le texte de prompt (question + options numérotées si applicable). */
export function formatFieldPrompt(spec: FieldSpec, fields: CasierFields, lang: LocalLang): string {
  const prompt = tBilingual(spec.prompt, lang);
  const options = spec.options(fields);
  if (!options || options.length === 0) return prompt;

  const listText = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return `${prompt}\n${listText}\n${tBilingual(CHOOSE_BY_NUMBER_OR_NAME, lang)}`;
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
