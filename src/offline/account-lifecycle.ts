import { userSchema, type User } from "@/domain/api-contracts";
import {
  accountClosureMarker,
  clearAccountDatabase,
  isMarkedLoggedOut,
  metaValue,
  openShellDatabase,
  requestResult,
  setAccountClosureMarker,
  transactionDone,
  withAccountLock,
  withShellLock,
} from "./database-core";

export type AccountClosureMode = "logout" | "delete";
export type RemoteAccountClosureOutcome =
  | { status: "confirmed" }
  | { status: "indeterminate" }
  | { status: "rejected"; error: unknown };
export interface AccountClosureResult {
  cleanupComplete: boolean;
  remoteStatus: "confirmed" | "indeterminate";
}

export async function rememberUser(
  user: User,
  explicitAuthentication = false,
  ownerSignal?: AbortSignal,
): Promise<boolean> {
  const throwIfOwnerEnded = () => {
    if (ownerSignal?.aborted)
      throw ownerSignal.reason ?? new DOMException("Aborted", "AbortError");
  };
  throwIfOwnerEnded();
  await withAccountLock(
    user.id,
    async () => {
      throwIfOwnerEnded();
      await withShellLock(async () => {
        throwIfOwnerEnded();
        const db = await openShellDatabase();
        try {
          const transaction = db.transaction("meta", "readwrite");
          const abortTransaction = () => {
            try {
              transaction.abort();
            } catch {
              // The transaction already completed or aborted.
            }
          };
          ownerSignal?.addEventListener("abort", abortTransaction, {
            once: true,
          });
          const store = transaction.objectStore("meta");
          try {
            const marker = await requestResult(
              store.get(`loggedOut:${user.id}`),
            );
            throwIfOwnerEnded();
            if (marker && !explicitAuthentication) {
              await transactionDone(transaction);
              return;
            }
            store.put({ key: "lastUser", value: user });
            if (explicitAuthentication) store.delete(`loggedOut:${user.id}`);
            await transactionDone(transaction);
          } finally {
            ownerSignal?.removeEventListener("abort", abortTransaction);
          }
        } finally {
          db.close();
        }
      }, ownerSignal);
    },
    ownerSignal,
  );
  throwIfOwnerEnded();
  const remembered =
    explicitAuthentication || !(await isMarkedLoggedOut(user.id));
  throwIfOwnerEnded();
  return remembered;
}

export async function lastRememberedUser(): Promise<User | null> {
  return withShellLock(async () => {
    const db = await openShellDatabase();
    try {
      const transaction = db.transaction("meta", "readonly");
      const row = await requestResult(
        transaction.objectStore("meta").get("lastUser"),
      );
      const user = userSchema.safeParse(metaValue(row));
      if (!user.success) return null;
      const marker = await requestResult(
        transaction.objectStore("meta").get(`loggedOut:${user.data.id}`),
      );
      return marker ? null : user.data;
    } finally {
      db.close();
    }
  });
}

export async function clearRememberedUser(
  expectedUserId?: string,
): Promise<void> {
  return withShellLock(async () => {
    const db = await openShellDatabase();
    try {
      const transaction = db.transaction("meta", "readwrite");
      const store = transaction.objectStore("meta");
      const user = userSchema.safeParse(
        metaValue(await requestResult(store.get("lastUser"))),
      );
      if (!expectedUserId || (user.success && user.data.id === expectedUserId))
        store.delete("lastUser");
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });
}

async function clearClosedAccount(userId: string): Promise<boolean> {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("kyle-financial-auth");
    channel.postMessage({ type: "logout", userId });
    channel.close();
  }
  const cleanup = await Promise.allSettled([
    clearAccountDatabase(userId),
    clearRememberedUser(userId),
  ]);
  return cleanup.every(({ status }) => status === "fulfilled");
}

export async function safelyCloseAccount(
  userId: string,
  mode: AccountClosureMode,
  closeRemote: () => Promise<RemoteAccountClosureOutcome>,
  queuedMutationCount: () => Promise<number>,
  ownerSignal?: AbortSignal,
): Promise<AccountClosureResult> {
  return withAccountLock(
    userId,
    async () => {
      ownerSignal?.throwIfAborted();
      const priorMarker = await accountClosureMarker(userId);
      ownerSignal?.throwIfAborted();
      if (priorMarker?.mode === "delete") {
        return {
          cleanupComplete: await clearClosedAccount(userId),
          remoteStatus:
            priorMarker.status === "terminal" ? "confirmed" : "indeterminate",
        };
      }
      if (priorMarker?.mode === "logout" && mode === "delete") {
        throw new Error(
          "This browser is already logged out. Sign in again before deleting the account.",
        );
      }
      if (!priorMarker) {
        if ((await queuedMutationCount()) > 0) {
          throw new Error(
            "Unsynced edits are still on this device. Reconnect and wait for Saved before logging out.",
          );
        }
        await setAccountClosureMarker(userId, {
          mode,
          status: "indeterminate",
        });
      }
      if (priorMarker?.status === "terminal") {
        return {
          cleanupComplete: await clearClosedAccount(userId),
          remoteStatus: "confirmed",
        };
      }
      if (ownerSignal?.aborted) {
        if (!priorMarker) await setAccountClosureMarker(userId, null);
        ownerSignal.throwIfAborted();
      }
      let outcome: RemoteAccountClosureOutcome;
      try {
        outcome = await closeRemote();
      } catch {
        outcome = { status: "indeterminate" };
      }
      if (outcome.status === "rejected") {
        if (!priorMarker) await setAccountClosureMarker(userId, null);
        throw outcome.error;
      }
      if (outcome.status === "confirmed") {
        await setAccountClosureMarker(userId, { mode, status: "terminal" });
      }
      return {
        cleanupComplete: await clearClosedAccount(userId),
        remoteStatus: outcome.status,
      };
    },
    ownerSignal,
  );
}
