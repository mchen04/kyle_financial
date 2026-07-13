import type { Sql } from "postgres";
import {
  fullPlanSchema,
  planBasicsSchema,
  updatePlanBasicsSchema,
  type FullPlan,
  type FullPlanInput,
  type PlanBasicsInput,
  type UpdatePlanBasicsInput,
} from "@/domain/plan-schema";
import type { StoredPlan } from "@/domain/stored-plan";
import { diffPlanMutations } from "@/domain/sync";
import {
  createPlanWithDefaults as createNormalizedPlanWithDefaults,
  getPlanByYear,
} from "@/server/plans/repository";
import { applySyncMutations } from "@/server/sync/repository";

export function createPlanWithDefaults(
  sql: Sql,
  userId: string,
  input: PlanBasicsInput,
) {
  return createNormalizedPlanWithDefaults(
    sql,
    userId,
    planBasicsSchema.parse(input),
  );
}

export async function updatePlanBasics(
  sql: Sql,
  userId: string,
  year: number,
  input: UpdatePlanBasicsInput,
) {
  const current = await getPlanByYear(sql, userId, year);
  if (!current) return null;
  const basics = updatePlanBasicsSchema.parse(input);
  const next = fullPlanSchema.parse({
    ...current,
    ...basics,
    benefits:
      basics.filingStatus === "mfj"
        ? current.benefits
        : current.benefits.map((benefit) => ({
            ...benefit,
            owner: "primary" as const,
          })),
  });
  return persistPlanIntent(sql, userId, current, next);
}

export async function replacePlan(
  sql: Sql,
  userId: string,
  year: number,
  input: FullPlanInput,
) {
  const current = await getPlanByYear(sql, userId, year);
  if (!current) return null;
  return persistPlanIntent(sql, userId, current, fullPlanSchema.parse(input));
}

async function persistPlanIntent(
  sql: Sql,
  userId: string,
  current: StoredPlan,
  input: FullPlan,
) {
  const next = { ...current, ...input };
  const mutations = diffPlanMutations(current, next, new Date().toISOString());
  await applySyncMutations(sql, userId, mutations);
  return getPlanByYear(sql, userId, current.year);
}
