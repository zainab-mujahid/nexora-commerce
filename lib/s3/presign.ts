import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { s3Client } from "./client";
import { S3_BUCKET_NAME } from "./env";

const DEFAULT_EXPIRES_IN_SECONDS = 5 * 60;

/**
 * Generates a short-lived presigned PUT URL for uploading a single object
 * directly from the browser to S3. Key shaping, authorization, and MIME/size
 * validation are the caller's responsibility.
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = DEFAULT_EXPIRES_IN_SECONDS,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}
