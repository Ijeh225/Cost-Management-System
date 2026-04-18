import { Router } from "express";
import { db, customSectionsTable, customFieldsTable, customFieldValuesTable } from "@workspace/db";
import { eq, asc, and, isNull, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";

export const sectionsRouter = Router();

// List custom sections with their fields — filtered by containerId
sectionsRouter.get("/custom-sections", requireAuth, async (req, res) => {
  try {
    const containerId = req.query.containerId ? parseInt(req.query.containerId as string) : null;
    const whereClause = containerId !== null
      ? eq(customSectionsTable.containerId, containerId)
      : isNull(customSectionsTable.containerId);
    const sections = await db.select().from(customSectionsTable).where(whereClause).orderBy(asc(customSectionsTable.sectionOrder));
    const fields = await db.select().from(customFieldsTable).where(isNotNull(customFieldsTable.sectionId)).orderBy(asc(customFieldsTable.fieldOrder));
    const result = sections.map(s => ({
      ...s,
      fields: fields.filter(f => f.sectionId === s.id),
    }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Create section
sectionsRouter.post("/custom-sections", requireAuth, async (req: AuthRequest, res) => {
  const { name, color = "#6366f1", icon = "Layers", isRequired = false, containerId } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const containerIdNum = containerId ? parseInt(containerId) : null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  try {
    const whereClause = containerIdNum !== null
      ? eq(customSectionsTable.containerId, containerIdNum)
      : isNull(customSectionsTable.containerId);
    const maxOrder = await db.select({ sectionOrder: customSectionsTable.sectionOrder }).from(customSectionsTable).where(whereClause).orderBy(asc(customSectionsTable.sectionOrder));
    const nextOrder = maxOrder.length > 0 ? (maxOrder[maxOrder.length - 1].sectionOrder + 1) : 0;
    const [section] = await db.insert(customSectionsTable).values({ containerId: containerIdNum, name, slug: `${slug}_${Date.now()}`, color, icon, isRequired, sectionOrder: nextOrder, createdById: req.user!.id }).returning();
    return res.status(201).json({ ...section, fields: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update section
sectionsRouter.patch("/custom-sections/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id);
  const { name, color, icon, isRequired, isArchived, sectionOrder } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (icon !== undefined) updates.icon = icon;
  if (isRequired !== undefined) updates.isRequired = isRequired;
  if (isArchived !== undefined) updates.isArchived = isArchived;
  if (sectionOrder !== undefined) updates.sectionOrder = sectionOrder;
  try {
    const [section] = await db.update(customSectionsTable).set(updates).where(eq(customSectionsTable.id, id)).returning();
    return res.json(section);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Delete section
sectionsRouter.delete("/custom-sections/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.delete(customSectionsTable).where(eq(customSectionsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add field to section
sectionsRouter.post("/custom-sections/:id/fields", requireAuth, requireAdmin, async (req, res) => {
  const sectionId = parseInt(req.params.id);
  const { name, fieldType = "text", placeholder = "", helpText = "", defaultValue = "", isRequired = false, includeInTotal = false, visibleByRole = "all", editableByRole = "all", dropdownOptions = "[]" } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const existing = await db.select({ fieldOrder: customFieldsTable.fieldOrder }).from(customFieldsTable).where(eq(customFieldsTable.sectionId, sectionId)).orderBy(asc(customFieldsTable.fieldOrder));
    const nextOrder = existing.length > 0 ? (existing[existing.length - 1].fieldOrder + 1) : 0;
    const [field] = await db.insert(customFieldsTable).values({ sectionId, name, fieldType, placeholder, helpText, defaultValue, isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions, fieldOrder: nextOrder }).returning();
    return res.status(201).json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update field
sectionsRouter.patch("/custom-sections/:id/fields/:fieldId", requireAuth, requireAdmin, async (req, res) => {
  const fieldId = parseInt(req.params.fieldId);
  const { name, fieldType, placeholder, helpText, defaultValue, isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions, fieldOrder } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (fieldType !== undefined) updates.fieldType = fieldType;
  if (placeholder !== undefined) updates.placeholder = placeholder;
  if (helpText !== undefined) updates.helpText = helpText;
  if (defaultValue !== undefined) updates.defaultValue = defaultValue;
  if (isRequired !== undefined) updates.isRequired = isRequired;
  if (includeInTotal !== undefined) updates.includeInTotal = includeInTotal;
  if (visibleByRole !== undefined) updates.visibleByRole = visibleByRole;
  if (editableByRole !== undefined) updates.editableByRole = editableByRole;
  if (dropdownOptions !== undefined) updates.dropdownOptions = dropdownOptions;
  if (fieldOrder !== undefined) updates.fieldOrder = fieldOrder;
  try {
    const [field] = await db.update(customFieldsTable).set(updates).where(eq(customFieldsTable.id, fieldId)).returning();
    return res.json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Delete field
sectionsRouter.delete("/custom-sections/:id/fields/:fieldId", requireAuth, requireAdmin, async (req, res) => {
  const fieldId = parseInt(req.params.fieldId);
  try {
    await db.delete(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get field values for a container
sectionsRouter.get("/containers/:containerId/custom-values", requireAuth, async (req, res) => {
  const containerId = parseInt(req.params.containerId);
  try {
    const values = await db.select().from(customFieldValuesTable).where(eq(customFieldValuesTable.containerId, containerId));
    return res.json(values);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Save field values for a container
sectionsRouter.post("/containers/:containerId/custom-values", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.containerId);
  const { values } = req.body as { values: Array<{ fieldId: number; value: string }> };
  if (!Array.isArray(values)) return res.status(400).json({ error: "values array required" });
  try {
    for (const { fieldId, value } of values) {
      const existing = await db.select().from(customFieldValuesTable)
        .where(and(eq(customFieldValuesTable.fieldId, fieldId), eq(customFieldValuesTable.containerId, containerId)));
      if (existing.length > 0) {
        await db.update(customFieldValuesTable).set({ value, updatedById: req.user!.id, updatedAt: new Date() })
          .where(eq(customFieldValuesTable.id, existing[0].id));
      } else {
        await db.insert(customFieldValuesTable).values({ containerId, fieldId, value, updatedById: req.user!.id });
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Builtin Section Extra Fields ─────────────────────────────────────────────

// GET all extra fields for builtin sections, grouped by sectionKey
sectionsRouter.get("/builtin-extras", requireAuth, async (_req, res) => {
  try {
    const fields = await db.select().from(customFieldsTable)
      .where(isNotNull(customFieldsTable.builtinSectionKey))
      .orderBy(asc(customFieldsTable.fieldOrder));
    const grouped: Record<string, typeof fields> = {};
    for (const f of fields) {
      const key = f.builtinSectionKey!;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
    return res.json(grouped);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST create extra field for a builtin section
sectionsRouter.post("/builtin-extras", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { builtinSectionKey, name, fieldType = "number", placeholder = "", helpText = "", defaultValue = "", isRequired = false, includeInTotal = true, visibleByRole = "all", editableByRole = "all", dropdownOptions = "[]" } = req.body;
  if (!builtinSectionKey) return res.status(400).json({ error: "builtinSectionKey required" });
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const existing = await db.select({ fieldOrder: customFieldsTable.fieldOrder })
      .from(customFieldsTable)
      .where(eq(customFieldsTable.builtinSectionKey, builtinSectionKey))
      .orderBy(asc(customFieldsTable.fieldOrder));
    const nextOrder = existing.length > 0 ? (existing[existing.length - 1].fieldOrder + 1) : 0;
    const [field] = await db.insert(customFieldsTable).values({
      builtinSectionKey, name, fieldType, placeholder, helpText, defaultValue,
      isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions, fieldOrder: nextOrder,
    }).returning();
    return res.status(201).json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH update extra field
sectionsRouter.patch("/builtin-extras/:fieldId", requireAuth, requireAdmin, async (req, res) => {
  const fieldId = parseInt(req.params.fieldId);
  const { name, fieldType, placeholder, helpText, defaultValue, isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (fieldType !== undefined) updates.fieldType = fieldType;
  if (placeholder !== undefined) updates.placeholder = placeholder;
  if (helpText !== undefined) updates.helpText = helpText;
  if (defaultValue !== undefined) updates.defaultValue = defaultValue;
  if (isRequired !== undefined) updates.isRequired = isRequired;
  if (includeInTotal !== undefined) updates.includeInTotal = includeInTotal;
  if (visibleByRole !== undefined) updates.visibleByRole = visibleByRole;
  if (editableByRole !== undefined) updates.editableByRole = editableByRole;
  if (dropdownOptions !== undefined) updates.dropdownOptions = dropdownOptions;
  try {
    const [field] = await db.update(customFieldsTable).set(updates).where(eq(customFieldsTable.id, fieldId)).returning();
    return res.json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// DELETE extra field
sectionsRouter.delete("/builtin-extras/:fieldId", requireAuth, requireAdmin, async (req, res) => {
  const fieldId = parseInt(req.params.fieldId);
  try {
    await db.delete(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
