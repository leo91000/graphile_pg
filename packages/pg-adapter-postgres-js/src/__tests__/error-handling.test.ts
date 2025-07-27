import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPostgresJsPool } from "../index";
import { PgAdapterError } from "@graphile/pg-core";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/test";

describe("postgres.js error handling", () => {
  let connection: ReturnType<typeof createPostgresJsPool>;

  beforeAll(async () => {
    connection = createPostgresJsPool(DATABASE_URL, {
      onnotice: () => {
        // Suppress PostgreSQL notices in tests to avoid cluttering output
      },
    });
  });

  afterAll(async () => {
    await connection.end();
  });

  it("wraps PostgresError as PgAdapterError", async () => {
    try {
      // This should trigger a syntax error
      await connection.query("SELECT * FROM nonexistent_table");
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("42P01"); // undefined_table
      expect((error as PgAdapterError).severity).toBe("ERROR");
      expect((error as PgAdapterError).originalError).toBeDefined();
    }
  });

  it("wraps constraint violation errors", async () => {
    // Create a test table with a unique constraint
    await connection.query("DROP TABLE IF EXISTS test_unique");
    await connection.query(
      "CREATE TABLE test_unique (id INT PRIMARY KEY, name TEXT UNIQUE)",
    );

    try {
      // Insert first row
      await connection.query(
        "INSERT INTO test_unique (id, name) VALUES (1, 'test')",
      );

      // Try to insert duplicate - should trigger unique constraint violation
      await connection.query(
        "INSERT INTO test_unique (id, name) VALUES (2, 'test')",
      );
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("23505"); // unique_violation
      expect((error as PgAdapterError).severity).toBe("ERROR");
      expect((error as PgAdapterError).detail).toContain("already exists");
    } finally {
      await connection.query("DROP TABLE IF EXISTS test_unique");
    }
  });

  it("handles syntax errors", async () => {
    await connection.withPgClient(async (client) => {
      // Test with an invalid query syntax
      try {
        await client.query("INVALID SQL SYNTAX");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // This should be wrapped as PgAdapterError with syntax error code
        expect(error).toBeInstanceOf(PgAdapterError);
        expect((error as PgAdapterError).code).toBe("42601"); // syntax_error
      }
    });
  });

  it("handles errors in transactions", async () => {
    try {
      await connection.withTransaction(async (client) => {
        await client.query("CREATE TABLE test_tx (id INT PRIMARY KEY)");

        // This should fail due to duplicate key
        await client.query("INSERT INTO test_tx VALUES (1)");
        await client.query("INSERT INTO test_tx VALUES (1)");
        expect.fail("Should have thrown an error");
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("23505"); // unique_violation
    } finally {
      // Clean up in case the table was created
      await connection.query("DROP TABLE IF EXISTS test_tx");
    }
  });
});
