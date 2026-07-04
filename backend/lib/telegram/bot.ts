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
import { localize } from "../modelService";
import { answerInLanguage, explainPhoto, voiceToVoice } from "../orchestrator";
import { resolveUser, getChatContext } from "../identity";
import { checkAndConsumeQuota, QUOTA_REACHED_MESSAGES } from "../quota";
import { prisma } from "../db";
import { getCachedSpeechUrl } from "../audioCache";
import {
  t,
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
  govDocLabel,
  govDocUrl,
} from "../messages";
import type { GovDocKey } from "../messages";

let botInstance: Bot | null = null;

// ---------------------------------------------------------------------------
// Helpers de clavier
// ---------------------------------------------------------------------------

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ Mooré", "lang:mos")
    .text("Dioula ➡️", "lang:dyu");
}

function actionKeyboard(lang: LocalLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(ACTION_EXPLAIN_DOC, lang), "action:explain_doc")
    .row()
    .text(t(ACTION_GOV_DOC, lang), "action:gov_doc")
    .row()
    .text(t(ACTION_CHAT, lang), "action:chat");
}

function govDocKeyboard(lang: LocalLang): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const doc of GOV_DOCS) {
    kb.text(govDocLabel(doc.key, lang), `govdoc:${doc.key}`).row();
  }
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
 * Envoie l'audio (fire & forget, ne bloque jamais la réponse texte) pour un
 * message d'interface FIXE déjà écrit en langue locale, en le mettant en
 * cache (voir lib/audioCache.ts) pour ne payer le coût TTS qu'une fois par
 * (clé, langue). Utilisé pour les menus/boutons/erreurs — les usagers
 * dyu/mos ciblés ne lisent pas l'alphabet latin, ils ont besoin d'entendre
 * le contenu pour savoir quel bouton toucher.
 */
function sendMenuAudio(
  ctx: Context,
  key: string,
  text: string,
  lang: LocalLang,
  filename = "menu.wav"
): void {
  void (async () => {
    try {
      const audioUrl = await getCachedSpeechUrl(key, text, lang);
      const buffer = await downloadAudio(audioUrl);
      await ctx.replyWithVoice(new InputFile(buffer, filename));
    } catch (err) {
      console.error(`[telegram] audio menu "${key}" échouée:`, err);
      // Silencieux — le texte affiché reste disponible pour les usagers
      // qui savent lire.
    }
  })();
}

/** Envoie le clavier de choix de langue + un clip audio dans chaque langue. */
async function sendLanguagePicker(ctx: Context): Promise<void> {
  await ctx.reply(WELCOME_BILINGUAL_TEXT, {
    parse_mode: "Markdown",
    reply_markup: langKeyboard(),
  });

  void (async () => {
    try {
      // Texte DÉJÀ en mos/dyu -> speak() (jamais localize(), qui traduirait
      // à tort depuis le français et produirait un résultat incohérent).
      const [mosUrl, dyuUrl] = await Promise.all([
        getCachedSpeechUrl("welcome", WELCOME_AUDIO_TEXT_MOS, "mos"),
        getCachedSpeechUrl("welcome", WELCOME_AUDIO_TEXT_DYU, "dyu"),
      ]);
      const [mosBuf, dyuBuf] = await Promise.all([
        downloadAudio(mosUrl),
        downloadAudio(dyuUrl),
      ]);
      await ctx.replyWithVoice(new InputFile(mosBuf, "welcome_mos.wav"), {
        caption: "🗣️ Mooré ⬅️",
      });
      await ctx.replyWithVoice(new InputFile(dyuBuf, "welcome_dyu.wav"), {
        caption: "🗣️ Dioula ➡️",
      });
    } catch (err) {
      console.error("[telegram] audio choix de langue échouée:", err);
    }
  })();
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
    await ctx.reply(message + "\n\nEnvoyez PAYER pour continuer aujourd'hui.");
    sendMenuAudio(ctx, "quota_reached", message, lang, "quota.wav");
    return false;
  }
  return true;
}

/** Envoie le résultat (audio + texte en caption) et supprime l'ack. */
async function replyWithResult(
  ctx: Context,
  ackMessageId: number,
  result: { translated: string; audioUrl: string }
): Promise<void> {
  try {
    const audioBuffer = await downloadAudio(result.audioUrl);
    await ctx.replyWithAudio(new InputFile(audioBuffer, "reponse.wav"), {
      caption: result.translated,
    });
  } catch {
    // Si l'audio échoue, on renvoie le texte brut.
    await ctx.reply(result.translated);
  } finally {
    await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
  }
}

/** Supprime l'ack et envoie le message d'erreur adapté. */
async function replyWithError(
  ctx: Context,
  ackMessageId: number,
  err: unknown,
  lang: LocalLang | "fr" = "fr"
): Promise<void> {
  await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
  const catalog = isRateLimitError(err) ? ERR_RATE_LIMIT : ERR_GENERIC;
  const message = t(catalog, lang);
  await ctx.reply(message);
  if (lang !== "fr") {
    sendMenuAudio(ctx, isRateLimitError(err) ? "err_rate_limit" : "err_generic", message, lang, "erreur.wav");
  }
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
      { command: "lang", description: "Changer de langue" },
      { command: "help", description: "Aide" },
    ])
    .catch((err) =>
      console.error("[telegram] setMyCommands a échoué:", err)
    );

  // /start — bilingue + clavier + 2 audios (voir sendLanguagePicker)
  bot.command("start", async (ctx) => {
    await sendLanguagePicker(ctx);
  });

  // /menu — affiche le menu des actions dans la langue de l'utilisateur
  bot.command("menu", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    await ctx.reply(t(ACTION_MENU, lang), {
      reply_markup: actionKeyboard(lang),
    });
    sendMenuAudio(ctx, "action_menu", actionMenuAudioText(lang), lang, "menu.wav");
  });

  // /document — raccourci vers le menu des docs gouvernementaux
  bot.command("document", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    await ctx.reply(t(GOV_DOC_MENU, lang), {
      reply_markup: govDocKeyboard(lang),
    });
    sendMenuAudio(ctx, "gov_doc_menu", govDocMenuAudioText(lang), lang, "documents.wav");
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

    // Afficher le menu des actions dans la langue choisie
    await ctx.reply(t(ACTION_MENU, lang), {
      reply_markup: actionKeyboard(lang),
    });
    sendMenuAudio(ctx, "action_menu", actionMenuAudioText(lang), lang, "menu.wav");
  });

  // -------------------------------------------------------------------------
  // Callbacks — actions du menu
  // -------------------------------------------------------------------------

  bot.callbackQuery("action:explain_doc", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    const message = t(EXPLAIN_DOC_PROMPT, lang ?? "fr");
    await ctx.reply(message);
    if (lang) sendMenuAudio(ctx, "explain_doc_prompt", message, lang, "invite.wav");
  });

  bot.callbackQuery("action:gov_doc", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    await ctx.reply(t(GOV_DOC_MENU, lang ?? "fr"), {
      reply_markup: govDocKeyboard(lang ?? "dyu"),
    });
    if (lang) sendMenuAudio(ctx, "gov_doc_menu", govDocMenuAudioText(lang), lang, "documents.wav");
  });

  bot.callbackQuery("action:chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.chat ? await requireLang(ctx.chat.id) : null;
    const message = t(CHAT_PROMPT, lang ?? "fr");
    await ctx.reply(message);
    if (lang) sendMenuAudio(ctx, "chat_prompt", message, lang, "invite.wav");
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

    // 1. Envoyer le texte d'affichage avec le lien
    const displayText =
      `*${docName}*\n\n${t(GOV_DOC_COMING_SOON_DISPLAY, lang)}\n${url}`;
    await ctx.reply(displayText, { parse_mode: "Markdown" });

    // 2. Générer et envoyer un audio expliquant la situation (sans l'URL)
    void (async () => {
      try {
        const ttsText = t(GOV_DOC_COMING_SOON_TTS, lang);
        const localLang: LocalLang = lang === "fr" ? "dyu" : lang;
        const result = await localize(ttsText, localLang);
        const audioBuffer = await downloadAudio(result.audioUrl);
        await ctx.replyWithAudio(
          new InputFile(audioBuffer, "info_document.wav"),
          { caption: result.translated }
        );
      } catch (err) {
        console.error("[telegram] govdoc TTS failed:", err);
      }
    })();
  });

  // -------------------------------------------------------------------------
  // Messages entrants — voix
  // -------------------------------------------------------------------------

  bot.on("message:voice", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);
    if (!(await checkQuotaOrReply(ctx, lang))) return;

    const ack = await ctx.reply(t(ACK_LISTENING, lang));
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
            inputSummary: transcriptText
              ? transcriptText.slice(0, 80)
              : "voice:telegram",
            outputSummary: out.result.translated.slice(0, 80),
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error("DB Log telegram voice interaction failed:", dbErr)
        );

      await replyWithResult(ctx, ack.message_id, out.result);
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
    if (!(await checkQuotaOrReply(ctx, lang))) return;

    const ack = await ctx.reply(t(ACK_READING, lang));
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
            inputSummary: `photo:${largest.file_id.slice(0, 70)}`,
            outputSummary: out.result.translated.slice(0, 80),
            durationMs,
            userId: dbUser.id,
          },
        })
        .catch((dbErr) =>
          console.error("DB Log telegram photo interaction failed:", dbErr)
        );

      await replyWithResult(ctx, ack.message_id, out.result);
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
      await ctx.reply(message);
      sendMenuAudio(ctx, "err_wrong_file", message, lang, "erreur.wav");
      return;
    }
    if (!(await checkQuotaOrReply(ctx, lang))) return;

    const ack = await ctx.reply(t(ACK_READING, lang));
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
              ctx.message.document.file_name?.slice(0, 70) ?? "file"
            }`,
            outputSummary: out.result.translated.slice(0, 80),
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

      await replyWithResult(ctx, ack.message_id, out.result);
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
        await ctx.reply(t(ERR_GENERIC, lang));
      }
      return;
    }

    if (!(await checkQuotaOrReply(ctx, lang))) return;

    const ack = await ctx.reply(t(ACK_THINKING, lang));
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
            inputSummary: ctx.message.text.slice(0, 80),
            outputSummary: out.result.translated.slice(0, 80),
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

      await replyWithResult(ctx, ack.message_id, out.result);
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
