"""
Second Brain MCP Server — AgentCore Runtime

Exposes knowledge graph operations as MCP tools.
Deployed to AgentCore Runtime via code_configuration (Python 3.13).
"""

import json
import os
import boto3
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(host="0.0.0.0", stateless_http=True)

lambda_client = boto3.client("lambda", region_name=os.environ.get("AWS_REGION", "us-east-1"))
PROJECT = os.environ.get("PROJECT_NAME", "ssb")
ENV = os.environ.get("ENVIRONMENT", "dev")
MAX_WRITES_PER_SESSION = int(os.environ.get("MAX_WRITES_PER_SESSION", "10"))
ACTOR = "agent:runtime"

# Session-level write counter (reset per runtime instance)
_write_count = 0


def _check_write_limit():
    global _write_count
    _write_count += 1
    if _write_count > MAX_WRITES_PER_SESSION:
        raise ValueError(f"Write limit exceeded: {MAX_WRITES_PER_SESSION} writes per session")


def invoke_lambda(function_suffix: str, payload: dict) -> dict:
    """Invoke a Lambda function and return parsed response."""
    response = lambda_client.invoke(
        FunctionName=f"{PROJECT}-{ENV}-{function_suffix}",
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )
    result = json.loads(response["Payload"].read())
    if "body" in result:
        return json.loads(result["body"]) if isinstance(result["body"], str) else result["body"]
    return result


@mcp.tool()
def read_node(slug: str) -> str:
    """Read a knowledge node by its slug. Returns metadata, edges, and related nodes."""
    result = invoke_lambda("graph", {
        "pathParameters": {"id": slug},
        "resource": "/nodes/{id}",
        "httpMethod": "GET",
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def list_nodes(type: str = "", status: str = "", tag: str = "", limit: int = 20) -> str:
    """List knowledge nodes with optional filters by type, status, and tag."""
    params = {k: v for k, v in {"type": type, "status": status, "tag": tag, "limit": str(limit)}.items() if v}
    result = invoke_lambda("graph", {
        "queryStringParameters": params,
        "resource": "/graph",
        "httpMethod": "GET",
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def search(query: str, limit: int = 10) -> str:
    """Search the knowledge graph using hybrid keyword + semantic search."""
    result = invoke_lambda("search", {
        "queryStringParameters": {"q": query, "limit": str(limit)},
        "httpMethod": "GET",
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def add_node(text: str, url: str = "", type: str = "concept", language: str = "es") -> str:
    """Create a new knowledge node from text. AI classifies and generates metadata. Starts as 'seed' status."""
    _check_write_limit()
    result = invoke_lambda("capture", {
        "body": json.dumps({"text": text, "url": url, "type": type, "language": language, "actor": ACTOR}),
        "httpMethod": "POST",
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def connect_nodes(source: str, target: str, edge_type: str = "related", weight: float = 1.0) -> str:
    """Create an edge between two existing knowledge nodes."""
    _check_write_limit()
    result = invoke_lambda("connect", {
        "source": source,
        "target": target,
        "edge_type": edge_type,
        "weight": weight,
        "actor": ACTOR,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
def flag_stale(slug: str, reason: str) -> str:
    """Flag a knowledge node for human review. Does not modify the node."""
    _check_write_limit()
    result = invoke_lambda("flag", {
        "slug": slug,
        "reason": reason,
        "actor": ACTOR,
    })
    return json.dumps(result, indent=2)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
