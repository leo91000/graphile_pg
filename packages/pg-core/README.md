# @graphile/pg-core

Core PostgreSQL adapter interfaces and utilities for Graphile tools.

This package provides the foundational interfaces and types that all PostgreSQL adapters implement, enabling a consistent stream-first API across different PostgreSQL client libraries. It also includes SQL formatting utilities for safely building dynamic SQL queries.

## Installation

```bash
yarn add @graphile/pg-core
```

## Key Interfaces

- `PgConnection` - Main database connection interface
- `PgQueryResult` - Stream-first query result interface
- `PgTransaction` - Transaction interface
- `PgListener` - LISTEN/NOTIFY interface
- `PgAdapterError` - Base error class for adapter-specific errors

## Stream-First Design

The core design philosophy is stream-first for memory efficiency:

```typescript
// Process rows one by one
for await (const row of result) {
  console.log(row);
}

// Process in batches
for await (const batch of result.batches(100)) {
  processBatch(batch);
}

// Get count without loading all rows
const count = await result.count();
```

## SQL Formatting Utilities

The package includes SQL formatting functions to safely build dynamic SQL queries:

```typescript
import { format, ident, literal } from "@graphile/pg-core";

// Format with placeholders
const query = format("SELECT * FROM %I WHERE id = %L", "users", 123);
// Result: SELECT * FROM users WHERE id = '123'

// Quote identifiers
const table = ident("my-table"); // Result: "my-table"

// Quote literals
const value = literal("O'Brien"); // Result: 'O''Brien'
```

## Usage

This package is typically not used directly. Instead, use one of the adapter packages:

- `@graphile/pg-adapter-node-postgres` - For node-postgres (pg)
- `@graphile/pg-adapter-postgres-js` - For postgres.js
- `@graphile/pg-adapter-pglite` - For PGLite

## License

MIT
