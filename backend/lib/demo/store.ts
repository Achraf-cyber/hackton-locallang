/**
 * Store en memoire process du backend MOCK "e-casier" DEMO. Reinitialise a
 * chaque redemarrage du serveur -- suffisant pour une demo, ne PAS utiliser
 * tel quel pour de vraies donnees. Partage entre /api/demo/submit (ecriture)
 * et /api/demo/demandes/[code] et [code]/recepisse (lecture).
 */
import type { DemoFormState } from "./types";

export interface StoredDemande {
  referenceCode: string;
  submittedAt: string;
  payload: DemoFormState;
}

// Épinglé sur globalThis comme lib/db.ts le fait pour PrismaClient : sans ça,
// le serveur de dev (Turbopack/Fast Refresh) peut ré-exécuter ce module
// séparément pour différentes routes API qui l'importent, créant PLUSIEURS
// tableaux `demandes` indépendants au lieu d'un seul partagé -- une demande
// soumise via /api/demo/submit devenait alors introuvable depuis
// /api/demo/demandes/[code]/recepisse (404), bien que /api/demo/demandes/[code]
// (lookup) la retrouve, preuve que ces deux routes voyaient déjà des
// instances différentes du module.
const globalForDemoStore = globalThis as unknown as { __demoStoreDemandes?: StoredDemande[] };

const demandes: StoredDemande[] = globalForDemoStore.__demoStoreDemandes ?? [];
if (process.env.NODE_ENV !== "production") {
  globalForDemoStore.__demoStoreDemandes = demandes;
}

// Filet de sécurité pour un process long-uptime : sans plafond, ce tableau
// grossirait indéfiniment (jamais purgé ailleurs). Une démo ne justifie pas
// plus ; au-delà, on abandonne les plus anciennes.
const MAX_STORED_DEMANDES = 500;

export function addDemande(demande: StoredDemande): void {
  demandes.push(demande);
  if (demandes.length > MAX_STORED_DEMANDES) {
    demandes.splice(0, demandes.length - MAX_STORED_DEMANDES);
  }
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
