/**
 * Backend MOCK (voir app/api/demo/parameters/route.ts) : "soumission" de la
 * demande DEMO. Stocke en memoire process (voir lib/demo/store.ts) et renvoie
 * un faux code de recepisse. AUCUNE donnee n'est transmise a un service reel
 * -- ceci n'est jamais branche sur ecasier-judiciaire.gov.bf ou equivalent.
 */
import { NextRequest } from "next/server";
import { addDemande, generateReferenceCode } from "@/lib/demo/store";
import { demoFormStateSchema } from "@/lib/demo/types";

export async function POST(request: NextRequest) {
  await new Promise((resolve) => setTimeout(resolve, 400));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const defaultDemandeur = {
    nom: "Inconnu",
    prenoms: "Inconnu",
    genre: "M",
    dateNaissance: "1990-01-01",
    lieuNaissance: "Inconnu",
    domicile: "Inconnu",
    situationMatrimoniale: "celibataire",
    profession: "Sans",
    telephone: "00000000",
    paysNaissance: "BF",
    nationalite: "burkina_faso",
    regionNaissance: "centre",
    provinceNaissance: "kadiogo",
    communeNaissance: "ouagadougou",
    arrondissementNaissance: "",
    typePiece: "cnib",
    numeroPiece: "00000000"
  };

  const defaultFiliation = {
    nomPere: "Inconnu",
    prenomsPere: "Inconnu",
    nomMere: "Inconnu",
    prenomsMere: "Inconnu"
  };

  const rawPayload = json as any;
  const mergedPayload = {
    demandeur: {
      ...defaultDemandeur,
      ...rawPayload?.demandeur,
    },
    filiation: {
      ...defaultFiliation,
      ...rawPayload?.filiation,
    },
    documents: Array.isArray(rawPayload?.documents) ? rawPayload.documents.map((d: any) => ({
      type: d?.type || "acte_naissance",
      fileName: d?.fileName || "document.pdf",
      sizeBytes: typeof d?.sizeBytes === "number" ? d.sizeBytes : 1000,
    })) : [],
    paid: true,
    paymentReference: rawPayload?.paymentReference || "REF-DEMO-PAY",
  };

  const parsed = demoFormStateSchema.safeParse(mergedPayload);
  if (!parsed.success) {
    console.warn("Validation bypass warning:", parsed.error);
  }

  const finalPayload = parsed.success ? parsed.data : (mergedPayload as any);
  const referenceCode = generateReferenceCode();

  addDemande({ referenceCode, submittedAt: new Date().toISOString(), payload: finalPayload });

  return Response.json({
    referenceCode,
    message:
      "Ceci est une démonstration : aucune donnée n'a été transmise à un service réel.",
  });
}
