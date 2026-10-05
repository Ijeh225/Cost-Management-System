import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, containerDocumentsTable as documents, containersTable, documentProfilesTable as profiles,
  documentChecklistsTable as checklists, documentReviewsTable as reviews, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth.js";
import { getDocumentContainer, canReviewDocuments } from "../lib/document-access.js";
import { hasAuthority } from "../lib/authorization.js";
import { buildReadiness, profileSchema, reviewSchema, suggestFields } from "../lib/document-readiness.js";
import { getDocumentIndex } from "../lib/document-intelligence.js";

export const documentReadinessRouter = Router();
const base = "/containers/:id/document-readiness";

documentReadinessRouter.get(base, requireAuth, async (req: AuthRequest, res) => {
  try {
    const c = await getDocumentContainer(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Container not found" });
    const docs = await db.select().from(documents).where(eq(documents.containerId, c.id));
    const history = docs.length ? await db.select({ review: reviews, reviewerName: usersTable.name }).from(reviews)
      .leftJoin(usersTable, eq(reviews.reviewerId, usersTable.id))
      .where(inArray(reviews.documentId, docs.map(d => d.id))).orderBy(desc(reviews.id)) : [];
    const applications = await db.select({ application: checklists, profile: profiles, appliedByName: usersTable.name }).from(checklists)
      .innerJoin(profiles, eq(checklists.profileId, profiles.id)).leftJoin(usersTable, eq(checklists.appliedById, usersTable.id))
      .where(eq(checklists.containerId, c.id)).orderBy(desc(checklists.id));
    const availableProfiles = await db.select().from(profiles).where(eq(profiles.branchId, c.branchId)).orderBy(desc(profiles.id));
    const rows = docs.map(d => ({ ...d, review: history.find(h => h.review.documentId === d.id)?.review ?? null }));
    const { current: _current, ...readiness } = buildReadiness(applications[0] ? JSON.parse(applications[0].profile.requiredTypes) : null, rows);
    return res.json({ ...readiness,
      documents: rows.map(({ filename: _key, ...d }) => d), history, applications, profiles: availableProfiles,
      canReview: canReviewDocuments(req), canConfigure: hasAuthority(req.user!.accessProfile, "branch_admin") });
  } catch (error) { console.error(error); return res.status(500).json({ error: "Unable to load document readiness" }); }
});

documentReadinessRouter.post(`${base}/profiles`, requireAuth, async (req: AuthRequest, res) => {
  const input = profileSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Enter name, job/cargo type and unique required document types." });
  try {
    const c = await getDocumentContainer(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Container not found" });
    if (!hasAuthority(req.user!.accessProfile, "branch_admin")) return res.status(403).json({ error: "A branch administrator must configure requirement profiles." });
    const [profile] = await db.insert(profiles).values({ ...input.data, requiredTypes: JSON.stringify(input.data.requiredTypes),
      branchId: c.branchId, createdById: req.user!.id }).returning();
    return res.status(201).json(profile);
  } catch (error) { console.error(error); return res.status(500).json({ error: "Unable to create profile" }); }
});

documentReadinessRouter.post(`${base}/apply`, requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.body.profileId;
  const expected = req.body.expectedChecklistId;
  if (!Number.isSafeInteger(profileId) || profileId <= 0 || !(expected === null || Number.isSafeInteger(expected))) return res.status(400).json({ error: "Invalid profile or checklist revision" });
  try {
    const c = await getDocumentContainer(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Container not found" });
    if (!canReviewDocuments(req)) return res.status(403).json({ error: "Documentation or branch administration access required" });
    const result = await db.transaction(async tx => {
      await tx.select().from(containersTable).where(eq(containersTable.id, c.id)).for("update");
      const [last] = await tx.select().from(checklists).where(eq(checklists.containerId, c.id)).orderBy(desc(checklists.id)).limit(1);
      if ((last?.id ?? null) !== expected) return null;
      const [profile] = await tx.select().from(profiles).where(and(eq(profiles.id, profileId), eq(profiles.branchId, c.branchId)));
      if (!profile) return null;
      const [application] = await tx.insert(checklists).values({ containerId: c.id, profileId, appliedById: req.user!.id }).returning();
      return application;
    });
    return result ? res.status(201).json(result) : res.status(409).json({ error: "Checklist changed or profile unavailable. Refresh first." });
  } catch (error) { console.error(error); return res.status(500).json({ error: "Unable to apply profile" }); }
});

documentReadinessRouter.get(`${base}/:docId/extraction`, requireAuth, async (req: AuthRequest, res) => {
  try {
    const c = await getDocumentContainer(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Container not found" });
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, Number(req.params.docId)), eq(documents.containerId, c.id)));
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const index = await getDocumentIndex(doc.id);
    const pages = JSON.parse(index?.pageText ?? "[]");
    return res.json({ status: index?.status ?? "not_indexed", pages, suggestions: suggestFields(pages),
      error: index?.errorMessage ?? null, extractorVersion: index?.extractorVersion ?? null });
  } catch (error) { console.error(error); return res.status(500).json({ error: "Unable to load extraction" }); }
});

documentReadinessRouter.post(`${base}/:docId/review`, requireAuth, async (req: AuthRequest, res) => {
  const input = reviewSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: input.error.issues.map(i => i.message).join("; ") });
  try {
    const c = await getDocumentContainer(req, Number(req.params.id));
    if (!c) return res.status(404).json({ error: "Container not found" });
    if (!canReviewDocuments(req)) return res.status(403).json({ error: "Documentation or branch administration access required" });
    const result = await db.transaction(async tx => {
      const [doc] = await tx.select().from(documents).where(and(eq(documents.id, Number(req.params.docId)), eq(documents.containerId, c.id))).for("update");
      if (!doc) return null;
      const [successor] = await tx.select().from(documents).where(eq(documents.previousVersionId, doc.id));
      const [last] = await tx.select().from(reviews).where(eq(reviews.documentId, doc.id)).orderBy(desc(reviews.id)).limit(1);
      if (successor || (last?.id ?? null) !== input.data.expectedReviewId) return null;
      const extraction = await getDocumentIndex(doc.id);
      const { expectedReviewId: _expected, sourceChecked: _checked, acceptedFields, ...values } = input.data;
      await tx.update(documents).set({ retained: 1 }).where(eq(documents.id, doc.id));
      const [review] = await tx.insert(reviews).values({ ...values, documentId: doc.id, reviewerId: req.user!.id,
        acceptedFields: JSON.stringify(acceptedFields), extractionSnapshot: JSON.stringify({
          pages: JSON.parse(extraction?.pageText ?? "[]"), extractorVersion: extraction?.extractorVersion ?? null,
          indexedAt: extraction?.indexedAt ?? null,
        }) }).returning();
      return review;
    });
    return result ? res.status(201).json(result) : res.status(409).json({ error: "Document/review changed or superseded. Refresh before reviewing." });
  } catch (error) { console.error(error); return res.status(500).json({ error: "Unable to save review" }); }
});
