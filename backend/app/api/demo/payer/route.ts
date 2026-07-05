/**
 * Backend MOCK (voir app/api/demo/parameters/route.ts) : simulation d'un
 * paiement de frais de dossier. Ne parle a AUCUN prestataire de paiement
 * reel -- renvoie juste une fausse reference de transaction apres un delai
 * artificiel, pour donner l'illusion d'un traitement.
 */
import { generatePaymentReference } from "@/lib/demo/store";

export async function POST() {
  await new Promise((resolve) => setTimeout(resolve, 600));

  return Response.json({
    paymentReference: generatePaymentReference(),
    message: "Paiement fictif accepté (démonstration, aucun débit réel).",
  });
}
