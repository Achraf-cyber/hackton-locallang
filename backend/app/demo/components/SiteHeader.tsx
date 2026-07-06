import Link from "next/link";
import { Landmark } from "lucide-react";
import styles from "../demo.module.css";

/** En-tete du site DEMO, presente sur toutes les pages /demo/* (voir layout.tsx). */
export function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <Link href="/demo" className={styles.brand}>
        <span className={styles.brandIcon} aria-hidden>
          <Landmark size={20} />
        </span>
        <span>e-justice (DEMO)</span>
      </Link>
      <nav className={styles.siteNav}>
        <Link href="/demo/demande" className={styles.navButton}>
          Faire ma demande
        </Link>
        <Link href="/demo/suivre" className={`${styles.navButton} ${styles.navButtonGhost}`}>
          Suivre ma demande
        </Link>
        <Link href="/demo/faq" className={styles.navLink}>
          FAQ
        </Link>
        <Link href="/demo/confidentialite" className={styles.navLink}>
          Confidentialité
        </Link>
        <Link href="/demo/contacts" className={styles.navLink}>
          Contacts
        </Link>
      </nav>
    </header>
  );
}
