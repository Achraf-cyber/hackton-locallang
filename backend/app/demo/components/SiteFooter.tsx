import { Lock, Clock, FileText, CreditCard } from "lucide-react";
import styles from "../demo.module.css";

const INFO_CARDS = [
  { icon: Lock, title: "Sécurisé", text: "Vos données restent locales à cette démonstration." },
  { icon: Clock, title: "Suivi en temps réel", text: "Suivez l'état de votre demande avec votre code." },
  { icon: FileText, title: "Documents en ligne", text: "Téléversez vos pièces justificatives au format PDF." },
  { icon: CreditCard, title: "Paiement en ligne", text: "Réglez les frais de dossier (simulation)." },
];

/** Pied de page du site DEMO, presente sur toutes les pages /demo/*. */
export function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.infoCards}>
        {INFO_CARDS.map((card) => (
          <div key={card.title} className={styles.infoCard}>
            <div className={styles.infoCardIcon} aria-hidden>
              <card.icon size={20} />
            </div>
            <div className={styles.infoCardTitle}>{card.title}</div>
            <div className={styles.infoCardText}>{card.text}</div>
          </div>
        ))}
      </div>
      <p className={styles.footerNote}>
        e-justice (DEMO) — Site fictif à but de démonstration. Aucune donnée saisie ici n&apos;est
        transmise à un service gouvernemental réel.
      </p>
    </footer>
  );
}
