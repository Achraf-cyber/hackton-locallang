/**
 * Types du wizard "e-casier" DEMO (voir README.demo.md). Ceci n'est PAS le
 * vrai site gouvernemental : formulaire fictif, backend fictif (app/api/demo/*),
 * jamais de requete vers un domaine reel.
 */

export interface DemandeurState {
  nom: string;
  prenoms: string;
  genre: string;
  dateNaissance: string;
  lieuNaissance: string;
  domicile: string;
  situationMatrimoniale: string;
  profession: string;
  telephone: string;
  paysNaissance: string;
  nationalite: string;
  regionNaissance: string;
  provinceNaissance: string;
  communeNaissance: string;
  arrondissementNaissance: string;
  typePiece: string;
  numeroPiece: string;
}

export interface FiliationState {
  nomPere: string;
  prenomsPere: string;
  nomMere: string;
  prenomsMere: string;
}

export type DocumentType = "acte_naissance" | "piece_identite";

export interface UploadedDocument {
  type: DocumentType;
  fileName: string;
  sizeBytes: number;
}

export interface DemoFormState {
  demandeur: DemandeurState;
  filiation: FiliationState;
  documents: UploadedDocument[];
  paid: boolean;
  paymentReference: string | null;
}

export const EMPTY_DEMANDEUR: DemandeurState = {
  nom: "",
  prenoms: "",
  genre: "",
  dateNaissance: "",
  lieuNaissance: "",
  domicile: "",
  situationMatrimoniale: "",
  profession: "",
  telephone: "",
  paysNaissance: "",
  nationalite: "",
  regionNaissance: "",
  provinceNaissance: "",
  communeNaissance: "",
  arrondissementNaissance: "",
  typePiece: "",
  numeroPiece: "",
};

export const EMPTY_FILIATION: FiliationState = {
  nomPere: "",
  prenomsPere: "",
  nomMere: "",
  prenomsMere: "",
};

export const EMPTY_FORM_STATE: DemoFormState = {
  demandeur: EMPTY_DEMANDEUR,
  filiation: EMPTY_FILIATION,
  documents: [],
  paid: false,
  paymentReference: null,
};

export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = ["acte_naissance", "piece_identite"];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  acte_naissance: "Extrait / jugement supplétif d'acte de naissance",
  piece_identite: "CNIB / Passeport",
};

export const STEP_LABELS = [
  "Identification",
  "Filiation",
  "Pièces Justificatives",
  "Paiement",
  "Récépissé",
] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export const DEMANDE_FEE_FCFA = 1000;
