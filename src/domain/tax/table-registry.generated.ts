import federal2026 from "./tables/2026.federal.json";
import states2026 from "./tables/2026.states.json";
import { taxTableSchema } from "./table-schema";
import type { TaxTable } from "./types";

export const GENERATED_TAX_TABLES = {
  2026: taxTableSchema.parse({ ...federal2026, states: states2026.states }),
} satisfies Record<number, TaxTable>;
