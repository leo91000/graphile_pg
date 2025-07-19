import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPostgresJsPool } from "../index";
import { PgAdapterError } from "@graphile/pg-core";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/test";

describe("postgres.js error handling", () => {
  let connection: Awaited<ReturnType<typeof createPostgresJsPool>>;

  beforeAll(async () => {
    connection = await createPostgresJsPool(DATABASE_URL);
  });

  afterAll(async () => {
    await connection.end();
  });

  it("wraps PostgresError as PgAdapterError", async () => {
    try {
      // This should trigger a syntax error
      const result = connection.query("SELECT * FROM nonexistent_table");
      await result.toArray();
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
    await connection.query("DROP TABLE IF EXISTS test_unique").toArray();
    await connection
      .query("CREATE TABLE test_unique (id INT PRIMARY KEY, name TEXT UNIQUE)")
      .toArray();

    try {
      // Insert first row
      await connection
        .query("INSERT INTO test_unique (id, name) VALUES (1, 'test')")
        .toArray();

      // Try to insert duplicate - should trigger unique constraint violation
      const result = connection.query(
        "INSERT INTO test_unique (id, name) VALUES (2, 'test')",
      );
      await result.toArray();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("23505"); // unique_violation
      expect((error as PgAdapterError).severity).toBe("ERROR");
      expect((error as PgAdapterError).detail).toContain("already exists");
    } finally {
      await connection.query("DROP TABLE IF EXISTS test_unique").toArray();
    }
  });

  it("handles syntax errors", async () => {
    await connection.withPgClient(async (client) => {
      // Test with an invalid query syntax
      try {
        const result = client.query("INVALID SQL SYNTAX");
        await result.toArray();
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
        await client.query("CREATE TABLE test_tx (id INT PRIMARY KEY)").toArray();

        // This should fail due to duplicate key
        await client.query("INSERT INTO test_tx VALUES (1)").toArray();
        const result = client.query("INSERT INTO test_tx VALUES (1)");
        await result.toArray();
        expect.fail("Should have thrown an error");
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("23505"); // unique_violation
    } finally {
      // Clean up in case the table was created
      await connection.query("DROP TABLE IF EXISTS test_tx").toArray();
    }
  });
});
