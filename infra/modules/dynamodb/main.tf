variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "ttl_attribute" {
  description = "TTL attribute name for audit record expiration"
  type        = string
  default     = "ttl"
}

resource "aws_dynamodb_table" "this" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "updated_at"
    type = "S"
  }

  # GSI1 — Inverted index (SK → PK) for reverse edge queries and audit trail
  global_secondary_index {
    name            = "GSI1"
    key_schema {
      attribute_name = "SK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "PK"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  # GSI2 — Status index for queries like "all seeds not updated in 7 days"
  global_secondary_index {
    name               = "GSI2"
    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "updated_at"
      key_type       = "RANGE"
    }
    projection_type    = "INCLUDE"
    non_key_attributes = ["node_type", "title", "slug"]
  }

  ttl {
    attribute_name = var.ttl_attribute
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

output "table_name" {
  value = aws_dynamodb_table.this.name
}

output "table_arn" {
  value = aws_dynamodb_table.this.arn
}

output "gsi1_name" {
  value = "GSI1"
}

output "gsi2_name" {
  value = "GSI2"
}
