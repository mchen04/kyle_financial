import {
  entityFieldForTarget,
  parseSyncTarget,
  SYNC_BATCH_SIZE,
  type SyncMutation,
} from "@/domain/sync";

export type PersistedSyncMutation = SyncMutation & {
  localSequence?: number;
  deliveryUpdatedAt?: string;
  deliveryOrderAssigned?: boolean;
};

export type SequencedSyncMutation = Omit<
  PersistedSyncMutation,
  "localSequence" | "deliveryUpdatedAt"
> & {
  localSequence: number;
  deliveryUpdatedAt: string;
};

export interface MutationBatchPlan {
  batch: SyncMutation[];
  discardedMutationIds: string[];
  retainedMutations: SequencedSyncMutation[];
}

export function latestLocalSequenceForField(
  field: string,
  sequences: Record<string, number>,
): number {
  const target = parseSyncTarget(field);
  if (!target || target.kind === "scalar") return sequences[field] ?? 0;
  const entityField = entityFieldForTarget(target);
  if (target.property) {
    return Math.max(sequences[field] ?? 0, sequences[entityField] ?? 0);
  }
  return Math.max(
    0,
    ...Object.entries(sequences)
      .filter(
        ([key]) => key === entityField || key.startsWith(`${entityField}:`),
      )
      .map(([, sequence]) => sequence),
  );
}

export function toIntentMutation(
  mutation: PersistedSyncMutation,
): SyncMutation {
  const envelope = { ...mutation };
  delete envelope.localSequence;
  delete envelope.deliveryUpdatedAt;
  delete envelope.deliveryAfterMutationId;
  delete envelope.deliveryOrderAssigned;
  return envelope;
}

function deliveryMutation(mutation: SequencedSyncMutation): SyncMutation {
  const intent = toIntentMutation(mutation);
  const deliveryUpdatedAt = mutation.deliveryUpdatedAt;
  return {
    ...intent,
    updatedAt: deliveryUpdatedAt,
    ...(deliveryUpdatedAt === intent.updatedAt
      ? {}
      : { intentUpdatedAt: intent.updatedAt }),
    ...(typeof mutation.deliveryAfterMutationId === "string"
      ? { deliveryAfterMutationId: mutation.deliveryAfterMutationId }
      : {}),
  };
}

function invariantBatchGroup(
  mutation: SequencedSyncMutation,
  filingStatusYears: ReadonlySet<number>,
): string {
  const target = parseSyncTarget(mutation.field);
  if (
    (target?.kind === "scalar" && target.field !== "stateCode") ||
    (filingStatusYears.has(mutation.planYear) &&
      target?.kind === "benefit" &&
      target.property === "owner")
  )
    return `plan:${mutation.planYear}`;
  return target && target.kind !== "scalar"
    ? `entity:${mutation.planYear}:${target.kind}:${target.id}`
    : `mutation:${mutation.mutationId}`;
}

function invariantAwareBatch(
  mutations: SequencedSyncMutation[],
): SequencedSyncMutation[] {
  if (mutations.length <= SYNC_BATCH_SIZE) return mutations;
  const filingStatusYears = new Set(
    mutations
      .filter(({ field }) => field === "filingStatus")
      .map(({ planYear }) => planYear),
  );
  const groups = new Map<string, SequencedSyncMutation[]>();
  for (const mutation of mutations) {
    const key = invariantBatchGroup(mutation, filingStatusYears);
    const group = groups.get(key) ?? [];
    group.push(mutation);
    groups.set(key, group);
  }
  const selected = new Set(
    mutations.slice(0, SYNC_BATCH_SIZE).map(({ mutationId }) => mutationId),
  );
  const lockedGroups = new Set<string>();
  const orderedGroups = [...groups.entries()].toSorted(
    ([, left], [, right]) => left[0]!.localSequence - right[0]!.localSequence,
  );
  for (const [key, group] of orderedGroups) {
    const selectedCount = group.filter(({ mutationId }) =>
      selected.has(mutationId),
    ).length;
    if (selectedCount === 0 || selectedCount === group.length) continue;
    if (group.length > SYNC_BATCH_SIZE) continue;
    const priorSelection = new Set(selected);
    for (const { mutationId } of group) selected.add(mutationId);
    lockedGroups.add(key);
    while (selected.size > SYNC_BATCH_SIZE) {
      const eviction = orderedGroups
        .filter(
          ([candidateKey, candidate]) =>
            candidateKey !== key &&
            !lockedGroups.has(candidateKey) &&
            candidate.every(({ mutationId }) => selected.has(mutationId)),
        )
        .toSorted(
          ([, left], [, right]) =>
            right.at(-1)!.localSequence - left.at(-1)!.localSequence,
        )[0];
      if (!eviction) break;
      for (const { mutationId } of eviction[1]) selected.delete(mutationId);
    }
    if (selected.size > SYNC_BATCH_SIZE) {
      selected.clear();
      for (const mutationId of priorSelection) selected.add(mutationId);
      lockedGroups.delete(key);
    }
  }
  return mutations.filter(({ mutationId }) => selected.has(mutationId));
}

export function planMutationBatch(
  queuedMutations: readonly SequencedSyncMutation[],
): MutationBatchPlan {
  const queued = queuedMutations.map((mutation) => ({ ...mutation }));
  const ordered = queued.toSorted(
    (left, right) => left.localSequence - right.localSequence,
  );
  const latestByField = new Map<string, SequencedSyncMutation>();
  for (const mutation of ordered) {
    latestByField.set(`${mutation.planYear}:${mutation.field}`, mutation);
  }
  const latestWholeByEntity = new Map<string, SequencedSyncMutation>();
  for (const mutation of ordered) {
    const target = parseSyncTarget(mutation.field);
    if (target && target.kind !== "scalar" && !target.property)
      latestWholeByEntity.set(
        `${mutation.planYear}:${target.kind}:${target.id}`,
        mutation,
      );
  }
  const retainedMutations = [...latestByField.values()]
    .filter((mutation) => {
      const target = parseSyncTarget(mutation.field);
      if (!target || target.kind === "scalar" || !target.property) return true;
      const whole = latestWholeByEntity.get(
        `${mutation.planYear}:${target.kind}:${target.id}`,
      );
      return !whole || mutation.localSequence > whole.localSequence;
    })
    .toSorted((left, right) => left.localSequence - right.localSequence);
  const retainedIds = new Set(
    retainedMutations.map(({ mutationId }) => mutationId),
  );
  const discardedMutationIds = queued
    .filter(({ mutationId }) => !retainedIds.has(mutationId))
    .map(({ mutationId }) => mutationId);
  const discardedIds = new Set(discardedMutationIds);
  const sequencesByYear = new Map<number, Record<string, number>>();
  const mutationsBySequence = new Map<number, SequencedSyncMutation>();
  for (const mutation of retainedMutations) {
    const sequences = sequencesByYear.get(mutation.planYear) ?? {};
    const predecessorSequence = latestLocalSequenceForField(
      mutation.field,
      sequences,
    );
    const predecessorMutationId =
      mutationsBySequence.get(predecessorSequence)?.mutationId;
    if (
      !mutation.deliveryOrderAssigned ||
      (mutation.deliveryAfterMutationId !== undefined &&
        discardedIds.has(mutation.deliveryAfterMutationId))
    ) {
      if (predecessorMutationId)
        mutation.deliveryAfterMutationId = predecessorMutationId;
      else delete mutation.deliveryAfterMutationId;
      mutation.deliveryOrderAssigned = true;
    }
    sequences[mutation.field] = mutation.localSequence;
    sequencesByYear.set(mutation.planYear, sequences);
    mutationsBySequence.set(mutation.localSequence, mutation);
  }
  const validMutations = retainedMutations.filter(({ field, value }) => {
    const target = parseSyncTarget(field);
    const requiresNonemptyText =
      target?.kind === "benefit"
        ? target.property === "label"
        : target?.kind === "expense" &&
          (target.property === "name" || target.property === "group");
    return (
      !requiresNonemptyText ||
      (typeof value === "string" && value.trim().length > 0)
    );
  });
  return {
    batch: invariantAwareBatch(validMutations).map(deliveryMutation),
    discardedMutationIds,
    retainedMutations,
  };
}
