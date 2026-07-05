#!/usr/bin/env node
/**
 * Remplit automatiquement le wizard DEMO "e-casier" (backend/app/demo/demande)
 * avec des donnees fictives, s'arrete a l'etape Recepisse pour confirmation,
 * puis valide (localement, sur le mock backend DEMO uniquement).
 *
 * GARDE-FOU (non-negociable) : ce script ne parle JAMAIS a un site reel.
 * BASE_URL est fige sur localhost/127.0.0.1 (ou surchargeable via --base-url,
 * mais la garde ci-dessous refuse quand meme tout host qui n'est pas local).
 * Ne JAMAIS repointer ce script vers ecasier-judiciaire.gov.bf ou tout autre
 * systeme judiciaire/gouvernemental reel.
 *
 * Usage :
 *   node fill-form.js                 # remplit, s'arrete, demande confirmation (Entree)
 *   node fill-form.js --yes           # remplit et valide automatiquement (mock local, sans risque)
 *   node fill-form.js --base-url http://localhost:3001
 *   node fill-form.js --data ./sample-data.json
 *   HEADLESS=1 node fill-form.js      # sans fenetre navigateur visible (CI/sandbox)
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

const DEFAULT_BASE_URL = "http://localhost:3000";

function parseArgs(argv) {
  const args = { yes: false, baseUrl: DEFAULT_BASE_URL, dataPath: path.join(__dirname, "sample-data.json") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--yes") args.yes = true;
    else if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--data") args.dataPath = path.resolve(argv[++i]);
  }
  return args;
}

/** Refuse de tourner si BASE_URL ne pointe pas vers une machine locale. */
function assertLocalOnly(baseUrl) {
  const { hostname } = new URL(baseUrl);
  const allowed = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];
  if (!allowed.includes(hostname)) {
    throw new Error(
      `BASE_URL refuse : "${hostname}" n'est pas un host local (${allowed.join(", ")}).\n` +
        "Ce script ne doit JAMAIS etre pointe vers un systeme reel " +
        "(ecasier-judiciaire.gov.bf ou equivalent).",
    );
  }
}

function ensureSamplePdf(fixturesDir, fileName) {
  const filePath = path.join(fixturesDir, fileName);
  if (fs.existsSync(filePath)) return filePath;

  // PDF minimal mais valide (une page blanche) -- suffisant pour passer la
  // validation "application/pdf" cote demo, pas destine a etre lu.
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\n" +
      "xref\n0 4\n0000000000 65535 f \n" +
      "trailer << /Size 4 /Root 1 0 R >>\n" +
      "startxref\n0\n%%EOF",
    "utf-8",
  );
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(filePath, minimalPdf);
  return filePath;
}

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function fillStep1Demandeur(page, demandeur) {
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

  // Cascade region -> province -> commune -> (arrondissement, optionnel) :
  // chaque niveau ne se peuple qu'apres la reponse du niveau precedent.
  await page.selectOption("#regionNaissance", demandeur.regionNaissance);
  await page.waitForFunction(
    () => document.getElementById("provinceNaissance").options.length > 1,
    { timeout: 5000 },
  );
  await page.selectOption("#provinceNaissance", demandeur.provinceNaissance);
  await page.waitForFunction(
    () => document.getElementById("communeNaissance").options.length > 1,
    { timeout: 5000 },
  );
  await page.selectOption("#communeNaissance", demandeur.communeNaissance);

  if (demandeur.arrondissementNaissance) {
    await page
      .waitForFunction(() => document.getElementById("arrondissementNaissance").options.length > 1, {
        timeout: 3000,
      })
      .catch(() => {}); // certaines communes n'ont pas d'arrondissement dans le jeu de donnees demo
    const arrondOptionsCount = await page.$eval(
      "#arrondissementNaissance",
      (el) => el.options.length,
    );
    if (arrondOptionsCount > 1) {
      await page.selectOption("#arrondissementNaissance", demandeur.arrondissementNaissance);
    }
  }

  await page.selectOption("#typePiece", demandeur.typePiece);
  await page.fill("#numeroPiece", demandeur.numeroPiece);

  await page.click('[data-testid="btn-next"]');
}

async function fillStep2Filiation(page, filiation) {
  await page.fill("#nomPere", filiation.nomPere);
  await page.fill("#prenomsPere", filiation.prenomsPere);
  await page.fill("#nomMere", filiation.nomMere);
  await page.fill("#prenomsMere", filiation.prenomsMere);
  await page.click('[data-testid="btn-next"]');
}

async function fillStep3Documents(page, fixturesDir) {
  const acteNaissancePdf = ensureSamplePdf(fixturesDir, "acte-naissance.pdf");
  const pieceIdentitePdf = ensureSamplePdf(fixturesDir, "piece-identite.pdf");

  await page.setInputFiles('[data-testid="doc-input-acte_naissance"]', acteNaissancePdf);
  await page.setInputFiles('[data-testid="doc-input-piece_identite"]', pieceIdentitePdf);

  await page.click('[data-testid="btn-next"]');
}

async function fillStep4Paiement(page) {
  await page.click('[data-testid="btn-payer"]');
  await page.waitForSelector('[data-testid="payment-confirmation"]', { timeout: 5000 });
  await page.click('[data-testid="btn-next"]');
}

async function reviewAndSubmitStep5(page, demandeur, autoConfirm) {
  await page.waitForSelector('[data-testid="recap-table"]');
  const recapText = await page.$eval('[data-testid="recap-table"]', (el) => el.innerText);

  // Sanity check basique : le recap doit contenir ce qu'on a saisi.
  if (!recapText.includes(demandeur.nom) || !recapText.includes(demandeur.prenoms)) {
    throw new Error("Le recap ne correspond pas aux donnees saisies -- abandon avant validation.");
  }

  console.log("\n=== Résumé (Space DEMO local uniquement) ===");
  console.log(recapText);
  console.log("=============================================\n");

  if (!autoConfirm) {
    await waitForEnter(
      "Appuyez sur Entrée pour valider la demande (mock local), ou Ctrl+C pour annuler... ",
    );
  }

  await page.click('[data-testid="btn-valider"]');
  await page.waitForSelector('[data-testid="confirmation"]', { timeout: 5000 });
  const confirmationText = await page.$eval('[data-testid="confirmation"]', (el) => el.innerText);
  console.log(`\n${confirmationText}\n`);

  const match = confirmationText.match(/DEMO-\d{4}-\d{6}/);
  const referenceCode = match ? match[0] : null;
  return { confirmationText, referenceCode };
}

/**
 * Recupere le PDF de recepisse genere par le mock backend et l'enregistre
 * localement -- simule ce que le vrai bot (Telegram/WhatsApp) devrait faire
 * pour livrer le document a l'utilisateur de maniere fiable.
 */
async function downloadRecepisse(page, baseUrl, referenceCode, outputDir) {
  const url = `${baseUrl}/api/demo/demandes/${referenceCode}/recepisse`;
  const response = await page.request.get(url);
  if (!response.ok()) {
    throw new Error(`Échec du téléchargement du récépissé : ${response.status()} ${url}`);
  }
  const buffer = await response.body();
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `recepisse-${referenceCode}.pdf`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertLocalOnly(args.baseUrl);

  const sampleData = JSON.parse(fs.readFileSync(args.dataPath, "utf-8"));
  const fixturesDir = path.join(__dirname, "fixtures");

  const browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
  try {
    const page = await browser.newPage();
    await page.goto(`${args.baseUrl}/demo/demande`);

    console.log("Étape 1/5 — Identification...");
    await fillStep1Demandeur(page, sampleData.demandeur);

    console.log("Étape 2/5 — Filiation...");
    await fillStep2Filiation(page, sampleData.filiation);

    console.log("Étape 3/5 — Pièces justificatives...");
    await fillStep3Documents(page, fixturesDir);

    console.log("Étape 4/5 — Paiement (démo)...");
    await fillStep4Paiement(page);

    console.log("Étape 5/5 — Récépissé...");
    const { referenceCode } = await reviewAndSubmitStep5(page, sampleData.demandeur, args.yes);

    if (referenceCode) {
      const outputDir = path.join(__dirname, "output");
      const pdfPath = await downloadRecepisse(page, args.baseUrl, referenceCode, outputDir);
      console.log(`Récépissé PDF téléchargé : ${pdfPath}`);
    } else {
      console.warn("Code de référence introuvable dans la confirmation, PDF non téléchargé.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Échec du script :", err.message);
  process.exitCode = 1;
});
