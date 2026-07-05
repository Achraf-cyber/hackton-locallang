"use client";

import { useRef, useState } from "react";
import { useDemoForm } from "@/lib/demo/DemoContext";
import { DOCUMENT_TYPE_LABELS, DocumentType, REQUIRED_DOCUMENT_TYPES } from "@/lib/demo/types";
import styles from "../../demo.module.css";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export function Step3Documents() {
  const { formState, setDocuments, next, previous, isStepValid } = useDemoForm();
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<DocumentType, HTMLInputElement | null>>({
    acte_naissance: null,
    piece_identite: null,
  });

  const handleFileSelected = (type: DocumentType, file: File | undefined) => {
    setError(null);
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(`« ${file.name} » n'est pas un PDF. Seuls les fichiers PDF sont acceptés.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`« ${file.name} » dépasse la taille maximale de 2 Mo.`);
      return;
    }

    const withoutSameType = formState.documents.filter((d) => d.type !== type);
    setDocuments([...withoutSameType, { type, fileName: file.name, sizeBytes: file.size }]);
  };

  const handleRemove = (type: DocumentType) => {
    setDocuments(formState.documents.filter((d) => d.type !== type));
  };

  const getDoc = (type: DocumentType) => formState.documents.find((d) => d.type === type);

  return (
    <div>
      {error && (
        <div
          data-testid="upload-error"
          style={{
            background: "#fef2f2",
            border: "1px solid #b91c1c",
            color: "#b91c1c",
            borderRadius: "0.4rem",
            padding: "0.6rem 0.8rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {REQUIRED_DOCUMENT_TYPES.map((type) => {
        const doc = getDoc(type);
        return (
          <div key={type} style={{ marginBottom: "1rem" }}>
            <div className={styles.field} style={{ marginBottom: "0.4rem" }}>
              <label>{DOCUMENT_TYPE_LABELS[type]} *</label>
            </div>

            {doc ? (
              <div className={styles.docRow} data-testid={`doc-row-${type}`}>
                <span>{doc.fileName}</span>
                <div className={styles.docRowActions}>
                  <button
                    type="button"
                    data-testid={`doc-modifier-${type}`}
                    onClick={() => inputRefs.current[type]?.click()}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    data-testid={`doc-supprimer-${type}`}
                    onClick={() => handleRemove(type)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-testid={`doc-ajouter-${type}`}
                className={styles.secondaryButton}
                onClick={() => inputRefs.current[type]?.click()}
              >
                Ajouter un document
              </button>
            )}

            <input
              ref={(el) => {
                inputRefs.current[type] = el;
              }}
              data-testid={`doc-input-${type}`}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => handleFileSelected(type, e.target.files?.[0])}
            />
          </div>
        );
      })}

      <div className={styles.actions}>
        <button type="button" data-testid="btn-previous" className={styles.secondaryButton} onClick={previous}>
          Précédent
        </button>
        <button
          type="button"
          data-testid="btn-next"
          className={styles.primaryButton}
          disabled={!isStepValid(2)}
          onClick={next}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
