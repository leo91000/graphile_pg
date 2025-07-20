# @graphile/pg-format

A modern TypeScript implementation of PostgreSQL's `format()` function to safely create dynamic SQL queries. This package helps prevent SQL injection by properly escaping identifiers and literals.

## Installation

```bash
npm install @graphile/pg-format
# or
yarn add @graphile/pg-format
```

## Usage

```typescript
import format from '@graphile/pg-format';

// Basic usage
const sql = format('SELECT %I FROM %I WHERE %I = %L', 'name', 'users', 'id', 123);
// => SELECT name FROM users WHERE id = '123'

// Using positional arguments
const sql2 = format('SELECT %2$I FROM %1$I', 'users', 'name');
// => SELECT name FROM users

// Escaping identifiers
const sql3 = format('SELECT %I FROM users', 'user-name');
// => SELECT "user-name" FROM users

// Escaping literals
const sql4 = format("INSERT INTO users (name) VALUES (%L)", "O'Brien");
// => INSERT INTO users (name) VALUES ('O''Brien')
```

## Format Specifiers

- `%I` - Identifier (table names, column names, etc.)
- `%L` - Literal (values)
- `%s` - String (unquoted)
- `%%` - Literal percent sign

## API

### `format(fmt: string, ...args: any[]): string`

The main function for formatting SQL strings.

### `ident(value: any): string`

Escapes and quotes identifiers. Also available as `quoteIdent`.

### `literal(value: any): string`

Escapes and quotes literal values. Also available as `quoteLiteral`.

### `string(value: any): string`

Formats a value as a simple string without quotes. Also available as `quoteString`.

### `withArray(fmt: string, values: any[]): string`

Like `format()` but takes an array of values instead of variadic arguments.

### `config(options: FormatConfig): void`

Configure custom format patterns:

```typescript
config({
  pattern: {
    ident: 'i',    // Use %i instead of %I
    literal: 'l',  // Use %l instead of %L
    string: 'S'    // Use %S instead of %s
  }
});
```

## Type Support

The package properly handles:
- Strings (with quote escaping)
- Numbers
- Booleans (`true`/`false` → `'t'`/`'f'`)
- Dates (formatted as PostgreSQL timestamps)
- Buffers (formatted as bytea hex strings)
- Arrays (including nested arrays)
- Objects (formatted as JSONB)
- `null`/`undefined` → `NULL`

## Examples

### Building Dynamic Queries

```typescript
const columns = ['id', 'name', 'email'];
const table = 'users';
const conditions = { name: "John", age: 30 };

const sql = format(
  'SELECT %s FROM %I WHERE %s',
  columns.map(c => format('%I', c)).join(', '),
  table,
  Object.entries(conditions)
    .map(([key, value]) => format('%I = %L', key, value))
    .join(' AND ')
);
// => SELECT id, name, email FROM users WHERE name = 'John' AND age = '30'
```

### Safe Table Creation

```typescript
const tableName = 'user_data';
const columns = [
  { name: 'id', type: 'SERIAL PRIMARY KEY' },
  { name: 'name', type: 'TEXT NOT NULL' },
  { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' }
];

const sql = format(
  'CREATE TABLE %I (%s)',
  tableName,
  columns.map(col => format('%I %s', col.name, col.type)).join(', ')
);
// => CREATE TABLE user_data (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())
```

## Differences from node-pg-format

This is a modern TypeScript rewrite of the original `pg-format` package with:
- Full TypeScript support with proper types
- Modern ES modules support
- Cleaner codebase using modern JavaScript features
- Same API for compatibility

## License

MIT