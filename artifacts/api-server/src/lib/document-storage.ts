import { objectStorageClient } from "./objectStorage.js";

export function getDocumentStorageBucket() {
  const configurationError = getDocumentStorageConfigurationError();
  if (configurationError) throw new Error(configurationError);

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!.trim();
  return objectStorageClient.bucket(bucketId);
}

export function getDocumentStorageConfigurationError(): string | null {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim()) {
    return "Document storage is not configured. Set DEFAULT_OBJECT_STORAGE_BUCKET_ID.";
  }

  return null;
}
