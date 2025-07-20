# @graphile/pg-adapter-postgres-js

PostgreSQL adapter for [postgres.js](https://github.com/porsager/postgres) module.

This adapter implements the `@graphile/pg-core` interfaces using the postgres.js library, providing stream-first access to PostgreSQL databases with excellent performance characteristics.

## Installation

```bash
yarn add @graphile/pg-core @graphile/pg-adapter-postgres-js postgres
```

## Usage

### Basic Connection

```typescript
import { createPostgresJsConnection } from "@graphile/pg-adapter-postgres-js";

const connection = await createPostgresJsConnection(
  "postgresql://user:pass@localhost:5432/mydb",
);
```

### Connection with Options

```typescript
import { createPostgresJsConnection } from "@graphile/pg-adapter-postgres-js";

const connection = await createPostgresJsConnection({
  host: "localhost",
  port: 5432,
  database: "mydb",
  username: "postgres",
  password: "secret",
  max: 10,
  idle_timeout: 30,
});
```

### Streaming Queries

```typescript
// Stream rows one by one for memory efficiency
const result = connection.query("SELECT * FROM large_table");
for await (const row of result) {
  console.log(row);
}

// Process in batches
for await (const batch of result.batches(100)) {
  console.log(`Processing ${batch.length} rows`);
  // Process batch...
}

// Get just the count without loading all rows
const count = await connection.query("SELECT * FROM users").count();
console.log(`Total users: ${count}`);
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

All [postgres.js configuration options](https://github.com/porsager/postgres#all-postgres-options) are supported:

```typescript
const connection = await createPostgresJsConnection({
  host: "localhost",
  port: 5432,
  database: "mydb",
  username: "postgres",
  password: "secret",
  ssl: true,
  max: 20,
  idle_timeout: 30,
  connect_timeout: 60,
});
```

## Performance Benefits

postgres.js offers several performance advantages:

- Native support for arrays and JSON
- Connection pooling with excellent concurrency
- Prepared statement caching
- Pipeline mode support
- Minimal overhead

## License

MIT
