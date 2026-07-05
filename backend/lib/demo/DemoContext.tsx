"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DemandeurState,
  DemoFormState,
  EMPTY_FORM_STATE,
  FiliationState,
  REQUIRED_DOCUMENT_TYPES,
  StepIndex,
  UploadedDocument,
} from "./types";

interface DemoContextValue {
  formState: DemoFormState;
  updateDemandeur: (patch: Partial<DemandeurState>) => void;
  updateFiliation: (patch: Partial<FiliationState>) => void;
  setDocuments: (docs: UploadedDocument[]) => void;
  markPaid: (paymentReference: string) => void;
  step: StepIndex;
  goToStep: (step: StepIndex) => void;
  next: () => void;
  previous: () => void;
  isStepValid: (step: StepIndex) => boolean;
  referenceCode: string | null;
  setReferenceCode: (code: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const REQUIRED_DEMANDEUR_FIELDS: (keyof DemandeurState)[] = [
  "nom",
  "prenoms",
  "genre",
  "dateNaissance",
  "lieuNaissance",
  "domicile",
  "situationMatrimoniale",
  "profession",
  "telephone",
  "paysNaissance",
  "nationalite",
  "regionNaissance",
  "provinceNaissance",
  "communeNaissance",
  "typePiece",
  "numeroPiece",
];

const REQUIRED_FILIATION_FIELDS: (keyof FiliationState)[] = [
  "nomPere",
  "prenomsPere",
  "nomMere",
  "prenomsMere",
];

const LAST_STEP: StepIndex = 4;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [formState, setFormState] = useState<DemoFormState>(EMPTY_FORM_STATE);
  const [step, setStep] = useState<StepIndex>(0);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  const updateDemandeur = (patch: Partial<DemandeurState>) =>
    setFormState((prev) => ({ ...prev, demandeur: { ...prev.demandeur, ...patch } }));

  const updateFiliation = (patch: Partial<FiliationState>) =>
    setFormState((prev) => ({ ...prev, filiation: { ...prev.filiation, ...patch } }));

  const setDocuments = (docs: UploadedDocument[]) =>
    setFormState((prev) => ({ ...prev, documents: docs }));

  const markPaid = (paymentReference: string) =>
    setFormState((prev) => ({ ...prev, paid: true, paymentReference }));

  const isStepValid = (checkStep: StepIndex): boolean => {
    if (checkStep === 0) {
      return REQUIRED_DEMANDEUR_FIELDS.every((field) => formState.demandeur[field].trim() !== "");
    }
    if (checkStep === 1) {
      return REQUIRED_FILIATION_FIELDS.every((field) => formState.filiation[field].trim() !== "");
    }
    if (checkStep === 2) {
      const uploadedTypes = new Set(formState.documents.map((d) => d.type));
      return REQUIRED_DOCUMENT_TYPES.every((type) => uploadedTypes.has(type));
    }
    if (checkStep === 3) {
      return formState.paid;
    }
    return true;
  };

  const goToStep = (target: StepIndex) => setStep(target);
  const next = () => setStep((s) => (s < LAST_STEP ? ((s + 1) as StepIndex) : s));
  const previous = () => setStep((s) => (s > 0 ? ((s - 1) as StepIndex) : s));

  const value = useMemo<DemoContextValue>(
    () => ({
      formState,
      updateDemandeur,
      updateFiliation,
      setDocuments,
      markPaid,
      step,
      goToStep,
      next,
      previous,
      isStepValid,
      referenceCode,
      setReferenceCode,
    }),
    [formState, step, referenceCode],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoForm(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoForm doit être utilisé sous <DemoProvider>");
  return ctx;
}
