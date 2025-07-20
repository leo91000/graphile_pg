# @graphile/pg-adapter-pglite

PostgreSQL adapter for [PGLite](https://github.com/electric-sql/pglite) - an in-memory PostgreSQL database that runs in WebAssembly.

This adapter implements the `@graphile/pg-core` interfaces using PGLite, enabling you to run PostgreSQL in memory, in the browser, or in Node.js without requiring a separate PostgreSQL server.

## Installation

```bash
yarn add @graphile/pg-core @graphile/pg-adapter-pglite @electric-sql/pglite
```

## Usage

### In-Memory Database

```typescript
import { createPgLiteConnection } from "@graphile/pg-adapter-pglite";

// Create an in-memory database
const connection = await createPgLiteConnection();
```

### Persistent Database

```typescript
import { createPgLiteConnection } from "@graphile/pg-adapter-pglite";

// Create a persistent database (Node.js only)
const connection = await createPgLiteConnection({
  dataDir: "./my-database",
});
```

### Browser Usage

```typescript
import { createPgLiteConnection } from "@graphile/pg-adapter-pglite";

// In the browser - uses IndexedDB for persistence
const connection = await createPgLiteConnection({
  dataDir: "idb://my-database",
});
```

### Basic Operations

```typescript
// Create tables and insert data
await connection.execute(`
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

await connection.execute("INSERT INTO users (name, email) VALUES ($1, $2)", [
  "John Doe",
  "john@example.com",
]);

// Query with streaming results
const result = connection.query("SELECT * FROM users");
for await (const row of result) {
  console.log(row);
}
```

### Transactions

```typescript
await connection.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name, email) VALUES ($1, $2)", [
    "Alice",
    "alice@example.com",
  ]);
  await tx.execute("INSERT INTO users (name, email) VALUES ($1, $2)", [
    "Bob",
    "bob@example.com",
  ]);
});
```

### Extensions

PGLite supports many PostgreSQL extensions:

```typescript
const connection = await createPgLiteConnection({
  extensions: {
    vector: "https://unpkg.com/@electric-sql/pglite/dist/vector.js",
  },
});

// Now you can use vector operations
await connection.execute("CREATE EXTENSION vector");
```

## Use Cases

- **Testing**: Fast, isolated test databases
- **Development**: Local development without PostgreSQL server
- **Browser Applications**: Full PostgreSQL in the browser
- **Edge Computing**: Lightweight PostgreSQL for serverless
- **Demos**: Portable database examples

## Limitations

- No LISTEN/NOTIFY support (PGLite limitation)
- Single connection per database instance
- Memory usage grows with data size for in-memory databases
- Some PostgreSQL features may not be available

## Configuration Options

```typescript
const connection = await createPgLiteConnection({
  dataDir: "./data", // Data directory (optional)
  debug: true, // Enable debug logging
  extensions: {}, // Extensions to load
  relaxedDurability: true, // Faster writes, less durability
});
```

## License

MIT
