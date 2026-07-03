/**
 * Bot Telegram (grammY) — client interne du backend.
 *
 * Le bot n'appelle JAMAIS Gemini ni le service modèles directement : il passe
 * par lib/orchestrator.ts, exactement comme les routes /api/*, pour garder
 * toute la logique métier au même endroit.
 *
 * Pas de base de données à ce stade (Jour 4) : la langue choisie par
 * utilisateur est mémorisée dans une Map en mémoire, perdue au redémarrage.
 */

import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import { getEnv } from "../env";
import { isRateLimitError } from "../llm";
import type { LocalLang } from "../modelService";
import { answerInLanguage, explainPhoto, voiceToVoice } from "../orchestrator";

const chatLang = new Map<number, LocalLang>();

let botInstance: Bot | null = null;

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🗣️ Dioula", "lang:dyu").text("🗣️ Mooré", "lang:mos");
}

async function downloadTelegramFile(bot: Bot, fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${getEnv().TELEGRAM_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Téléchargement du fichier Telegram échoué (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadAudio(audioUrl: string): Promise<Buffer> {
  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error(`Téléchargement de l'audio généré échoué (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Construit (une seule fois) le bot et enregistre tous ses handlers. */
export function getBot(): Bot {
  if (botInstance) return botInstance;

  const env = getEnv();
  if (!env.TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN manquant : impossible de démarrer le bot Telegram.");
  }

  const bot = new Bot(env.TELEGRAM_TOKEN);

  bot.api
    .setMyCommands([
      { command: "start", description: "Démarrer / choisir la langue" },
      { command: "lang", description: "Changer de langue (Dioula / Mooré)" },
      { command: "help", description: "Voir ce que je sais faire" },
    ])
    .catch((err) => console.error("[telegram] setMyCommands a échoué:", err));

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Bienvenue ! Je peux vous aider avec les démarches administratives, " +
        "en Dioula ou en Mooré. Parlez-moi, envoyez une photo ou un PDF d'un " +
        "document, ou écrivez votre question.\n\nChoisissez d'abord votre langue :",
      { reply_markup: langKeyboard() },
    );
  });

  bot.command("lang", async (ctx) => {
    await ctx.reply("🗣️ Choisissez votre langue :", { reply_markup: langKeyboard() });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "ℹ️ Voici ce que je peux faire :\n\n" +
        "🎤 Envoyez une note vocale — je réponds en note vocale.\n" +
        "📷 Envoyez une photo ou un PDF d'un document — je vous explique ce qu'il contient.\n" +
        "⌨️ Écrivez une question — je réponds simplement.\n\n" +
        "Commandes :\n" +
        "/start — démarrer / choisir la langue\n" +
        "/lang — changer de langue à tout moment\n" +
        "/help — afficher ce message",
    );
  });

  bot.callbackQuery(/^lang:(dyu|mos)$/, async (ctx) => {
    const lang = ctx.match[1] as LocalLang;
    const previous = ctx.chat ? chatLang.get(ctx.chat.id) : undefined;
    if (ctx.chat) chatLang.set(ctx.chat.id, lang);
    await ctx.answerCallbackQuery();
    const label = lang === "dyu" ? "Dioula" : "Mooré";
    await ctx.reply(
      previous && previous !== lang
        ? `✅ Langue changée : ${label}.`
        : `✅ ${label} sélectionné.`,
    );
  });

  async function requireLang(chatId: number): Promise<LocalLang | null> {
    const lang = chatLang.get(chatId);
    if (lang) return lang;
    return null;
  }

  async function askLanguage(ctx: Context): Promise<void> {
    await ctx.reply("Choisissez d'abord votre langue :", { reply_markup: langKeyboard() });
  }

  async function replyWithResult(
    ctx: Context,
    ackMessageId: number,
    result: { translated: string; audioUrl: string },
  ): Promise<void> {
    try {
      const audioBuffer = await downloadAudio(result.audioUrl);
      await ctx.replyWithAudio(new InputFile(audioBuffer, "reponse.wav"), {
        caption: result.translated,
      });
    } catch {
      // Si l'audio ne peut pas être envoyé, on renvoie au moins le texte.
      await ctx.reply(result.translated);
    } finally {
      await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
    }
  }

  async function replyWithError(
    ctx: Context,
    ackMessageId: number,
    err: unknown,
  ): Promise<void> {
    await ctx.api.deleteMessage(ctx.chat!.id, ackMessageId).catch(() => {});
    await ctx.reply(
      isRateLimitError(err)
        ? "⏳ Trop de demandes en ce moment (limite du service IA atteinte). Réessayez dans quelques minutes."
        : "😕 Désolé, une erreur est survenue. Le service est peut-être indisponible, réessayez dans un instant.",
    );
    console.error("[telegram]", err);
  }

  bot.on("message:voice", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    const ack = await ctx.reply("⏳ Je vous écoute...");
    try {
      const buffer = await downloadTelegramFile(bot, ctx.message.voice.file_id);
      const out = await voiceToVoice(buffer, "voice.oga", lang);
      await replyWithResult(ctx, ack.message_id, out.result);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err);
    }
  });

  bot.on("message:photo", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    const ack = await ctx.reply("⏳ Je regarde votre document...");
    try {
      const largest = ctx.message.photo.at(-1)!;
      const buffer = await downloadTelegramFile(bot, largest.file_id);
      const out = await explainPhoto(buffer, "image/jpeg", lang);
      await replyWithResult(ctx, ack.message_id, out.result);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err);
    }
  });

  bot.on("message:document", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    const mimeType = ctx.message.document.mime_type ?? "";
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
      await ctx.reply("Envoyez une image ou un PDF, s'il vous plaît.");
      return;
    }

    const ack = await ctx.reply("⏳ Je regarde votre document...");
    try {
      const buffer = await downloadTelegramFile(bot, ctx.message.document.file_id);
      const out = await explainPhoto(buffer, mimeType, lang);
      await replyWithResult(ctx, ack.message_id, out.result);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err);
    }
  });

  bot.on("message:text", async (ctx) => {
    const lang = await requireLang(ctx.chat.id);
    if (!lang) return askLanguage(ctx);

    const ack = await ctx.reply("⏳...");
    try {
      const out = await answerInLanguage(ctx.message.text, lang);
      await replyWithResult(ctx, ack.message_id, out.result);
    } catch (err) {
      await replyWithError(ctx, ack.message_id, err);
    }
  });

  bot.catch((err) => {
     
    console.error("[telegram] erreur non gérée:", err);
  });

  botInstance = bot;
  return bot;
}
