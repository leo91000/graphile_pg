# @graphile/pg

PostgreSQL adapter system for Graphile tools. This monorepo provides a common interface for different PostgreSQL client libraries, allowing tools like Graphile Worker to work with various database drivers.

## Packages

- **[@graphile/pg-core](./packages/pg-core)** - Core interfaces with stream-first design
- **[@graphile/pg-adapter-pg](./packages/pg-adapter-pg)** - Adapter for [node-postgres (pg)](https://github.com/brianc/node-postgres)
- **[@graphile/pg-adapter-postgres-js](./packages/pg-adapter-postgres-js)** - Adapter for [postgres.js](https://github.com/porsager/postgres)

## Installation

```bash
# For node-postgres users
yarn add @graphile/pg-core @graphile/pg-adapter-pg pg

# For postgres.js users
yarn add @graphile/pg-core @graphile/pg-adapter-postgres-js postgres
```

## Usage

### Using node-postgres adapter

```typescript
import { createNodePostgresConnection } from "@graphile/pg-adapter-pg";

// Create a connection
const connection = await createNodePostgresConnection(
  "postgresql://user:pass@localhost:5432/mydb"
);

// Execute queries with streaming results
const result = connection.query('SELECT * FROM users WHERE active = $1', [true]);

// Process rows one by one
for await (const row of result) {
  console.log(row);
}

// Or collect all rows into array
const allRows = await result.toArray();

// Transaction support
await connection.transaction(async (tx) => {
  await tx.execute('UPDATE users SET active = false WHERE id = $1', [123]);
  await tx.execute('INSERT INTO audit_log (action) VALUES ($1)', ['user_deactivated']);
});

// LISTEN/NOTIFY support
const listener = await connection.listen('my_channel', (payload) => {
  console.log('Received:', payload);
});

// Stop listening
await listener.unlisten();

// Cleanup
await connection.close();
```

### Using postgres.js adapter

```typescript
import { createPostgresJsConnection } from "@graphile/pg-adapter-postgres-js";

// Create a connection
const connection = await createPostgresJsConnection(
  "postgresql://user:pass@localhost:5432/mydb"
);

// Same interface as node-postgres adapter
const result = connection.query('SELECT * FROM large_table');

// Process in batches for memory efficiency
for await (const batch of result.batches(100)) {
  console.log(`Processing ${batch.length} rows`);
  // Process batch...
}

// Get just the count
const count = await connection.query('SELECT * FROM users').count();
console.log(`Total users: ${count}`);
```

## Stream-First Interface

This adapter system uses a stream-first design for memory efficiency:

- `PgConnection.query()` - Returns a `PgQueryResult` with async iteration
- `PgQueryResult[Symbol.asyncIterator]()` - Process rows one by one
- `PgQueryResult.batches(size)` - Process rows in batches
- `PgQueryResult.toArray()` - Collect all rows (for small result sets)
- `PgQueryResult.count()` - Get row count (consumes the stream)
- `PgConnection.execute()` - Execute without returning results
- `PgConnection.notify()` - Send NOTIFY messages
- `PgConnection.transaction()` - Transaction support
- `PgConnection.listen()` - LISTEN/NOTIFY support
- `PgConnection.close()` - Close the connection

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

Contributions are welcome! The postgres.js adapter is not yet implemented and would be a great first contribution.

## License

MIT