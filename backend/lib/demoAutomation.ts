/**
 * Remplit et soumet le formulaire DEMO "e-casier" (backend/app/demo/demande)
 * via un navigateur headless (Playwright), pour le compte du bot Telegram
 * (voir lib/telegram/casierFlow.ts). Équivalent programmatique
 * d'`automation/fill-form.js`, mais appelé en-process depuis le backend
 * plutôt qu'en CLI, et avec les fichiers déjà en mémoire (buffers reçus de
 * Telegram) plutôt que lus depuis le disque.
 *
 * GARDE-FOU : DEMO_BASE_URL doit pointer vers CE déploiement (le site DEMO
 * qu'on héberge nous-mêmes), jamais vers un site gouvernemental réel -- voir
 * assertNotRealGovSite().
 *
 * ATTENTION DÉPLOIEMENT : Playwright a besoin d'un binaire Chromium et d'un
 * processus Node persistant. Ça fonctionne dans `next dev` et dans un
 * déploiement Node "classique" (VM, conteneur), mais PAS dans une fonction
 * serverless Vercel standard (filesystem en lecture seule, pas de Chromium
 * embarqué) -- il faudrait soit un service à part (comme model-service),
 * soit remplacer `playwright` par `playwright-core` + `@sparticuz/chromium`
 * pour un runtime serverless. Cette décision n'a pas encore été prise ; ce
 * module fonctionne tel quel pour le développement local / un hébergement
 * Node classique.
 */
import { chromium } from "playwright";
import { getEnv } from "./env";
import type { DemoFormState } from "./demo/types";

const REAL_GOV_HOSTNAMES = ["ecasier-judiciaire.gov.bf"];

function assertNotRealGovSite(baseUrl: string): void {
  const { hostname } = new URL(baseUrl);
  if (REAL_GOV_HOSTNAMES.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    throw new Error(
      `DEMO_BASE_URL ("${hostname}") pointe vers un site gouvernemental réel -- refusé. ` +
        "Ce module ne doit automatiser QUE notre propre site DEMO.",
    );
  }
}

export interface CasierDocument {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface CasierAutomationResult {
  referenceCode: string;
  pdfBuffer: Buffer;
}

/**
 * Remplit les 5 étapes du wizard DEMO avec `formState`, téléverse les deux
 * documents fournis, paie (fictif), valide, puis télécharge le récépissé
 * PDF généré. Lance et ferme son propre navigateur à chaque appel (pas de
 * pool de contextes : le volume attendu ne le justifie pas pour une démo).
 */
export async function submitCasierDemande(
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  const baseUrl = getEnv().DEMO_BASE_URL.replace(/\/$/, "");
  assertNotRealGovSite(baseUrl);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/demo/demande`);

    const { demandeur, filiation } = formState;

    await page.fill("#nom", demandeur.nom);
    await page.fill("#prenoms", demandeur.prenoms);
    await page.selectOption("#genre", demandeur.genre);
    await page.fill("#dateNaissance", demandeur.dateNaissance);
    await page.fill("#lieuNaissance", demandeur.lieuNaissance);
    await page.fill("#domicile", demandeur.domicile);
    await page.selectOption("#situationMatrimoniale", demandeur.situationMatrimoniale);
    await page.fill("#profession", demandeur.profession);
    await page.fill("#telephone", demandeur.telephone);
    await page.selectOption("#paysNaissance", demandeur.paysNaissance);
    await page.selectOption("#nationalite", demandeur.nationalite);

    await page.selectOption("#regionNaissance", demandeur.regionNaissance);
    await page.waitForFunction(
      () => document.getElementById("provinceNaissance") instanceof HTMLSelectElement &&
        (document.getElementById("provinceNaissance") as HTMLSelectElement).options.length > 1,
      { timeout: 5000 },
    );
    await page.selectOption("#provinceNaissance", demandeur.provinceNaissance);
    await page.waitForFunction(
      () => document.getElementById("communeNaissance") instanceof HTMLSelectElement &&
        (document.getElementById("communeNaissance") as HTMLSelectElement).options.length > 1,
      { timeout: 5000 },
    );
    await page.selectOption("#communeNaissance", demandeur.communeNaissance);

    if (demandeur.arrondissementNaissance) {
      const arrondCount = await page.$eval(
        "#arrondissementNaissance",
        (el) => (el as HTMLSelectElement).options.length,
      );
      if (arrondCount > 1) {
        await page.selectOption("#arrondissementNaissance", demandeur.arrondissementNaissance);
      }
    }

    await page.selectOption("#typePiece", demandeur.typePiece);
    await page.fill("#numeroPiece", demandeur.numeroPiece);
    await page.click('[data-testid="btn-next"]');

    await page.fill("#nomPere", filiation.nomPere);
    await page.fill("#prenomsPere", filiation.prenomsPere);
    await page.fill("#nomMere", filiation.nomMere);
    await page.fill("#prenomsMere", filiation.prenomsMere);
    await page.click('[data-testid="btn-next"]');

    await page.setInputFiles('[data-testid="doc-input-acte_naissance"]', {
      name: documents.acteNaissance.fileName,
      mimeType: documents.acteNaissance.mimeType,
      buffer: documents.acteNaissance.buffer,
    });
    await page.setInputFiles('[data-testid="doc-input-piece_identite"]', {
      name: documents.pieceIdentite.fileName,
      mimeType: documents.pieceIdentite.mimeType,
      buffer: documents.pieceIdentite.buffer,
    });
    await page.click('[data-testid="btn-next"]');

    await page.click('[data-testid="btn-payer"]');
    await page.waitForSelector('[data-testid="payment-confirmation"]', { timeout: 5000 });
    await page.click('[data-testid="btn-next"]');

    await page.waitForSelector('[data-testid="recap-table"]');
    await page.click('[data-testid="btn-valider"]');
    await page.waitForSelector('[data-testid="confirmation"]', { timeout: 5000 });
    const confirmationText = await page.$eval('[data-testid="confirmation"]', (el) => (el as HTMLElement).innerText);

    const match = confirmationText.match(/DEMO-\d{4}-\d{6}/);
    if (!match) {
      throw new Error(`Code de référence introuvable dans la confirmation: "${confirmationText}"`);
    }
    const referenceCode = match[0];

    const pdfResponse = await page.request.get(`${baseUrl}/api/demo/demandes/${referenceCode}/recepisse`);
    if (!pdfResponse.ok()) {
      throw new Error(`Échec du téléchargement du récépissé (${pdfResponse.status()})`);
    }
    const pdfBuffer = await pdfResponse.body();

    return { referenceCode, pdfBuffer };
  } finally {
    await browser.close();
  }
}
