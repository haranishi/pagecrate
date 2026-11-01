// Workers-only module: imported by worker.ts alone, so `cloudflare:workers` never enters the Next.js bundle.
import { DurableObject } from "cloudflare:workers";
import { reserveRender, type BudgetDecision, type RenderCountStore } from "./budget-gate";

/** Global daily render counter. Its only table is renders(day, used): no user, URL or asset data. */
export class BudgetGate extends DurableObject<CloudflareEnv> {
  private readonly counts: RenderCountStore;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS renders (day TEXT PRIMARY KEY, used INTEGER NOT NULL)");
    this.counts = {
      read: day => sql.exec<{ used: number }>("SELECT used FROM renders WHERE day = ?", day).toArray()[0]?.used ?? null,
      write: (day, used) => { sql.exec("INSERT INTO renders (day, used) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET used = excluded.used", day, used); },
      deleteBefore: day => { sql.exec("DELETE FROM renders WHERE day < ?", day); },
    };
  }

  /** Called over RPC by the scan guard: reserve one render for the UTC `day` under `cap`. */
  reserve(day: string, cap: number): BudgetDecision {
    return reserveRender(this.counts, day, cap);
  }
}
