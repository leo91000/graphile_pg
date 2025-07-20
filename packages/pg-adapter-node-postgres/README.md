# @graphile/pg-adapter-node-postgres

PostgreSQL adapter for [node-postgres (pg)](https://github.com/brianc/node-postgres) module.

This adapter implements the `@graphile/pg-core` interfaces using the popular node-postgres library, providing stream-first access to PostgreSQL databases.

## Installation

```bash
yarn add @graphile/pg-core @graphile/pg-adapter-node-postgres pg
```

## Usage

### Connection Pool

```typescript
import { createNodePostgresPool } from "@graphile/pg-adapter-node-postgres";

// Option 1: Pass configuration (creates a new pool)
const pool = createNodePostgresPool({
  connectionString: "postgresql://user:pass@localhost:5432/mydb",
  max: 10,
});

// Option 2: Pass a pre-configured pg Pool instance
import { Pool } from "pg";
const pgPool = new Pool({ max: 50 });
const pool2 = createNodePostgresPool(pgPool);
```

### Basic Queries

```typescript
// Execute a query and get all results
const result = await pool.query("SELECT * FROM users WHERE active = $1", [true]);
console.log(result.rows); // Array of all matching rows
console.log(result.rowCount); // Number of rows returned
```

### Transactions

```typescript
await pool.withTransaction(async (tx) => {
  await tx.execute("UPDATE users SET active = false WHERE id = $1", [123]);
  await tx.execute("INSERT INTO audit_log (action) VALUES ($1)", [
    "user_deactivated",
  ]);
});
```

### LISTEN/NOTIFY

```typescript
const listener = await pool.listen("my_channel", (payload) => {
  console.log("Received:", payload);
});

// Send notification
await pool.notify("my_channel", "Hello World");

// Stop listening
await listener.unlisten();
```

## Configuration

All [node-postgres configuration options](https://node-postgres.com/apis/pool) are supported:

```typescript
const pool = createNodePostgresPool({
  host: "localhost",
  port: 5432,
  database: "mydb",
  user: "postgres",
  password: "secret",
  ssl: true,
  max: 20,
  idleTimeoutMillis: 30000,
});
```

## License

MIT
