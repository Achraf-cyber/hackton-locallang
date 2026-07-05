/**
 * Backend MOCK (voir app/api/demo/parameters/route.ts) : lookup d'une
 * demande DEMO deja "soumise", pour la page "Suivre ma demande". Lit
 * uniquement le store en memoire (lib/demo/store.ts).
 */
import { NextRequest } from "next/server";
import { findDemande } from "@/lib/demo/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { code } = await params;
  const demande = findDemande(code);

  if (!demande) {
    return Response.json({ found: false }, { status: 404 });
  }

  return Response.json({
    found: true,
    referenceCode: demande.referenceCode,
    submittedAt: demande.submittedAt,
    demandeurNom: `${demande.payload.demandeur.nom} ${demande.payload.demandeur.prenoms}`,
    statut: "Traitée (démonstration)",
  });
}
