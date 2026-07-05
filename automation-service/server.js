/**
 * automation-service — Space Docker dedie a l'automatisation Playwright du
 * site DEMO "e-casier" (voir backend/app/demo/*). Appele par
 * backend/lib/demoAutomation.ts via AUTOMATION_SERVICE_URL.
 *
 * Existe comme service SEPARE de `backend` (au lieu de tourner en-process
 * dans le Next.js) parce qu'un navigateur headless (Chromium) a besoin d'un
 * process Node persistant et d'un binaire ~300 Mo -- incompatible avec une
 * fonction serverless Vercel standard (filesystem lecture seule, limite de
 * taille de deploiement, timeout court). Meme raisonnement que le split
 * model-service/asr-service/tts-service (voir model-service/README.md),
 * applique ici a une contrainte d'execution plutot que de RAM.
 *
 * GARDE-FOU (non-negociable) : n'automatise JAMAIS un site reel. DEMO_BASE_URL
 * doit pointer vers notre propre site DEMO (le `backend` Next.js qu'on
 * heberge), jamais vers ecasier-judiciaire.gov.bf ou equivalent -- voir
 * assertNotRealGovSite().
 */

const express = require("express");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 7860;
const DEFAULT_DEMO_BASE_URL = process.env.DEMO_BASE_URL || "http://localhost:3000";
const REAL_GOV_HOSTNAMES = ["ecasier-judiciaire.gov.bf"];

function assertNotRealGovSite(baseUrl) {
  const { hostname } = new URL(baseUrl);
  if (REAL_GOV_HOSTNAMES.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    throw new Error(
      `DEMO_BASE_URL ("${hostname}") pointe vers un site gouvernemental reel -- refuse. ` +
        "Ce service ne doit automatiser QUE notre propre site DEMO.",
    );
  }
}

async function submitCasierDemande(baseUrl, formState, documents) {
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
      () => document.getElementById("provinceNaissance")?.options.length > 1,
      { timeout: 5000 },
    );
    await page.selectOption("#provinceNaissance", demandeur.provinceNaissance);
    await page.waitForFunction(
      () => document.getElementById("communeNaissance")?.options.length > 1,
      { timeout: 5000 },
    );
    await page.selectOption("#communeNaissance", demandeur.communeNaissance);

    if (demandeur.arrondissementNaissance) {
      const arrondCount = await page.$eval("#arrondissementNaissance", (el) => el.options.length);
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
      buffer: Buffer.from(documents.acteNaissance.base64, "base64"),
    });
    await page.setInputFiles('[data-testid="doc-input-piece_identite"]', {
      name: documents.pieceIdentite.fileName,
      mimeType: documents.pieceIdentite.mimeType,
      buffer: Buffer.from(documents.pieceIdentite.base64, "base64"),
    });
    await page.click('[data-testid="btn-next"]');

    await page.click('[data-testid="btn-payer"]');
    await page.waitForSelector('[data-testid="payment-confirmation"]', { timeout: 5000 });
    await page.click('[data-testid="btn-next"]');

    await page.waitForSelector('[data-testid="recap-table"]');
    await page.click('[data-testid="btn-valider"]');
    await page.waitForSelector('[data-testid="confirmation"]', { timeout: 5000 });
    const confirmationText = await page.$eval('[data-testid="confirmation"]', (el) => el.innerText);

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

    return { referenceCode, pdfBase64: pdfBuffer.toString("base64") };
  } finally {
    await browser.close();
  }
}

const app = express();
app.use(express.json({ limit: "25mb" })); // documents en base64 -> requêtes plus grosses qu'un JSON typique

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/submit-casier", async (req, res) => {
  const { formState, documents, demoBaseUrl } = req.body || {};
  if (!formState || !documents?.acteNaissance || !documents?.pieceIdentite) {
    return res.status(400).json({ error: "formState et documents.{acteNaissance,pieceIdentite} requis" });
  }

  try {
    const result = await submitCasierDemande(demoBaseUrl || DEFAULT_DEMO_BASE_URL, formState, documents);
    res.json(result);
  } catch (err) {
    console.error("[automation-service] /submit-casier échoué:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`automation-service en écoute sur le port ${PORT} (DEMO_BASE_URL=${DEFAULT_DEMO_BASE_URL})`);
});
