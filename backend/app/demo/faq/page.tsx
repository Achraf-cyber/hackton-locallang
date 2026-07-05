import styles from "../demo.module.css";

const FAQ_ITEMS = [
  {
    q: "Combien coûte une demande de casier judiciaire ?",
    a: "Dans cette démonstration, des frais fictifs de 1 000 FCFA sont simulés à l'étape Paiement.",
  },
  {
    q: "Quel est le délai de traitement ?",
    a: "Sur le vrai site, environ 2 jours ouvrables. Ici, le récépissé est généré instantanément.",
  },
  {
    q: "Quels documents dois-je fournir ?",
    a: "Un extrait ou jugement supplétif d'acte de naissance, et une CNIB ou un passeport, au format PDF.",
  },
];

export default function FaqPage() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1>Foire aux questions</h1>
      </div>
      {FAQ_ITEMS.map((item) => (
        <div key={item.q} style={{ marginBottom: "1.25rem" }}>
          <strong>{item.q}</strong>
          <p style={{ color: "#4b5563", marginTop: "0.35rem" }}>{item.a}</p>
        </div>
      ))}
    </main>
  );
}
