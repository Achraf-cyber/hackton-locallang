import styles from "../demo.module.css";

export default function ContactsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1>Contacts</h1>
      </div>
      <p style={{ color: "#4b5563" }}>
        Page fictive : sur le vrai site, cette section afficherait les coordonnées du support. Ici,
        elle ne fait que compléter la navigation de démonstration.
      </p>
    </main>
  );
}
