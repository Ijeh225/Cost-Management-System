import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationsReadTable = pgTable("notifications_read", {
  id: serial("id").primaryKey(),
  alertKey: text("alert_key").notNull().unique(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
