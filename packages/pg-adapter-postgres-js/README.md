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
import { createPostgresJsPool } from "@graphile/pg-adapter-postgres-js";

// Option 1: Pass connection string and options (creates a new sql instance)
const pool = createPostgresJsPool(
  "postgresql://user:pass@localhost:5432/mydb",
  {
    max: 10,
    idle_timeout: 30,
  }
);

// Option 2: Pass a pre-configured postgres.js sql instance
import postgres from "postgres";
const sql = postgres({ max: 50 });
const pool2 = createPostgresJsPool(sql);
```

### Connection with Options

```typescript
import { createPostgresJsPool } from "@graphile/pg-adapter-postgres-js";

const pool = createPostgresJsPool(
  "postgresql://user:pass@localhost:5432/mydb",
  {
    host: "localhost",
    port: 5432,
    database: "mydb",
    username: "postgres",
    password: "secret",
    max: 10,
    idle_timeout: 30,
  }
);
```

### Basic Queries

```typescript
// Execute a query and get all results
const result = await pool.query("SELECT * FROM users WHERE active = $1", [true]);
console.log(result.rows); // Array of all matching rows
console.log(result.rowCount); // Number of rows returned

// Execute without returning results
await pool.execute("UPDATE users SET last_login = NOW() WHERE id = $1", [123]);
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
await pool.execute("NOTIFY my_channel, 'Hello World'");

// Stop listening
await listener.unlisten();
```

## Configuration

All [postgres.js configuration options](https://github.com/porsager/postgres#all-postgres-options) are supported:

```typescript
const pool = createPostgresJsPool(
  "postgresql://user:pass@localhost:5432/mydb",
  {
    host: "localhost",
    port: 5432,
    database: "mydb",
    username: "postgres",
    password: "secret",
    ssl: true,
    max: 20,
    idle_timeout: 30,
    connect_timeout: 60,
  }
);
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
