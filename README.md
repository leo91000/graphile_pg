# @graphile/pg

PostgreSQL adapter system for Graphile tools. This monorepo provides a common interface for different PostgreSQL client libraries, allowing tools like Graphile Worker to work with various database drivers.

## Packages

- **[@graphile/pg-core](./packages/pg-core)** - Core interfaces and SQL formatting utilities
- **[@graphile/pg-adapter-node-postgres](./packages/pg-adapter-node-postgres)** - Adapter for [node-postgres (pg)](https://github.com/brianc/node-postgres)
- **[@graphile/pg-adapter-postgres-js](./packages/pg-adapter-postgres-js)** - Adapter for [postgres.js](https://github.com/porsager/postgres)
- **[@graphile/pg-adapter-pglite](./packages/pg-adapter-pglite)** - Adapter for [PGLite](https://github.com/electric-sql/pglite)

## Installation

```bash
# For node-postgres users
yarn add @graphile/pg-core @graphile/pg-adapter-node-postgres pg

# For postgres.js users
yarn add @graphile/pg-core @graphile/pg-adapter-postgres-js postgres

# For PGLite users (in-memory/WASM PostgreSQL)
yarn add @graphile/pg-core @graphile/pg-adapter-pglite @electric-sql/pglite
```

## Usage

### Using node-postgres adapter

```typescript
import { createNodePostgresPool } from "@graphile/pg-adapter-node-postgres";

// Create a pool
const pool = createNodePostgresPool({
  connectionString: "postgresql://user:pass@localhost:5432/mydb",
  max: 10,
});

// Execute queries
const result = await pool.query("SELECT * FROM users WHERE active = $1", [
  true,
]);
console.log(result.rows); // Array of row objects
console.log(result.rowCount); // Number of rows returned

// Transaction support
await pool.withTransaction(async (tx) => {
  await tx.query("UPDATE users SET active = false WHERE id = $1", [123]);
  await tx.query("INSERT INTO audit_log (action) VALUES ($1)", [
    "user_deactivated",
  ]);
});

// LISTEN/NOTIFY support
const listener = await pool.listen("my_channel", (payload) => {
  console.log("Received:", payload);
});

// Send notification
await pool.notify("my_channel", "Hello World");

// Stop listening
await listener.unlisten();

// Cleanup
await pool.end();
```

### Using postgres.js adapter

```typescript
import { createPostgresJsPool } from "@graphile/pg-adapter-postgres-js";

// Create a pool
const pool = createPostgresJsPool(
  "postgresql://user:pass@localhost:5432/mydb",
  { max: 10 },
);

// Same interface as node-postgres adapter
const result = await pool.query("SELECT * FROM users WHERE active = $1", [
  true,
]);
console.log(result.rows); // Array of row objects
console.log(result.rowCount); // Number of rows returned

// Execute queries
await pool.query("UPDATE users SET last_seen = NOW() WHERE id = $1", [123]);
```

## Common Interface

All adapters implement a common interface:

- `query(sql, params?)` - Execute query and return results with metadata
- `withTransaction(callback)` - Run operations in a transaction
- `withPgClient(callback)` - Get a client from the pool for multiple operations
- `listen(channel, callback)` - Subscribe to PostgreSQL notifications
- `notify(channel, payload?)` - Send PostgreSQL notifications
- `getPoolSize()` - Get the configured pool size
- `end()` - Close the connection pool

## Development

This is a Yarn workspace monorepo. To get started:

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test
```

## Contributing

Contributions are welcome!

## License

MIT
