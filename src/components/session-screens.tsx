"use client";

import { ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { planResponseSchema, type User } from "@/domain/api-contracts";
import { STATE_OPTIONS } from "@/domain/tax/jurisdictions";
import {
  centsFromInput,
  isExpiredSessionError,
  isUncertainPlanCreationError,
  jsonRequest,
  type StoredPlan,
} from "./plan-types";
import { authenticateWithOwner } from "./authentication";
import styles from "./session.module.css";

export function LoadingView() {
  return (
    <main
      className={styles.centered}
      aria-busy="true"
      aria-label="Loading your plan"
    >
      <div className={styles.loadingBrand}>
        <div className={styles.brandMark}>KF</div>
        <h1>Kyle Financial</h1>
      </div>
      <div className={styles.loadingLine} />
      <p>Opening your plan…</p>
    </main>
  );
}

export function AuthView({
  onAuthenticated,
  getOwnerSignal,
  notice,
}: {
  onAuthenticated: (user: User, ownerSignal: AbortSignal) => void;
  getOwnerSignal: () => AbortSignal;
  notice: string;
}) {
  const [mode, setMode] = useState<"signup" | "login">(
    notice ? "login" : "signup",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const ownerSignal = getOwnerSignal();
    if (ownerSignal.aborted) return;
    submittingRef.current = true;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const user = await authenticateWithOwner(
        mode,
        {
          email: form.get("email"),
          password: form.get("password"),
          invitationCode: form.get("invitationCode"),
        },
        ownerSignal,
      );
      if (ownerSignal.aborted) return;
      onAuthenticated(user, ownerSignal);
    } catch (caught) {
      if (ownerSignal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      if (!ownerSignal.aborted) {
        submittingRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authStory} aria-labelledby="welcome-title">
        <Wordmark />
        <div className={styles.authThesis}>
          <p className={styles.eyebrow}>
            A yearly plan, not another transaction feed
          </p>
          <h1 id="welcome-title">
            Know what&apos;s left before the year begins.
          </h1>
          <p>
            Turn salary, taxes, benefits, and the life you actually plan to live
            into one honest monthly number.
          </p>
        </div>
        <div className={styles.previewLedger} aria-hidden="true">
          <span>Gross pay</span>
          <strong>$150,000</strong>
          <i />
          <span>Taxes · benefits · life</span>
          <strong>accounted for</strong>
          <i />
          <span>What&apos;s left each month</span>
          <strong className={styles.previewSurplus}>$2,184</strong>
        </div>
      </section>
      <section
        className={styles.authPanel}
        aria-label={mode === "signup" ? "Create account" : "Sign in"}
      >
        <p className={styles.eyebrow}>
          {mode === "signup" ? "Start your plan" : "Welcome back"}
        </p>
        <h2>
          {mode === "signup" ? "Create your private account" : "Open your plan"}
        </h2>
        <form onSubmit={submit} className={styles.authForm}>
          {notice && (
            <p className={styles.fallbackNotice} role="status">
              {notice}
            </p>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={10}
              required
            />
            {mode === "signup" && <small>Use at least 10 characters.</small>}
          </label>
          {mode === "signup" && (
            <label>
              Invitation code
              <input
                name="invitationCode"
                type="text"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <small>Generated for this email by the app owner.</small>
            </label>
          )}
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}
          <button className={styles.primaryButton} disabled={busy}>
            {busy
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
            {busy ? (
              <RefreshCw size={17} className={styles.spin} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        </form>
        <button
          className={styles.textButton}
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <p className={styles.privacyNote}>
          <ShieldCheck size={16} /> No bank connection or ads. Export or
          permanently delete every plan anytime.
        </p>
      </section>
    </main>
  );
}

export function Onboarding({
  user,
  getOwnerSignal,
  onCreated,
  onRecover,
  onSessionExpired,
}: {
  user: User;
  getOwnerSignal: () => AbortSignal;
  onCreated: (plan: StoredPlan, ownerSignal: AbortSignal) => Promise<void>;
  onRecover: (year: number, ownerSignal: AbortSignal) => Promise<boolean>;
  onSessionExpired: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currentYear = new Date().getFullYear();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ownerSignal = getOwnerSignal();
    if (ownerSignal.aborted) return;
    const form = new FormData(event.currentTarget);
    const selectedYear = Number(form.get("year"));
    setBusy(true);
    setError("");
    try {
      const response = await jsonRequest(
        "/api/plans",
        planResponseSchema,
        {
          method: "POST",
          signal: ownerSignal,
          body: JSON.stringify({
            year: selectedYear,
            stateCode: form.get("stateCode"),
            filingStatus: form.get("filingStatus"),
            grossSalaryCents: centsFromInput(String(form.get("income"))),
            additionalWageIncomeCents: 0,
            spouseWageIncomeCents: 0,
            otherOrdinaryIncomeCents: 0,
            hsaCoverage: "self",
            primaryHsaEligible: true,
            spouseHsaEligible: false,
            primaryHsaCatchUpEligible: false,
            spouseHsaCatchUpEligible: false,
            primaryHsaFamilyAllocationPpm: 1_000_000,
            spouseHsaFamilyAllocationPpm: 0,
          }),
        },
        user.id,
      );
      if (ownerSignal.aborted) return;
      await onCreated(response.plan, ownerSignal);
    } catch (caught) {
      if (ownerSignal.aborted) return;
      if (isExpiredSessionError(caught)) {
        onSessionExpired();
        return;
      }
      if (isUncertainPlanCreationError(caught)) {
        try {
          if (await onRecover(selectedYear, ownerSignal)) return;
        } catch (recoveryError) {
          if (ownerSignal.aborted) return;
          if (isExpiredSessionError(recoveryError)) {
            onSessionExpired();
            return;
          }
        }
      }
      if (ownerSignal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Your plan could not be created.",
      );
    } finally {
      if (!ownerSignal.aborted) setBusy(false);
    }
  }

  return (
    <main className={styles.onboarding}>
      <Wordmark />
      <section className={styles.onboardingCard}>
        <p className={styles.eyebrow}>
          Three details · sensible defaults do the rest
        </p>
        <h1>Build your {currentYear} plan</h1>
        <p className={styles.muted}>
          Start with a rough income estimate. You can change every value after
          this step. We add an editable expense checklist at $0 so you can fill
          in only what applies. Tax figures are planning estimates, not tax
          advice.
        </p>
        <form onSubmit={submit} className={styles.onboardingForm}>
          <label>
            Year
            <input
              name="year"
              type="number"
              defaultValue={currentYear}
              min="2000"
              max="2200"
            />
          </label>
          <label>
            Primary earner yearly wages
            <input
              name="income"
              type="number"
              inputMode="decimal"
              placeholder="150,000"
              min="0"
              required
            />
          </label>
          <label>
            State
            <select name="stateCode" defaultValue="CA">
              {STATE_OPTIONS.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filing status
            <select name="filingStatus">
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="hoh">
                Head of household (state uses Single proxy)
              </option>
            </select>
          </label>
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}
          <button className={styles.primaryButton} disabled={busy}>
            {busy ? "Opening your plan…" : "See my plan"}{" "}
            {busy ? (
              <RefreshCw size={17} className={styles.spin} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        </form>
      </section>
    </main>
  );
}

function Wordmark() {
  return (
    <div className={styles.wordmark}>
      <span className={styles.brandMark}>KF</span>Kyle Financial
    </div>
  );
}
