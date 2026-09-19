import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { AWS_REGION } from "./env";

// Region only — no `credentials` option. The AWS SDK default credential
// provider chain resolves credentials on its own: an AWS_PROFILE named
// profile in local development, an EC2 IAM Role/Instance Profile in
// production. This must stay code-identical across both environments.
export const s3Client = new S3Client({
  region: AWS_REGION,
});
