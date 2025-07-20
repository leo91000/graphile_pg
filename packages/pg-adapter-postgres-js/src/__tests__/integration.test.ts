import { describe } from "vitest";
import crypto from "node:crypto";
import { createIntegrationTestSuite } from "../../../../test/integration-suite";
import { createPostgresJsPool } from "../index";

const baseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/test";

describe("@graphile/pg-adapter-postgres-js integration tests", () => {
  createIntegrationTestSuite(async () => {
    // Generate unique database name
    const dbName = `test_${crypto.randomUUID().replace(/-/g, "_")}`;
    const testUrl = baseUrl.replace(/\/[^/]*$/, `/${dbName}`);

    // Create the test database
    const setupPool = await createPostgresJsPool(baseUrl);
    // Execute the query without returning results
    await setupPool.execute(`CREATE DATABASE "${dbName}"`);
    await setupPool.end();

    // Connect to the test database
    const pool = await createPostgresJsPool(testUrl);

    // Ensure cleanup on end
    const originalEnd = pool.end.bind(pool);
    pool.end = async () => {
      await originalEnd();
      // Drop the test database
      const cleanupPool = await createPostgresJsPool(baseUrl);
      await cleanupPool.execute(`DROP DATABASE IF EXISTS "${dbName}"`);
      await cleanupPool.end();
    };

    return pool;
  })();
});
