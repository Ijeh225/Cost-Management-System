import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, containerDocumentsTable, containersTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

export const documentsRouter = Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
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
  try {
    const [container] = await db.select({ branchId: containersTable.branchId }).from(containersTable).where(eq(containersTable.id, containerId));
    if (!container) return res.status(404).json({ error: "Container not found" });
    const [doc] = await db.insert(containerDocumentsTable).values({
      containerId,
      branchId: container.branchId,
      section,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedById: req.user!.id,
    }).returning();
    return res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

documentsRouter.get("/documents/:filename", requireAuth, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  return res.sendFile(filePath);
});

documentsRouter.delete("/containers/:id/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  const docId = parseInt(req.params.docId);
  try {
    const [doc] = await db.select().from(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    if (doc) {
      const filePath = path.join(uploadDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await db.delete(containerDocumentsTable).where(eq(containerDocumentsTable.id, docId));
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
