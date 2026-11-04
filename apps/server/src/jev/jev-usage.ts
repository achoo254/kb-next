/**
 * Daily Jev totals in Postgres (`jev_usage_daily`): every call's usage line (src/jev/jev-client.ts) adds to the row
 * of its day in Asia/Saigon and its purpose. Recording never fails the request that made the call: a database error
 * is logged and that call is missing from the total (the `jev-call` log line still has it).
 */
import { and, asc, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { jevUsageDaily } from '../db/schema';
import { safeErrorText } from '../log-error';
import type { JevUsageLog } from './jev-client';

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day of `at` in Saigon, `YYYY-MM-DD`. */
export function saigonDay(at: Date): string {
  return DAY_FORMAT.format(at);
}

export interface JevUsageDay {
  day: string;
  purpose: string;
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export class JevUsageStore {
  private pending = new Set<Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Adds one call to today's total; never rejects. */
  record(line: JevUsageLog): Promise<void> {
    const values = {
      day: saigonDay(this.now()),
      purpose: line.purpose,
      calls: 1,
      failedCalls: line.ok ? 0 : 1,
      inputTokens: line.inputTokens,
      outputTokens: line.outputTokens,
    };
    const write = this.db
      .insert(jevUsageDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [jevUsageDaily.day, jevUsageDaily.purpose],
        set: {
          calls: sql`${jevUsageDaily.calls} + 1`,
          failedCalls: sql`${jevUsageDaily.failedCalls} + ${values.failedCalls}`,
          inputTokens: sql`${jevUsageDaily.inputTokens} + ${values.inputTokens}`,
          outputTokens: sql`${jevUsageDaily.outputTokens} + ${values.outputTokens}`,
        },
      })
      .then(
        () => undefined,
        (error: unknown) => console.error('jev usage: could not record a call', safeErrorText(error)),
      );
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
    return write;
  }

  /** Resolves once every recording started so far is written (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  /** The totals of the days from `from` to `to` (inclusive, `YYYY-MM-DD`), oldest first, for the cost report. */
  async days(from: string, to: string): Promise<JevUsageDay[]> {
    return this.db
      .select()
      .from(jevUsageDaily)
      .where(and(gte(jevUsageDaily.day, from), lte(jevUsageDaily.day, to)))
      .orderBy(asc(jevUsageDaily.day), asc(jevUsageDaily.purpose));
  }
}
