import type { Sql, TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createUser } from "../auth/repository";
import { testSql } from "../../test/database";
import {
  copyPlanToYear,
  exportAccount,
  getPlanByYear,
  PlanYearConflictError,
  SourcePlanChangedError,
} from "./repository";
import {
  createPlanWithDefaults,
  replacePlan,
  updatePlanBasics,
} from "@/test/plan-repository";

const sql = testSql();

afterAll(async () => {
  await sql.end();
});

describe("account-scoped plans", () => {
  it("reads plan scalars, versions, and collections from one snapshot", async () => {
    const user = await createUser(
      sql,
      "snapshot-plan-owner@example.com",
      "snapshot plan password is long",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2042,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const originalLabel = created.benefits[0].label;
    let markScalarsRead: () => void = () => undefined;
    const scalarsRead = new Promise<void>((resolve) => {
      markScalarsRead = resolve;
    });
    let releaseCollections: () => void = () => undefined;
    const collectionsReleased = new Promise<void>((resolve) => {
      releaseCollections = resolve;
    });

    function barrierSql(base: Sql | TransactionSql): Sql {
      type SqlTag = (
        strings: TemplateStringsArray,
        ...parameters: unknown[]
      ) => unknown;
      const execute = base as unknown as SqlTag;
      const tagged = ((
        strings: TemplateStringsArray,
        ...parameters: unknown[]
      ) => {
        const query = strings.join("?");
        if (/FROM plans\s+WHERE user_id/.test(query)) {
          return Promise.resolve(execute(strings, ...parameters)).then(
            (rows) => {
              markScalarsRead();
              return rows;
            },
          );
        }
        if (/FROM (benefits|expenses)\s+WHERE plan_id/.test(query)) {
          return collectionsReleased.then(() =>
            execute(strings, ...parameters),
          );
        }
        return execute(strings, ...parameters);
      }) as unknown as Sql;
      tagged.begin = ((options: unknown, callback?: unknown) => {
        const operation = callback ?? options;
        const transactionOptions = callback ? options : undefined;
        const run = (transaction: TransactionSql) =>
          (operation as (sql: Sql) => unknown)(barrierSql(transaction));
        return transactionOptions
          ? (base as Sql).begin(transactionOptions as string, run)
          : (base as Sql).begin(run);
      }) as Sql["begin"];
      return tagged;
    }

    const read = getPlanByYear(barrierSql(sql), user.id, 2042);
    await scalarsRead;
    await replacePlan(sql, user.id, 2042, {
      ...created,
      grossSalaryCents: 20_000_000,
      benefits: created.benefits.map((benefit, index) =>
        index === 0 ? { ...benefit, label: "Concurrent label" } : benefit,
      ),
    });
    releaseCollections();

    const observed = await read;
    expect(observed).not.toBeNull();
    const oldSnapshot =
      observed?.grossSalaryCents === 10_000_000 &&
      observed.benefits[0].label === originalLabel;
    const newSnapshot =
      observed?.grossSalaryCents === 20_000_000 &&
      observed.benefits[0].label === "Concurrent label";
    expect(oldSnapshot || newSnapshot).toBe(true);
  });

  it("seeds every owner category and blocks cross-account reads and writes", async () => {
    const owner = await createUser(
      sql,
      "plans-owner@example.com",
      "owner password is long",
    );
    const outsider = await createUser(
      sql,
      "plans-outsider@example.com",
      "outsider password long",
    );
    const created = await createPlanWithDefaults(sql, owner.id, {
      year: 2026,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 15_000_000,
      additionalWageIncomeCents: 1_000_000,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });

    expect(created.expenses.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "Car payment",
        "Car insurance",
        "Car registration",
        "Estimated car maintenance",
        "Rent",
        "Groceries",
        "Water",
        "Electric",
        "Gas",
        "Internet",
        "Brokerage investing",
        "IRA / Roth IRA",
        "Other transportation",
        "Cleaning supplies",
        "Household replacements",
        "Gifts",
        "Clothes",
        "Skincare",
        "TV subscriptions",
        "Spotify",
        "Cell phone",
        "Fun money",
        "Vacation",
      ]),
    );
    expect(await getPlanByYear(sql, outsider.id, 2026)).toBeNull();
    expect(
      await updatePlanBasics(sql, outsider.id, created.year, {
        stateCode: "TX",
        filingStatus: "single",
        grossSalaryCents: 1,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
      }),
    ).toBeNull();
    expect((await getPlanByYear(sql, owner.id, 2026))?.stateCode).toBe("CA");
  });

  it("enforces one plan per year and copy-forward is a deep copy", async () => {
    const owner = await createUser(
      sql,
      "copy-owner@example.com",
      "copy password is long",
    );
    const source = await createPlanWithDefaults(sql, owner.id, {
      year: 2026,
      stateCode: "IL",
      filingStatus: "mfj",
      grossSalaryCents: 18_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "family",
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
    });
    await replacePlan(sql, owner.id, source.year, {
      ...source,
      expenses: source.expenses.map((expense, index) =>
        index === 0 ? { ...expense, amountCents: 50_000 } : expense,
      ),
    });

    await expect(
      createPlanWithDefaults(sql, owner.id, {
        year: 2026,
        stateCode: "TX",
        filingStatus: "single",
        grossSalaryCents: 0,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
      }),
    ).rejects.toBeInstanceOf(PlanYearConflictError);

    const currentSource = await getPlanByYear(sql, owner.id, 2026);
    if (!currentSource) throw new Error("Expected source plan");
    const copied = await copyPlanToYear(
      sql,
      owner.id,
      2026,
      2027,
      currentSource.updatedAt,
      currentSource.fieldVersions,
    );
    expect(copied).toMatchObject({
      year: 2027,
      stateCode: "IL",
      filingStatus: "mfj",
      primaryHsaEligible: true,
      spouseHsaEligible: true,
      primaryHsaCatchUpEligible: true,
      spouseHsaCatchUpEligible: true,
      primaryHsaFamilyAllocationPpm: 500_000,
      spouseHsaFamilyAllocationPpm: 500_000,
    });
    expect(copied.expenses[0].amountCents).toBe(50_000);
    expect(copied.expenses[0].id).not.toBe(source.expenses[0].id);
    expect(copied.benefits[0].id).not.toBe(source.benefits[0].id);

    await expect(
      copyPlanToYear(
        sql,
        owner.id,
        2026,
        2027,
        currentSource.updatedAt,
        currentSource.fieldVersions,
      ),
    ).rejects.toBeInstanceOf(PlanYearConflictError);

    await replacePlan(sql, owner.id, copied.year, {
      ...copied,
      expenses: copied.expenses.map((expense, index) =>
        index === 0 ? { ...expense, amountCents: 99_000 } : expense,
      ),
    });
    expect(
      (await getPlanByYear(sql, owner.id, 2026))?.expenses[0].amountCents,
    ).toBe(50_000);

    const exported = await exportAccount(sql, owner.id, owner.email);
    expect(exported.plans.map(({ year }) => year)).toEqual([2026, 2027]);
    expect(exported.plans[0].expenses).toHaveLength(23);
    expect(exported.plans[1].benefits).toHaveLength(source.benefits.length);
    expect(exported.plans[0].spouseHsaEligible).toBe(true);
    expect(exported.plans[0].primaryHsaCatchUpEligible).toBe(true);
    expect(exported.plans[0].spouseHsaCatchUpEligible).toBe(true);
  });

  it("refuses copy-forward when the reconciled source version changed", async () => {
    const owner = await createUser(
      sql,
      "copy-version-owner@example.com",
      "copy version password is long",
    );
    const source = await createPlanWithDefaults(sql, owner.id, {
      year: 2032,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 12_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    await updatePlanBasics(sql, owner.id, source.year, {
      stateCode: "TX" as const,
      filingStatus: "single",
      grossSalaryCents: 13_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });

    await expect(
      copyPlanToYear(
        sql,
        owner.id,
        2032,
        2033,
        source.updatedAt,
        source.fieldVersions,
      ),
    ).rejects.toBeInstanceOf(SourcePlanChangedError);
    expect(await getPlanByYear(sql, owner.id, 2033)).toBeNull();
  });

  it("copies source scalars and children from one locked snapshot", async () => {
    const owner = await createUser(
      sql,
      "copy-snapshot-owner@example.com",
      "copy snapshot password is long",
    );
    const source = await createPlanWithDefaults(sql, owner.id, {
      year: 2034,
      stateCode: "CA",
      filingStatus: "single",
      grossSalaryCents: 12_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const originalLabel = source.benefits[0].label;
    await sql`
      CREATE OR REPLACE FUNCTION delay_2035_plan_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.year = 2035 THEN PERFORM pg_sleep(0.25); END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await sql`
      CREATE TRIGGER delay_2035_plan_insert_trigger
      AFTER INSERT ON plans
      FOR EACH ROW EXECUTE FUNCTION delay_2035_plan_insert()
    `;
    try {
      const copy = copyPlanToYear(
        sql,
        owner.id,
        2034,
        2035,
        source.updatedAt,
        source.fieldVersions,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      const update = sql.begin(async (transaction) => {
        await transaction`
          UPDATE plans
          SET gross_salary_cents = 13000000, updated_at = now()
          WHERE id = ${source.id}
        `;
        await transaction`
          UPDATE benefits SET label = 'Concurrent label'
          WHERE id = ${source.benefits[0].id}
        `;
      });

      const [copied] = await Promise.all([copy, update]);
      expect(copied.grossSalaryCents).toBe(12_000_000);
      expect(copied.benefits[0].label).toBe(originalLabel);
    } finally {
      await sql`DROP TRIGGER IF EXISTS delay_2035_plan_insert_trigger ON plans`;
      await sql`DROP FUNCTION IF EXISTS delay_2035_plan_insert()`;
    }
  });

  it("atomically saves category and benefit edits only for the owner", async () => {
    const owner = await createUser(
      sql,
      "replace-owner@example.com",
      "replace password long",
    );
    const outsider = await createUser(
      sql,
      "replace-outsider@example.com",
      "outsider password long",
    );
    const source = await createPlanWithDefaults(sql, owner.id, {
      year: 2028,
      stateCode: "CO",
      filingStatus: "hoh",
      grossSalaryCents: 12_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    const edited = {
      stateCode: "TX" as const,
      filingStatus: source.filingStatus,
      grossSalaryCents: source.grossSalaryCents,
      additionalWageIncomeCents: source.additionalWageIncomeCents,
      spouseWageIncomeCents: 0,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: source.hsaCoverage,
      benefits: [
        ...source.benefits.slice(0, 1).map((entry) => ({
          ...entry,
          label: "My retirement",
        })),
        {
          id: "2ba31bd6-01dc-4532-867f-c5ea34e81e0f",
          type: "custom" as const,
          label: "Custom pre-tax item",
          amount: { kind: "fixedAnnual" as const, cents: 10_000 },
          customTaxTreatment: {
            reducesFederalTaxable: true,
            reducesFicaTaxable: false,
            reducesStateTaxable: true,
            reducesTakeHome: true,
            countsAsSavings: false,
            employerSide: false,
          },
        },
      ],
      expenses: source.expenses.slice(0, 2).map((entry, sortOrder) => ({
        ...entry,
        name: sortOrder === 0 ? "Vehicle" : entry.name,
        amountCents: 12_345,
        sortOrder,
      })),
    };

    expect(await replacePlan(sql, outsider.id, 2028, edited)).toBeNull();
    const saved = await replacePlan(sql, owner.id, 2028, edited);
    expect(saved).toMatchObject({ stateCode: "TX" });
    expect(saved?.benefits).toHaveLength(2);
    expect(saved?.benefits[0].label).toBe("My retirement");
    expect(saved?.benefits[1].customTaxTreatment).toMatchObject({
      reducesFederalTaxable: true,
      reducesStateTaxable: true,
    });
    expect(saved?.expenses.map(({ name }) => name)).toEqual([
      "Vehicle",
      "Car insurance",
    ]);
  });

  it("reassigns spouse benefits when a basics update leaves MFJ", async () => {
    const user = await createUser(
      sql,
      "plans-filing-owner@example.com",
      "plans filing owner password",
    );
    const created = await createPlanWithDefaults(sql, user.id, {
      year: 2041,
      stateCode: "TX",
      filingStatus: "mfj",
      grossSalaryCents: 10_000_000,
      additionalWageIncomeCents: 0,
      spouseWageIncomeCents: 5_000_000,
      otherOrdinaryIncomeCents: 0,
      hsaCoverage: "self",
    });
    await replacePlan(sql, user.id, 2041, {
      ...created,
      benefits: created.benefits.map((benefit, index) => ({
        ...benefit,
        owner: index === 0 ? ("spouse" as const) : benefit.owner,
      })),
    });
    expect(
      await updatePlanBasics(sql, user.id, created.year, {
        stateCode: "TX",
        filingStatus: "single",
        grossSalaryCents: 10_000_000,
        additionalWageIncomeCents: 0,
        spouseWageIncomeCents: 0,
        otherOrdinaryIncomeCents: 0,
        hsaCoverage: "self",
      }),
    ).not.toBeNull();
    expect(
      (await getPlanByYear(sql, user.id, 2041))?.benefits.every(
        ({ owner }) => owner === "primary",
      ),
    ).toBe(true);
  });
});
