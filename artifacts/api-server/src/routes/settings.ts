import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin, AuthRequest } from "../lib/auth.js";

export const settingsRouter = Router();

const BUILT_IN_SECTION_KEYS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
const BUILT_IN_SECTION_DEFAULTS: Record<string, string> = {
  shipping:   "Shipping Charges",
  customs:    "Customs Duty & Taxes",
  terminal:   "Terminal Charges",
  delivery:   "Delivery & Transport",
  operations: "Operations & Misc.",
};

settingsRouter.get("/settings", requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const map: Record<string, string> = { ...BUILT_IN_SECTION_DEFAULTS };
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return res.json(map);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

settingsRouter.patch("/settings", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== "string") continue;
      const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
      if (existing.length > 0) {
        await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
      } else {
        await db.insert(settingsTable).values({ key, value });
      }
    }
    const rows = await db.select().from(settingsTable);
    const map: Record<string, string> = { ...BUILT_IN_SECTION_DEFAULTS };
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return res.json(map);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
