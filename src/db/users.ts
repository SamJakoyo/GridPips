import { desc, eq } from 'drizzle-orm';
import { sqlDb } from './index.ts';
import { sqlJournalEntries, sqlTradingStrategies, sqlUsers } from './schema.ts';

export async function getOrCreateSqlUser(
  uid: string,
  email: string,
  name = 'Trader',
  exnessAccountId = ''
) {
  try {
    const result = await sqlDb
      .insert(sqlUsers)
      .values({
        uid,
        email,
        name,
        exnessAccountId,
      })
      .onConflictDoUpdate({
        target: sqlUsers.uid,
        set: {
          email,
          name,
          ...(exnessAccountId ? { exnessAccountId } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Cloud SQL user upsert failed:', error);
    throw new Error('Unable to sync trader profile.', { cause: error });
  }
}

export async function listSqlStrategiesByUid(uid: string) {
  try {
    return await sqlDb
      .select({
        id: sqlTradingStrategies.id,
        title: sqlTradingStrategies.title,
        pair: sqlTradingStrategies.pair,
        timeframe: sqlTradingStrategies.timeframe,
        rulesSummary: sqlTradingStrategies.rulesSummary,
        createdAt: sqlTradingStrategies.createdAt,
      })
      .from(sqlTradingStrategies)
      .innerJoin(sqlUsers, eq(sqlTradingStrategies.userId, sqlUsers.id))
      .where(eq(sqlUsers.uid, uid))
      .orderBy(desc(sqlTradingStrategies.id));
  } catch (error) {
    console.error('Cloud SQL list strategies failed:', error);
    throw new Error('Unable to load saved strategies.', { cause: error });
  }
}

export async function createSqlStrategy(
  userId: number,
  title: string,
  pair: string,
  timeframe: string,
  rulesSummary: string
) {
  try {
    const inserted = await sqlDb
      .insert(sqlTradingStrategies)
      .values({
        userId,
        title,
        pair,
        timeframe,
        rulesSummary,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Cloud SQL create strategy failed:', error);
    throw new Error('Unable to save strategy.', { cause: error });
  }
}

export async function deleteSqlStrategyByUid(strategyId: number, uid: string) {
  try {
    const userRow = await sqlDb.select().from(sqlUsers).where(eq(sqlUsers.uid, uid));
    if (!userRow[0]) return false;
    const rows = await sqlDb
      .select()
      .from(sqlTradingStrategies)
      .where(eq(sqlTradingStrategies.id, strategyId));
    if (!rows[0] || rows[0].userId !== userRow[0].id) return false;
    await sqlDb.delete(sqlTradingStrategies).where(eq(sqlTradingStrategies.id, strategyId));
    return true;
  } catch (error) {
    console.error('Cloud SQL delete strategy failed:', error);
    throw new Error('Unable to remove strategy.', { cause: error });
  }
}

export async function logSqlJournalEntry(
  userId: number,
  instrument: string,
  side: string,
  pnl: number,
  notes: string,
  tradeDate: string
) {
  try {
    const inserted = await sqlDb
      .insert(sqlJournalEntries)
      .values({
        userId,
        instrument,
        side,
        pnl,
        notes,
        tradeDate,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Cloud SQL journal insert failed:', error);
    throw new Error('Unable to save journal entry.', { cause: error });
  }
}
