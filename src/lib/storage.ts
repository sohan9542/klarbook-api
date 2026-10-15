import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true,
});

export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

export function presignDownload(key: string, filename: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn: 300 },
  );
}

export async function objectSize(key: string) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  return head.ContentLength ?? 0;
}