"use client";

import { DemoProvider, useDemoForm } from "@/lib/demo/DemoContext";
import { StepIndicator } from "./components/StepIndicator";
import { Step1Demandeur } from "./steps/Step1Demandeur";
import { Step2Filiation } from "./steps/Step2Filiation";
import { Step3Documents } from "./steps/Step3Documents";
import { Step4Paiement } from "./steps/Step4Paiement";
import { Step5Resume } from "./steps/Step5Resume";
import styles from "../demo.module.css";

function DemoWizard() {
  const { step } = useDemoForm();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Demande de bulletin n°3 du casier judiciaire</h1>
      </div>

      <StepIndicator />

      {step === 0 && <Step1Demandeur />}
      {step === 1 && <Step2Filiation />}
      {step === 2 && <Step3Documents />}
      {step === 3 && <Step4Paiement />}
      {step === 4 && <Step5Resume />}
    </div>
  );
}

export default function DemandePage() {
  return (
    <DemoProvider>
      <DemoWizard />
    </DemoProvider>
  );
}
