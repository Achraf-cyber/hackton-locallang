import { webhookCallback } from "grammy";
import { waitUntil } from "@vercel/functions";
import { getBot } from "../../../lib/telegram/bot";

// Plafond explicite (au lieu de dépendre du défaut de la plateforme, qui
// peut varier selon le plan Vercel) : le traitement réel d'un message
// (transcription + Gemini + traduction + TTS) peut légitimement dépasser
// largement 10s -- un cas observé en prod a pris 67s. Doit rester cohérent
// avec le timeoutMilliseconds: Infinity passé à webhookCallback ci-dessous :
// avec ce plafond comme SEULE limite réelle désormais, mieux vaut qu'il soit
// déclaré ici plutôt qu'implicite.
export const maxDuration = 300;

// timeoutMilliseconds: Infinity -- SANS ce réglage, webhookCallback() course
// en interne bot.handleUpdate() contre un timeout PAR DÉFAUT DE 10 SECONDES
// (voir node_modules/grammy/out/convenience/webhook.js, timeoutIfNecessary) :
// passé ce délai, la promesse qu'on confie à waitUntil() ci-dessous REJETTE
// avec "Request timed out after 10000 ms" (exactement l'erreur vue dans les
// logs runtime Vercel) alors que le traitement réel (transcription + Gemini +
// traduction + TTS) dépasse très souvent 10s -- un cas observé en prod a pris
// 67 606ms rien que pour l'appel /localize. bot.handleUpdate() lui-même n'est
// PAS annulé par ce rejet (les promesses JS ne s'annulent pas), mais Vercel
// considère la tâche waitUntil "terminée" dès que la promesse qu'on lui donne
// se règle -- rejet compris -- et peut geler/tuer l'instance de fonction
// avant que le traitement réel (et donc la réponse Telegram) n'aboutisse :
// le bot semble alors ne "jamais répondre", silencieusement, sans qu'aucune
// erreur ne remonte à l'usager. Infinity supprime cette course interne :
// timeoutIfNecessary() renvoie alors directement la tâche réelle, dont le
// seul plafond restant est la durée max de fonction Vercel elle-même (300s,
// voir vercel.json/plan) -- un bien meilleur signal d'échec réel que 10s.
const handleUpdate = webhookCallback(getBot(), "std/http", "throw", Infinity);

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
