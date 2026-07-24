"use client";

import { useEffect, useRef, useState } from "react";
import type { TransactionEntry } from "@/domain/budget";
import { undoFastLogEntry, type FastLogTransition } from "@/domain/fast-log";
import {
  acceptCalculablePlanDraft,
  type StoredPlan,
  type WorkspaceLocation,
} from "./plan-types";
import type { PlanDraftChange } from "./sync-state";

export interface FastLogToast {
  before: TransactionEntry | null;
  after: TransactionEntry | null;
  message: string;
  allowEdit: boolean;
}

export function useFastLogController({
  location,
  onLocation,
  onDraft,
  onValidationError,
}: {
  location: WorkspaceLocation;
  onLocation: (location: WorkspaceLocation) => void;
  onDraft: (change: PlanDraftChange) => void;
  onValidationError: (error: string) => void;
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [toast, setToast] = useState<FastLogToast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const acceptLatestDraft = (
    update: (currentPlan: StoredPlan) => StoredPlan,
  ) => {
    let validationError: string | null = null;
    onDraft((currentPlan) => {
      const nextDraft = update(currentPlan);
      validationError = acceptCalculablePlanDraft(nextDraft, () => undefined);
      return validationError ? currentPlan : nextDraft;
    });
    onValidationError(validationError ?? "");
  };

  const acceptTransition = (
    update: (currentPlan: StoredPlan) => FastLogTransition | null,
  ): FastLogTransition | null => {
    let validationError: string | null = null;
    let acceptedTransition: FastLogTransition | null = null;
    onDraft((currentPlan) => {
      const transition = update(currentPlan);
      if (!transition) return currentPlan;
      validationError = acceptCalculablePlanDraft(
        transition.nextPlan,
        () => undefined,
      );
      if (validationError) return currentPlan;
      acceptedTransition = transition;
      return transition.nextPlan;
    });
    onValidationError(validationError ?? "");
    return acceptedTransition;
  };

  const open = (transactionId?: string) => {
    setToast(null);
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    onLocation({
      route: location.route,
      overlay: {
        kind: "fast-log",
        ...(transactionId ? { transactionId } : {}),
      },
    });
  };

  const close = () => {
    const returnFocus = returnFocusRef.current;
    onLocation({ route: location.route });
    window.requestAnimationFrame(() => {
      const fallback = document.querySelector<HTMLElement>(
        '[aria-label="Fast Log expense"]',
      );
      if (returnFocus?.isConnected) returnFocus.focus();
      else fallback?.focus();
    });
  };

  const saved = (
    transaction: TransactionEntry,
    previousTransaction: TransactionEntry | null,
  ) =>
    setToast({
      before: previousTransaction,
      after: transaction,
      message: "Expense saved",
      allowEdit: true,
    });

  const deleted = (transaction: TransactionEntry) =>
    setToast({
      before: transaction,
      after: null,
      message: "Expense deleted",
      allowEdit: false,
    });

  const editToast = () => {
    if (toast?.after) open(toast.after.id);
    setToast(null);
  };

  const undoToast = () => {
    if (!toast) return;
    acceptLatestDraft((latestPlan) =>
      undoFastLogEntry(latestPlan, toast.before, toast.after),
    );
    setToast(null);
  };

  return {
    toast,
    open,
    close,
    acceptTransition,
    saved,
    deleted,
    editToast,
    undoToast,
  };
}
