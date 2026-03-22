import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

export async function getBody(
  nodeType: string,
  slug: string,
  language: "es" | "en" = "es",
): Promise<string | null> {
  const suffix = language === "en" ? "body.en.mdx" : "body.mdx";
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `content/${nodeType}/${slug}/${suffix}`,
    }));
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch {
    return null;
  }
}

export async function putBody(
  nodeType: string,
  slug: string,
  body: string,
  language: "es" | "en" = "es",
): Promise<void> {
  const suffix = language === "en" ? "body.en.mdx" : "body.mdx";
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `content/${nodeType}/${slug}/${suffix}`,
    Body: body,
    ContentType: "text/markdown; charset=utf-8",
  }));
}

export async function deleteBody(nodeType: string, slug: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const prefix = `content/${nodeType}/${slug}/`;
  for (const suffix of ["body.mdx", "body.en.mdx"]) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: `${prefix}${suffix}` })).catch(() => {});
  }
}
