"use client";

import { useState } from "react";
import { useDemoForm } from "@/lib/demo/DemoContext";
import { DEMANDE_FEE_FCFA } from "@/lib/demo/types";
import styles from "../../demo.module.css";

export function Step4Paiement() {
  const { formState, markPaid, next, previous, isStepValid } = useDemoForm();
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    try {
      const res = await fetch("/api/demo/payer", { method: "POST" });
      const data = (await res.json()) as { paymentReference: string };
      markPaid(data.paymentReference);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <div className={styles.confirmation} style={{ background: "#eff6ff", borderColor: "#2563eb" }}>
        <strong>Frais de dossier (démonstration) : {DEMANDE_FEE_FCFA.toLocaleString("fr-FR")} FCFA</strong>
        <p>
          Aucun paiement réel n&apos;est effectué ici : ce bouton simule uniquement une réponse de
          paiement fictive.
        </p>
      </div>

      {formState.paid ? (
        <div className={styles.confirmation} data-testid="payment-confirmation">
          <strong>Paiement (démo) accepté — référence : {formState.paymentReference}</strong>
        </div>
      ) : (
        <button
          type="button"
          data-testid="btn-payer"
          className={styles.primaryButton}
          disabled={paying}
          onClick={handlePay}
          style={{ marginTop: "1rem" }}
        >
          {paying ? "Traitement..." : "Payer maintenant (démo)"}
        </button>
      )}

      <div className={styles.actions}>
        <button type="button" data-testid="btn-previous" className={styles.secondaryButton} onClick={previous}>
          Précédent
        </button>
        <button
          type="button"
          data-testid="btn-next"
          className={styles.primaryButton}
          disabled={!isStepValid(3)}
          onClick={next}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
