"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import type { LimitWarning } from "@/domain/tax/engine";
import { isHsaEligibilityWarning } from "./hsa-controls";
import { money } from "./plan-types";
import styles from "./financial-app.module.css";

export function BoundedMessages({
  children,
  visibleCount = 1,
}: {
  children: ReactNode[];
  visibleCount?: number;
}) {
  if (children.length === 0) return null;
  if (children.length <= visibleCount) {
    return <div className={styles.messageStack}>{children}</div>;
  }
  const hiddenCount = children.length - visibleCount;
  return (
    <div className={styles.messageStack}>
      {children.slice(0, visibleCount)}
      <details className={styles.messageDisclosure}>
        <summary>
          Show {hiddenCount} {visibleCount > 0 ? "more " : ""}warning
          {hiddenCount === 1 ? "" : "s"} and tax note
          {hiddenCount === 1 ? "" : "s"}
        </summary>
        <div>{children.slice(visibleCount)}</div>
      </details>
    </div>
  );
}

export function WarningCard({
  warning,
  location,
}: {
  warning: LimitWarning;
  location: "plan" | "benefits";
}) {
  const headline = warning.code.startsWith("hsa-owner-ineligible")
    ? "HSA contributions are entered for someone marked ineligible."
    : warning.code === "hsa-eligibility"
      ? "The HSA and Health FSA choices may conflict."
      : warning.code.startsWith("hsa-")
        ? "HSA contributions are above the modeled tax-excluded limit."
        : warning.code === "paycheck-feasibility"
          ? "Payroll deductions are above the wages available to fund them."
          : warning.code === "dependent-care-earned-income"
            ? "The dependent-care exclusion is above modeled eligible earnings."
            : "This benefit is above its modeled planning limit.";
  const details = warning.message;
  const thresholdLabel = isHsaEligibilityWarning(warning.code)
    ? "Tax-excluded HSA amount"
    : warning.code === "paycheck-feasibility"
      ? "Modeled paycheck capacity"
      : "Tax-excluded limit";
  return (
    <div className={styles.warning} role="status">
      <CircleHelp size={16} />
      <div className={styles.warningBody}>
        <strong>{headline}</strong>
        <span>
          Entered {money(warning.actualCents)} · {thresholdLabel}{" "}
          {money(warning.limitCents)}.
        </span>
        {location === "benefits" && warning.code.startsWith("hsa-") ? (
          <a className={styles.warningLink} href="#benefit-hsa">
            Jump to the HSA row ↓
          </a>
        ) : (
          <span className={styles.warningAction}>
            {location === "plan"
              ? "Open Benefits to adjust this choice."
              : "Adjust the matching benefit row below."}
          </span>
        )}
        {details && (
          <details className={styles.warningDetails}>
            <summary>Modeling notes</summary>
            <p>{details}</p>
          </details>
        )}
      </div>
    </div>
  );
}
