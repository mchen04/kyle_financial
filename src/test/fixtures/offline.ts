import { vi } from "vitest";
import { clearAccountCache, clearRememberedUser } from "@/offline/database";

export async function resetOfflineTestState(
  userIds: readonly string[] = ["user-a", "user-b"],
): Promise<void> {
  vi.unstubAllGlobals();
  await clearRememberedUser();
  await Promise.all(userIds.map((userId) => clearAccountCache(userId)));
}

function openRawAccountDatabase(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`kyle-financial-account-${userId}`, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("plans"))
        request.result.createObjectStore("plans", { keyPath: "year" });
      if (!request.result.objectStoreNames.contains("outbox"))
        request.result.createObjectStore("outbox", { keyPath: "mutationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedRawStore(
  userId: string,
  storeName: "plans" | "outbox",
  rows: readonly unknown[],
): Promise<void> {
  const db = await openRawAccountDatabase(userId);
  try {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const row of rows) store.put(row);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function seedRawCachedPlans(
  userId: string,
  plans: readonly unknown[],
): Promise<void> {
  await seedRawStore(userId, "plans", plans);
}

export async function seedRawQueuedMutations(
  userId: string,
  mutations: readonly unknown[],
): Promise<void> {
  await seedRawStore(userId, "outbox", mutations);
}
