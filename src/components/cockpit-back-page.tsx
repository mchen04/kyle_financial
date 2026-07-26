import { ChevronLeft } from "lucide-react";
import styles from "./cockpit-shared.module.css";

/**
 * The one detail-surface header. Every secondary surface — Category detail,
 * Edit budget, Manage categories, Monthly wrap, Plan details, Benefits and
 * Compare years — is framed by this and nothing else, so arriving on any of
 * them puts the back control and the title in the same place at the same size.
 *
 * It carries no eyebrow. The eyebrow used to be the literal string "Budget" on
 * every surface while `backLabel` was already dynamic, so Monthly wrap reached
 * from Activity showed a back control reading "Activity" beside a section label
 * reading "Budget" — two answers to "where am I?" and one of them wrong. The
 * back control names the destination on its own, which is the fact a reader
 * actually needs, so the second line is gone rather than corrected.
 */
export function BackPage({
  title,
  // The surface `onBack` actually returns to. It defaults to Budget, which is
  // where most sub-pages go; Monthly wrap, Account and the Plan children are
  // reachable from elsewhere and name the one they will return to (C14:
  // exactly one back control, and it has to be honest about its destination).
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
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}
