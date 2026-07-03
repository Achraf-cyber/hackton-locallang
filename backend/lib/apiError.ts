import { isRateLimitError } from "./llm";

/**
 * Construit la réponse d'erreur d'une route API à partir d'une exception
 * attrapée dans son handler : logue toujours la cause réelle côté serveur
 * (sinon invisible, seul un message générique atteint le client), et
 * distingue le cas "quota Gemini dépassé" (429) d'une erreur générique (502)
 * pour donner un message actionnable à l'usager.
 */
export function handleApiError(context: string, err: unknown): Response {
   
  console.error(`[${context}]`, err);

  if (isRateLimitError(err)) {
    return Response.json(
      {
        error:
          "Trop de demandes en ce moment (limite du service IA atteinte). Réessayez dans quelques minutes.",
      },
      { status: 429 },
    );
  }

  return Response.json({ error: (err as Error).message }, { status: 502 });
}
