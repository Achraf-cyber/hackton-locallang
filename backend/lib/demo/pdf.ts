/**
 * Genere le PDF de recepisse DEMO a partir d'une demande stockee
 * (lib/demo/store.ts). Contenu fictif, regenere a la demande (pas de
 * persistance des octets, seulement du payload deja stocke) : voir
 * app/api/demo/demandes/[code]/recepisse/route.ts.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DOCUMENT_TYPE_LABELS } from "./types";
import type { StoredDemande } from "./store";

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

export async function generateRecepissePdf(demande: StoredDemande): Promise<Uint8Array> {
  const { demandeur, filiation, documents } = demande.payload;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;
  const drawLine = (text: string, opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    page.drawText(text, {
      x: MARGIN,
      y,
      size: opts.size ?? 11,
      font: opts.font ?? font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
    y -= opts.gap ?? (opts.size ?? 11) + 8;
  };

  drawLine("DEMO — DONNÉES FICTIVES — AUCUNE DEMANDE RÉELLE", {
    size: 10,
    font: bold,
    color: rgb(0.72, 0.11, 0.11),
    gap: 22,
  });
  drawLine("RÉPUBLIQUE DÉMONSTRATION — e-justice (DEMO)", { size: 9, color: rgb(0.4, 0.4, 0.4), gap: 24 });
  drawLine("Récépissé de demande de casier judiciaire (bulletin n°3)", { size: 15, font: bold, gap: 26 });

  drawLine(`Référence : ${demande.referenceCode}`, { size: 12, font: bold });
  drawLine(`Date de soumission : ${new Date(demande.submittedAt).toLocaleString("fr-FR")}`, { gap: 24 });

  drawLine("Demandeur", { size: 13, font: bold, gap: 20 });
  drawLine(`Nom : ${demandeur.nom}`);
  drawLine(`Prénom(s) : ${demandeur.prenoms}`);
  drawLine(`Date de naissance : ${demandeur.dateNaissance}`);
  drawLine(`Lieu de naissance : ${demandeur.lieuNaissance}`);
  drawLine(`Nationalité : ${demandeur.nationalite}`);
  drawLine(`Type de pièce : ${demandeur.typePiece} — N° ${demandeur.numeroPiece}`, { gap: 24 });

  drawLine("Filiation", { size: 13, font: bold, gap: 20 });
  drawLine(`Père : ${filiation.nomPere} ${filiation.prenomsPere}`);
  drawLine(`Mère : ${filiation.nomMere} ${filiation.prenomsMere}`, { gap: 24 });

  drawLine("Pièces jointes", { size: 13, font: bold, gap: 20 });
  for (const document of documents) {
    drawLine(`- ${DOCUMENT_TYPE_LABELS[document.type]} (${document.fileName})`);
  }

  y -= 20;
  drawLine("Ceci est une démonstration : ce document ne constitue pas un acte officiel", {
    size: 9,
    color: rgb(0.5, 0.5, 0.5),
  });
  drawLine("et n'a été généré par aucun service gouvernemental réel.", {
    size: 9,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}
