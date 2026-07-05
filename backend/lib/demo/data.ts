/**
 * Donnees de reference STATIQUES et FICTIVES pour le formulaire DEMO
 * "e-casier" (voir lib/demo/types.ts). Sous-ensemble volontairement reduit
 * (quelques regions/provinces/communes) : suffisant pour demontrer la
 * cascade region -> province -> commune -> arrondissement sans viser une
 * parite exhaustive avec un vrai decoupage administratif.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export const GENRE_OPTIONS: SelectOption[] = [
  { value: "M", label: "Masculin" },
  { value: "F", label: "Féminin" },
];

export const SITUATION_MATRIMONIALE_OPTIONS: SelectOption[] = [
  { value: "celibataire", label: "Célibataire" },
  { value: "marie", label: "Marié(e)" },
  { value: "divorce", label: "Divorcé(e)" },
  { value: "veuf", label: "Veuf/Veuve" },
];

export const PAYS_OPTIONS: SelectOption[] = [
  { value: "BF", label: "Burkina Faso" },
  { value: "CI", label: "Côte d'Ivoire" },
  { value: "ML", label: "Mali" },
  { value: "AUTRE", label: "Autre" },
];

export const NATIONALITE_OPTIONS: SelectOption[] = [
  { value: "burkinabe", label: "Burkinabè" },
  { value: "ivoirienne", label: "Ivoirienne" },
  { value: "malienne", label: "Malienne" },
  { value: "autre", label: "Autre" },
];

export const TYPE_PIECE_OPTIONS: SelectOption[] = [
  { value: "cnib", label: "CNIB" },
  { value: "passeport", label: "Passeport" },
];

interface CommuneNode {
  value: string;
  label: string;
  arrondissements: SelectOption[];
}

interface ProvinceNode {
  value: string;
  label: string;
  communes: CommuneNode[];
}

interface RegionNode {
  value: string;
  label: string;
  provinces: ProvinceNode[];
}

/** Sous-ensemble fictif/reduit du decoupage administratif du Burkina Faso. */
export const LOCALITES_TREE: RegionNode[] = [
  {
    value: "centre",
    label: "Centre",
    provinces: [
      {
        value: "kadiogo",
        label: "Kadiogo",
        communes: [
          {
            value: "ouagadougou",
            label: "Ouagadougou",
            arrondissements: [
              { value: "bogodogo", label: "Bogodogo" },
              { value: "baskuy", label: "Baskuy" },
              { value: "nongremassom", label: "Nongr-Massom" },
            ],
          },
        ],
      },
    ],
  },
  {
    value: "hauts-bassins",
    label: "Hauts-Bassins",
    provinces: [
      {
        value: "houet",
        label: "Houet",
        communes: [
          {
            value: "bobo-dioulasso",
            label: "Bobo-Dioulasso",
            arrondissements: [
              { value: "dafra", label: "Dafra" },
              { value: "dogona", label: "Dogona" },
            ],
          },
        ],
      },
    ],
  },
  {
    value: "plateau-central",
    label: "Plateau-Central",
    provinces: [
      {
        value: "oubritenga",
        label: "Oubritenga",
        communes: [{ value: "ziniare", label: "Ziniaré", arrondissements: [] }],
      },
    ],
  },
];

export function regionOptions(): SelectOption[] {
  return LOCALITES_TREE.map((r) => ({ value: r.value, label: r.label }));
}

export function provinceOptions(regionValue: string): SelectOption[] {
  const region = LOCALITES_TREE.find((r) => r.value === regionValue);
  return region ? region.provinces.map((p) => ({ value: p.value, label: p.label })) : [];
}

export function communeOptions(regionValue: string, provinceValue: string): SelectOption[] {
  const region = LOCALITES_TREE.find((r) => r.value === regionValue);
  const province = region?.provinces.find((p) => p.value === provinceValue);
  return province ? province.communes.map((c) => ({ value: c.value, label: c.label })) : [];
}

export function arrondissementOptions(
  regionValue: string,
  provinceValue: string,
  communeValue: string,
): SelectOption[] {
  const region = LOCALITES_TREE.find((r) => r.value === regionValue);
  const province = region?.provinces.find((p) => p.value === provinceValue);
  const commune = province?.communes.find((c) => c.value === communeValue);
  return commune ? commune.arrondissements : [];
}
