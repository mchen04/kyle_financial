import { ChevronLeft } from "lucide-react";
import styles from "./cockpit-shared.module.css";

export function BackPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.surfaceStack}>
      <header className={styles.backHeader}>
        <button onClick={onBack} aria-label="Back to Budget">
          <ChevronLeft />
          <span>Budget</span>
        </button>
        <div>
          <p className={styles.eyebrow}>Budget</p>
          <h1>{title}</h1>
        </div>
      </header>
      {children}
    </div>
  );
}
