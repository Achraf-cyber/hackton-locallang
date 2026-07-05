/**
 * Pré-génère l'audio des messages d'interface FIXES du bot Telegram (menus,
 * prompts, erreurs, accueil...) et l'écrit dans public/audio/, pour que
 * l'usager n'attende JAMAIS une génération TTS pour un message dont le texte
 * est déjà connu à l'avance — voir lib/pregeneratedAudio.ts pour le
 * mécanisme de lecture côté bot (fallback silencieux vers la génération à
 * la demande si un fichier est absent). Seules les réponses réellement
 * imprévisibles (ex. réponse Gemini à une question libre) continuent de
 * générer leur audio à la volée.
 *
 * Usage :
 *   npm run pregenerate-audio
 *   (nécessite MODEL_SERVICE_URL / TTS_SERVICE_URL joignables, voir .env.local)
 *
 * Idempotent : peut être relancé après toute modification de lib/messages.ts
 * (nouveau message, texte corrigé...) pour régénérer les fichiers concernés.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

async function main() {
  const { speak } = await import("../lib/modelService");
  const {
    t,
    WELCOME_AUDIO_TEXT_MOS,
    WELCOME_AUDIO_TEXT_DYU,
    ERR_RATE_LIMIT,
    ERR_GENERIC,
    ERR_WRONG_FILE,
    EXPLAIN_DOC_PROMPT,
    CHAT_PROMPT,
    GOV_DOC_COMING_SOON_TTS,
    actionMenuAudioText,
    govDocMenuAudioText,
  } = await import("../lib/messages");
  const { QUOTA_REACHED_MESSAGES } = await import("../lib/quota");

  const LANGS = ["mos", "dyu"] as const;

  // Un seul endroit qui énumère tous les (clé, texte) fixes : reflète
  // exactement les appels sendMenuAudio()/getCachedSpeechUrl() de
  // lib/telegram/bot.ts. Si un nouveau message fixe est ajouté au bot,
  // ajoutez-le ici pour qu'il soit aussi pré-généré.
  const entries: { key: string; lang: "mos" | "dyu"; text: string }[] = [];
  for (const lang of LANGS) {
    entries.push({ key: "welcome", lang, text: lang === "mos" ? WELCOME_AUDIO_TEXT_MOS : WELCOME_AUDIO_TEXT_DYU });
    entries.push({ key: "quota_reached", lang, text: QUOTA_REACHED_MESSAGES[lang] ?? QUOTA_REACHED_MESSAGES.fr });
    entries.push({ key: "err_rate_limit", lang, text: t(ERR_RATE_LIMIT, lang) });
    entries.push({ key: "err_generic", lang, text: t(ERR_GENERIC, lang) });
    entries.push({ key: "err_wrong_file", lang, text: t(ERR_WRONG_FILE, lang) });
    entries.push({ key: "action_menu", lang, text: actionMenuAudioText(lang) });
    entries.push({ key: "gov_doc_menu", lang, text: govDocMenuAudioText(lang) });
    entries.push({ key: "explain_doc_prompt", lang, text: t(EXPLAIN_DOC_PROMPT, lang) });
    entries.push({ key: "chat_prompt", lang, text: t(CHAT_PROMPT, lang) });
    entries.push({ key: "gov_doc_coming_soon", lang, text: t(GOV_DOC_COMING_SOON_TTS, lang) });
  }

  const outDir = join(__dirname, "..", "public", "audio");
  mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let failed = 0;
  for (const entry of entries) {
    const outPath = join(outDir, `${entry.key}-${entry.lang}.ogg`);
    try {
      const { audioUrl } = await speak(entry.text, entry.lang);
      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error(`speak() a renvoyé une URL inaccessible (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(outPath, buffer);
      console.log(`✅ ${entry.key}-${entry.lang}.ogg (${buffer.length} octets)`);
      ok++;
    } catch (err) {
      console.error(`❌ ${entry.key}-${entry.lang}.ogg :`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\n${ok} audio(s) pré-généré(s), ${failed} échec(s), écrits dans ${outDir}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exitCode = 1;
});
