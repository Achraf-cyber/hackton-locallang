/**
 * Remplit et soumet le formulaire DEMO "e-casier" (backend/app/demo/demande)
 * pour le compte du bot Telegram (voir lib/telegram/casierFlow.ts).
 *
 * Trois chemins possibles, choisis dans cet ordre par submitCasierDemande() :
 *
 * 1. AUTOMATION_SERVICE_URL défini -> délègue à `automation-service` (Space
 *    Docker séparé, voir automation-service/README.md). Non utilisé en
 *    pratique actuellement : ce Space n'a jamais été créé sur huggingface.co
 *    (voir .github/workflows/deploy-automation-service.yml, pointé vers
 *    "automation-service-disabled" pour désactiver son déploiement CI sans
 *    supprimer le code -- créer le vrai Space + définir cette variable
 *    d'env est la voie "propre" si on veut un jour un navigateur dédié,
 *    persistant, hors contrainte serverless).
 *
 * 2. Sur Vercel (process.env.VERCEL défini) sans AUTOMATION_SERVICE_URL ->
 *    lancement Playwright EN-PROCESS avec un binaire Chromium compatible
 *    serverless (@sparticuz/chromium + playwright-core). AJOUTÉ après un
 *    bug de prod confirmé : le chemin (3) ci-dessous (Playwright "normal",
 *    qui attend un navigateur téléchargé via `playwright install` dans un
 *    cache local) plantait systématiquement en prod avec "Cannot find
 *    module '.../playwright-core/browsers.json'" -- une fonction Vercel n'a
 *    ni le cache navigateur de `playwright install`, ni de filesystem
 *    persistant pour l'y télécharger à la volée. @sparticuz/chromium
 *    embarque un binaire Chromium compressé spécifiquement construit pour
 *    tourner dans ce genre d'environnement (AWS Lambda/Vercel), extrait
 *    dans /tmp au démarrage.
 *
 * 3. Sinon (dev local hors Vercel) -> lancement Playwright "normal"
 *    (submitCasierDemandeLocal), qui utilise le Chromium téléchargé
 *    localement via `playwright install` -- nécessite `playwright` en
 *    dépendance locale (voir package.json), jamais utilisé en prod.
 *
 * GARDE-FOU (les trois chemins) : refuse d'automatiser un site autre que
 * notre propre DEMO -- voir assertNotRealGovSite().
 */
import type { Browser, Page } from "playwright-core";
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
 * Point d'entrée public : voir les 3 chemins possibles dans le commentaire
 * d'en-tête du fichier.
 */
export async function submitCasierDemande(
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  const env = getEnv();

  if (env.AUTOMATION_SERVICE_URL) {
    return submitViaAutomationService(env.AUTOMATION_SERVICE_URL, env.DEMO_BASE_URL, formState, documents);
  }

  if (process.env.VERCEL) {
    return submitCasierDemandeServerless(formState, documents);
  }

  return submitCasierDemandeLocal(formState, documents);
}

async function submitViaAutomationService(
  serviceUrl: string,
  demoBaseUrl: string,
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/submit-casier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      formState,
      demoBaseUrl,
      documents: {
        acteNaissance: {
          base64: documents.acteNaissance.buffer.toString("base64"),
          mimeType: documents.acteNaissance.mimeType,
          fileName: documents.acteNaissance.fileName,
        },
        pieceIdentite: {
          base64: documents.pieceIdentite.buffer.toString("base64"),
          mimeType: documents.pieceIdentite.mimeType,
          fileName: documents.pieceIdentite.fileName,
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`automation-service ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as { referenceCode: string; pdfBase64: string };
  return { referenceCode: data.referenceCode, pdfBuffer: Buffer.from(data.pdfBase64, "base64") };
}

/**
 * Remplit les 5 étapes du wizard DEMO avec `formState` sur une `page`
 * Playwright déjà ouverte, téléverse les deux documents fournis, paie
 * (fictif), valide, puis télécharge le récépissé PDF généré. Partagée par
 * les deux chemins de lancement en-process (local et serverless) -- seule
 * la façon dont le `Browser`/`Page` sont obtenus diffère entre eux.
 */
async function runCasierWizard(
  page: Page,
  baseUrl: string,
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
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
}

async function runWithBrowser(
  browser: Browser,
  baseUrl: string,
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  try {
    const page = await browser.newPage();
    return await runCasierWizard(page, baseUrl, formState, documents);
  } finally {
    await browser.close();
  }
}

function resolveBaseUrl(): string {
  let baseUrl = getEnv().DEMO_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL && (baseUrl === "http://localhost:3000" || !baseUrl)) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
  }
  return baseUrl;
}

/**
 * Lance et ferme son propre navigateur à chaque appel (pas de pool de
 * contextes : le volume attendu ne le justifie pas pour une démo).
 * DEV LOCAL UNIQUEMENT -- voir le commentaire d'en-tête du fichier.
 */
async function submitCasierDemandeLocal(
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  const baseUrl = resolveBaseUrl();
  assertNotRealGovSite(baseUrl);

  // Import dynamique du package `playwright` COMPLET (avec gestion de
  // navigateur téléchargé via `playwright install`) : réservé au dev local,
  // jamais atteint sur Vercel (voir submitCasierDemandeServerless pour le
  // chemin de prod, qui utilise playwright-core + @sparticuz/chromium).
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  return runWithBrowser(browser, baseUrl, formState, documents);
}

/**
 * Équivalent de submitCasierDemandeLocal, mais avec un binaire Chromium
 * compatible fonction serverless (@sparticuz/chromium) au lieu du Chromium
 * "normal" géré par `playwright install` (absent sur Vercel -- voir le
 * commentaire d'en-tête du fichier pour le bug de prod que ceci corrige).
 */
async function submitCasierDemandeServerless(
  formState: DemoFormState,
  documents: { acteNaissance: CasierDocument; pieceIdentite: CasierDocument },
): Promise<CasierAutomationResult> {
  const baseUrl = resolveBaseUrl();
  assertNotRealGovSite(baseUrl);

  const [{ chromium }, sparticuzChromium] = await Promise.all([
    import("playwright-core"),
    import("@sparticuz/chromium").then((m) => m.default),
  ]);
  const browser = await chromium.launch({
    args: sparticuzChromium.args,
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });
  return runWithBrowser(browser, baseUrl, formState, documents);
}
