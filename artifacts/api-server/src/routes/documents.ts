import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db, containerDocumentsTable, containersTable, documentIntelligenceIndexTable, usersTable, workflowNotificationsTable } from "@workspace/db";
import type { DocumentIntelligenceIndex } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireAuth, AuthRequest, userCanAccessBranch } from "../lib/auth.js";
import { deleteDocument, documentExists, getDocument, getDocumentBuffer, saveDocument } from "../lib/document-storage.js";
import { settingsTable } from "@workspace/db";
import { getDocumentIndex, getIndexableDocument, indexContainerDocument } from "../lib/document-intelligence.js";
import { getDocumentContainer } from "../lib/document-access.js";
import { documentTypeSchema, expirySchema } from "../lib/document-readiness.js";
import { documentReviewsTable } from "@workspace/db";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const DEFAULT_DOCUMENT_SECTIONS = [
  { id: "general", label: "General" },
  { id: "shipping", label: "Shipping" },
  { id: "customs", label: "Customs" },
  { id: "terminal", label: "Terminal" },
  { id: "delivery", label: "Delivery" },
  { id: "operations", label: "Operations" },
];

async function getDocumentSections() {
  const [setting] = await db.select({ value: settingsTable.value }).from(settingsTable)
    .where(eq(settingsTable.key, "documentSections")).limit(1);
  if (!setting?.value) return DEFAULT_DOCUMENT_SECTIONS;
  try {
    const parsed = JSON.parse(setting.value);
    if (Array.isArray(parsed) && parsed.every((item) => item && typeof item.id === "string" && typeof item.label === "string")) return parsed;
  } catch {}
  return DEFAULT_DOCUMENT_SECTIONS;
}

async function getAccessibleContainer(req: AuthRequest, containerId: number) {
  return getDocumentContainer(req, containerId);
}

function documentIntelligenceResponse(index: DocumentIntelligenceIndex | null) {
  return index ? {
    status: index.status,
    pageCount: index.pageCount,
    indexedAt: index.indexedAt?.toISOString() ?? null,
    errorMessage: index.errorMessage,
  } : {
    status: "not_indexed",
    pageCount: null,
    indexedAt: null,
    errorMessage: "This existing document has not been indexed yet. Select Retry indexing to make it searchable.",
  };
}

documentsRouter.get("/containers/:id/documents", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const docs = await db.select({
      id: containerDocumentsTable.id,
      documentType: containerDocumentsTable.documentType,
      versionNumber: containerDocumentsTable.versionNumber,
      previousVersionId: containerDocumentsTable.previousVersionId,
      retained: containerDocumentsTable.retained,
      containerId: containerDocumentsTable.containerId,
      section: containerDocumentsTable.section,
      filename: containerDocumentsTable.filename,
      originalName: containerDocumentsTable.originalName,
      mimeType: containerDocumentsTable.mimeType,
      size: containerDocumentsTable.size,
      uploadedById: containerDocumentsTable.uploadedById,
      uploaderName: usersTable.name,
      createdAt: containerDocumentsTable.createdAt,
      intelligenceStatus: documentIntelligenceIndexTable.status,
      intelligencePageCount: documentIntelligenceIndexTable.pageCount,
      intelligenceIndexedAt: documentIntelligenceIndexTable.indexedAt,
      intelligenceError: documentIntelligenceIndexTable.errorMessage,
    }).from(containerDocumentsTable)
      .leftJoin(usersTable, eq(containerDocumentsTable.uploadedById, usersTable.id))
      .leftJoin(documentIntelligenceIndexTable, eq(documentIntelligenceIndexTable.documentId, containerDocumentsTable.id))
      .where(eq(containerDocumentsTable.containerId, containerId))
      .orderBy(asc(containerDocumentsTable.createdAt));

    return res.json(docs.map(d => ({
      id: d.id,
      documentType: d.documentType,
      versionNumber: d.versionNumber,
      previousVersionId: d.previousVersionId,
      retained: d.retained,
      containerId: d.containerId,
      section: d.section,
      filename: d.filename,
      originalName: d.originalName,
      mimeType: d.mimeType,
      size: d.size,
      uploadedById: d.uploadedById,
      uploaderName: d.uploaderName ?? "Unknown",
      createdAt: d.createdAt.toISOString(),
      intelligence: d.intelligenceStatus ? {
        status: d.intelligenceStatus,
        pageCount: d.intelligencePageCount,
        indexedAt: d.intelligenceIndexedAt?.toISOString() ?? null,
        errorMessage: d.intelligenceError,
      } : documentIntelligenceResponse(null),
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

documentsRouter.get("/document-sections", requireAuth, async (_req: AuthRequest, res) => {
  try {
    return res.json(await getDocumentSections());
  } catch (err) {
    console.error("[documents] sections error:", err);
    return res.status(500).json({ error: "Failed to load document sections" });
  }
});

documentsRouter.post("/containers/:id/documents", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const section = typeof req.body.section === "string" ? req.body.section.trim() : "";

  const ext = path.extname(req.file.originalname).toLowerCase();
  const objectKey = `documents/${Date.now()}-${randomUUID()}${ext}`;

  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const sections = await getDocumentSections();
    if (section && !sections.some((item) => item.id === section)) {
      return res.status(400).json({ error: "Choose a valid document section." });
    }

    const documentType = documentTypeSchema.safeParse(req.body.documentType ?? "other");
    const expiry = expirySchema.safeParse(req.body.expiresOn || null);
    const previousId = req.body.previousVersionId ? Number(req.body.previousVersionId) : null;
    const issuer = typeof req.body.issuer === "string" ? req.body.issuer.trim() : "";
    if (!documentType.success || !expiry.success || issuer.length > 200 ||
      (previousId !== null && (!Number.isSafeInteger(previousId) || previousId <= 0))) {
      return res.status(400).json({ error: "Invalid document classification, issuer, expiry or version." });
    }

    await saveDocument(objectKey, req.file.buffer, req.file.mimetype);

    const doc = await db.transaction(async tx => {
      let previous = null;
      if (previousId !== null) {
        [previous] = await tx.select().from(containerDocumentsTable).where(and(
          eq(containerDocumentsTable.id, previousId), eq(containerDocumentsTable.containerId, containerId),
          eq(containerDocumentsTable.branchId, container.branchId))).for("update");
        if (!previous) throw new Error("VERSION_CONFLICT");
        const successors = await tx.select().from(containerDocumentsTable).where(eq(containerDocumentsTable.previousVersionId, previousId));
        if (successors.length) throw new Error("VERSION_CONFLICT");
        await tx.update(containerDocumentsTable).set({ retained: 1 }).where(eq(containerDocumentsTable.id, previousId));
      }
      const [created] = await tx.insert(containerDocumentsTable).values({
      documentType: documentType.data, issuer, expiresOn: expiry.data,
      previousVersionId: previousId, versionNumber: previous ? previous.versionNumber + 1 : 1, retained: 1,
      containerId,
      branchId: container.branchId,
      section: section || null,
      filename: objectKey,
      originalName: req.file!.originalname,
      mimeType: req.file!.mimetype,
      size: req.file!.size,
      uploadedById: req.user!.id,
      }).returning();
      return created;
    });

    try {
      const docMsg = `Document uploaded: "${req.file.originalname}" — ${container.containerNumber}`;
      let targetUserId: number | null = null;
      if (container.stageOwner) {
        const [ownerUser] = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.branchId, container.branchId), eq(usersTable.name, container.stageOwner), eq(usersTable.isActive, true)))
          .limit(1);
        if (ownerUser) targetUserId = ownerUser.id;
      }
      await db.insert(workflowNotificationsTable).values({
        type: "document_uploaded", branchId: container.branchId,
        message: docMsg, containerId, containerNumber: container.containerNumber,
        targetUserId,
      });
    } catch {}

    let intelligence = documentIntelligenceResponse(null);
    try {
      intelligence = documentIntelligenceResponse(await indexContainerDocument(doc, req.file.buffer));
    } catch (indexError) {
      // Upload remains successful; the Documents tab exposes the failed status and retry control.
      console.error("[documents] indexing error:", indexError);
      intelligence = { status: "failed", pageCount: null, indexedAt: null, errorMessage: "Indexing could not start. Select Retry indexing to try again." };
    }

    return res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), intelligence });
  } catch (err) {
    console.error("[documents] upload error:", err);
    try { await deleteDocument(objectKey); } catch {}
    const message = err instanceof Error ? err.message : "";
    if (message === "VERSION_CONFLICT") return res.status(409).json({ error: "The source version is unavailable or already replaced. Refresh and choose the latest version." });
    return res.status(message.includes("Document storage is not configured") ? 503 : 500)
      .json({ error: message.includes("Document storage is not configured") ? message : "Document upload failed" });
  }
});

documentsRouter.post("/containers/:id/documents/:docId/intelligence/retry", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  const docId = parseInt(String(req.params.docId));
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const document = await getIndexableDocument(docId);
    if (!document || document.containerId !== container.id || document.branchId !== container.branchId) {
      return res.status(404).json({ error: "Document not found" });
    }
    const canRetry = document.uploadedById === req.user!.id || ["super_admin", "admin", "branch_admin"].includes(req.user!.role);
    if (!canRetry) return res.status(403).json({ error: "Only the uploader or a branch administrator can retry document indexing." });
    const reviews = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.documentId, docId)).limit(1);
    if (reviews.length) return res.status(409).json({ error: "Reviewed extraction is retained. Upload a new version to re-extract." });
    const buffer = await getDocumentBuffer(document.filename);
    const index = await indexContainerDocument(document, buffer);
    return res.json({ success: true, intelligence: documentIntelligenceResponse(index) });
  } catch (error) {
    console.error("[documents] retry indexing error:", error);
    const message = error instanceof Error ? error.message : "Document indexing failed";
    return res.status(message.includes("Document storage is not configured") ? 503 : 500)
      .json({ error: message.includes("Document storage is not configured") ? message : "Document indexing failed. Retry again shortly." });
  }
});

documentsRouter.get("/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  const docId = parseInt(String(req.params.docId));
  if (isNaN(docId)) return res.status(400).json({ error: "Invalid document id" });
  try {
    const [doc] = await db.select({
      containerId: containerDocumentsTable.containerId,
      branchId: containerDocumentsTable.branchId,
      filename: containerDocumentsTable.filename,
      originalName: containerDocumentsTable.originalName,
      mimeType: containerDocumentsTable.mimeType,
    }).from(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    if (!doc || !await getAccessibleContainer(req, doc.containerId)) return res.status(404).json({ error: "Document not found" });

    if (!await documentExists(doc.filename)) return res.status(404).json({ error: "File not found in storage" });
    const storedDocument = await getDocument(doc.filename);
    const contentType = storedDocument.contentType || doc.mimeType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const inline = /^(application\/pdf|text\/plain|image\/(png|jpeg|webp|gif))$/i.test(contentType.split(";")[0].trim());
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.originalName)}"`);
    if (storedDocument.contentLength) res.setHeader("Content-Length", String(storedDocument.contentLength));

    storedDocument.stream
      .on("error", (err): void => {
        console.error("[documents] stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Stream error" });
      })
      .pipe(res);
    return;
  } catch (err) {
    console.error("[documents] serve error:", err);
    const message = err instanceof Error ? err.message : "";
    return res.status(message.includes("Document storage is not configured") ? 503 : 500)
      .json({ error: message.includes("Document storage is not configured") ? message : "Document retrieval failed" });
  }
});

documentsRouter.delete("/containers/:id/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  const docId = parseInt(String(req.params.docId));
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const outcome = await db.transaction(async tx => {
      const [doc] = await tx.select().from(containerDocumentsTable)
        .where(and(eq(containerDocumentsTable.id, docId), eq(containerDocumentsTable.containerId, containerId))).for("update");
      if (!doc || doc.branchId !== container.branchId) return { status: 404, error: "Document not found" };
      const canDelete = doc.uploadedById === req.user!.id || ["super_admin", "admin", "branch_admin"].includes(req.user!.role);
      if (!canDelete) return { status: 403, error: "Only the uploader or a branch administrator can delete this document." };
      if (doc.retained) return { status: 409, error: "Document versions are retained for audit. Reject or upload a replacement version instead." };
      try { await deleteDocument(doc.filename); }
      catch { return { status: 502, error: "Storage unavailable. Document was not deleted." }; }
      await tx.delete(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
      return null;
    });
    if (outcome) return res.status(outcome.status).json({ error: outcome.error });
    return res.json({ success: true });
  } catch (err) {
    console.error("[documents] delete error:", err);
    const message = err instanceof Error ? err.message : "";
    return res.status(message.includes("Document storage is not configured") ? 503 : 500)
      .json({ error: message.includes("Document storage is not configured") ? message : "Document deletion failed" });
  }
});
