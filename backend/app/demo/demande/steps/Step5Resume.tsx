"use client";

import { useState } from "react";
import { useDemoForm } from "@/lib/demo/DemoContext";
import { DOCUMENT_TYPE_LABELS } from "@/lib/demo/types";
import {
  GENRE_OPTIONS,
  NATIONALITE_OPTIONS,
  PAYS_OPTIONS,
  SITUATION_MATRIMONIALE_OPTIONS,
  TYPE_PIECE_OPTIONS,
  arrondissementOptions,
  communeOptions,
  labelFor,
  provinceOptions,
  regionOptions,
} from "@/lib/demo/data";
import styles from "../../demo.module.css";

export function Step5Resume() {
  const { formState, previous, referenceCode, setReferenceCode } = useDemoForm();
  const { demandeur, filiation, documents } = formState;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/demo/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });
      const data = (await res.json()) as { referenceCode: string };
      setReferenceCode(data.referenceCode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <table className={styles.recapTable} data-testid="recap-table">
        <tbody>
          <tr><td>Nom</td><td>{demandeur.nom}</td></tr>
          <tr><td>Prénom(s)</td><td>{demandeur.prenoms}</td></tr>
          <tr><td>Genre</td><td>{labelFor(GENRE_OPTIONS, demandeur.genre)}</td></tr>
          <tr><td>Date de naissance</td><td>{demandeur.dateNaissance}</td></tr>
          <tr><td>Lieu de naissance</td><td>{demandeur.lieuNaissance}</td></tr>
          <tr><td>Domicile</td><td>{demandeur.domicile}</td></tr>
          <tr><td>Situation matrimoniale</td><td>{labelFor(SITUATION_MATRIMONIALE_OPTIONS, demandeur.situationMatrimoniale)}</td></tr>
          <tr><td>Profession</td><td>{demandeur.profession}</td></tr>
          <tr><td>Téléphone</td><td>{demandeur.telephone}</td></tr>
          <tr><td>Pays de naissance</td><td>{labelFor(PAYS_OPTIONS, demandeur.paysNaissance)}</td></tr>
          <tr><td>Nationalité</td><td>{labelFor(NATIONALITE_OPTIONS, demandeur.nationalite)}</td></tr>
          <tr><td>Région de naissance</td><td>{labelFor(regionOptions(), demandeur.regionNaissance)}</td></tr>
          <tr><td>Province de naissance</td><td>{labelFor(provinceOptions(demandeur.regionNaissance), demandeur.provinceNaissance)}</td></tr>
          <tr><td>Commune de naissance</td><td>{labelFor(communeOptions(demandeur.regionNaissance, demandeur.provinceNaissance), demandeur.communeNaissance)}</td></tr>
          <tr><td>Arrondissement de naissance</td><td>{demandeur.arrondissementNaissance ? labelFor(arrondissementOptions(demandeur.regionNaissance, demandeur.provinceNaissance, demandeur.communeNaissance), demandeur.arrondissementNaissance) : ""}</td></tr>
          <tr><td>Type de pièce</td><td>{labelFor(TYPE_PIECE_OPTIONS, demandeur.typePiece)}</td></tr>
          <tr><td>Numéro de la pièce</td><td>{demandeur.numeroPiece}</td></tr>
          <tr><td>Nom du père</td><td>{filiation.nomPere}</td></tr>
          <tr><td>Prénom(s) du père</td><td>{filiation.prenomsPere}</td></tr>
          <tr><td>Nom de la mère</td><td>{filiation.nomMere}</td></tr>
          <tr><td>Prénom(s) de la mère</td><td>{filiation.prenomsMere}</td></tr>
          {documents.map((doc) => (
            <tr key={doc.type}>
              <td>{DOCUMENT_TYPE_LABELS[doc.type]}</td>
              <td>{doc.fileName}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {referenceCode ? (
        <div className={styles.confirmation} data-testid="confirmation">
          <strong>Récépissé (démo) : {referenceCode}</strong>
          <p>Ceci est une démonstration : aucune donnée n&apos;a été transmise à un service réel.</p>
          <a
            href={`/api/demo/demandes/${referenceCode}/recepisse`}
            data-testid="link-recepisse-pdf"
            className={styles.primaryButton}
            style={{ display: "inline-block", marginTop: "0.75rem", textDecoration: "none" }}
          >
            Télécharger le récépissé (PDF)
          </a>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" data-testid="btn-previous" className={styles.secondaryButton} onClick={previous}>
            Précédent
          </button>
          <button
            type="button"
            data-testid="btn-valider"
            className={styles.primaryButton}
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Envoi..." : "Valider ma demande"}
          </button>
        </div>
      )}
    </div>
  );
}
