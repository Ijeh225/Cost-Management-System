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
  if (!Number.isInteger(containerId) || containerId <= 0) return null;
  const [container] = await db.select({
    id: containersTable.id,
    branchId: containersTable.branchId,
    containerNumber: containersTable.containerNumber,
    stageOwner: containersTable.stageOwner,
  }).from(containersTable).where(eq(containersTable.id, containerId)).limit(1);
  return container && userCanAccessBranch(req, container.branchId) ? container : null;
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

    await saveDocument(objectKey, req.file.buffer, req.file.mimetype);

    const [doc] = await db.insert(containerDocumentsTable).values({
      containerId,
      branchId: container.branchId,
      section: section || null,
      filename: objectKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedById: req.user!.id,
    }).returning();

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
    if (!doc || !userCanAccessBranch(req, doc.branchId)) return res.status(404).json({ error: "Document not found" });

    if (!await documentExists(doc.filename)) return res.status(404).json({ error: "File not found in storage" });
    const storedDocument = await getDocument(doc.filename);
    const contentType = storedDocument.contentType || doc.mimeType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName)}"`);
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
    const [doc] = await db.select().from(containerDocumentsTable)
      .where(and(eq(containerDocumentsTable.id, docId), eq(containerDocumentsTable.containerId, containerId)));
    if (!doc || doc.branchId !== container.branchId) return res.status(404).json({ error: "Document not found" });
    const canDelete = doc.uploadedById === req.user!.id || ["super_admin", "admin", "branch_admin"].includes(req.user!.role);
    if (!canDelete) return res.status(403).json({ error: "Only the uploader or a branch administrator can delete this document." });
    try {
      await deleteDocument(doc.filename);
    } catch (storageErr) {
      console.error("[documents] storage delete failed:", storageErr);
      return res.status(502).json({ error: "Document storage is temporarily unavailable. The document was not deleted." });
    }
    await db.delete(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    return res.json({ success: true });
  } catch (err) {
    console.error("[documents] delete error:", err);
    const message = err instanceof Error ? err.message : "";
    return res.status(message.includes("Document storage is not configured") ? 503 : 500)
      .json({ error: message.includes("Document storage is not configured") ? message : "Document deletion failed" });
  }
});
