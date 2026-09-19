import "server-only";

import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";

import { s3Client } from "./client";
import { S3_BUCKET_NAME } from "./env";

export type S3ObjectMetadata = {
  contentType: string | undefined;
  contentLength: number | undefined;
};

/**
 * Reads an object's metadata directly from S3 (not from client-reported
 * values), so a caller can verify what was actually uploaded rather than
 * trusting the browser. Returns null if the object does not exist.
 */
export async function headS3Object(key: string): Promise<S3ObjectMetadata | null> {
  try {
    const result = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }),
    );

    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}
