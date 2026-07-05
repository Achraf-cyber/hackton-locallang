/**
 * Store en memoire process du backend MOCK "e-casier" DEMO. Reinitialise a
 * chaque redemarrage du serveur -- suffisant pour une demo, ne PAS utiliser
 * tel quel pour de vraies donnees. Partage entre /api/demo/submit (ecriture)
 * et /api/demo/demandes/[code] (lecture, "Suivre ma demande").
 */
import type { DemoFormState } from "./types";

export interface StoredDemande {
  referenceCode: string;
  submittedAt: string;
  payload: DemoFormState;
}

const demandes: StoredDemande[] = [];

export function addDemande(demande: StoredDemande): void {
  demandes.push(demande);
}

export function findDemande(referenceCode: string): StoredDemande | undefined {
  return demandes.find((d) => d.referenceCode.toLowerCase() === referenceCode.trim().toLowerCase());
}

function randomDigits(count: number): string {
  let result = "";
  for (let i = 0; i < count; i++) result += Math.floor(Math.random() * 10);
  return result;
}

export function generateReferenceCode(): string {
  const year = new Date().getFullYear();
  return `DEMO-${year}-${randomDigits(6)}`;
}

export function generatePaymentReference(): string {
  return `PAY-DEMO-${randomDigits(8)}`;
}
