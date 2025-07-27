import { beforeAll, afterAll, describe, it, expect, beforeEach } from "vitest";
import { PgPool } from "../packages/pg-core/src";

/**
 * Minimal integration test suite for PostgreSQL adapters
 */
export function createIntegrationTestSuite(
  getConnection: () => Promise<PgPool>,
) {
  return (): void => {
    let sql: PgPool;

    beforeAll(async () => {
      sql = await getConnection();
    });

    afterAll(async () => {
      await sql.end();
    });

    describe("Basic Operations", () => {
      it("executes queries", async () => {
        const result = await sql.query<{ num: number }>("SELECT 1 as num");
        expect(result.rows).toEqual([{ num: 1 }]);
      });

      it("handles parameters", async () => {
        const result = await sql.query<{ sum: number }>(
          "SELECT $1::int + $2::int as sum",
          [5, 10],
        );
        expect(result.rows[0].sum).toBe(15);
      });

      it("handles multiple rows", async () => {
        const result = await sql.query<{ n: number }>(
          "SELECT generate_series(1, 3) as n",
        );
        const values = result.rows.map((row) => row.n);
        expect(values).toEqual([1, 2, 3]);
      });
    });

    describe("Transactions", () => {
      beforeEach(async () => {
        await sql.query("DROP TABLE IF EXISTS test");
        await sql.query("CREATE TABLE test (id INT PRIMARY KEY, name TEXT)");
      });

      it("commits data", async () => {
        await sql.withTransaction(async (tx) => {
          await tx.query("INSERT INTO test VALUES (1, 'Alice')");
        });

        const result = await sql.query<{ name: string }>(
          "SELECT name FROM test WHERE id = 1",
        );
        expect(result.rows[0].name).toBe("Alice");
      });

      it("rolls back on error", async () => {
        try {
          await sql.withTransaction(async (tx) => {
            await tx.query("INSERT INTO test VALUES (1, 'Bob')");
            throw new Error("Rollback");
          });
        } catch (e) {
          // Expected
        }

        const result = await sql.query("SELECT COUNT(*) as count FROM test");
        // PGLite returns numbers as numbers, while pg/postgres.js return them as strings
        expect(String(result.rows[0].count)).toBe("0");
      });
    });

    describe("LISTEN/NOTIFY", () => {
      it("receives notifications", async () => {
        const messages: string[] = [];

        const { unlisten } = await sql.listen("test_channel", (payload) => {
          messages.push(payload || "null");
        });

        await sql.notify("test_channel", "hello");
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(messages).toEqual(["hello"]);
        await unlisten();
      });
    });
  };
}
