/**
 * Adapter for the `postgres` module (postgres.js).
 * https://github.com/porsager/postgres
 */
import type {
  PgConnection,
  PgClient,
  PgQueryResult,
  MaybeRow,
  PgPool as PgPoolAdapter,
} from "@graphile/pg-core";
import { PgAdapterError, createPgPool } from "@graphile/pg-core";
import type { Sql, ReservedSql } from "postgres";
import postgres from "postgres";

/**
 * Create a PostgreSQL connection using postgres.js
 */
export async function createPostgresJsPool<
  T extends Record<string, postgres.PostgresType> = {},
>(
  connectionString: string,
  options?: postgres.Options<T> | undefined,
): Promise<PgPoolAdapter> {
  const sql = postgres(connectionString, options);
  const connection = createPostgresJsConnectionInternal(
    sql,
    options?.max ?? 10,
  );
  return createPgPool(connection);
}

function wrapError(error: unknown): PgAdapterError {
  // postgres.js errors have a specific structure with 'name' property
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as any).name === "PostgresError" &&
    "code" in error
  ) {
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

function createPostgresJsConnectionInternal(
  sql: Sql,
  maxPoolSize: number,
): PgConnection {
  let closed = false;

  async function withPgClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const reserved = await sql.reserve();
    try {
      const client = createPostgresJsClient(reserved);
      return await callback(client);
    } finally {
      reserved.release();
    }
  }

  return {
    async execute(sqlText: string, params?: any[], options?: { prepare?: boolean }): Promise<void> {
      try {
        if (params) {
          await sql.unsafe(sqlText, params, { prepare: options?.prepare ?? false });
        } else {
          await sql.unsafe(sqlText, [], { prepare: options?.prepare ?? false });
        }
      } catch (error) {
        throw wrapError(error);
      }
    },

    async query<T extends MaybeRow = any>(
      sqlText: string,
      params?: any[],
      options?: { prepare?: boolean }
    ): Promise<PgQueryResult<T>> {
      try {
        const result = params
          ? await sql.unsafe<T[]>(sqlText, params, { prepare: options?.prepare ?? false })
          : await sql.unsafe<T[]>(sqlText, [], { prepare: options?.prepare ?? false });

        // postgres.js attaches metadata to the array
        const pgResult = result as any;
        return {
          command: pgResult.command || "SELECT",
          rowCount: pgResult.count ?? result.length,
          rows: result,
          // postgres.js doesn't provide field metadata in the same format
        };
      } catch (error) {
        throw wrapError(error);
      }
    },

    withPgClient,

    async withTransaction<T>(
      callback: (client: PgClient) => Promise<T>,
    ): Promise<T> {
      // postgres.js has built-in transaction support
      // Cast is needed because postgres.js types use UnwrapPromiseArray
      return sql.begin(async (txSql) => {
        const client = createPostgresJsTransactionClient(txSql);
        return callback(client);
      }) as Promise<T>;
    },

    async listen(
      channel: string,
      onnotify: (payload: string | null) => void,
      _onError?: (error: Error) => void,
    ): Promise<{ unlisten: () => Promise<void> }> {
      if (closed) {
        throw new Error("Connection is closed");
      }

      try {
        // postgres.js listen returns a promise that resolves with unlisten method
        const postgresListenMeta = await sql.listen(
          channel,
          (payload: string) => {
            onnotify(payload || null);
          },
        );

        // Note: postgres.js handles reconnection internally, so we don't need
        // to implement retry logic like in the pg adapter
        return {
          unlisten: async () => {
            // Only unlisten if the connection is still open
            if (!closed) {
              await postgresListenMeta.unlisten();
            }
          },
        };
      } catch (error) {
        throw wrapError(error);
      }
    },

    getPoolSize(): number {
      return maxPoolSize;
    },

    async end(): Promise<void> {
      closed = true;
      await sql.end();
    },
  };
}

function createPostgresJsClient(reserved: ReservedSql): PgClient {
  return {
    async execute(sql: string, params?: any[], options?: { prepare?: boolean }): Promise<void> {
      try {
        if (params) {
          await reserved.unsafe(sql, params, { prepare: options?.prepare ?? false });
        } else {
          await reserved.unsafe(sql, [], { prepare: options?.prepare ?? false });
        }
      } catch (error) {
        throw wrapError(error);
      }
    },

    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
      options?: { prepare?: boolean }
    ): Promise<PgQueryResult<T>> {
      try {
        const result = params
          ? await reserved.unsafe<T[]>(sql, params, { prepare: options?.prepare ?? false })
          : await reserved.unsafe<T[]>(sql, [], { prepare: options?.prepare ?? false });

        const pgResult = result as any;
        return {
          command: pgResult.command || "SELECT",
          rowCount: pgResult.count ?? result.length,
          rows: result,
        };
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}

function createPostgresJsTransactionClient(txSql: Sql): PgClient {
  return {
    async execute(sql: string, params?: any[], options?: { prepare?: boolean }): Promise<void> {
      try {
        if (params) {
          await txSql.unsafe(sql, params, { prepare: options?.prepare ?? false });
        } else {
          await txSql.unsafe(sql, [], { prepare: options?.prepare ?? false });
        }
      } catch (error) {
        throw wrapError(error);
      }
    },

    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
      options?: { prepare?: boolean }
    ): Promise<PgQueryResult<T>> {
      try {
        const result = params
          ? await txSql.unsafe<T[]>(sql, params, { prepare: options?.prepare ?? false })
          : await txSql.unsafe<T[]>(sql, [], { prepare: options?.prepare ?? false });

        const pgResult = result as any;
        return {
          command: pgResult.command || "SELECT",
          rowCount: pgResult.count ?? result.length,
          rows: result,
        };
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}
