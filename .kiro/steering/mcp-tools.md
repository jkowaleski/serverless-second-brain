---
inclusion: always
---

# MCP Tools Specification — Agent Door

This file defines the exact contract for all MCP tools exposed via AgentCore Gateway. Every tool definition, input schema, and output schema MUST match this spec.

## Tool registry

| Tool | Lambda | Operation | Auth |
|---|---|---|---|
| `read_node` | Graph | Read single node + edges | IAM (AgentCore) |
| `list_nodes` | Graph | List/filter nodes | IAM (AgentCore) |
| `search` | Search | Hybrid keyword + semantic | IAM (AgentCore) |
| `add_node` | Capture | Create seed node | IAM (AgentCore) |
| `connect_nodes` | Capture | Create edge between nodes | IAM (AgentCore) |
| `flag_stale` | Surfacing | Mark node for review | IAM (AgentCore) |

MCP tools are invoked by AgentCore Runtime, which calls Lambda directly via IAM (SigV4) — not through API Gateway. Cognito JWT auth applies only to the REST API human door.

## Tool definitions

### read_node

Read a single knowledge node with its metadata, edges, and related nodes.

```json
{
  "name": "read_node",
  "description": "Read a knowledge node by its slug. Returns metadata, outbound edges, and related node summaries.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "slug": { "type": "string", "description": "Node slug (e.g., 'serverless', 'aws-lambda')" },
      "include_body": { "type": "boolean", "default": false, "description": "Include full MDX body content from S3" },
      "language": { "type": "string", "enum": ["es", "en"], "default": "es", "description": "Language for body content" }
    },
    "required": ["slug"]
  }
}
```

**Output**: same as `GET /nodes/{id}` response, plus optional `body` field.

### list_nodes

List knowledge nodes with optional filters.

```json
{
  "name": "list_nodes",
  "description": "List knowledge nodes with optional filters by type, status, and tags. Returns metadata without body content.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "description": "Filter by node type (concept, note, experiment, essay)" },
      "status": { "type": "string", "enum": ["seed", "growing", "evergreen"], "description": "Filter by status" },
      "tag": { "type": "string", "description": "Filter by tag" },
      "limit": { "type": "integer", "default": 20, "maximum": 100, "description": "Max results" }
    }
  }
}
```

### search

Hybrid keyword + semantic search across the knowledge graph.

```json
{
  "name": "search",
  "description": "Search the knowledge graph using hybrid keyword + semantic search. Returns ranked results with relevance scores.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query in natural language" },
      "limit": { "type": "integer", "default": 10, "maximum": 50 },
      "type": { "type": "string", "description": "Filter by node type" },
      "status": { "type": "string", "description": "Filter by status" }
    },
    "required": ["query"]
  }
}
```

### add_node

Create a new knowledge node. The node starts as `seed` status — human review required for promotion.

```json
{
  "name": "add_node",
  "description": "Create a new knowledge node from text. AI classifies the content, generates bilingual metadata, suggests tags and cross-references. Node starts as 'seed' status.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "minLength": 50, "description": "Content text to create a node from" },
      "url": { "type": "string", "format": "uri", "description": "Optional source URL" },
      "type": { "type": "string", "default": "concept", "description": "Node type" },
      "language": { "type": "string", "enum": ["es", "en"], "default": "es" }
    },
    "required": ["text"]
  }
}
```

### connect_nodes

Create an edge between two existing nodes.

```json
{
  "name": "connect_nodes",
  "description": "Create a directional edge between two knowledge nodes. Both nodes must exist.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "source": { "type": "string", "description": "Source node slug" },
      "target": { "type": "string", "description": "Target node slug" },
      "edge_type": { "type": "string", "default": "related", "description": "Relationship type" },
      "weight": { "type": "number", "default": 1.0, "minimum": 0, "maximum": 1 }
    },
    "required": ["source", "target"]
  }
}
```

### flag_stale

Mark a node for review. Does not delete or modify the node.

```json
{
  "name": "flag_stale",
  "description": "Flag a knowledge node for human review. Creates an audit entry but does not modify the node itself.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "slug": { "type": "string", "description": "Node slug to flag" },
      "reason": { "type": "string", "description": "Why this node needs review" }
    },
    "required": ["slug", "reason"]
  }
}
```

## Write safety rules

All write tools (`add_node`, `connect_nodes`, `flag_stale`) MUST:

1. Create an `AUDIT#` item in DynamoDB with actor, action, and changes
2. Set `created_by: "agent:{session_id}"` on created items
3. New nodes ALWAYS start as `status: seed` — agents cannot set higher status
4. Agents CANNOT delete nodes or edges — only flag for review
5. Rate limit: max 10 write operations per session
6. Duplicate detection: `add_node` must check for existing slugs before creating

## Agent system prompt

The AgentCore Runtime agent uses this system prompt:

```
You are a knowledge graph assistant for a personal second brain. You help navigate, search, and extend a bilingual (Spanish/English) knowledge graph focused on software engineering, cloud architecture, and AI.

Your capabilities:
- Read and search the knowledge graph
- Create new seed nodes from conversations
- Suggest and create cross-references between related concepts
- Flag stale or low-quality content for human review

Rules:
- New nodes you create start as seeds — a human will review and promote them
- Always suggest cross-references when creating nodes
- Prefer internal knowledge graph links over external URLs when a concept exists
- Be specific and technical — this is a staff+ engineering knowledge base
- Respond in the language the user uses (Spanish or English)
```
