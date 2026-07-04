/**
 * Catalogue de messages pré-construits.
 *
 * Chaque entrée contient les variantes mos (Mooré), dyu (Dioula) et fr
 * (français — utilisé en fallback et pour la logique interne).
 *
 * Conçu pour être partagé par tous les canaux (Telegram, WhatsApp, Web)
 * via les adaptateurs de canal respectifs.
 */

import type { LocalLang } from "./modelService";

export type Trilingual = Record<LocalLang | "fr", string>;

/** Retourne la variante dans la langue de l'utilisateur, avec fallback fr. */
export function t(catalog: Trilingual, lang: LocalLang | "fr"): string {
  return catalog[lang] ?? catalog.fr;
}

// ---------------------------------------------------------------------------
// /start — message d'accueil bilingue (Mooré + Dioula concaténés)
// ---------------------------------------------------------------------------

export const WELCOME_BILINGUAL_TEXT = `
🇧🇫 *Bienvenue / Taabɩ / I ni ce !*

🗣️ *Mooré :* M tara barka ! Mam so a sɩd n na sɩga tõnd pʋgẽ. Kõ kẽ fo yam ne fo tõod taoor.

🗣️ *Dioula :* I ni ce ! Ne bɛ to ka i dɛmɛ ni adamadenya ko la. I fɛla la ni i ka blog la.

⬇️ *Choisissez votre langue :*
`.trim();

// Texte TTS pour le clip audio Mooré
export const WELCOME_AUDIO_TEXT_MOS =
  "Taabɩ ! M so a sɩd n na sɩga tõnd pʋgẽ. Pɩlgẽ fo tõod ne pʋʋsem a sãnda.";

// Texte TTS pour le clip audio Dioula
export const WELCOME_AUDIO_TEXT_DYU =
  "I ni ce ! Ne bɛ to ka i dɛmɛ ni adamadenya ko la. I fɛla la nin kan siri.";

// ---------------------------------------------------------------------------
// Menu des actions (après sélection de langue)
// ---------------------------------------------------------------------------

export const ACTION_MENU: Trilingual = {
  mos: "Yaa bõe la fo sẽn dat ? Tẽeg zĩ-kãnga ning fo sẽn dat :",
  dyu: "I bɛ wulɛ mun? I latɔgɔ fɔlɔ min b'i sɛgɛ sɔrɔ :",
  fr: "Que souhaitez-vous faire ? Choisissez une option :",
};

export const ACTION_EXPLAIN_DOC: Trilingual = {
  mos: "📄 Wilgd windga",
  dyu: "📄 Sɛbɛn ɲɔgɔn",
  fr: "📄 Expliquer un document",
};

export const ACTION_GOV_DOC: Trilingual = {
  mos: "🏛️ Kɩɩ windga",
  dyu: "🏛️ Ɲini sɛbɛn",
  fr: "🏛️ Demander un document officiel",
};

export const ACTION_CHAT: Trilingual = {
  mos: "💬 Lɛbr-yãood",
  dyu: "💬 Kuma",
  fr: "💬 Poser une question",
};

// ---------------------------------------------------------------------------
// Confirmations d'action
// ---------------------------------------------------------------------------

export const EXPLAIN_DOC_PROMPT: Trilingual = {
  mos: "📤 Tʋm foto wala windga (PDF) foo sẽn dat n bãng a võore.",
  dyu: "📤 I ka fɔtɔ wala sɛbɛn (PDF) ci, ka na kɔrɔfɔ i ye.",
  fr: "📤 Envoyez une photo ou un document (PDF) que vous souhaitez comprendre.",
};

export const CHAT_PROMPT: Trilingual = {
  mos: "💬 Wʋsd fo yam ne sõore, m na leok-y.",
  dyu: "💬 I ka i ɲinɛ wolo, ka na jabi i ye.",
  fr: "💬 Posez votre question, je vous répondrai.",
};

// ---------------------------------------------------------------------------
// Menu des documents officiels
// ---------------------------------------------------------------------------

export const GOV_DOC_MENU: Trilingual = {
  mos: "🏛️ Windga bʋg la fo sẽn dat ? Tẽeg zĩ-kãnga ning :",
  dyu: "🏛️ Sɛbɛn jumɛn i bɛ ɲini? I latɔgɔ fɔlɔ :",
  fr: "🏛️ Quel document souhaitez-vous ? Choisissez :",
};

export const GOV_DOCS = [
  { key: "casier",    labelFr: "Casier judiciaire",                url: "https://www.ecasier-judiciaire.gov.bf/", labelMos: "Kasiye jidisyɛr",     labelDyu: "Kasiyɛ jidisyɛr"    },
  { key: "cnib",      labelFr: "Carte nationale d'identité (CNIB)", url: "https://deliacte.gov.bf/",              labelMos: "Laogẽnd yãkr (CNIB)", labelDyu: "Carte identité (CNIB)" },
  { key: "bourse",    labelFr: "Demande de bourse d'études",        url: "https://deliacte.gov.bf/",              labelMos: "Karẽ Lɛbr",           labelDyu: "Domani bursɛ"        },
  { key: "permis",    labelFr: "Permis de construire",              url: "https://deliacte.gov.bf/",              labelMos: "Permis construire",    labelDyu: "Pɛrmisi"             },
  { key: "naissance", labelFr: "Acte de naissance",                 url: "https://deliacte.gov.bf/",              labelMos: "Windga rogmã",         labelDyu: "Sɛbɛn woloma"        },
  { key: "fiscal",    labelFr: "Déclaration fiscale",               url: "https://dgi.bf/edocument/",             labelMos: "Tẽed-n-taar",          labelDyu: "Lakɔli kɔngɔ"        },
] as const;

export type GovDocKey = (typeof GOV_DOCS)[number]["key"];

/** Retourne le libellé du document dans la langue de l'utilisateur. */
export function govDocLabel(key: GovDocKey, lang: LocalLang | "fr"): string {
  const doc = GOV_DOCS.find((d) => d.key === key);
  if (!doc) return key;
  if (lang === "mos") return doc.labelMos;
  if (lang === "dyu") return doc.labelDyu;
  return doc.labelFr;
}

/** Retourne l'URL du document. */
export function govDocUrl(key: GovDocKey): string {
  return GOV_DOCS.find((d) => d.key === key)?.url ?? "";
}

// ---------------------------------------------------------------------------
// Message "bientôt disponible"
// TTS (sans URL — les URLs ne se lisent pas bien à voix haute)
// + texte affiché (avec URL)
// ---------------------------------------------------------------------------

export const GOV_DOC_COMING_SOON_TTS: Trilingual = {
  mos: "Tõnd sẽn dat n na sõng foo ne sẽtgã website sɛ, la yaa wakat sẽn kẽed. Wilgd foo ne yõore tõnd tʋm-tʋmdo a yiib n na sõng-a lame.",
  dyu: "An bɛ ɲini ka i dɛmɛ ni guvɛrɛnaman siten na. Fɔlɔ, siten nin bɛ i la. An bɛ to ka a ban kɛ.",
  fr: "Nous travaillons à l'intégration avec ce service du gouvernement. En attendant, utilisez le lien ci-dessous pour accéder directement au service.",
};

export const GOV_DOC_COMING_SOON_DISPLAY: Trilingual = {
  mos: "🔗 Tʋm ne websɩtɩ kãnga sẽn be tɩɩr pʋgẽ :",
  dyu: "🔗 I ka siten nin don :",
  fr: "🔗 Accédez au service directement ici :",
};

// ---------------------------------------------------------------------------
// Accusés de réception (⏳)
// ---------------------------------------------------------------------------

export const ACK_LISTENING: Trilingual = {
  mos: "⏳ M kelga...",
  dyu: "⏳ Ka lakali...",
  fr: "⏳ Je vous écoute...",
};

export const ACK_READING: Trilingual = {
  mos: "⏳ M kẽeda windga fõ wʋmdo...",
  dyu: "⏳ Ka sɛbɛn kalan na...",
  fr: "⏳ Je lis votre document...",
};

export const ACK_THINKING: Trilingual = {
  mos: "⏳ M tagsd...",
  dyu: "⏳ Ka lakali...",
  fr: "⏳ Je réfléchis...",
};

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export const ERR_RATE_LIMIT: Trilingual = {
  mos: "⏳ Tʋm-tʋmd sẽn kẽ-b sɩd yaa wʋsgo. Leb-y n tʋms n sa pʋg-sʋk la.",
  dyu: "⏳ Baara na tɛmɛna. I ka segin ka.",
  fr: "⏳ Trop de demandes en ce moment. Réessayez dans quelques minutes.",
};

export const ERR_GENERIC: Trilingual = {
  mos: "😕 Yell bee tɩɩrẽ. Leb-y n tʋms.",
  dyu: "😕 Fili sira bɛ yen. I ka segin ka.",
  fr: "😕 Une erreur est survenue. Réessayez dans un instant.",
};

export const ERR_WRONG_FILE: Trilingual = {
  mos: "📎 Tʋm foto wala PDF bala.",
  dyu: "📎 I ka fɔtɔ wala PDF ci.",
  fr: "📎 Envoyez une image ou un PDF s'il vous plaît.",
};
