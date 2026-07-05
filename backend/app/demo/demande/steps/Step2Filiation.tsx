"use client";

import { useDemoForm } from "@/lib/demo/DemoContext";
import styles from "../../demo.module.css";

export function Step2Filiation() {
  const { formState, updateFiliation, next, previous, isStepValid } = useDemoForm();
  const filiation = formState.filiation;

  return (
    <div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="nomPere">Nom du père *</label>
          <input
            id="nomPere"
            data-testid="field-nomPere"
            value={filiation.nomPere}
            onChange={(e) => updateFiliation({ nomPere: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="prenomsPere">Prénom(s) du père *</label>
          <input
            id="prenomsPere"
            data-testid="field-prenomsPere"
            value={filiation.prenomsPere}
            onChange={(e) => updateFiliation({ prenomsPere: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="nomMere">Nom de la mère *</label>
          <input
            id="nomMere"
            data-testid="field-nomMere"
            value={filiation.nomMere}
            onChange={(e) => updateFiliation({ nomMere: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="prenomsMere">Prénom(s) de la mère *</label>
          <input
            id="prenomsMere"
            data-testid="field-prenomsMere"
            value={filiation.prenomsMere}
            onChange={(e) => updateFiliation({ prenomsMere: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" data-testid="btn-previous" className={styles.secondaryButton} onClick={previous}>
          Précédent
        </button>
        <button
          type="button"
          data-testid="btn-next"
          className={styles.primaryButton}
          disabled={!isStepValid(1)}
          onClick={next}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
