import "server-only";

import { HeadBucketCommand, HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";

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

export type S3BucketStatus = { ok: true } | { ok: false; problem: string };

/**
 * Checks that the configured bucket exists and these credentials can use it.
 * A HEAD on an object in a missing bucket is also a bare 404, so callers
 * that report missing objects must check the bucket first to tell "object
 * gone" apart from "bucket gone / no access". `problem` is a short,
 * non-secret description for admin screens.
 */
export async function headS3Bucket(): Promise<S3BucketStatus> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
    return { ok: true };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (error as { name?: string })?.name ?? "";
    if (status === 404 || name === "NotFound" || name === "NoSuchBucket") return { ok: false, problem: "bucket not found" };
    if (status === 403 || name === "Forbidden" || name === "AccessDenied") {
      return { ok: false, problem: "access denied — check the AWS credentials and bucket permissions" };
    }
    if (name === "CredentialsProviderError") return { ok: false, problem: "no AWS credentials available" };
    return { ok: false, problem: name ? `S3 error: ${name}` : "S3 unreachable" };
  }
}
