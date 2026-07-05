"use client";

import { useState } from "react";
import styles from "../demo.module.css";

interface LookupResult {
  found: boolean;
  referenceCode?: string;
  submittedAt?: string;
  demandeurNom?: string;
  statut?: string;
}

export default function SuivrePage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/demo/demandes/${encodeURIComponent(code.trim())}`);
      const data = (await res.json()) as LookupResult;
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1>Suivre ma demande</h1>
      </div>

      <div className={styles.field}>
        <label htmlFor="reference">Code de référence (ex. DEMO-2026-123456)</label>
        <input
          id="reference"
          data-testid="field-reference"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className={styles.actions} style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          data-testid="btn-rechercher"
          className={styles.primaryButton}
          disabled={loading || !code.trim()}
          onClick={handleSearch}
        >
          {loading ? "Recherche..." : "Rechercher"}
        </button>
      </div>

      {result && (
        <div className={styles.confirmation} data-testid="lookup-result" style={{ marginTop: "1.5rem" }}>
          {result.found ? (
            <>
              <strong>Demande {result.referenceCode}</strong>
              <p>Demandeur : {result.demandeurNom}</p>
              <p>Statut : {result.statut}</p>
              <p>Soumise le : {new Date(result.submittedAt!).toLocaleString("fr-FR")}</p>
            </>
          ) : (
            <p>Aucune demande trouvée avec ce code (démonstration).</p>
          )}
        </div>
      )}
    </main>
  );
}
