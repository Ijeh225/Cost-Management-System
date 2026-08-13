import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

type DocumentStorageConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getConfig(): DocumentStorageConfig {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  const endpoint = process.env.DOCUMENT_STORAGE_ENDPOINT?.trim();
  const region = process.env.DOCUMENT_STORAGE_REGION?.trim();
  const accessKeyId = process.env.DOCUMENT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY?.trim();
  const missing = [
    !bucket && "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
    !endpoint && "DOCUMENT_STORAGE_ENDPOINT",
    !region && "DOCUMENT_STORAGE_REGION",
    !accessKeyId && "DOCUMENT_STORAGE_ACCESS_KEY_ID",
    !secretAccessKey && "DOCUMENT_STORAGE_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Document storage is not configured. Set ${missing.join(", ")}.`);
  return { bucket: bucket!, endpoint: endpoint!, region: region!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! };
}

function getClient(config: DocumentStorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export function getDocumentStorageConfigurationError(): string | null {
  try {
    getConfig();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Document storage is not configured.";
  }
}

export async function saveDocument(key: string, body: Buffer, contentType: string) {
  const config = getConfig();
  await getClient(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteDocument(key: string) {
  const config = getConfig();
  await getClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function getDocument(key: string): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
  const config = getConfig();
  const result = await getClient(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!result.Body || typeof (result.Body as Readable).pipe !== "function") throw new Error("Document storage returned an invalid file stream.");
  return {
    stream: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function documentExists(key: string): Promise<boolean> {
  const config = getConfig();
  try {
    await getClient(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (["NotFound", "NoSuchKey", "NoSuchBucket"].includes(name)) return false;
    throw error;
  }
}
