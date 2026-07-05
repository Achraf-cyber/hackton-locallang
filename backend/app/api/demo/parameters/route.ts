/**
 * Backend MOCK du wizard DEMO "e-casier" (voir lib/demo/*). Renvoie des
 * donnees de reference statiques et fictives, simulant le batch fetch
 * "parametre_values/parameters" du vrai site (avec un delai artificiel pour
 * imiter l'UX). Ne parle JAMAIS a un systeme reel.
 */
import {
  GENRE_OPTIONS,
  NATIONALITE_OPTIONS,
  PAYS_OPTIONS,
  SITUATION_MATRIMONIALE_OPTIONS,
  TYPE_PIECE_OPTIONS,
} from "@/lib/demo/data";

export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 250));

  return Response.json({
    genre: GENRE_OPTIONS,
    situationMatrimoniale: SITUATION_MATRIMONIALE_OPTIONS,
    pays: PAYS_OPTIONS,
    nationalite: NATIONALITE_OPTIONS,
    typePiece: TYPE_PIECE_OPTIONS,
  });
}
