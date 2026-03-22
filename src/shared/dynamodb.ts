import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, BatchGetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { MetaItem, EdgeItem, EmbedItem, AuditItem } from "./types.js";

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

export async function putEmbed(item: EmbedItem): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

export async function getNodeEdges(slug: string): Promise<EdgeItem[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": `NODE#${slug}`, ":prefix": "EDGE#" },
  }));
  return (result.Items ?? []) as EdgeItem[];
}

export async function getInboundEdges(slug: string): Promise<EdgeItem[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "SK = :sk",
    ExpressionAttributeValues: { ":sk": `EDGE#${slug}` },
  }));
  return (result.Items ?? []) as EdgeItem[];
}

export async function getAllNodes(): Promise<MetaItem[]> {
  const items: MetaItem[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "META" },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []) as MetaItem[]);
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

export async function getAllEmbeddings(): Promise<EmbedItem[]> {
  const items: EmbedItem[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "EMBED" },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []) as EmbedItem[]);
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

export async function getAllEdges(): Promise<EdgeItem[]> {
  const items: EdgeItem[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":prefix": "EDGE#" },
      ProjectionExpression: "PK, SK, edge_type, weight",
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []) as EdgeItem[]);
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

export async function batchGetNodes(slugs: string[]): Promise<MetaItem[]> {
  if (slugs.length === 0) return [];
  const keys = [...new Set(slugs)].map((s) => ({ PK: `NODE#${s}`, SK: "META" }));
  const items: MetaItem[] = [];

  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const result = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: batch } },
    }));
    items.push(...((result.Responses?.[TABLE_NAME] ?? []) as MetaItem[]));
  }
  return items;
}

export async function bumpCacheVersion(): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { PK: "SYSTEM#config", SK: "CACHE_VERSION", version: Date.now().toString() },
  }));
}

export async function getCacheVersion(): Promise<string> {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: "SYSTEM#config", SK: "CACHE_VERSION" },
    ProjectionExpression: "version",
  }));
  return (res.Item?.version as string) ?? "";
}

export async function updateNodeVisibility(slug: string, visibility: "public" | "private"): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `NODE#${slug}`, SK: "META" },
    UpdateExpression: "SET visibility = :v, updated_at = :now",
    ExpressionAttributeValues: { ":v": visibility, ":now": new Date().toISOString() },
    ConditionExpression: "attribute_exists(PK)",
  }));
}

export async function updateNodeMeta(slug: string, fields: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":now": now };
  const parts = ["updated_at = :now"];

  for (const [key, val] of Object.entries(fields)) {
    const attr = `#${key}`;
    const placeholder = `:${key}`;
    names[attr] = key;
    values[placeholder] = val;
    parts.push(`${attr} = ${placeholder}`);
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `NODE#${slug}`, SK: "META" },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: values,
    ConditionExpression: "attribute_exists(PK)",
  }));
}

export async function deleteNode(slug: string): Promise<void> {
  // Get all items for this node (META, EDGE#*, EMBED)
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `NODE#${slug}` },
    ProjectionExpression: "PK, SK",
  }));
  if (!res.Items?.length) return;

  // Delete in batches of 25
  const items = res.Items as { PK: string; SK: string }[];
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    const { BatchWriteCommand } = await import("@aws-sdk/lib-dynamodb");
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map((item) => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        })),
      },
    }));
  }
}
