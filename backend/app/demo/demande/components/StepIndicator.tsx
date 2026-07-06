"use client";

import { Check } from "lucide-react";
import { STEP_LABELS, StepIndex } from "@/lib/demo/types";
import { useDemoForm } from "@/lib/demo/DemoContext";
import styles from "../../demo.module.css";

export function StepIndicator() {
  const { step, isStepValid, goToStep } = useDemoForm();

  return (
    <div className={styles.stepBar} data-testid="step-indicator">
      {STEP_LABELS.map((label, index) => {
        const idx = index as StepIndex;
        const isCurrent = idx === step;
        const canJump = idx <= step || (idx === step + 1 && isStepValid(step));

        return (
          <div key={label} className={styles.stepItem}>
            <button
              type="button"
              data-testid={`step-tab-${index}`}
              onClick={() => canJump && goToStep(idx)}
              style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: canJump ? "pointer" : "default" }}
            >
              <span
                className={`${styles.stepCircle} ${
                  idx < step ? styles.stepCircleDone : isCurrent ? styles.stepCircleDoing : ""
                }`}
              >
                {idx < step ? <Check size={14} /> : index + 1}
              </span>
              <span className={`${styles.stepLabel} ${isCurrent ? styles.stepLabelActive : ""}`}>
                {label}
              </span>
            </button>
            {index < STEP_LABELS.length - 1 && (
              <div className={`${styles.stepConnector} ${idx < step ? styles.stepConnectorDone : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
