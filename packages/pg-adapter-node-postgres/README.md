# @graphile/pg-adapter-node-postgres

PostgreSQL adapter for [node-postgres (pg)](https://github.com/brianc/node-postgres) module.

This adapter implements the `@graphile/pg-core` interfaces using the popular node-postgres library, providing stream-first access to PostgreSQL databases.

## Installation

```bash
yarn add @graphile/pg-core @graphile/pg-adapter-node-postgres pg
```

## Usage

### Basic Connection

```typescript
import { createNodePostgresConnection } from "@graphile/pg-adapter-node-postgres";

const connection = await createNodePostgresConnection(
  "postgresql://user:pass@localhost:5432/mydb",
);
```

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

### Streaming Queries

```typescript
// Stream rows one by one
const result = connection.query("SELECT * FROM large_table");
for await (const row of result) {
  console.log(row);
}

// Process in batches for better performance
for await (const batch of result.batches(100)) {
  console.log(`Processing ${batch.length} rows`);
}
```

### Transactions

```typescript
await connection.transaction(async (tx) => {
  await tx.execute("UPDATE users SET active = false WHERE id = $1", [123]);
  await tx.execute("INSERT INTO audit_log (action) VALUES ($1)", [
    "user_deactivated",
  ]);
});
```

### LISTEN/NOTIFY

```typescript
const listener = await connection.listen("my_channel", (payload) => {
  console.log("Received:", payload);
});

// Send notification
await connection.notify("my_channel", "Hello World");

// Stop listening
await listener.unlisten();
```

## Configuration

All [node-postgres configuration options](https://node-postgres.com/apis/client) are supported:

```typescript
const connection = await createNodePostgresConnection({
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
