"use client";

import type { PlanResult } from "@/domain/tax/engine";
import { ExpenseLedger } from "./expense-ledger";
import type { HsaFamilyAllocation } from "./hsa-controls";
import { PlanAnswer } from "./plan-answer";
import { PlanAssumptions } from "./plan-assumptions";
import type { StoredPlan } from "./plan-types";
import styles from "./plan.module.css";

export function PlanScreen({
  draft,
  result,
  onDraft,
  preferredHsaAllocation,
  onHsaAllocationIntent,
}: {
  draft: StoredPlan;
  result: PlanResult;
  onDraft: (plan: StoredPlan) => void;
  preferredHsaAllocation?: HsaFamilyAllocation;
  onHsaAllocationIntent: (allocation: HsaFamilyAllocation) => void;
}) {
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
