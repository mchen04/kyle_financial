import { z } from "zod";
import { maximumEsppDiscountPpm } from "@/domain/plan-schema";
import { parseSyncTarget } from "@/domain/sync";

const SHELL_DATABASE = "kyle-financial-shell";
const DATABASE_VERSION = 2;
const accountClosureMarkerSchema = z.object({
  mode: z.enum(["logout", "delete"]),
  status: z.enum(["indeterminate", "terminal"]),
});
export type AccountClosureMarker = z.infer<typeof accountClosureMarkerSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLegacyBenefitDiscount(value: unknown): unknown {
  if (
    !isRecord(value) ||
    typeof value.discountRatePpm !== "number" ||
    value.discountRatePpm <= maximumEsppDiscountPpm
  )
    return value;
  return { ...value, discountRatePpm: maximumEsppDiscountPpm };
}

function migrateLegacyPlanRow(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.benefits)) return value;
  const legacyBenefits = value.benefits;
  const benefits = legacyBenefits.map(clampLegacyBenefitDiscount);
  return benefits.some((benefit, index) => benefit !== legacyBenefits[index])
    ? { ...value, benefits }
    : value;
}

function migrateLegacyMutationRow(value: unknown): unknown {
  if (!isRecord(value) || typeof value.field !== "string") return value;
  const target = parseSyncTarget(value.field);
  if (!target || target.kind !== "benefit") return value;
  if (target.property === "discountRatePpm") {
    return typeof value.value === "number" &&
      value.value > maximumEsppDiscountPpm
      ? { ...value, value: maximumEsppDiscountPpm }
      : value;
  }
  if (target.property !== undefined) return value;
  const migrated = clampLegacyBenefitDiscount(value.value);
  return migrated === value.value ? value : { ...value, value: migrated };
}

function migrateLegacyOutbox(store: IDBObjectStore): void {
  const request = store.getAll();
  request.onsuccess = () => {
    const rows = request.result;
    const migrationRows = rows.map((original, index) => {
      const migrated = migrateLegacyMutationRow(original);
      const localSequence =
        isRecord(original) &&
        Number.isInteger(original.localSequence) &&
        Number(original.localSequence) > 0
          ? Number(original.localSequence)
          : undefined;
      return { index, original, migrated, localSequence };
    });
    if (migrationRows.every(({ original, migrated }) => original === migrated))
      return;
    const legacyRows = migrationRows
      .filter(({ localSequence }) => localSequence === undefined)
      .toSorted((left, right) => {
        const leftRecord = isRecord(left.original) ? left.original : {};
        const rightRecord = isRecord(right.original) ? right.original : {};
        return (
          Date.parse(String(leftRecord.updatedAt)) -
            Date.parse(String(rightRecord.updatedAt)) ||
          String(leftRecord.mutationId).localeCompare(
            String(rightRecord.mutationId),
          )
        );
      });
    const sequencedRows = migrationRows
      .filter(({ localSequence }) => localSequence !== undefined)
      .toSorted((left, right) => left.localSequence! - right.localSequence!);
    const orderedRows = [...legacyRows, ...sequencedRows];
    for (const [index, row] of orderedRows.entries()) {
      row.localSequence = index + 1;
    }
    const latestWholeBenefits = new Map<
      string,
      (typeof migrationRows)[number]
    >();
    for (const row of orderedRows) {
      if (!isRecord(row.migrated)) continue;
      const target = parseSyncTarget(String(row.migrated.field));
      if (target?.kind !== "benefit" || target.property !== undefined) continue;
      latestWholeBenefits.set(
        `${String(row.migrated.planYear)}:${target.id}`,
        row,
      );
    }
    const needsNewIdentity = (row: (typeof migrationRows)[number]) => {
      if (row.original !== row.migrated) return true;
      if (!isRecord(row.migrated)) return false;
      const target = parseSyncTarget(String(row.migrated.field));
      if (target?.kind !== "benefit" || target.property === undefined)
        return false;
      const predecessor = latestWholeBenefits.get(
        `${String(row.migrated.planYear)}:${target.id}`,
      );
      return Boolean(
        predecessor &&
        predecessor.original !== predecessor.migrated &&
        predecessor.localSequence! < row.localSequence!,
      );
    };
    const correctionTime = Date.now();
    const replacements = new Map<
      number,
      { mutationId: string; updatedAt: string }
    >();
    for (const [offset, row] of migrationRows
      .filter(needsNewIdentity)
      .toSorted((left, right) => left.localSequence! - right.localSequence!)
      .entries()) {
      replacements.set(row.index, {
        mutationId: crypto.randomUUID(),
        updatedAt: new Date(correctionTime + offset).toISOString(),
      });
    }
    const corrected = migrationRows.map((row) => {
      if (!isRecord(row.migrated)) return row.migrated;
      const next: Record<string, unknown> = {
        ...row.migrated,
        localSequence: row.localSequence,
      };
      const replacement = replacements.get(row.index);
      if (replacement) {
        next.mutationId = replacement.mutationId;
        next.updatedAt = replacement.updatedAt;
        delete next.intentUpdatedAt;
        delete next.baseVersion;
      }
      delete next.deliveryUpdatedAt;
      delete next.deliveryAfterMutationId;
      delete next.deliveryOrderAssigned;
      return next;
    });
    store.clear();
    for (const row of corrected) store.put(row);
  };
}

function migrateStoreRows(
  store: IDBObjectStore,
  migrate: (value: unknown) => unknown,
): void {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const migrated = migrate(cursor.value);
    if (migrated !== cursor.value) cursor.update(migrated);
    cursor.continue();
  };
}

export function metaValue(row: unknown): unknown {
  if (typeof row !== "object" || row === null || !("value" in row)) return;
  return row.value;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function openDatabase(
  name: string,
  stores: string[],
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, {
            keyPath:
              store === "plans"
                ? "year"
                : store === "outbox"
                  ? "mutationId"
                  : "key",
          });
        }
      }
      if (
        event.oldVersion < 2 &&
        name.startsWith("kyle-financial-account-") &&
        request.transaction
      ) {
        if (request.result.objectStoreNames.contains("plans"))
          migrateStoreRows(
            request.transaction.objectStore("plans"),
            migrateLegacyPlanRow,
          );
        if (request.result.objectStoreNames.contains("outbox"))
          migrateLegacyOutbox(request.transaction.objectStore("outbox"));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function accountDatabaseName(userId: string): string {
  return `kyle-financial-account-${userId}`;
}

export async function clearAccountDatabase(userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(accountDatabaseName(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Account cache is still open"));
  });
}

async function withLock<T>(
  name: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request(
      name,
      { mode: "exclusive", signal },
      operation,
    );
  }
  if (typeof window !== "undefined") {
    throw new Error(
      "This browser cannot safely coordinate private offline data across tabs.",
    );
  }
  return operation();
}

export function withAccountLock<T>(
  userId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  return withLock(`kyle-financial-account-${userId}`, operation, signal);
}

export function withIntentLock<T>(
  userId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  return withLock(`kyle-financial-intent-${userId}`, operation, signal);
}

export function withCopyForwardIntentLock<T>(
  userId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return withIntentLock(userId, operation, signal);
}

export function withShellLock<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  return withLock("kyle-financial-shell-meta", operation, signal);
}

function parseAccountClosureMarker(row: unknown): AccountClosureMarker | null {
  if (row === undefined) return null;
  const value = metaValue(row);
  if (value === true) return { mode: "logout", status: "terminal" };
  const parsed = accountClosureMarkerSchema.safeParse(value);
  return parsed.success ? parsed.data : { mode: "logout", status: "terminal" };
}

export async function accountClosureMarker(
  userId: string,
): Promise<AccountClosureMarker | null> {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readonly");
      return parseAccountClosureMarker(
        await requestResult(
          transaction.objectStore("meta").get(`loggedOut:${userId}`),
        ),
      );
    } finally {
      db.close();
    }
  });
}

export async function setAccountClosureMarker(
  userId: string,
  marker: AccountClosureMarker | null,
) {
  return withShellLock(async () => {
    const db = await openDatabase(SHELL_DATABASE, ["meta"]);
    try {
      const transaction = db.transaction("meta", "readwrite");
      const store = transaction.objectStore("meta");
      if (marker) store.put({ key: `loggedOut:${userId}`, value: marker });
      else store.delete(`loggedOut:${userId}`);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  });
}

export async function isMarkedLoggedOut(userId: string): Promise<boolean> {
  return (await accountClosureMarker(userId)) !== null;
}

export function openShellDatabase(): Promise<IDBDatabase> {
  return openDatabase(SHELL_DATABASE, ["meta"]);
}
