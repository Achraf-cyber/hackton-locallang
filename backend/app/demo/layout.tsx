import type { Metadata } from "next";
import { DemoBanner } from "./components/DemoBanner";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "DEMO — e-Casier (site fictif, ne pas confondre avec le vrai service)",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.demoRoot}>
      <DemoBanner />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
