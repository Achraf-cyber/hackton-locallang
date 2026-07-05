import styles from "../demo.module.css";

export default function ConfidentialitePage() {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1>Confidentialité</h1>
      </div>
      <p style={{ color: "#4b5563" }}>
        Ceci est une page fictive faisant partie d&apos;un site de démonstration. Les données saisies
        dans ce formulaire ne sont conservées qu&apos;en mémoire, le temps du processus serveur, et ne
        sont jamais transmises à un service tiers ou gouvernemental réel.
      </p>
    </main>
  );
}
