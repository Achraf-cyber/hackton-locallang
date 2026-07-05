/**
 * Backend MOCK (voir app/api/demo/parameters/route.ts) : sert le PDF de
 * recepisse d'une demande DEMO deja soumise. Regenere le PDF a la demande a
 * partir du payload stocke (lib/demo/store.ts) -- pas de fichier persiste.
 */
import { NextRequest } from "next/server";
import { findDemande } from "@/lib/demo/store";
import { generateRecepissePdf } from "@/lib/demo/pdf";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const demande = findDemande(code);

  if (!demande) {
    return Response.json({ found: false }, { status: 404 });
  }

  const pdfBytes = await generateRecepissePdf(demande);

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recepisse-${demande.referenceCode}.pdf"`,
    },
  });
}
