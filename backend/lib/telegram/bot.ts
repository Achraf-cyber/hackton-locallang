/**
 * Bot Telegram (grammY) — client interne du backend.
 *
 * Le bot n'appelle JAMAIS Gemini ni le service modèles directement : il passe
 * par lib/orchestrator.ts, exactement comme les routes /api/*, pour garder
 * toute la logique métier au même endroit.
 *
 * Flux principal :
 *  1. /start  → message bilingue (mos + dyu) + clavier langue + 2 audios async
 *  2. Choix langue → menu des actions (3 boutons dans la langue choisie)
 *  3a. "Expliquer un doc"  → invite à envoyer un fichier
 *  3b. "Demander un doc"   → sous-menu des 6 services gouvernementaux
 *  3c. "Poser une question"→ invite à écrire
 *  4. À tout moment : voix / photo / document → traitement immédiat
 */

import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import { getEnv } from "../env";
import { isRateLimitError } from "../llm";
import type { LocalLang } from "../modelService";
import { answerInLanguage, explainPhoto, voiceToVoice } from "../orchestrator";
import { resolveUser, getChatContext } from "../identity";
import { checkAndConsumeQuota, QUOTA_REACHED_MESSAGES } from "../quota";
import { prisma } from "../db";
import { getCachedSpeechUrl } from "../audioCache";
import { fetchPregeneratedAudio } from "../pregeneratedAudio";
import {
  t,
  tBilingual,
  stripForSpeech,
  WELCOME_BILINGUAL_TEXT,
  WELCOME_AUDIO_TEXT_MOS,
  WELCOME_AUDIO_TEXT_DYU,
  ACTION_MENU,
  ACTION_EXPLAIN_DOC,
  ACTION_GOV_DOC,
  ACTION_CHAT,
  actionMenuAudioText,
  EXPLAIN_DOC_PROMPT,
  CHAT_PROMPT,
  GOV_DOC_MENU,
  GOV_DOCS,
  govDocMenuAudioText,
  GOV_DOC_COMING_SOON_TTS,
  GOV_DOC_COMING_SOON_DISPLAY,
  ACK_LISTENING,
  ACK_READING,
  ACK_THINKING,
  ERR_RATE_LIMIT,
  ERR_GENERIC,
  ERR_WRONG_FILE,
  CASIER_CANCELLED,
  CASIER_CANCEL_BUTTON,
  CASIER_CONFIRM_BUTTON,
  CASIER_GENERIC_ERROR,
  govDocLabel,
  govDocLabelBilingual,
  govDocUrl,
} from "../messages";
import type { GovDocKey } from "../messages";
import {
  startCasierSession,
  hasActiveCasierSession,
  isAwaitingCasierDocument,
  getCasierSession,
  handleCasierDocument,
  handleCasierTextAnswer,
  handleCasierConfirmation,
  cancelCasierSession,
  casierAskDoc1,
  CASIER_ASK_DOC1_CATALOG,
  CASIER_ASK_DOC1_AUDIO_KEY,
  type CasierStepResult,
} from "./casierFlow";

let botInstance: Bot | null = null;

// ---------------------------------------------------------------------------
// Helpers de clavier
// ---------------------------------------------------------------------------

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ Mooré", "lang:mos")
    .text("Dioula ➡️", "lang:dyu");
}

// Puces numérotées : le même numéro est énoncé dans l'audio du menu (voir
// buildMenuAudioText dans messages.ts) pour que l'usager qui ne lit pas
// l'alphabet latin sache quel bouton correspond à quelle option entendue.
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

/**
 * Bouton unique "quitter le processus", attaché à chaque message du flux
 * casier (invite doc1/doc2, question de champ, récap+confirmation). Permet
 * de sortir d'un tap plutôt que de devoir taper "ANNULER" (repli toujours
 * accepté par ailleurs, voir le handler message:text) -- essentiel pour des
 * usagers qui, par hypothèse de départ de cette app, ne lisent pas
 * forcément l'alphabet latin couramment.
 */
function casierCancelKeyboard(lang: LocalLang): InlineKeyboard {
  return new InlineKeyboard().text(tBilingual(CASIER_CANCEL_BUTTON, lang), "casier:cancel");
}

function casierConfirmKeyboard(lang: LocalLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tBilingual(CASIER_CONFIRM_BUTTON, lang), "casier:confirm")
    .row()
    .text(tBilingual(CASIER_CANCEL_BUTTON, lang), "casier:cancel");
}

function actionKeyboard(lang: LocalLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${NUMBER_EMOJIS[0]} ${tBilingual(ACTION_EXPLAIN_DOC, lang)}`, "action:explain_doc")
    .row()
    .text(`${NUMBER_EMOJIS[1]} ${tBilingual(ACTION_GOV_DOC, lang)}`, "action:gov_doc")
    .row()
    .text(`${NUMBER_EMOJIS[2]} ${tBilingual(ACTION_CHAT, lang)}`, "action:chat");
}

function govDocKeyboard(lang: LocalLang): InlineKeyboard {
  const kb = new InlineKeyboard();
  GOV_DOCS.forEach((doc, i) => {
    kb.text(`${NUMBER_EMOJIS[i]} ${govDocLabelBilingual(doc.key, lang)}`, `govdoc:${doc.key}`).row();
  });
  return kb;
}

// ---------------------------------------------------------------------------
// Helpers de téléchargement
// ---------------------------------------------------------------------------

async function downloadTelegramFile(bot: Bot, fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  const url =
    "https://api.telegram.org/file/bot" +
    getEnv().TELEGRAM_TOKEN +
    "/" +
    file.file_path;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      "Téléchargement du fichier Telegram échoué (" + res.status + ")."
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadAudio(audioUrl: string): Promise<Buffer> {
  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error(
      "Téléchargement de l'audio généré échoué (" + res.status + ")."
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Envoie l'audio pour un message d'interface FIXE déjà écrit en langue
 * locale, en le mettant en cache (voir lib/audioCache.ts) pour ne payer le
 * coût TTS qu'une fois par (clé, langue). Utilisé pour les menus/boutons/
 * erreurs — les usagers dyu/mos ciblés ne lisent pas l'alphabet latin, ils
 * ont besoin d'ENTENDRE le contenu AVANT de voir les boutons pour savoir
 * lequel toucher : on attend donc (await) la livraison de l'audio ici, et
 * l'appelant doit envoyer le texte/clavier seulement APRÈS que cette
 * fonction se soit résolue (jamais en parallèle / fire-and-forget).
 */
const DOCUMENT_SEND_MAX_ATTEMPTS = 3;
const DOCUMENT_SEND_BASE_DELAY_MS = 1000;

/**
 * Envoie un document (ex. récépissé PDF) à l'usager avec retry + backoff.
 * Contrairement à l'audio (sendMenuAudio, best-effort/silencieux), un
 * document comme un récépissé officiel N'A PAS de repli acceptable si
 * l'envoi échoue : l'usager doit le recevoir de façon fiable, donc on
 * réessaie au lieu d'avaler l'erreur, et on la relance si tous les essais
 * échouent (l'appelant doit alors prévenir l'usager explicitement).
 */
async function sendDocumentReliably(
  ctx: Context,
  buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOCUMENT_SEND_MAX_ATTEMPTS; attempt++) {
    try {
      await ctx.replyWithDocument(new InputFile(buffer, filename), caption ? { caption } : undefined);
      return;
    } catch (err) {
      lastError = err;
      console.error(
        `[telegram] envoi document "${filename}" tentative ${attempt}/${DOCUMENT_SEND_MAX_ATTEMPTS} échouée:`,
        err,
      );
      if (attempt < DOCUMENT_SEND_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, DOCUMENT_SEND_BASE_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Répond à l'usager après une étape du flux "casier judiciaire" (voir
 * lib/telegram/casierFlow.ts) : soit une simple relance texte (prochaine
 * question/document attendu), soit — quand `result.done` — la livraison
 * fiable du récépissé PDF final.
 */
async function replyToCasierStep(ctx: Context, result: CasierStepResult, lang: LocalLang): Promise<void> {
  if (result.audioKey && result.audioText) {
    await sendMenuAudio(ctx, result.audioKey, result.audioText, lang, "casier.ogg");
  }
  // Bouton "quitter" ou clavier de confirmation attaché à chaque relance tant que le flux n'est pas
  // terminé -- inutile sur le message final (done: true), le flux est déjà
  // clos à ce moment-là.
  const keyboard = result.isConfirmation ? casierConfirmKeyboard(lang) : casierCancelKeyboard(lang);
  await ctx.reply(result.reply, result.done ? undefined : { reply_markup: keyboard });
  if (!result.done) return;

  try {
    await sendDocumentReliably(
      ctx,
      result.pdfBuffer,
      `recepisse-${result.referenceCode}.pdf`,
      `Récépissé (démo) — ${result.referenceCode}`,
    );
  } catch (err) {
    console.error("[telegram] livraison du récépissé (flux casier) définitivement échouée:", err);
    await ctx.reply(
      `Le récépissé a été généré (référence ${result.referenceCode}) mais n'a pas pu vous être envoyé après ` +
        `plusieurs tentatives. Utilisez /recepisse ${result.referenceCode} pour réessayer.`,
    );
  }
}

/** Gère une erreur survenue pendant une étape du flux casier (extraction, automatisation...). */
async function replyToCasierError(ctx: Context, err: unknown, lang: LocalLang | "fr" = "fr"): Promise<void> {
  console.error("[telegram] erreur dans le flux casier judiciaire:", err);
  if (lang !== "fr") await sendMenuAudio(ctx, "casier_generic_error", t(CASIER_GENERIC_ERROR, lang), lang, "erreur.ogg");
  await ctx.reply(tBilingual(CASIER_GENERIC_ERROR, lang));
}

async function sendMenuAudio(
  ctx: Context,
  key: string,
  text: string,
  lang: LocalLang,
  filename = "menu.ogg"
): Promise<void> {
  try {
    // Ce texte est FIXE (déjà connu au moment du build, voir
    // scripts/pregenerate-audio.ts) : on essaie d'abord le fichier
    // pré-généré (aucune attente TTS pour l'usager), et on ne retombe sur
    // une génération à la demande que s'il est absent (ex. nouvelle clé pas
    // encore pré-générée).
    const pregenerated = await fetchPregeneratedAudio(key, lang);
    // Repli (fichier pré-généré absent) : on nettoie le texte des emojis/
    // pictos avant le TTS — sendMenuAudio ne sert QUE pour des messages
    // d'interface fixes, jamais du texte libre, donc ce strip est toujours sûr
    // (et identique à celui de scripts/pregenerate-audio.ts).
    const buffer =
      pregenerated ?? (await downloadAudio(await getCachedSpeechUrl(key, stripForSpeech(text), lang)));
    // replyWithVoice exige un fichier .ogg encodé en OPUS côté Bot API
    // Telegram -- TTS.speak() (model-service) encode maintenant exactement
    // ça (voir model-service/app/services/tts.py _write_ogg_opus), donc
    // c'est la bonne méthode : bulle "message vocal" classique, lisible
    // partout. (Avant ce fix, on générait du WAV brut, illisible aussi bien
    // par sendVoice -- OPUS requis -- que par sendAudio -- MP3/M4A requis.)
    await ctx.replyWithVoice(new InputFile(buffer, filename));
  } catch (err) {
    console.error(`[telegram] audio menu "${key}" échouée:`, err);
    // Silencieux — le texte affiché reste disponible pour les usagers
    // qui savent lire. On n'empêche pas l'envoi du texte qui suit.
  }
}

/**
 * Envoie un clip audio dans chaque langue puis le clavier de choix de
 * langue — l'audio doit arriver en premier (voir sendMenuAudio) pour que
 * l'utilisateur l'entende avant de devoir choisir un bouton.
 */
async function sendLanguagePicker(ctx: Context): Promise<void> {
  try {
    // Texte DÉJÀ en mos/dyu -> speak() (jamais localize(), qui traduirait
    // à tort depuis le français et produirait un résultat incohérent).
    // Comme sendMenuAudio : texte fixe -> fichier pré-généré en priorité.
    const [mosBuf, dyuBuf] = await Promise.all([
      fetchPregeneratedAudio("welcome", "mos").then(
        (buf) => buf ?? getCachedSpeechUrl("welcome", WELCOME_AUDIO_TEXT_MOS, "mos").then(downloadAudio),
      ),
      fetchPregeneratedAudio("welcome", "dyu").then(
        (buf) => buf ?? getCachedSpeechUrl("welcome", WELCOME_AUDIO_TEXT_DYU, "dyu").then(downloadAudio),
      ),
    ]);
    // replyWithVoice : voir le commentaire dans sendMenuAudio (OGG/Opus réel maintenant).
    await ctx.replyWithVoice(new InputFile(mosBuf, "welcome_mos.ogg"), {
      caption: "🗣️ Mooré ⬅️",
    });
    await ctx.replyWithVoice(new InputFile(dyuBuf, "welcome_dyu.ogg"), {
      caption: "🗣️ Dioula ➡️",
    });
  } catch (err) {
    console.error("[telegram] audio choix de langue échouée:", err);
  }

  await ctx.reply(WELCOME_BILINGUAL_TEXT, {
    parse_mode: "Markdown",
    reply_markup: langKeyboard(),
  });
}

// ---------------------------------------------------------------------------
// Helpers métier
// ---------------------------------------------------------------------------

/** Résout l'identité DB de l'utilisateur Telegram et retourne sa langue si définie. */
async function requireLang(chatId: number): Promise<LocalLang | null> {
  try {
    const dbUser = await resolveUser("telegram", chatId.toString());
    if (dbUser.preferredLang) {
      return dbUser.preferredLang as LocalLang;
    }
  } catch (dbErr) {
    console.error("DB User lookup failed in bot requireLang:", dbErr);
  }
  return null;
}

async function askLanguage(ctx: Context): Promise<void> {
  await sendLanguagePicker(ctx);
}

/**
 * Vérifie le quota de l'utilisateur Telegram avant de traiter sa demande.
 * Retourne false (et envoie le message approprié) si le quota est épuisé.
 */
async function checkQuotaOrReply(
  ctx: Context,
  lang: LocalLang
): Promise<boolean> {
  if (!ctx.chat) return true;
  const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
  const quota = await checkAndConsumeQuota(dbUser);
  if (!quota.allowed) {
    const message = QUOTA_REACHED_MESSAGES[lang] ?? QUOTA_REACHED_MESSAGES.fr;
    const messageBilingual = `${message} (${QUOTA_REACHED_MESSAGES.fr})`;
    await sendMenuAudio(ctx, "quota_reached", message, lang, "quota.ogg");
    await ctx.reply(messageBilingual + "\n\nEnvoyez PAYER pour continuer aujourd'hui.");
    return false;
  }
  return true;
}

const AUDIO_CAPTION_MAX_LENGTH = 1024;

/** Formate une durée en millisecondes pour affichage à l'usager (ex. "3,2 s"). */
function formatDurationSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1).replace(".", ",")} s`;
}

/** Envoie le résultat (audio + texte en caption, traduction fr entre parenthèses). */
async function replyWithResult(
  ctx: Context,
  ackMessageId: number,
  result: { translated: string; audioUrl: string; sourceFr: string },
  durationMs: number,
): Promise<void> {
  const timingLine = `⏱️ Répondu en ${formatDurationSeconds(durationMs)}`;
  const caption = `${result.translated} (${result.sourceFr})\n${timingLine}`;
  try {
    const audioBuffer = await downloadAudio(result.audioUrl);
    // replyWithVoice : model-service produit maintenant du OGG/Opus réel
    // (voir model-service/app/services/tts.py), le format exigé par l'API
    // Bot Telegram pour un message vocal.
    if (caption.length <= AUDIO_CAPTION_MAX_LENGTH) {
      await ctx.replyWithVoice(new InputFile(audioBuffer, "reponse.ogg"), { caption });
    } else {
      // Légende Telegram limitée à 1024 caractères : si le fr ne rentre pas
      // avec le texte local, on l'envoie dans un message séparé qui suit.
      await ctx.replyWithVoice(new InputFile(audioBuffer, "reponse.ogg"), {
        caption: result.translated,
      });
      await ctx.reply(`(${result.sourceFr})\n${timingLine}`);
    }
  } catch {
    // Si l'audio échoue, on renvoie le texte brut.
    await ctx.reply(caption);
  } finally {
    await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
  }
}

/** Supprime l'ack et envoie le message d'erreur adapté (fr entre parenthèses). */
async function replyWithError(
  ctx: Context,
  ackMessageId: number,
  err: unknown,
  lang: LocalLang | "fr" = "fr"
): Promise<void> {
  await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
  const catalog = isRateLimitError(err) ? ERR_RATE_LIMIT : ERR_GENERIC;
  const message = t(catalog, lang);
  if (lang !== "fr") {
    await sendMenuAudio(ctx, isRateLimitError(err) ? "err_rate_limit" : "err_generic", message, lang, "erreur.ogg");
  }
  await ctx.reply(tBilingual(catalog, lang));
  console.error("[telegram]", err);
}

// ---------------------------------------------------------------------------
// Entrée principale
// ---------------------------------------------------------------------------

/** Construit (une seule fois) le bot et enregistre tous ses handlers. */
export function getBot(): Bot {
  if (botInstance) return botInstance;

  const env = getEnv();
  if (!env.TELEGRAM_TOKEN) {
    throw new Error(
      "TELEGRAM_TOKEN manquant : impossible de démarrer le bot Telegram."
    );
  }

  const bot = new Bot(env.TELEGRAM_TOKEN);

  // -------------------------------------------------------------------------
  // Commandes
  // -------------------------------------------------------------------------

  bot.api
    .setMyCommands([
      { command: "start", description: "Démarrer / choisir la langue" },
      { command: "menu", description: "Afficher le menu principal" },
      { command: "document", description: "Demander un document officiel" },
      { command: "recepisse", description: "(DEMO) Récupérer un récépissé par code" },
      { command: "lang", description: "Changer de langue" },
      { command: "help", description: "Aide" },
    ])
    .catch((err) =>
      console.error("[telegram] setMyCommands a échoué:", err)
    );

  // /start — bilingue + clavier + 2 audios (voir sendLanguagePicker)
  bot.command("start", async (ctx) => {
    // Redémarrer abandonne tout flux "casier judiciaire" en cours : sinon la
    // session en mémoire reste active et intercepte les prochains messages
    // (photo/document/texte) comme si l'usager était encore dedans.
    if (ctx.chat) await cancelCasierSession(ctx.chat.id);
    await sendLanguagePicker(ctx);
  });

  // /menu — affiche le menu des actions dans la langue de l'utilisateur
  bot.command("menu", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    await sendMenuAudio(ctx, "action_menu", actionMenuAudioText(lang), lang, "menu.ogg");
    await ctx.reply(tBilingual(ACTION_MENU, lang), {
      reply_markup: actionKeyboard(lang),
    });
  });

  // /document — raccourci vers le menu des docs gouvernementaux
  bot.command("document", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    await sendMenuAudio(ctx, "gov_doc_menu", govDocMenuAudioText(lang), lang, "documents.ogg");
    await ctx.reply(tBilingual(GOV_DOC_MENU, lang), {
      reply_markup: govDocKeyboard(lang),
    });
  });

  // /recepisse <code> — (DEMO uniquement) va chercher le PDF de récépissé
  // généré par le site DEMO "e-casier" (backend/app/demo/*) pour la demande
  // <code>, et le livre à l'usager de façon fiable (voir sendDocumentReliably).
  // Préfigure ce que fera l'orchestrateur une fois le flux "upload documents
  // -> extraction -> questions -> automatisation -> récépissé" branché
  // bout-à-bout (voir memory/demo-ecasier-*.md pour le reste du plan).
  bot.command("recepisse", async (ctx) => {
    const code = ctx.match?.toString().trim();
    if (!code) {
      await ctx.reply("Usage : /recepisse DEMO-2026-123456");
      return;
    }

    const baseUrl = env.DEMO_BASE_URL.replace(/\/$/, "");
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/demo/demandes/${encodeURIComponent(code)}/recepisse`);
    } catch (err) {
      console.error("[telegram] /recepisse fetch échoué:", err);
      await ctx.reply("Impossible de joindre le site DEMO pour récupérer ce récépissé.");
      return;
    }
    if (!res.ok) {
      await ctx.reply(`Aucune demande trouvée avec le code ${code} (démonstration).`);
      return;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    try {
      await sendDocumentReliably(ctx, buffer, `recepisse-${code}.pdf`, `Récépissé (démo) — ${code}`);
    } catch (err) {
      console.error("[telegram] envoi du récépissé définitivement échoué:", err);
      await ctx.reply(
        "Le récépissé a été généré mais n'a pas pu vous être envoyé après plusieurs tentatives. Réessayez /recepisse dans un instant.",
      );
    }
  });

  // /lang — changer de langue
  bot.command("lang", async (ctx) => {
    await sendLanguagePicker(ctx);
  });

  // /help
  bot.command("help", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    const langStr = lang === "mos" ? "Mooré" : lang === "dyu" ? "Dioula" : "?";
    await ctx.reply(
      `ℹ️ LocalLang Bot — @Africalangbot\n\n` +
        `🌍 Langue actuelle : ${lang ? langStr : "non définie"}\n\n` +
        `🎤 Note vocale → je réponds en note vocale\n` +
        `📷 Photo / PDF → j'explique le document\n` +
        `⌨️ Texte → je réponds à votre question\n\n` +
        `Commandes :\n` +
        `/start — (re)démarrer\n` +
        `/menu — afficher le menu\n` +
        `/document — demander un document officiel\n` +
        `/lang — changer de langue\n` +
        `/help — ce message`
    );
  });

  // -------------------------------------------------------------------------
  // Callbacks — sélection de langue
  // -------------------------------------------------------------------------

  bot.callbackQuery(/^lang:(dyu|mos)$/, async (ctx) => {
    const lang = ctx.match[1] as LocalLang;

    if (ctx.chat) {
      try {
        const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { preferredLang: lang },
        });
      } catch (dbErr) {
        console.error("DB User upsert failed in bot lang callback:", dbErr);
      }
    }

    await ctx.answerCallbackQuery();

    // Afficher le menu des actions dans la langue choisie (audio d'abord)
    await sendMenuAudio(ctx, "action_menu", actionMenuAudioText(lang), lang, "menu.ogg");
    await ctx.reply(tBilingual(ACTION_MENU, lang), {
      reply_markup: actionKeyboard(lang),
    });
  });

  // -------------------------------------------------------------------------
  // Callbacks — actions du menu
  // -------------------------------------------------------------------------

  bot.callbackQuery("action:explain_doc", async (ctx) => {
    await ctx.answerCallbackQuery();
    // L'usager choisit explicitement "expliquer un document" : une session
    // casier active (même si elle n'attend pas de photo à cet instant précis,
    // voir isAwaitingCasierDocument) ne doit plus intercepter la prochaine
    // photo envoyée -- ce choix de menu EST le signal de sortie du flux
    // casier, pas seulement le bouton dédié ou "ANNULER".
    if (ctx.chat && await hasActiveCasierSession(ctx.chat.id)) await cancelCasierSession(ctx.chat.id);
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    const message = t(EXPLAIN_DOC_PROMPT, lang ?? "fr");
    if (lang) await sendMenuAudio(ctx, "explain_doc_prompt", message, lang, "invite.ogg");
    await ctx.reply(tBilingual(EXPLAIN_DOC_PROMPT, lang ?? "fr"));
  });

  bot.callbackQuery("action:gov_doc", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    if (lang) await sendMenuAudio(ctx, "gov_doc_menu", govDocMenuAudioText(lang), lang, "documents.ogg");
    await ctx.reply(tBilingual(GOV_DOC_MENU, lang ?? "fr"), {
      reply_markup: govDocKeyboard(lang ?? "dyu"),
    });
  });

  bot.callbackQuery("action:chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    // Même raisonnement que action:explain_doc ci-dessus.
    if (ctx.chat && await hasActiveCasierSession(ctx.chat.id)) await cancelCasierSession(ctx.chat.id);
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    const message = t(CHAT_PROMPT, lang ?? "fr");
    if (lang) await sendMenuAudio(ctx, "chat_prompt", message, lang, "invite.ogg");
    await ctx.reply(tBilingual(CHAT_PROMPT, lang ?? "fr"));
  });

  // Bouton "❌ Annuler" attaché à chaque étape du flux casier (voir
  // casierCancelKeyboard) : équivalent au mot-clé tapé "ANNULER" (toujours
  // accepté par ailleurs, voir message:text), mais accessible d'un tap.
  bot.callbackQuery("casier:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.chat) return;
    const session = await getCasierSession(ctx.chat.id);
    const lang = session?.lang ?? (await requireLang(ctx.chat.id)) ?? "dyu";
    await cancelCasierSession(ctx.chat.id);
    await sendMenuAudio(ctx, "casier_cancelled", t(CASIER_CANCELLED, lang), lang, "annule.ogg");
    await ctx.reply(tBilingual(CASIER_CANCELLED, lang));
  });

  bot.callbackQuery("casier:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.chat) return;
    const session = await getCasierSession(ctx.chat.id);
    if (!session || session.step !== "awaiting_confirmation") return;
    const lang = session.lang;
    try {
      const result = await handleCasierConfirmation(ctx.chat.id);
      await replyToCasierStep(ctx, result, lang);
    } catch (err) {
      await replyToCasierError(ctx, err, lang);
    }
  });

  // -------------------------------------------------------------------------
  // Callbacks — documents gouvernementaux
  // -------------------------------------------------------------------------

  const govDocKeys = GOV_DOCS.map((d) => d.key).join("|");
  bot.callbackQuery(new RegExp(`^govdoc:(${govDocKeys})$`), async (ctx) => {
    const key = ctx.match[1] as GovDocKey;
    const lang = ctx.chat ? (await requireLang(ctx.chat.id)) ?? "fr" : "fr";
    const url = govDocUrl(key);
    const docName = govDocLabel(key, lang);

    await ctx.answerCallbackQuery();

    // "Casier judiciaire" est le seul document dont la demande est
    // automatisée bout-à-bout (voir lib/telegram/casierFlow.ts) : upload des
    // 2 documents -> extraction -> questions -> soumission -> récépissé.
    // Les autres options du menu restent des liens "bientôt disponible".
    if (key === "casier" && ctx.chat) {
      const casierLang: LocalLang = lang === "fr" ? "dyu" : lang;
      await startCasierSession(ctx.chat.id, casierLang);
      await sendMenuAudio(ctx, CASIER_ASK_DOC1_AUDIO_KEY, t(CASIER_ASK_DOC1_CATALOG, casierLang), casierLang, "casier.ogg");
      await ctx.reply(casierAskDoc1(casierLang), { reply_markup: casierCancelKeyboard(casierLang) });
      return;
    }

    // 1. Générer et envoyer un audio expliquant la situation (sans l'URL),
    // AVANT le texte : ce message ne porte pas de boutons, mais on garde le
    // même ordre (audio -> texte) pour rester cohérent sur tout le bot.
    // Le texte est DÉJÀ écrit en langue locale (catalogue GOV_DOC_COMING_SOON_TTS)
    // -> sendMenuAudio()/speak(), jamais localize() qui traduirait à tort
    // depuis le français (même bug que l'audio d'accueil, corrigé ici aussi).
    const localLang: LocalLang = lang === "fr" ? "dyu" : lang;
    await sendMenuAudio(
      ctx,
      "gov_doc_coming_soon",
      t(GOV_DOC_COMING_SOON_TTS, localLang),
      localLang,
      "info_document.ogg"
    );

    // 2. Envoyer le texte d'affichage avec le lien (fr entre parenthèses)
    const displayText =
      `*${docName}${lang !== "fr" ? ` (${govDocLabel(key, "fr")})` : ""}*\n\n` +
      `${tBilingual(GOV_DOC_COMING_SOON_DISPLAY, lang)}\n${url}`;
    await ctx.reply(displayText, { parse_mode: "Markdown" });
  });

  // -------------------------------------------------------------------------
  // Messages entrants — voix
  // -------------------------------------------------------------------------

  bot.on("message:voice", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    if (!(await checkQuotaOrReply(ctx, lang))) return;

    await sendMenuAudio(ctx, "ack_listening", t(ACK_LISTENING, lang), lang, "ecoute.ogg");
    const ack = await ctx.reply(tBilingual(ACK_LISTENING, lang));
    try {
      const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
      const history = await getChatContext(dbUser.id);
      const buffer = await downloadTelegramFile(bot, ctx.message.voice.file_id);
      const out = await voiceToVoice(buffer, "voice.oga", lang, history);

      const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
      const transcriptText = out.result.transcript ?? "";
      prisma.interaction
        .create({
          data: {
            channel: "telegram",
            lang,
            type: "voice",
            inputSummary: transcriptText ? transcriptText : "voice:telegram",
            outputSummary: out.result.translated,
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error("DB Log telegram voice interaction failed:", dbErr)
        );

      await replyWithResult(ctx, ack.message_id, out.result, durationMs);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err, lang);
    }
  });

  // -------------------------------------------------------------------------
  // Messages entrants — photo
  // -------------------------------------------------------------------------

  bot.on("message:photo", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    // Une photo reçue PENDANT QUE LE BOT L'ATTEND (doc1/doc2, voir
    // isAwaitingCasierDocument) est un document d'identité à extraire, pas
    // une demande d'explication générique. Consomme le quota comme
    // n'importe quel autre traitement de document (appel Gemini) : sans ce
    // check, le flux casier serait illimité et gratuit alors que
    // /explainPhoto et /explainDoc sont limités. Utilise volontairement
    // isAwaitingCasierDocument() et non hasActiveCasierSession() : une
    // session active à une AUTRE étape (question texte en cours, récap en
    // attente de confirmation...) ne doit plus intercepter cette photo --
    // laisser passer vers l'explication générale ci-dessous.
    if (await isAwaitingCasierDocument(ctx.chat.id)) {
      if (!(await checkQuotaOrReply(ctx, lang))) return;
      try {
        const largest = ctx.message.photo.at(-1)!;
        const buffer = await downloadTelegramFile(bot, largest.file_id);
        const result = await handleCasierDocument(ctx.chat.id, buffer, "image/jpeg", "photo.jpg");
        await replyToCasierStep(ctx, result, lang);
      } catch (err) {
        await replyToCasierError(ctx, err, lang);
      }
      return;
    }

    if (!(await checkQuotaOrReply(ctx, lang))) return;

    await sendMenuAudio(ctx, "ack_reading", t(ACK_READING, lang), lang, "lecture.ogg");
    const ack = await ctx.reply(tBilingual(ACK_READING, lang));
    try {
      const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
      const largest = ctx.message.photo.at(-1)!;
      const buffer = await downloadTelegramFile(bot, largest.file_id);
      const out = await explainPhoto(buffer, "image/jpeg", lang);

      const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
      prisma.interaction
        .create({
          data: {
            channel: "telegram",
            lang,
            type: "photo",
            inputSummary: `photo:${largest.file_id}`,
            outputSummary: out.result.translated,
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error("DB Log telegram photo interaction failed:", dbErr)
        );

      await replyWithResult(ctx, ack.message_id, out.result, durationMs);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err, lang);
    }
  });

  // -------------------------------------------------------------------------
  // Messages entrants — document (PDF / image)
  // -------------------------------------------------------------------------

  bot.on("message:document", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    const mimeType = ctx.message.document.mime_type ?? "";
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
      const message = t(ERR_WRONG_FILE, lang);
      await sendMenuAudio(ctx, "err_wrong_file", message, lang, "erreur.ogg");
      await ctx.reply(tBilingual(ERR_WRONG_FILE, lang));
      return;
    }

    // Document reçu PENDANT QUE LE BOT L'ATTEND : à extraire, pas à
    // expliquer (voir même branche + même raisonnement sur message:photo
    // ci-dessus, y compris pour la consommation de quota).
    if (await isAwaitingCasierDocument(ctx.chat.id)) {
      if (!(await checkQuotaOrReply(ctx, lang))) return;
      try {
        const buffer = await downloadTelegramFile(bot, ctx.message.document.file_id);
        const result = await handleCasierDocument(
          ctx.chat.id,
          buffer,
          mimeType,
          ctx.message.document.file_name ?? "document",
        );
        await replyToCasierStep(ctx, result, lang);
      } catch (err) {
        await replyToCasierError(ctx, err, lang);
      }
      return;
    }

    if (!(await checkQuotaOrReply(ctx, lang))) return;

    await sendMenuAudio(ctx, "ack_reading", t(ACK_READING, lang), lang, "lecture.ogg");
    const ack = await ctx.reply(tBilingual(ACK_READING, lang));
    try {
      const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
      const buffer = await downloadTelegramFile(
        bot,
        ctx.message.document.file_id
      );
      const out = await explainPhoto(buffer, mimeType, lang);

      const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
      prisma.interaction
        .create({
          data: {
            channel: "telegram",
            lang,
            type: "photo",
            inputSummary: `document:${
              ctx.message.document.file_name ?? "file"
            }`,
            outputSummary: out.result.translated,
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error(
            "DB Log telegram document interaction failed:",
            dbErr
          )
        );

      await replyWithResult(ctx, ack.message_id, out.result, durationMs);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err, lang);
    }
  });

  // -------------------------------------------------------------------------
  // Messages entrants — texte
  // -------------------------------------------------------------------------

  bot.on("message:text", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    // Réponse à une question du flux "casier judiciaire" (voir casierFlow.ts)
    const casierSession = await getCasierSession(ctx.chat.id);
    if (casierSession) {
      if (ctx.message.text.trim().toUpperCase() === "ANNULER") {
        await cancelCasierSession(ctx.chat.id);
        await sendMenuAudio(ctx, "casier_cancelled", t(CASIER_CANCELLED, lang), lang, "annule.ogg");
        await ctx.reply(tBilingual(CASIER_CANCELLED, lang));
        return;
      }
      if (casierSession.step === "awaiting_field" || casierSession.step === "awaiting_confirmation") {
        try {
          const result = await handleCasierTextAnswer(ctx.chat.id, ctx.message.text);
          await replyToCasierStep(ctx, result, lang);
        } catch (err) {
          await replyToCasierError(ctx, err, lang);
        }
        return;
      }
    }

    // Commande textuelle "PAYER"
    if (ctx.message.text.trim().toUpperCase() === "PAYER") {
      try {
        const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: dbUser.id,
            amountFcfa: 100,
            creditsRequested: 10,
          }),
        });
        const data = (await res.json()) as { paidCreditsLeft?: number };
        await ctx.reply(
          `✅ Paiement simulé confirmé. Il vous reste ${
            data.paidCreditsLeft ?? "?"
          } requêtes payées.`
        );
      } catch (err) {
        console.error("[telegram] paiement simulé échoué:", err);
        await ctx.reply(tBilingual(ERR_GENERIC, lang));
      }
      return;
    }

    if (!(await checkQuotaOrReply(ctx, lang))) return;

    await sendMenuAudio(ctx, "ack_thinking", t(ACK_THINKING, lang), lang, "reflexion.ogg");
    const ack = await ctx.reply(tBilingual(ACK_THINKING, lang));
    try {
      const dbUser = await resolveUser("telegram", ctx.chat.id.toString());
      const history = await getChatContext(dbUser.id);
      const out = await answerInLanguage(ctx.message.text, lang, history);

      const durationMs = Object.values(out.timings).reduce((a, b) => a + b, 0);
      prisma.interaction
        .create({
          data: {
            channel: "telegram",
            lang,
            type: "text",
            inputSummary: ctx.message.text,
            outputSummary: out.result.translated,
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error(
            "DB Log telegram text interaction failed:",
            dbErr
          )
        );

      await replyWithResult(ctx, ack.message_id, out.result, durationMs);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err, lang);
    }
  });

  // -------------------------------------------------------------------------
  // Gestion d'erreur globale
  // -------------------------------------------------------------------------

  bot.catch((err) => {
    console.error("[telegram] erreur non gérée:", err);
  });

  botInstance = bot;
  return bot;
}
