import "server-only";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { s3Client } from "./client";
import { S3_BUCKET_NAME } from "./env";

/**
 * Deletes a single object from the S3 bucket by key. Callers that mirror
 * object existence in Postgres must delete the S3 object first and only
 * remove the database row once this resolves successfully.
 */
export async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    }),
  );
}
