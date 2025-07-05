import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPostgresJsConnection } from "../index";
import { PgAdapterError } from "@graphile/pg-core";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/test";

describe("postgres.js error handling", () => {
  let connection: Awaited<ReturnType<typeof createPostgresJsConnection>>;

  beforeAll(async () => {
    connection = await createPostgresJsConnection(DATABASE_URL);
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

  it("preserves non-PostgresError errors", async () => {
    const client = await connection.reserve();
    try {
      // Force an error by trying to query after release
      client.release();
      const result = client.query("SELECT 1");
      await result.toArray();
      expect.fail("Should have thrown an error");
    } catch (error) {
      // This should not be wrapped as PgAdapterError
      expect(error).not.toBeInstanceOf(PgAdapterError);
    }
  });

  it("handles errors in transactions", async () => {
    const client = await connection.reserve();
    try {
      await client.query("BEGIN").toArray();
      await client.query("CREATE TABLE test_tx (id INT PRIMARY KEY)").toArray();

      // This should fail due to duplicate key
      await client.query("INSERT INTO test_tx VALUES (1)").toArray();
      const result = client.query("INSERT INTO test_tx VALUES (1)");
      await result.toArray();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(PgAdapterError);
      expect((error as PgAdapterError).code).toBe("23505"); // unique_violation
    } finally {
      await client.query("ROLLBACK").toArray();
      await client.query("DROP TABLE IF EXISTS test_tx").toArray();
      client.release();
    }
  });
});
