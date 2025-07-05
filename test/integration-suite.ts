import { beforeAll, afterAll, describe, it, expect, beforeEach } from "vitest";
import { PgConnection, PgHelper } from "../packages/pg-core/src";

/**
 * Minimal integration test suite for PostgreSQL adapters
 */
export function createIntegrationTestSuite(
  getConnection: () => Promise<PgConnection>,
) {
  return (): void => {
    let sql: PgHelper;

    beforeAll(async () => {
      const connection = await getConnection();
      sql = new PgHelper(connection);
    });

    afterAll(async () => {
      await sql.end();
    });

    describe("Basic Operations", () => {
      it("executes queries", async () => {
        const result = sql.query<{ num: number }>("SELECT 1 as num");
        const rows = await result.toArray();
        expect(rows).toEqual([{ num: 1 }]);
      });

      it("handles parameters", async () => {
        const result = sql.query<{ sum: number }>(
          "SELECT $1::int + $2::int as sum",
          [5, 10],
        );
        const rows = await result.toArray();
        expect(rows[0].sum).toBe(15);
      });

      it("streams results", async () => {
        const result = sql.query<{ n: number }>(
          "SELECT generate_series(1, 3) as n",
        );
        const values: number[] = [];
        for await (const row of result) {
          values.push(row.n);
        }
        expect(values).toEqual([1, 2, 3]);
      });
    });

    describe("Transactions", () => {
      beforeEach(async () => {
        await sql.execute("DROP TABLE IF EXISTS test");
        await sql.execute("CREATE TABLE test (id INT PRIMARY KEY, name TEXT)");
      });

      it("commits data", async () => {
        await sql.begin(async (tx) => {
          await tx.execute("INSERT INTO test VALUES (1, 'Alice')");
        });

        const result = sql.query<{ name: string }>(
          "SELECT name FROM test WHERE id = 1",
        );
        const rows = await result.toArray();
        expect(rows[0].name).toBe("Alice");
      });

      it("rolls back on error", async () => {
        try {
          await sql.begin(async (tx) => {
            await tx.execute("INSERT INTO test VALUES (1, 'Bob')");
            throw new Error("Rollback");
          });
        } catch (e) {
          // Expected
        }

        const result = sql.query("SELECT COUNT(*) as count FROM test");
        const rows = await result.toArray();
        expect(rows[0].count).toBe("0");
      });

      it("handles savepoints", async () => {
        await sql.begin(async (tx) => {
          await tx.execute("INSERT INTO test VALUES (1, 'Alice')");

          try {
            await tx.savepoint(async (sp) => {
              await sp.execute("INSERT INTO test VALUES (2, 'Bob')");
              throw new Error("Rollback savepoint");
            });
          } catch (e) {
            // Expected
          }

          await tx.execute("INSERT INTO test VALUES (3, 'Charlie')");
        });

        const result = sql.query<{ id: number }>(
          "SELECT id FROM test ORDER BY id",
        );
        const rows = await result.toArray();
        expect(rows.map((r) => r.id)).toEqual([1, 3]);
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
        unlisten();
      });
    });
  };
}
