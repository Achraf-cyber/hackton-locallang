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
    stripForSpeech,
    WELCOME_AUDIO_TEXT_MOS,
    WELCOME_AUDIO_TEXT_DYU,
    ERR_RATE_LIMIT,
    ERR_GENERIC,
    ERR_WRONG_FILE,
    EXPLAIN_DOC_PROMPT,
    CHAT_PROMPT,
    GOV_DOC_COMING_SOON_TTS,
    ACK_LISTENING,
    ACK_READING,
    ACK_THINKING,
    CASIER_CANCELLED,
    actionMenuAudioText,
    govDocMenuAudioText,
  } = await import("../lib/messages");
  const { QUOTA_REACHED_MESSAGES } = await import("../lib/quota");

  const LANGS = ["mos", "dyu"] as const;

  // Un seul endroit qui énumère tous les (clé, texte) fixes : reflète
  // exactement les appels sendMenuAudio()/getCachedSpeechUrl() de
  // lib/telegram/bot.ts. Si un nouveau message fixe est ajouté au bot,
  // ajoutez-le ici pour qu'il soit aussi pré-généré.
  //
  // stripForSpeech() est appliqué au texte de CHAQUE entrée (comme le fait
  // sendMenuAudio côté bot) pour que le TTS ne reçoive jamais d'emoji/picto :
  // le fichier pré-généré doit être identique à ce que produirait le repli.
  // actionMenuAudioText/govDocMenuAudioText nettoient déjà en interne.
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
    entries.push({ key: "ack_listening", lang, text: t(ACK_LISTENING, lang) });
    entries.push({ key: "ack_reading", lang, text: t(ACK_READING, lang) });
    entries.push({ key: "ack_thinking", lang, text: t(ACK_THINKING, lang) });
    entries.push({ key: "casier_cancelled", lang, text: t(CASIER_CANCELLED, lang) });
  }
  // Nettoyage TTS uniforme (les deux builders de menu nettoient déjà, strip
  // est idempotent donc les ré-appliquer est sans effet).
  for (const entry of entries) entry.text = stripForSpeech(entry.text);

  const outDir = join(__dirname, "..", "public", "audio");
  mkdirSync(outDir, { recursive: true });

  // Un vrai clip Opus parlé fait au minimum quelques kilo-octets ; en dessous,
  // le TTS a renvoyé un fichier vide/silencieux (« ne fonctionne pas »). On le
  // traite comme un échec plutôt que d'écrire un fichier muet qui passerait
  // inaperçu jusqu'à ce qu'un usager l'entende.
  const MIN_VALID_BYTES = 2000;
  const OGG_MAGIC = Buffer.from("OggS");

  let ok = 0;
  let failed = 0;
  for (const entry of entries) {
    const outPath = join(outDir, `${entry.key}-${entry.lang}.ogg`);
    try {
      const { audioUrl } = await speak(entry.text, entry.lang);
      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error(`speak() a renvoyé une URL inaccessible (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.subarray(0, 4).equals(OGG_MAGIC)) {
        throw new Error("le fichier renvoyé n'est pas un conteneur OGG (en-tête OggS absent)");
      }
      if (buffer.length < MIN_VALID_BYTES) {
        throw new Error(`clip trop court (${buffer.length} octets < ${MIN_VALID_BYTES}) — probablement muet`);
      }
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
