import { describe } from "vitest";
import { createIntegrationTestSuite } from "../../../../test/integration-suite";
import { createPGLitePool } from "../index";

describe("@graphile/pg-adapter-pglite integration tests", () => {
  createIntegrationTestSuite(async () => {
    // PGLite uses an in-memory database by default
    // Each instance is isolated, so no cleanup is needed
    const pool = createPGLitePool();

    return pool;
  })();
});
