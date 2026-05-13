import { Router } from "express";
import { db, customSectionsTable, customFieldsTable, customFieldValuesTable, containersTable } from "@workspace/db";
import { eq, asc, and, isNull, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest, userCanAccessBranch, getBranchScope, resolveCreateBranch } from "../lib/auth.js";

async function loadSectionForBranchCheck(sectionId: number) {
  const [s] = await db.select({ id: customSectionsTable.id, branchId: customSectionsTable.branchId })
    .from(customSectionsTable).where(eq(customSectionsTable.id, sectionId));
  return s ?? null;
}

export const sectionsRouter = Router();

// List custom sections with their fields — filtered by containerId
sectionsRouter.get("/custom-sections", requireAuth, async (req: AuthRequest, res) => {
  try {
    const containerId = req.query.containerId ? parseInt(req.query.containerId as string) : null;
    const baseClause = containerId !== null
      ? eq(customSectionsTable.containerId, containerId)
      : isNull(customSectionsTable.containerId);
    // Task #74: branch scope from X-Branch-Id header.
    const bScope = getBranchScope(req);
    const whereClause = bScope === null
      ? baseClause
      : and(baseClause, eq(customSectionsTable.branchId, bScope));
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
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [section] = await db.insert(customSectionsTable).values({ containerId: containerIdNum, branchId: createBranchId, name, slug: `${slug}_${Date.now()}`, color, icon, isRequired, sectionOrder: nextOrder, createdById: req.user!.id }).returning();
    return res.status(201).json({ ...section, fields: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update section
sectionsRouter.patch("/custom-sections/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id);
  const sec = await loadSectionForBranchCheck(id);
  if (!sec || !userCanAccessBranch(req, sec.branchId)) return res.status(404).json({ error: "Section not found" });
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
sectionsRouter.delete("/custom-sections/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id);
  const sec = await loadSectionForBranchCheck(id);
  if (!sec || !userCanAccessBranch(req, sec.branchId)) return res.status(404).json({ error: "Section not found" });
  try {
    await db.delete(customSectionsTable).where(eq(customSectionsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add field to section
sectionsRouter.post("/custom-sections/:id/fields", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const sectionId = parseInt(req.params.id);
  const sec = await loadSectionForBranchCheck(sectionId);
  if (!sec || !userCanAccessBranch(req, sec.branchId)) return res.status(404).json({ error: "Section not found" });
  const { name, fieldType = "text", placeholder = "", helpText = "", defaultValue = "", isRequired = false, includeInTotal = false, visibleByRole = "all", editableByRole = "all", dropdownOptions = "[]" } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const existing = await db.select({ fieldOrder: customFieldsTable.fieldOrder }).from(customFieldsTable).where(eq(customFieldsTable.sectionId, sectionId)).orderBy(asc(customFieldsTable.fieldOrder));
    const nextOrder = existing.length > 0 ? (existing[existing.length - 1].fieldOrder + 1) : 0;
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    if (createBranchId !== sec.branchId) return res.status(400).json({ error: "Active branch does not match the parent section's branch." });
    const [field] = await db.insert(customFieldsTable).values({ sectionId, branchId: createBranchId, name, fieldType, placeholder, helpText, defaultValue, isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions, fieldOrder: nextOrder }).returning();
    return res.status(201).json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update field
sectionsRouter.patch("/custom-sections/:id/fields/:fieldId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const sectionId = parseInt(req.params.id);
  const fieldId = parseInt(req.params.fieldId);
  const sec = await loadSectionForBranchCheck(sectionId);
  if (!sec) return res.status(404).json({ error: "Section not found" });
  if (!userCanAccessBranch(req, sec.branchId)) return res.status(404).json({ error: "Section not found" });
  // Bind fieldId to its parent section to prevent cross-section IDOR via mismatched IDs.
  const [fieldRow] = await db.select({ id: customFieldsTable.id, sectionId: customFieldsTable.sectionId, branchId: customFieldsTable.branchId })
    .from(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
  if (!fieldRow || fieldRow.sectionId !== sectionId) return res.status(404).json({ error: "Field not found in this section" });
  if (!userCanAccessBranch(req, fieldRow.branchId)) return res.status(404).json({ error: "Field not found in this section" });
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
sectionsRouter.delete("/custom-sections/:id/fields/:fieldId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const sectionId = parseInt(req.params.id);
  const fieldId = parseInt(req.params.fieldId);
  const sec = await loadSectionForBranchCheck(sectionId);
  if (!sec) return res.status(404).json({ error: "Section not found" });
  if (!userCanAccessBranch(req, sec.branchId)) return res.status(404).json({ error: "Section not found" });
  const [fieldRow] = await db.select({ id: customFieldsTable.id, sectionId: customFieldsTable.sectionId, branchId: customFieldsTable.branchId })
    .from(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
  if (!fieldRow || fieldRow.sectionId !== sectionId) return res.status(404).json({ error: "Field not found in this section" });
  if (!userCanAccessBranch(req, fieldRow.branchId)) return res.status(404).json({ error: "Field not found in this section" });
  try {
    await db.delete(customFieldsTable).where(and(eq(customFieldsTable.id, fieldId), eq(customFieldsTable.sectionId, sectionId)));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get field values for a container
sectionsRouter.get("/containers/:containerId/custom-values", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.containerId);
  try {
    const [container] = await db.select({ branchId: containersTable.branchId }).from(containersTable).where(eq(containersTable.id, containerId));
    if (!container || !userCanAccessBranch(req, container.branchId)) return res.status(404).json({ error: "Container not found" });
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
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, containerId));
    if (!container || !userCanAccessBranch(req, container.branchId)) return res.status(404).json({ error: "Container not found" });
    for (const { fieldId, value } of values) {
      const existing = await db.select().from(customFieldValuesTable)
        .where(and(eq(customFieldValuesTable.fieldId, fieldId), eq(customFieldValuesTable.containerId, containerId)));
      if (existing.length > 0) {
        await db.update(customFieldValuesTable).set({ value, updatedById: req.user!.id, updatedAt: new Date() })
          .where(eq(customFieldValuesTable.id, existing[0].id));
      } else {
        await db.insert(customFieldValuesTable).values({ containerId, branchId: container.branchId, fieldId, value, updatedById: req.user!.id });
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
sectionsRouter.get("/builtin-extras", requireAuth, async (req: AuthRequest, res) => {
  try {
    const bScope = getBranchScope(req);
    const branchPredicate = bScope === null
      ? isNotNull(customFieldsTable.builtinSectionKey)
      : and(isNotNull(customFieldsTable.builtinSectionKey), eq(customFieldsTable.branchId, bScope));
    const fields = await db.select().from(customFieldsTable)
      .where(branchPredicate)
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
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [field] = await db.insert(customFieldsTable).values({
      builtinSectionKey, branchId: createBranchId,
      name, fieldType, placeholder, helpText, defaultValue,
      isRequired, includeInTotal, visibleByRole, editableByRole, dropdownOptions, fieldOrder: nextOrder,
    }).returning();
    return res.status(201).json(field);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH update extra field
sectionsRouter.patch("/builtin-extras/:fieldId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const fieldId = parseInt(req.params.fieldId);
  const [fieldRow] = await db.select({ id: customFieldsTable.id, branchId: customFieldsTable.branchId, builtinSectionKey: customFieldsTable.builtinSectionKey })
    .from(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
  if (!fieldRow || !fieldRow.builtinSectionKey) return res.status(404).json({ error: "Builtin extra field not found" });
  if (!userCanAccessBranch(req, fieldRow.branchId)) return res.status(404).json({ error: "Builtin extra field not found" });
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
sectionsRouter.delete("/builtin-extras/:fieldId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const fieldId = parseInt(req.params.fieldId);
  const [fieldRow] = await db.select({ id: customFieldsTable.id, branchId: customFieldsTable.branchId, builtinSectionKey: customFieldsTable.builtinSectionKey })
    .from(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
  if (!fieldRow || !fieldRow.builtinSectionKey) return res.status(404).json({ error: "Builtin extra field not found" });
  if (!userCanAccessBranch(req, fieldRow.branchId)) return res.status(404).json({ error: "Builtin extra field not found" });
  try {
    await db.delete(customFieldsTable).where(eq(customFieldsTable.id, fieldId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
