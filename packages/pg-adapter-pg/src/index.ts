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
    async execute(sql: string, params?: any[]): Promise<void> {
      try {
        await pool.query(sql, params);
      } catch (error) {
        throw wrapError(error);
      }
    },

    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): Promise<PgQueryResult<T>> {
      try {
        const result = await pool.query(sql, params);
        return {
          command: result.command,
          rowCount: result.rowCount ?? 0,
          rows: result.rows as T[],
          fields: result.fields?.map((field) => ({
            name: field.name,
            dataTypeID: field.dataTypeID,
          })),
        };
      } catch (error) {
        throw wrapError(error);
      }
    },

    withPgClient,

    async withTransaction<T>(
      callback: (client: PgClient) => Promise<T>,
    ): Promise<T> {
      return withPgClient(async (client) => {
        await client.execute("BEGIN");
        try {
          const result = await callback(client);
          await client.execute("COMMIT");
          return result;
        } catch (error) {
          await client.execute("ROLLBACK");
          throw error;
        }
      });
    },

    async listen(
      channel: string,
      onnotify: (payload: string | null) => void,
      onError?: (error: Error) => void,
    ): Promise<{ unlisten: () => Promise<void> }> {
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
    async execute(sql: string, params?: any[]): Promise<void> {
      try {
        await client.query(sql, params);
      } catch (error) {
        throw wrapError(error);
      }
    },
    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): Promise<PgQueryResult<T>> {
      try {
        const result = await client.query(sql, params);
        return {
          command: result.command,
          rowCount: result.rowCount ?? 0,
          rows: result.rows as T[],
          fields: result.fields?.map((field) => ({
            name: field.name,
            dataTypeID: field.dataTypeID,
          })),
        };
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}
