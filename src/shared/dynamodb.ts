import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { MetaItem, EdgeItem, AuditItem } from "./types.js";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;

export async function getNode(slug: string): Promise<MetaItem | null> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `NODE#${slug}`, SK: "META" },
  }));
  return (result.Item as MetaItem) ?? null;
}

export async function putNode(item: MetaItem): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(PK)",
  }));
}

export async function putEdge(item: EdgeItem): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));
}

export async function putAudit(item: AuditItem): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));
}

export async function listNodeSlugs(limit = 200): Promise<string[]> {
  const slugs: string[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "META" },
      ProjectionExpression: "slug",
      ExclusiveStartKey: lastKey,
      Limit: Math.min(limit - slugs.length, 100),
    }));
    for (const item of result.Items ?? []) {
      slugs.push((item as { slug: string }).slug);
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey && slugs.length < limit);

  return slugs;
}
