import { webhookCallback } from "grammy";
import { waitUntil } from "@vercel/functions";
import { getBot } from "../../../lib/telegram/bot";

const handleUpdate = webhookCallback(getBot(), "std/http");

export async function POST(request: Request): Promise<Response> {
  // BUG CORRIGÉ : `waitUntil(handleUpdate(request))` passait l'objet Request
  // original tel quel à une tâche différée. grammY lit le corps via
  // `request.json()` À L'INTÉRIEUR de cette tâche, mais le flux du corps de
  // la requête n'est plus garanti lisible une fois la réponse HTTP renvoyée
  // (`return new Response("ok")` juste après) : en prod, ça produisait
  // systématiquement "SyntaxError: Unexpected end of JSON input" (visible
  // dans les logs runtime Vercel sur quasiment CHAQUE webhook récent), donc
  // le bot ne traitait plus aucun message alors même que Telegram recevait
  // un 200 (pas de retry côté Telegram, panne silencieuse).
  //
  // Fix : lire et bufferiser le corps AVANT de renvoyer la réponse (pendant
  // que le flux est encore garanti valide), puis reconstruire un Request à
  // partir de ce texte déjà en mémoire pour la tâche différée.
  const bodyText = await request.text();
  const bufferedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bodyText,
  });

  // waitUntil laisse le traitement (Gemini + service modèles) continuer
  // après la réponse au webhook, pour respecter le délai attendu par
  // Telegram (~quelques secondes) sans bloquer la génération de la réponse.
  waitUntil(handleUpdate(bufferedRequest));
  return new Response("ok");
}
