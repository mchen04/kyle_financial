"use client";

import { useMemo } from "react";
import { calculatePlan } from "@/domain/tax/engine";
import { ExpenseLedger } from "./expense-ledger";
import type { HsaFamilyAllocation } from "./hsa-controls";
import { PlanAnswer } from "./plan-answer";
import { PlanAssumptions } from "./plan-assumptions";
import type { StoredPlan } from "./plan-types";
import styles from "./plan.module.css";

export function PlanScreen({
  draft,
  onDraft,
  preferredHsaAllocation,
  onHsaAllocationIntent,
}: {
  draft: StoredPlan;
  onDraft: (plan: StoredPlan) => void;
  preferredHsaAllocation?: HsaFamilyAllocation;
  onHsaAllocationIntent: (allocation: HsaFamilyAllocation) => void;
}) {
  const result = useMemo(() => calculatePlan(draft), [draft]);

  return (
    <div className={styles.planGrid}>
      <PlanAnswer draft={draft} result={result} />
      <PlanAssumptions
        draft={draft}
        result={result}
        onDraft={onDraft}
        preferredHsaAllocation={preferredHsaAllocation}
        onHsaAllocationIntent={onHsaAllocationIntent}
      />
      <ExpenseLedger draft={draft} result={result} onDraft={onDraft} />
    </div>
  );
}
