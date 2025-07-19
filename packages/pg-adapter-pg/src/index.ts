/**
 * Adapter for the `pg` module (node-postgres).
 * https://github.com/brianc/node-postgres
 */

import type { Pool, PoolClient, PoolConfig } from "pg";
import pg from "pg";
import type {
  PgConnection,
  PgClient,
  PgQueryResult,
  MaybeRow,
  PgPool as PgPoolAdapter,
} from "@graphile/pg-core";
import { PgAdapterError, createPgPool } from "@graphile/pg-core";
import { createListenClient } from "./listen";
import { createPoolQueryResult, createClientQueryResult } from "./query-result";

export type { ListenError } from "./listen";

/**
 * Create a PostgreSQL connection using node-postgres (pg)
 */
export async function createNodePostgresPool(
  poolConfig?: PoolConfig,
): Promise<PgPoolAdapter> {
  const pool = new pg.Pool(poolConfig) as Pool;
  const connection = createNodePostgresConnection(pool);
  return createPgPool(connection);
}

function wrapError(error: unknown): PgAdapterError {
  if (error && typeof error === "object" && "code" in error) {
    const pgError = error as any;
    return new PgAdapterError(
      pgError.message || "Database error",
      pgError.code,
      error,
      {
        severity: pgError.severity,
        detail: pgError.detail,
        hint: pgError.hint,
      },
    );
  }

  // Handle non-PostgreSQL errors
  const message = error instanceof Error ? error.message : String(error);
  return new PgAdapterError(message, undefined, error);
}

function createNodePostgresConnection(pool: Pool): PgConnection {
  let closed = false;

  async function withPgClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const poolClient = await pool.connect();
    try {
      const client = createNodePostgresClient(poolClient, wrapError);
      return await callback(client);
    } finally {
      poolClient.release();
    }
  }

  return {
    query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): PgQueryResult<T> {
      // For pool-level queries, we need to handle the connection internally
      return createPoolQueryResult<T>(pool, sql, params, wrapError);
    },

    withPgClient,

    async withTransaction<T>(
      callback: (client: PgClient) => Promise<T>,
    ): Promise<T> {
      return withPgClient(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await callback(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },

    async listen(
      channel: string,
      onnotify: (payload: string | null) => void,
      onError?: (error: Error) => void,
    ): Promise<{ unlisten: () => void }> {
      if (closed) {
        throw new Error("Connection is closed");
      }

      return createListenClient({
        pool,
        channel,
        onnotify,
        onError,
      });
    },

    async end(): Promise<void> {
      closed = true;
      await pool.end();
    },
  };
}

function createNodePostgresClient(
  client: PoolClient,
  wrapError: (error: unknown) => PgAdapterError,
): PgClient & { client: PoolClient } {
  return {
    client, // Expose for transaction handling
    query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): PgQueryResult<T> {
      return createClientQueryResult<T>(client, sql, params, wrapError);
    },
  };
}
