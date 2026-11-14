import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const sqlUsers = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default('Trader'),
  exnessAccountId: text('exness_account_id').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sqlJournalEntries = pgTable('journal_entries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => sqlUsers.id)
    .notNull(),
  instrument: text('instrument').notNull(),
  side: text('side').notNull(),
  pnl: doublePrecision('pnl').notNull().default(0),
  notes: text('notes').notNull().default(''),
  tradeDate: text('trade_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sqlTradingStrategies = pgTable('trading_strategies', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => sqlUsers.id)
    .notNull(),
  title: text('title').notNull(),
  pair: text('pair').notNull(),
  timeframe: text('timeframe').notNull(),
  rulesSummary: text('rules_summary').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sqlUsersRelations = relations(sqlUsers, ({ many }) => ({
  journalEntries: many(sqlJournalEntries),
  tradingStrategies: many(sqlTradingStrategies),
}));

export const sqlJournalEntriesRelations = relations(sqlJournalEntries, ({ one }) => ({
  author: one(sqlUsers, {
    fields: [sqlJournalEntries.userId],
    references: [sqlUsers.id],
  }),
}));

export const sqlTradingStrategiesRelations = relations(sqlTradingStrategies, ({ one }) => ({
  author: one(sqlUsers, {
    fields: [sqlTradingStrategies.userId],
    references: [sqlUsers.id],
  }),
}));
