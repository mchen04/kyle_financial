import { ChevronLeft } from "lucide-react";
import styles from "./cockpit-shared.module.css";

export function BackPage({
  title,
  // The surface `onBack` actually returns to. It defaults to Budget, which is
  // where every sub-page but Monthly wrap goes; wrap is reachable from two
  // places and names the one it will return to (C14: exactly one back control,
  // and it has to be honest about its destination).
  backLabel = "Budget",
  onBack,
  children,
}: {
  title: string;
  backLabel?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.surfaceStack}>
      <header className={styles.backHeader}>
        <button onClick={onBack} aria-label={`Back to ${backLabel}`}>
          <ChevronLeft />
          <span>{backLabel}</span>
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
