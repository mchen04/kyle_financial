"use client";

import { Cloud, Download, LogOut } from "lucide-react";
import { useState } from "react";
import type { User } from "@/domain/api-contracts";
import { PRODUCT_NAME } from "@/domain/brand";
import type { StoredPlan } from "./plan-types";
import styles from "./account.module.css";

export function AccountScreen({
  user,
  plans,
  onLogout,
  onDeleteAccount,
}: {
  user: User;
  plans: StoredPlan[];
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [logoutError, setLogoutError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  async function logout() {
    setLogoutError("");
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Could not safely log out.",
      );
    }
  }
  async function deleteAccount() {
    if (
      !window.confirm(
        "Permanently delete this account, every server plan, and this device's cached copy? This cannot be undone.",
      )
    )
      return;
    setLogoutError("");
    setDeleting(true);
    try {
      await onDeleteAccount();
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Could not safely delete this account.",
      );
      setDeleting(false);
    }
  }
  async function exportPlans() {
    setExportError("");
    setExporting(true);
    try {
      const response = await fetch(
        `/api/export?accountId=${encodeURIComponent(user.id)}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Export failed (${response.status}).`);
      }
      download(await response.blob(), "house-by-30-export.json");
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export your plans. Try again.",
      );
    } finally {
      setExporting(false);
    }
  }
  function exportLocalPlans() {
    const body = JSON.stringify(
      {
        schemaVersion: 2,
        source: "account-scoped device cache",
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email },
        plans,
      },
      null,
      2,
    );
    download(
      new Blob([body], { type: "application/json" }),
      "house-by-30-device-export.json",
    );
  }
  return (
    <section className={styles.accountGrid}>
      <div className={styles.wideCard}>
        <p className={styles.eyebrow}>Your data</p>
        <h1>Account and data</h1>
        <p className={styles.accountEmail}>{user.email}</p>
        <p className={styles.muted}>
          Your plans stay private to this account. Export a complete copy
          whenever you want.
        </p>
        <p className={styles.accountPrivacy}>
          No bank connection or ads. Your plans remain on the server until you
          delete this account; deletion also clears this device&apos;s cached
          copy.
        </p>
        {exportError && (
          <p className={styles.warning} role="alert">
            Export failed. {exportError} Your plans are unaffected; use Export
            all years to retry.
          </p>
        )}
        <div className={styles.accountActions}>
          <button
            className={styles.primaryButton}
            onClick={() => void exportPlans()}
            disabled={exporting}
          >
            <Download size={17} />{" "}
            {exporting ? "Exporting…" : "Export all years"}
          </button>
          <button className={styles.secondaryButton} onClick={exportLocalPlans}>
            <Download size={17} /> Export this device
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => void logout()}
          >
            <LogOut size={17} /> Log out
          </button>
          {logoutError && (
            <p className={styles.warning} role="alert">
              {logoutError}
            </p>
          )}
        </div>
        <p className={styles.estimateNote}>
          “Export all years” downloads the server copy. “Export this device”
          works offline and includes the account-scoped plans, categories, and
          transaction history currently cached here.
        </p>
        <div className={styles.deleteAccountRow}>
          <div>
            <strong>Delete account and data</strong>
            <span>Permanently removes every plan. Export first if needed.</span>
          </div>
          <button
            className={styles.dangerButton}
            onClick={() => void deleteAccount()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
      <div className={styles.wideCard}>
        <p className={styles.eyebrow}>Install on iPhone</p>
        <h2>Keep your plan one tap away.</h2>
        <ol className={styles.installSteps}>
          <li>
            <span>1</span>Open this site in Safari.
          </li>
          <li>
            <span>2</span>Tap Share, then “Add to Home Screen.”
          </li>
          <li>
            <span>3</span>Open {PRODUCT_NAME} from the new icon.
          </li>
        </ol>
        <p className={styles.estimateNote}>
          <Cloud size={16} /> Installed plans will remain available offline
          after their first sync.
        </p>
      </div>
    </section>
  );
}
