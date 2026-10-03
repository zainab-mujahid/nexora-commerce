import "server-only";

import type { ProductImage } from "@/lib/catalog/types";
import { headS3Bucket, headS3Object } from "@/lib/s3/head";

// Admin-only diagnosis of a product's stored image keys against S3, so the
// edit page can say exactly what is wrong instead of showing anonymous
// placeholders: the bucket/credentials themselves (nothing can work), or
// individual objects missing behind otherwise valid rows (data drift). It
// only reads — it never deletes or rewrites rows to hide a problem.
export type ProductImageStorage = {
  reachable: boolean;
  // Short, non-secret reason when the bucket can't be used.
  problem?: string;
  // Images whose object is confirmed missing in a reachable bucket.
  missingIds: string[];
};

export async function checkProductImageStorage(images: ProductImage[]): Promise<ProductImageStorage> {
  const bucket = await headS3Bucket();
  if (!bucket.ok) return { reachable: false, problem: bucket.problem, missingIds: [] };

  const missingIds: string[] = [];
  await Promise.all(
    images.map(async (image) => {
      try {
        if ((await headS3Object(image.s3_key)) === null) missingIds.push(image.id);
      } catch (error) {
        // A per-object failure other than "not found" is not proof the
        // object is gone; leave it unflagged and keep the evidence in logs.
        console.error(`checkProductImageStorage: could not check "${image.s3_key}"`, (error as { name?: string })?.name);
      }
    }),
  );
  return { reachable: true, missingIds };
}
