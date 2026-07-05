import Link from "next/link";
import { STEP_LABELS } from "@/lib/demo/types";
import styles from "./demo.module.css";

const STEP_ICONS = ["🪪", "👪", "📎", "💳", "🧾"];

export default function DemoLandingPage() {
  return (
    <main className={styles.landingPage}>
      <div className={styles.hero}>
        <h1>Bienvenue dans votre système de demande et de délivrance du bulletin n°3 du casier judiciaire</h1>
        <p>
          Cette plateforme (démonstration) est ouverte à toute personne de nationalité burkinabè, née
          au Burkina Faso (quelle que soit la région de naissance) ou à l&apos;étranger.
        </p>
        <p className={styles.heroWarning}>
          Le délai de traitement est de 2 jours ouvrables à compter de l&apos;heure de paiement.
        </p>
      </div>

      <div className={styles.landingCards}>
        <Link href="/demo/demande" className={styles.landingCard}>
          <span className={styles.landingCardIcon} aria-hidden>
            📝
          </span>
          <span>Faire ma demande</span>
        </Link>
        <Link href="/demo/suivre" className={`${styles.landingCard} ${styles.landingCardGhost}`}>
          <span className={styles.landingCardIcon} aria-hidden>
            👁️
          </span>
          <span>Suivre ma demande</span>
        </Link>
      </div>

      <h2 className={styles.landingSectionTitle}>Comment obtenir son Casier Judiciaire ?</h2>
      <div className={styles.processSteps}>
        {STEP_LABELS.map((label, index) => (
          <div key={label} className={styles.processStep}>
            <div className={styles.processStepDot}>{STEP_ICONS[index] ?? index + 1}</div>
            <div className={styles.processStepLabel}>
              {index + 1}
              <br />
              {label}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
