import { Router } from "express";
import { db, settingsTable, usersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin, AuthRequest } from "../lib/auth.js";
import { validateSettingsPayload } from "../lib/settings-validation.js";

export const settingsRouter = Router();

const BUILT_IN_SECTION_KEYS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
const BUILT_IN_SECTION_DEFAULTS: Record<string, string> = {
  shipping:   "Shipping Charges",
  customs:    "Customs Duty & Taxes",
  terminal:   "Terminal Charges",
  delivery:   "Delivery & Transport",
  operations: "Operations & Misc.",
};

settingsRouter.get("/settings", requireAdmin, async (_req, res) => {
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
    const validated = validateSettingsPayload(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });
    if (validated.officerIds.length) {
      const activeUsers = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(inArray(usersTable.id, validated.officerIds), eq(usersTable.isActive, true)));
      if (activeUsers.length !== validated.officerIds.length) return res.status(400).json({ error: "Officer selections must refer to active users." });
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(validated.values)) {
        await tx.insert(settingsTable).values({ key, value, updatedAt: now })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: now } });
      }
    });
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
