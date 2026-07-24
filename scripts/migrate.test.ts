import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { testDatabaseUrl, testSql } from "../src/test/database";

describe("database migrations", () => {
  it("are complete and idempotent after the empty-database setup", async () => {
    expect(await migrate(testDatabaseUrl())).toEqual([]);
    const sql = testSql();
    try {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
        ORDER BY table_name
      `;
      expect(tables.map(({ table_name }) => table_name)).toEqual([
        "app_migrations",
        "applied_mutations",
        "auth_rate_limits",
        "benefits",
        "expenses",
        "plans",
        "sessions",
        "transactions",
        "users",
      ]);
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'plans' AND column_name IN (
              'spouse_wage_income_cents', 'other_ordinary_income_cents',
              'primary_hsa_catch_up_eligible', 'spouse_hsa_catch_up_eligible',
              'starting_savings_cents'
            ))
            OR (table_name = 'benefits' AND column_name = 'owner')
            OR (table_name = 'expenses' AND column_name IN (
              'guidance_bucket', 'color_token', 'archived'
            ))
          )
        ORDER BY column_name
      `;
      expect(columns.map(({ column_name }) => column_name)).toEqual([
        "archived",
        "color_token",
        "guidance_bucket",
        "other_ordinary_income_cents",
        "owner",
        "primary_hsa_catch_up_eligible",
        "spouse_hsa_catch_up_eligible",
        "spouse_wage_income_cents",
        "starting_savings_cents",
      ]);
      const abandonedChildMetadata = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('benefits', 'expenses')
          AND column_name IN ('field_versions', 'updated_at')
      `;
      expect(abandonedChildMetadata).toEqual([]);
      const benefitType = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'benefits_type'
          AND conrelid = 'benefits'::regclass
      `;
      expect(benefitType[0]?.definition).toContain("commuterParking");

      await sql`DELETE FROM benefits WHERE type = 'commuterParking'`;
      await sql`ALTER TABLE benefits DROP CONSTRAINT benefits_type`;
      await sql.unsafe(`
        ALTER TABLE benefits ADD CONSTRAINT benefits_type CHECK (type IN (
          'traditional401k', 'roth401k', 'employer401kMatch', 'espp', 'hsa',
          'employerHsa', 'healthFsa', 'dependentCareFsa', 'section125Premium',
          'commuter', 'lifeDisabilityInsurance', 'custom'
        ))
      `);
      await sql`
        DELETE FROM app_migrations
        WHERE name = '005_add_commuter_parking_benefit.sql'
      `;
      expect(await migrate(testDatabaseUrl())).toEqual([
        "005_add_commuter_parking_benefit.sql",
      ]);
      const upgradedBenefitType = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'benefits_type'
          AND conrelid = 'benefits'::regclass
      `;
      expect(upgradedBenefitType[0]?.definition).toContain("commuterParking");
      expect(await migrate(testDatabaseUrl())).toEqual([]);

      const discountRange = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'benefits_discount_range'
          AND conrelid = 'benefits'::regclass
      `;
      expect(discountRange[0]?.definition).toContain("150000");

      await sql`ALTER TABLE benefits DROP CONSTRAINT benefits_discount_range`;
      await sql`
        ALTER TABLE benefits ADD CONSTRAINT benefits_discount_range
        CHECK (discount_rate_ppm IS NULL OR discount_rate_ppm BETWEEN 0 AND 1000000)
      `;
      const legacyDiscount = await sql<{ id: string }[]>`
        WITH legacy_user AS (
          INSERT INTO users (email, password_hash)
          VALUES ('legacy-espp-migration@example.com', 'migration-test-hash')
          RETURNING id
        ), legacy_plan AS (
          INSERT INTO plans (
            user_id, year, state_code, filing_status, hsa_coverage
          )
          SELECT id, 2199, 'CA', 'single', 'self' FROM legacy_user
          RETURNING id
        )
        INSERT INTO benefits (
          plan_id, type, label, amount_kind, amount_value, discount_rate_ppm
        )
        SELECT id, 'espp', 'Legacy ESPP', 'percent', 10000, 1000000
        FROM legacy_plan
        RETURNING id
      `;
      await sql`
        DELETE FROM app_migrations
        WHERE name = '008_limit_espp_discount.sql'
      `;
      expect(await migrate(testDatabaseUrl())).toEqual([
        "008_limit_espp_discount.sql",
      ]);
      const upgradedDiscountRange = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'benefits_discount_range'
          AND conrelid = 'benefits'::regclass
      `;
      expect(upgradedDiscountRange[0]?.definition).toContain("150000");
      const migratedDiscount = await sql<{ discount_rate_ppm: number }[]>`
        SELECT discount_rate_ppm FROM benefits WHERE id = ${legacyDiscount[0].id}
      `;
      expect(migratedDiscount[0].discount_rate_ppm).toBe(150_000);
      await sql`DELETE FROM users WHERE email = 'legacy-espp-migration@example.com'`;
      expect(await migrate(testDatabaseUrl())).toEqual([]);
    } finally {
      await migrate(testDatabaseUrl()).catch(() => undefined);
      await sql.end();
    }
  });

  it("upgrades an existing yearly plan without inventing transactions", async () => {
    const schema = `kf_test_existing_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const admin = testSql();
    const url = new URL(testDatabaseUrl());
    url.searchParams.set("options", `-csearch_path=${schema}`);
    await admin`CREATE SCHEMA ${admin(schema)}`;
    const legacySql = postgres(url.toString(), {
      max: 1,
      onnotice: () => undefined,
    });
    try {
      const migrationFiles = (await readdir(resolve("migrations")))
        .filter((name) => /^\d+_.+\.sql$/.test(name) && name < "012_")
        .sort();
      for (const file of migrationFiles) {
        await legacySql.unsafe(
          await readFile(resolve("migrations", file), "utf8"),
        );
      }
      await legacySql`
        CREATE TABLE app_migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      for (const file of migrationFiles)
        await legacySql`INSERT INTO app_migrations (name) VALUES (${file})`;
      const seeded = await legacySql<{ plan_id: string; expense_id: string }[]>`
        WITH existing_user AS (
          INSERT INTO users (email, password_hash)
          VALUES ('existing-daily-migration@example.com', 'migration-test-hash')
          RETURNING id
        ), existing_plan AS (
          INSERT INTO plans (
            user_id, year, state_code, filing_status, hsa_coverage
          )
          SELECT id, 2026, 'CA', 'single', 'self' FROM existing_user
          RETURNING id
        ), existing_expense AS (
          INSERT INTO expenses (
            plan_id, name, category_group, cadence, amount_cents, sort_order
          )
          SELECT id, 'Rent', 'Home', 'monthly', 250000, 4
          FROM existing_plan
          RETURNING id, plan_id
        )
        SELECT plan_id, id AS expense_id FROM existing_expense
      `;

      expect(await migrate(url.toString())).toEqual([
        "012_daily_money_cockpit.sql",
      ]);
      const upgraded = await legacySql<
        {
          id: string;
          color_token: string;
          archived: boolean;
          starting_savings_cents: string | null;
        }[]
      >`
        SELECT expenses.id, expenses.color_token, expenses.archived,
               plans.starting_savings_cents
        FROM expenses
        JOIN plans ON plans.id = expenses.plan_id
        WHERE plans.id = ${seeded[0].plan_id}
      `;
      expect(upgraded).toEqual([
        {
          id: seeded[0].expense_id,
          color_token: "rose",
          archived: false,
          starting_savings_cents: null,
        },
      ]);
      expect(
        (
          await legacySql<{ count: string }[]>`
            SELECT count(*)::text AS count FROM transactions
          `
        )[0].count,
      ).toBe("0");
      expect(await migrate(url.toString())).toEqual([]);
    } finally {
      await legacySql.end();
      await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      await admin.end();
    }
  });
});
