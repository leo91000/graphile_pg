# @graphile/pg-core

Core PostgreSQL adapter interfaces and utilities for Graphile tools.

This package provides the foundational interfaces and types that all PostgreSQL adapters implement, enabling a consistent API across different PostgreSQL client libraries. It also includes SQL formatting utilities for safely building dynamic SQL queries.

## Installation

```bash
yarn add @graphile/pg-core
```

## Key Interfaces

- `PgConnection` - Main database connection interface
- `PgQueryResult` - Query result interface with metadata
- `PgTransaction` - Transaction interface
- `PgListener` - LISTEN/NOTIFY interface
- `PgAdapterError` - Base error class for adapter-specific errors

## Query Results

Query results include metadata and rows:

```typescript
const result = await pool.query("SELECT * FROM users WHERE active = $1", [
  true,
]);

console.log(result.rows); // Array of row objects
console.log(result.rowCount); // Number of rows returned
console.log(result.command); // SQL command (e.g., "SELECT")
console.log(result.fields); // Column metadata (if available)
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
