/**
 * Bot Telegram en long-polling, pour tester en local sans URL publique.
 *
 * Usage : npm run dev:bot
 * (le backend Next.js et le service modèles doivent tourner en parallèle :
 * next dev sur :3000, uvicorn sur :8000)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBot } from "../lib/telegram/bot";

// Next.js charge .env.local automatiquement ; ce script autonome (lancé via
// tsx, hors Next.js) doit le faire lui-même, avant d'appeler getBot().
function loadEnvLocal(): void {
  const path = join(__dirname, "..", ".env.local");
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

loadEnvLocal();

const bot = getBot();

bot.start({
  onStart: (info) => {
     
    console.log(`🤖 Bot Telegram démarré en long-polling : @${info.username}`);
  },
});
