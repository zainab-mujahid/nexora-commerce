import "server-only";

import { S3_PUBLIC_BASE_URL } from "./env";

/**
 * Builds a public image URL from an s3_key at read time. Full URLs are
 * never stored in Postgres — only the key — so this is the single place
 * deployment configuration (S3_PUBLIC_BASE_URL) turns a key into a URL.
 */
export function getS3PublicUrl(key: string): string {
  return `${S3_PUBLIC_BASE_URL}/${key}`;
}
