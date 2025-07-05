import { describe } from "vitest";
import crypto from "node:crypto";
import { createIntegrationTestSuite } from "../../../../test/integration-suite";
import { createPostgresJsConnection } from "../index";

const baseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/test";

describe("@graphile/pg-adapter-postgres-js integration tests", () => {
  createIntegrationTestSuite(async () => {
    // Generate unique database name
    const dbName = `test_${crypto.randomUUID().replace(/-/g, "_")}`;
    const testUrl = baseUrl.replace(/\/[^/]*$/, `/${dbName}`);

    // Create the test database
    const setupConnection = await createPostgresJsConnection(baseUrl);
    // Since PgQueryResult extends Promise, we can await it directly
    await setupConnection.query(`CREATE DATABASE "${dbName}"`);
    await setupConnection.end();

    // Connect to the test database
    const connection = await createPostgresJsConnection(testUrl);

    // Ensure cleanup on end
    const originalEnd = connection.end.bind(connection);
    connection.end = async () => {
      await originalEnd();
      // Drop the test database
      const cleanupConnection = await createPostgresJsConnection(baseUrl);
      await cleanupConnection.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await cleanupConnection.end();
    };

    return connection;
  })();
});
