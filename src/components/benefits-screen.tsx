"use client";

import { CircleHelp, Plus, Trash2 } from "lucide-react";
import {
  type BenefitEntry,
  type BenefitType,
  type TaxTreatment,
} from "@/domain/benefits";
import type { PlanResult } from "@/domain/tax/engine";
import { BufferedTextInput } from "./buffered-text-input";
import {
  benefitAmountFromInput,
  esppDiscountFromInput,
  money,
  type StoredPlan,
} from "./plan-types";
import { BoundedMessages, WarningCard } from "./workspace-messages";
import styles from "./benefits.module.css";

const benefitLabels: Record<BenefitType, string> = {
  traditional401k: "Traditional 401(k)",
  roth401k: "Roth 401(k)",
  employer401kMatch: "Employer 401(k) match",
  espp: "Employee stock purchase plan",
  hsa: "Health savings account",
  employerHsa: "Employer HSA contribution",
  healthFsa: "Health FSA",
  dependentCareFsa: "Dependent-care FSA",
  section125Premium: "Health, dental, and vision premiums",
  commuter: "Commuter benefit",
  commuterParking: "Qualified parking benefit",
  lifeDisabilityInsurance: "Life / disability insurance",
  custom: "Custom payroll item",
};

const postTaxTreatment: TaxTreatment = {
  reducesFederalTaxable: false,
  reducesFicaTaxable: false,
  reducesStateTaxable: false,
  reducesTakeHome: true,
  countsAsSavings: false,
  employerSide: false,
};

export function BenefitsScreen({
  draft,
  result,
  onDraft,
}: {
  draft: StoredPlan;
  result: PlanResult;
  onDraft: (plan: StoredPlan) => void;
}) {
  const esppDiscountValueCents = result.benefits.reduce(
    (total, benefit) => total + benefit.impliedEsppDiscountGainCents,
    0,
  );
  const update = (id: string, change: Partial<BenefitEntry>) =>
    onDraft({
      ...draft,
      benefits: draft.benefits.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
    });

  function add(type: BenefitType) {
    const fixedMonthly =
      type === "section125Premium" || type === "lifeDisabilityInsurance";
    onDraft({
      ...draft,
      benefits: [
        ...draft.benefits,
        {
          id: crypto.randomUUID(),
          type,
          label: benefitLabels[type],
          amount: fixedMonthly
            ? { kind: "fixedMonthly", cents: 0 }
            : { kind: "percent", ratePpm: 0 },
          ...(type === "espp" ? { discountRatePpm: 150_000 } : {}),
          ...(type === "custom"
            ? { customTaxTreatment: postTaxTreatment }
            : {}),
        },
      ],
    });
  }

  return (
    <section className={styles.wideCard}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Before the paycheck lands</p>
          <h1>Benefits and payroll choices</h1>
          <p className={styles.muted}>
            Percentages use the selected person’s salary and bonus/RSU wages.
            Entered amounts stay visible when an exclusion is capped.
          </p>
        </div>
        <label className={styles.addSelect}>
          <Plus size={17} />
          <select
            aria-label="Add benefit"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) add(event.target.value as BenefitType);
              event.target.value = "";
            }}
          >
            <option value="">Add benefit</option>
            {Object.entries(benefitLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.benefitSummary}>
        <span>
          Saved from paychecks{" "}
          <strong>{money(result.payrollSavingsAnnualCents)} / year</strong>
        </span>
        <span>
          Employer contributions{" "}
          <strong>{money(result.employerSavingsAnnualCents)} / year</strong>
        </span>
        <span>
          Benefits going to savings{" "}
          <strong>
            {result.isPayrollFeasible
              ? `${money(result.payrollSavingsAnnualCents + result.employerSavingsAnnualCents)} / year`
              : "Not feasible with current payroll choices"}
          </strong>
        </span>
        {esppDiscountValueCents > 0 && (
          <span>
            Estimated ESPP discount value{" "}
            <strong>{money(esppDiscountValueCents)} / year</strong>
          </span>
        )}
      </div>
      <BoundedMessages visibleCount={result.warnings.length > 0 ? 1 : 0}>
        {[
          ...result.warnings.map((warning) => (
            <WarningCard
              key={warning.code}
              warning={warning}
              location="benefits"
            />
          )),
          ...result.notices.map((notice) => (
            <p key={notice} className={styles.modelDisclosure} role="note">
              <CircleHelp size={16} />{" "}
              {notice.startsWith("Participant limits are aggregated")
                ? "Because employer and plan details are not entered, contribution limits are estimated separately for each person."
                : notice}
            </p>
          )),
        ]}
      </BoundedMessages>
      <div className={styles.benefitList}>
        {draft.benefits.map((entry) => (
          <BenefitRow
            key={entry.id}
            entry={entry}
            showOwner={draft.filingStatus === "mfj"}
            annualAmountCents={
              result.benefits.find(({ entry: item }) => item.id === entry.id)
                ?.annualAmountCents ?? 0
            }
            onUpdate={(change) => update(entry.id, change)}
            onDelete={() =>
              onDraft({
                ...draft,
                benefits: draft.benefits.filter(({ id }) => id !== entry.id),
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function BenefitRow({
  entry,
  showOwner,
  annualAmountCents,
  onUpdate,
  onDelete,
}: {
  entry: BenefitEntry;
  showOwner: boolean;
  annualAmountCents: number;
  onUpdate: (change: Partial<BenefitEntry>) => void;
  onDelete: () => void;
}) {
  const numericValue =
    entry.amount.kind === "percent"
      ? entry.amount.ratePpm / 10_000
      : entry.amount.cents / 100;
  const changeKind = (kind: BenefitEntry["amount"]["kind"]) =>
    onUpdate({
      amount: kind === "percent" ? { kind, ratePpm: 0 } : { kind, cents: 0 },
    });
  return (
    <div
      id={entry.type === "hsa" ? "benefit-hsa" : undefined}
      className={`${styles.benefitRow} ${
        entry.type === "espp" ? styles.benefitRowWithDiscount : ""
      }`}
    >
      <div className={styles.benefitName}>
        <BufferedTextInput
          aria-label="Benefit name"
          value={entry.label}
          maxLength={100}
          onValue={(label) => onUpdate({ label })}
        />
        <span>
          {entry.type === "employer401kMatch" || entry.type === "employerHsa"
            ? "Employer-side · does not reduce paycheck"
            : "Recomputes take-home instantly"}
        </span>
        {showOwner && (
          <select
            aria-label={`${entry.label} payroll owner`}
            value={entry.owner ?? "primary"}
            onChange={(event) =>
              onUpdate({
                owner: event.target.value as NonNullable<BenefitEntry["owner"]>,
              })
            }
          >
            <option value="primary">Primary payroll</option>
            <option value="spouse">Spouse payroll</option>
          </select>
        )}
      </div>
      <select
        aria-label={`${entry.label} amount type`}
        value={entry.amount.kind}
        onChange={(event) =>
          changeKind(event.target.value as BenefitEntry["amount"]["kind"])
        }
      >
        <option value="percent">% of wages</option>
        <option value="fixedAnnual">$ per year</option>
        <option value="fixedMonthly">$ per month</option>
      </select>
      <label className={styles.moneyInput}>
        <span>{entry.amount.kind === "percent" ? "%" : "$"}</span>
        <input
          aria-label={`${entry.label} amount`}
          type="number"
          min="0"
          step={entry.amount.kind === "percent" ? ".1" : "1"}
          value={numericValue || ""}
          placeholder="0"
          onChange={(event) =>
            onUpdate({
              amount: benefitAmountFromInput(
                entry.amount.kind,
                event.target.value,
              ),
            })
          }
        />
      </label>
      <span className={styles.muted}>{money(annualAmountCents)} / year</span>
      {entry.type === "espp" && (
        <label className={styles.compactField}>
          Discount %
          <input
            type="number"
            min="0"
            max="15"
            value={(entry.discountRatePpm ?? 0) / 10_000}
            onChange={(event) =>
              onUpdate({
                discountRatePpm: esppDiscountFromInput(event.target.value),
              })
            }
          />
        </label>
      )}
      <button
        className={styles.iconButton}
        aria-label={`Delete ${entry.label}`}
        onClick={onDelete}
      >
        <Trash2 size={17} />
      </button>
      {entry.type === "custom" && entry.customTaxTreatment && (
        <div className={styles.customTreatment}>
          <span>Custom tax treatment</span>
          {(
            [
              "reducesFederalTaxable",
              "reducesFicaTaxable",
              "reducesStateTaxable",
              "countsAsSavings",
            ] as const
          ).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={entry.customTaxTreatment?.[key] ?? false}
                onChange={(event) =>
                  onUpdate({
                    customTaxTreatment: {
                      ...entry.customTaxTreatment!,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {
                {
                  reducesFederalTaxable: "Pre-tax federal",
                  reducesFicaTaxable: "Pre-tax FICA",
                  reducesStateTaxable: "Pre-tax state",
                  countsAsSavings: "Counts as saving",
                }[key]
              }
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
