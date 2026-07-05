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

  const parsed = demoFormStateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const referenceCode = generateReferenceCode();

  addDemande({ referenceCode, submittedAt: new Date().toISOString(), payload });

  return Response.json({
    referenceCode,
    message:
      "Ceci est une démonstration : aucune donnée n'a été transmise à un service réel.",
  });
}
