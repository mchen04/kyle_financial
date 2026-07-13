import { Settings2 } from "lucide-react";
import type { PlanResult } from "@/domain/tax/engine";
import { STATE_OPTIONS } from "@/domain/tax/jurisdictions";
import { selectTaxTable } from "@/domain/tax/table-registry";
import type { TaxTable } from "@/domain/tax/types";
import {
  currentHsaFamilyAllocation,
  hsaCoverageChange,
  hsaEligibilityChange,
  showsHsaCatchUpEligibility,
  showsHsaFamilyAllocation,
  showsSpouseHsaEligibility,
  type HsaFamilyAllocation,
} from "./hsa-controls";
import { centsFromInput, money, type StoredPlan } from "./plan-types";
import { Guidance } from "./plan-visualizations";
import styles from "./plan.module.css";

function Citations({
  values,
  sources,
}: {
  values: string[];
  sources: TaxTable["sources"];
}) {
  return values.map((citation, index) => (
    <span key={citation}>
      {index > 0 && ", "}
      <a href={sources[citation].url} target="_blank" rel="noreferrer">
        {sources[citation].label}
      </a>
    </span>
  ));
}

export function PlanAssumptions({
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
  const sources = selectTaxTable(result.appliedTaxYear).table.sources;
  const updateHsaEligibility = (
    owner: "primary" | "spouse",
    eligible: boolean,
  ) => {
    const currentAllocation = currentHsaFamilyAllocation(draft);
    if (currentAllocation) onHsaAllocationIntent(currentAllocation);
    onDraft({
      ...draft,
      ...hsaEligibilityChange(draft, owner, eligible, preferredHsaAllocation),
    });
  };

  return (
    <aside className={styles.assumptionsCard}>
      <details>
        <summary>
          <span>
            <Settings2 size={17} /> Income and taxes
          </span>
          <span>Edit</span>
        </summary>
        <div className={styles.assumptionFields}>
          <label>
            Yearly salary
            <input
              type="number"
              min="0"
              value={draft.grossSalaryCents / 100 || ""}
              onChange={(event) =>
                onDraft({
                  ...draft,
                  grossSalaryCents: centsFromInput(event.target.value),
                })
              }
            />
          </label>
          <label>
            Bonus / RSU wages
            <input
              type="number"
              min="0"
              value={draft.additionalWageIncomeCents / 100 || ""}
              onChange={(event) =>
                onDraft({
                  ...draft,
                  additionalWageIncomeCents: centsFromInput(event.target.value),
                })
              }
            />
          </label>
          {draft.filingStatus === "mfj" && (
            <label>
              Spouse yearly wages
              <input
                type="number"
                min="0"
                value={draft.spouseWageIncomeCents / 100 || ""}
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    spouseWageIncomeCents: centsFromInput(event.target.value),
                  })
                }
              />
            </label>
          )}
          <label>
            Other ordinary income (no payroll tax)
            <input
              type="number"
              min="0"
              value={draft.otherOrdinaryIncomeCents / 100 || ""}
              onChange={(event) =>
                onDraft({
                  ...draft,
                  otherOrdinaryIncomeCents: centsFromInput(event.target.value),
                })
              }
            />
          </label>
          <label>
            State
            <select
              value={draft.stateCode}
              onChange={(event) =>
                onDraft({
                  ...draft,
                  stateCode: event.target.value as StoredPlan["stateCode"],
                })
              }
            >
              {STATE_OPTIONS.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filing status
            <select
              value={draft.filingStatus}
              onChange={(event) => {
                const filingStatus = event.target
                  .value as StoredPlan["filingStatus"];
                onDraft({
                  ...draft,
                  filingStatus,
                  ...(filingStatus === "mfj"
                    ? {}
                    : {
                        spouseWageIncomeCents: 0,
                        spouseHsaEligible: false,
                        spouseHsaCatchUpEligible: false,
                        primaryHsaFamilyAllocationPpm: 1_000_000,
                        spouseHsaFamilyAllocationPpm: 0,
                        benefits: draft.benefits.map((entry) => ({
                          ...entry,
                          owner: "primary" as const,
                        })),
                      }),
                });
              }}
            >
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="hoh">
                Head of household (state uses Single proxy)
              </option>
            </select>
          </label>
          <label>
            HSA coverage
            <select
              value={draft.hsaCoverage}
              onChange={(event) => {
                const currentAllocation = currentHsaFamilyAllocation(draft);
                if (currentAllocation) onHsaAllocationIntent(currentAllocation);
                onDraft({
                  ...draft,
                  ...hsaCoverageChange(
                    draft,
                    event.target.value as StoredPlan["hsaCoverage"],
                    preferredHsaAllocation,
                  ),
                });
              }}
            >
              <option value="self">Self-only</option>
              <option value="family">Family</option>
            </select>
          </label>
          <label className={styles.hsaEligibilityControl}>
            <input
              type="checkbox"
              checked={draft.primaryHsaEligible}
              onChange={(event) =>
                updateHsaEligibility("primary", event.target.checked)
              }
            />
            Primary owner is HSA-eligible
          </label>
          {showsHsaCatchUpEligibility(draft, "primary") && (
            <label className={styles.hsaEligibilityControl}>
              <input
                type="checkbox"
                checked={draft.primaryHsaCatchUpEligible}
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    primaryHsaCatchUpEligible: event.target.checked,
                  })
                }
              />
              Primary owner qualifies for the age-55 $1,000 HSA catch-up
            </label>
          )}
          {showsSpouseHsaEligibility(draft) && (
            <>
              <label className={styles.hsaEligibilityControl}>
                <input
                  type="checkbox"
                  checked={draft.spouseHsaEligible}
                  onChange={(event) =>
                    updateHsaEligibility("spouse", event.target.checked)
                  }
                />
                Spouse is HSA-eligible
              </label>
              {showsHsaCatchUpEligibility(draft, "spouse") && (
                <label className={styles.hsaEligibilityControl}>
                  <input
                    type="checkbox"
                    checked={draft.spouseHsaCatchUpEligible}
                    onChange={(event) =>
                      onDraft({
                        ...draft,
                        spouseHsaCatchUpEligible: event.target.checked,
                      })
                    }
                  />
                  Spouse qualifies for the age-55 $1,000 HSA catch-up
                </label>
              )}
              {showsHsaFamilyAllocation(draft) && (
                <label>
                  Agreed primary share of family HSA limit
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={draft.primaryHsaFamilyAllocationPpm / 10_000}
                    onChange={(event) => {
                      const primary = Math.min(
                        1_000_000,
                        Math.max(
                          0,
                          Math.round(Number(event.target.value) * 10_000),
                        ),
                      );
                      const allocation = {
                        primaryHsaFamilyAllocationPpm: primary,
                        spouseHsaFamilyAllocationPpm: 1_000_000 - primary,
                      };
                      onDraft({ ...draft, ...allocation });
                      onHsaAllocationIntent(allocation);
                    }}
                  />
                  <small>
                    Spouse receives{" "}
                    {draft.spouseHsaFamilyAllocationPpm / 10_000}
                    %. Both shares include employee and employer HSA
                    contributions.
                  </small>
                </label>
              )}
            </>
          )}
        </div>
        <div className={styles.benefitSummary} aria-label="Tax breakdown">
          <span>
            Federal <strong>{money(result.federalIncomeTaxCents, 2)}</strong>
          </span>
          <span>
            Social Security &amp; Medicare{" "}
            <strong>{money(result.ficaTaxCents, 2)}</strong>
          </span>
          <span>
            State <strong>{money(result.stateIncomeTaxCents, 2)}</strong>
          </span>
        </div>
        <p className={styles.muted}>{result.federalApproximation}</p>
        <p className={styles.muted}>
          Federal and benefit sources:{" "}
          <Citations values={result.federalCitations} sources={sources} />.
        </p>
        <p className={styles.muted}>
          {result.stateApproximation} Sources:{" "}
          <Citations values={result.stateCitations} sources={sources} />.
        </p>
      </details>
      <Guidance result={result} />
    </aside>
  );
}
