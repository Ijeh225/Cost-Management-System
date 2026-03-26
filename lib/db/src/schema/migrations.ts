import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

export const appMigrationsTable = pgTable("app_migrations", {
  name: varchar("name", { length: 255 }).primaryKey(),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
});

export type AppMigration = typeof appMigrationsTable.$inferSelect;
