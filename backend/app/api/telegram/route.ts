import { webhookCallback } from "grammy";
import { waitUntil } from "@vercel/functions";
import { getBot } from "../../../lib/telegram/bot";

const handleUpdate = webhookCallback(getBot(), "std/http");

export async function POST(request: Request): Promise<Response> {
  // waitUntil laisse le traitement (Gemini + service modèles) continuer
  // après la réponse au webhook, pour respecter le délai attendu par
  // Telegram (~quelques secondes) sans bloquer la génération de la réponse.
  waitUntil(handleUpdate(request));
  return new Response("ok");
}
