import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db, containerDocumentsTable, containersTable, usersTable, workflowNotificationsTable } from "@workspace/db";
import { eq, asc, inArray, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";
import { objectStorageClient } from "../lib/objectStorage.js";

export const documentsRouter = Router();

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

function getBucket() {
  if (!BUCKET_ID) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  return objectStorageClient.bucket(BUCKET_ID);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

documentsRouter.get("/containers/:id/documents", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.id);
  try {
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
    }).from(containerDocumentsTable)
      .leftJoin(usersTable, eq(containerDocumentsTable.uploadedById, usersTable.id))
      .where(eq(containerDocumentsTable.containerId, containerId))
      .orderBy(asc(containerDocumentsTable.createdAt));

    return res.json(docs.map(d => ({ ...d, uploaderName: d.uploaderName ?? "Unknown", createdAt: d.createdAt.toISOString() })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

documentsRouter.post("/containers/:id/documents", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.id);
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const section = req.body.section || null;

  const ext = path.extname(req.file.originalname).toLowerCase();
  const objectKey = `documents/${Date.now()}-${randomUUID()}${ext}`;

  try {
    const [container] = await db.select({ branchId: containersTable.branchId, containerNumber: containersTable.containerNumber }).from(containersTable).where(eq(containersTable.id, containerId));
    if (!container) return res.status(404).json({ error: "Container not found" });

    const gcsFile = getBucket().file(objectKey);
    await gcsFile.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
      resumable: false,
    });

    const [doc] = await db.insert(containerDocumentsTable).values({
      containerId,
      branchId: container.branchId,
      section,
      filename: objectKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedById: req.user!.id,
    }).returning();

    try {
      const SECTION_ROLES: Record<string, string[]> = {
        shipping:   ["shipping_user", "shipping_terminal_user"],
        customs:    ["customs_user"],
        terminal:   ["terminal_user", "terminal_manager", "shipping_terminal_user"],
        delivery:   ["delivery_user"],
        operations: ["operations_user"],
      };
      const docMsg = `Document uploaded: "${req.file.originalname}" — ${container.containerNumber}`;
      const sectionRoles = SECTION_ROLES[section] ?? [];
      let inserted = false;
      if (sectionRoles.length > 0) {
        const targetUsers = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.branchId, container.branchId), eq(usersTable.isActive, true), inArray(usersTable.role, sectionRoles)));
        if (targetUsers.length > 0) {
          await db.insert(workflowNotificationsTable).values(
            targetUsers.map(u => ({
              type: "document_uploaded", branchId: container.branchId,
              message: docMsg, containerId, containerNumber: container.containerNumber,
              targetUserId: u.id,
            }))
          );
          inserted = true;
        }
      }
      if (!inserted) {
        await db.insert(workflowNotificationsTable).values({
          type: "document_uploaded", branchId: container.branchId,
          message: docMsg, containerId, containerNumber: container.containerNumber,
        });
      }
    } catch {}

    return res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString() });
  } catch (err) {
    console.error("[documents] upload error:", err);
    try { await getBucket().file(objectKey).delete({ ignoreNotFound: true }); } catch {}
    return res.status(500).json({ error: "Server error" });
  }
});

documentsRouter.get("/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  const docId = parseInt(req.params.docId);
  if (isNaN(docId)) return res.status(400).json({ error: "Invalid document id" });
  try {
    const [doc] = await db.select({
      filename: containerDocumentsTable.filename,
      originalName: containerDocumentsTable.originalName,
      mimeType: containerDocumentsTable.mimeType,
    }).from(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const gcsFile = getBucket().file(doc.filename);
    const [exists] = await gcsFile.exists();
    if (!exists) return res.status(404).json({ error: "File not found in storage" });

    const [metadata] = await gcsFile.getMetadata();
    const contentType = (metadata.contentType as string) || doc.mimeType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

    gcsFile.createReadStream()
      .on("error", (err) => {
        console.error("[documents] stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Stream error" });
      })
      .pipe(res);
  } catch (err) {
    console.error("[documents] serve error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

documentsRouter.delete("/containers/:id/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  const docId = parseInt(req.params.docId);
  try {
    const [doc] = await db.select().from(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    if (doc) {
      try {
        await getBucket().file(doc.filename).delete({ ignoreNotFound: true });
      } catch (storageErr) {
        console.warn("[documents] GCS delete warning:", storageErr);
      }
      await db.delete(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("[documents] delete error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
