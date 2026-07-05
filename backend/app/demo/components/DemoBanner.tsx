import styles from "../demo.module.css";

/** Banniere DEMO persistante et non-masquable : voir README.demo.md, §2. */
export function DemoBanner() {
  return (
    <div className={styles.banner} data-testid="demo-banner">
      DEMO — DONNÉES FICTIVES — AUCUNE SOUMISSION RÉELLE
    </div>
  );
}
