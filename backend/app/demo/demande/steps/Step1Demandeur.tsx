"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoForm } from "@/lib/demo/DemoContext";
import { arrondissementOptions, communeOptions, provinceOptions, type SelectOption } from "@/lib/demo/data";
import styles from "../../demo.module.css";

interface Parameters {
  genre: SelectOption[];
  situationMatrimoniale: SelectOption[];
  pays: SelectOption[];
  nationalite: SelectOption[];
  typePiece: SelectOption[];
}

export function Step1Demandeur() {
  const { formState, updateDemandeur, next, isStepValid } = useDemoForm();
  const demandeur = formState.demandeur;

  const [parameters, setParameters] = useState<Parameters | null>(null);
  const [regions, setRegions] = useState<SelectOption[]>([]);

  // Batch fetch des donnees de reference (sexe, situation matrimoniale, ...),
  // simule l'appel "parametre_values/parameters" du site reel.
  useEffect(() => {
    fetch("/api/demo/parameters")
      .then((res) => res.json())
      .then(setParameters);
    fetch("/api/demo/localites")
      .then((res) => res.json())
      .then((data) => setRegions(data.regions ?? []));
  }, []);

  // Cascade région -> province -> commune -> arrondissement : dérivée en
  // mémoire (useMemo), PAS via fetch + useEffect + useState comme le reste
  // du formulaire. provinceOptions/communeOptions/arrondissementOptions sont
  // déjà des fonctions synchrones (lib/demo/data.ts, le même module que
  // consomme app/api/demo/localites/route.ts) : passer par le réseau pour
  // filtrer un tableau statique déjà présent dans le bundle n'apportait
  // qu'une latence et une fenêtre de course (une réponse en retard pour une
  // sélection déjà remplacée pouvait écraser la liste avec des options
  // périmées) sans aucun bénéfice.
  const provinces = useMemo(
    () => provinceOptions(demandeur.regionNaissance),
    [demandeur.regionNaissance],
  );
  const communes = useMemo(
    () => communeOptions(demandeur.regionNaissance, demandeur.provinceNaissance),
    [demandeur.regionNaissance, demandeur.provinceNaissance],
  );
  const arrondissements = useMemo(
    () => arrondissementOptions(demandeur.regionNaissance, demandeur.provinceNaissance, demandeur.communeNaissance),
    [demandeur.regionNaissance, demandeur.provinceNaissance, demandeur.communeNaissance],
  );

  const handleRegionChange = (value: string) => {
    updateDemandeur({
      regionNaissance: value,
      provinceNaissance: "",
      communeNaissance: "",
      arrondissementNaissance: "",
    });
  };

  const handleProvinceChange = (value: string) => {
    updateDemandeur({ provinceNaissance: value, communeNaissance: "", arrondissementNaissance: "" });
  };

  const handleCommuneChange = (value: string) => {
    updateDemandeur({ communeNaissance: value, arrondissementNaissance: "" });
  };

  return (
    <div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="nom">Nom *</label>
          <input
            id="nom"
            data-testid="field-nom"
            value={demandeur.nom}
            onChange={(e) => updateDemandeur({ nom: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="prenoms">Prénom(s) *</label>
          <input
            id="prenoms"
            data-testid="field-prenoms"
            value={demandeur.prenoms}
            onChange={(e) => updateDemandeur({ prenoms: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="genre">Genre *</label>
          <select
            id="genre"
            data-testid="field-genre"
            value={demandeur.genre}
            onChange={(e) => updateDemandeur({ genre: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {parameters?.genre.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="dateNaissance">Date de naissance *</label>
          <input
            id="dateNaissance"
            data-testid="field-dateNaissance"
            type="date"
            value={demandeur.dateNaissance}
            onChange={(e) => updateDemandeur({ dateNaissance: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="lieuNaissance">Lieu de naissance *</label>
          <input
            id="lieuNaissance"
            data-testid="field-lieuNaissance"
            value={demandeur.lieuNaissance}
            onChange={(e) => updateDemandeur({ lieuNaissance: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="domicile">Domicile *</label>
          <input
            id="domicile"
            data-testid="field-domicile"
            value={demandeur.domicile}
            onChange={(e) => updateDemandeur({ domicile: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="situationMatrimoniale">Situation matrimoniale *</label>
          <select
            id="situationMatrimoniale"
            data-testid="field-situationMatrimoniale"
            value={demandeur.situationMatrimoniale}
            onChange={(e) => updateDemandeur({ situationMatrimoniale: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {parameters?.situationMatrimoniale.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="profession">Profession *</label>
          <input
            id="profession"
            data-testid="field-profession"
            value={demandeur.profession}
            onChange={(e) => updateDemandeur({ profession: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="telephone">Téléphone *</label>
          <input
            id="telephone"
            data-testid="field-telephone"
            value={demandeur.telephone}
            onChange={(e) => updateDemandeur({ telephone: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="paysNaissance">Pays de naissance *</label>
          <select
            id="paysNaissance"
            data-testid="field-paysNaissance"
            value={demandeur.paysNaissance}
            onChange={(e) => updateDemandeur({ paysNaissance: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {parameters?.pays.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="nationalite">Nationalité *</label>
          <select
            id="nationalite"
            data-testid="field-nationalite"
            value={demandeur.nationalite}
            onChange={(e) => updateDemandeur({ nationalite: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {parameters?.nationalite.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="regionNaissance">Région de naissance *</label>
          <select
            id="regionNaissance"
            data-testid="field-regionNaissance"
            value={demandeur.regionNaissance}
            onChange={(e) => handleRegionChange(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {regions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="provinceNaissance">Province de naissance *</label>
          <select
            id="provinceNaissance"
            data-testid="field-provinceNaissance"
            value={demandeur.provinceNaissance}
            disabled={!demandeur.regionNaissance}
            onChange={(e) => handleProvinceChange(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {provinces.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="communeNaissance">Commune de naissance *</label>
          <select
            id="communeNaissance"
            data-testid="field-communeNaissance"
            value={demandeur.communeNaissance}
            disabled={!demandeur.provinceNaissance}
            onChange={(e) => handleCommuneChange(e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {communes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="arrondissementNaissance">Arrondissement de naissance</label>
          <select
            id="arrondissementNaissance"
            data-testid="field-arrondissementNaissance"
            value={demandeur.arrondissementNaissance}
            disabled={!demandeur.communeNaissance || arrondissements.length === 0}
            onChange={(e) => updateDemandeur({ arrondissementNaissance: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {arrondissements.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="typePiece">Type de pièce d&apos;identité *</label>
          <select
            id="typePiece"
            data-testid="field-typePiece"
            value={demandeur.typePiece}
            onChange={(e) => updateDemandeur({ typePiece: e.target.value })}
          >
            <option value="">Sélectionner...</option>
            {parameters?.typePiece.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="numeroPiece">Numéro de la pièce *</label>
          <input
            id="numeroPiece"
            data-testid="field-numeroPiece"
            value={demandeur.numeroPiece}
            onChange={(e) => updateDemandeur({ numeroPiece: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <span />
        <button
          type="button"
          data-testid="btn-next"
          className={styles.primaryButton}
          disabled={!isStepValid(0)}
          onClick={next}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
