import "server-only";

// Credentials are never read here — the AWS SDK default credential provider
// chain resolves them (AWS_PROFILE locally, an EC2 IAM Role/Instance Profile
// in production). Only plain configuration lives in this module.
const region = process.env.AWS_REGION;
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;

if (!region || !bucketName || !publicBaseUrl) {
  throw new Error(
    "Missing AWS S3 environment variables. Copy .env.example to .env.local and fill in AWS_REGION, AWS_S3_BUCKET_NAME, and S3_PUBLIC_BASE_URL.",
  );
}

export const AWS_REGION = region;
export const S3_BUCKET_NAME = bucketName;
export const S3_PUBLIC_BASE_URL = publicBaseUrl.replace(/\/+$/, "");
