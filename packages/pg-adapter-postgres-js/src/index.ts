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
  const connection = createPostgresJsConnectionInternal(sql);
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

function createPostgresJsConnectionInternal(sql: Sql): PgConnection {
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
    query<T extends MaybeRow = any>(
      sqlText: string,
      params?: any[],
    ): PgQueryResult<T> {
      const pendingQuery = params
        ? sql.unsafe<T[]>(sqlText, params)
        : sql.unsafe<T[]>(sqlText);

      return createPostgresJsQueryResult<T>(pendingQuery);
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
    ): Promise<{ unlisten: () => void }> {
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

    async end(): Promise<void> {
      closed = true;
      await sql.end();
    },
  };
}

function createPostgresJsClient(reserved: ReservedSql): PgClient {
  return {
    query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): PgQueryResult<T> {
      const pendingQuery = params
        ? reserved.unsafe<T[]>(sql, params)
        : reserved.unsafe<T[]>(sql);

      return createPostgresJsQueryResult<T>(pendingQuery);
    },
  };
}

function createPostgresJsTransactionClient(txSql: Sql): PgClient {
  return {
    query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
    ): PgQueryResult<T> {
      const pendingQuery = params
        ? txSql.unsafe<T[]>(sql, params)
        : txSql.unsafe<T[]>(sql);

      return createPostgresJsQueryResult<T>(pendingQuery);
    },
  };
}

function createPostgresJsQueryResult<T extends MaybeRow>(
  pendingQuery: postgres.PendingQuery<T[]>,
): PgQueryResult<T> {
  let cachedResult: postgres.RowList<T[]> | null = null;
  let arrayPromise: Promise<T[]> | null = null;

  const getArrayPromise = (): Promise<T[]> => {
    if (!arrayPromise) {
      // Create the promise lazily to avoid executing the query until needed
      arrayPromise = pendingQuery
        .then((result) => {
          cachedResult = result;
          return [...result];
        })
        .catch((error) => {
          throw wrapError(error);
        });
    }
    return arrayPromise;
  };

  const getResult = async (): Promise<postgres.RowList<T[]>> => {
    if (cachedResult === null) {
      // Await the PendingQuery to get the RowList
      cachedResult = await pendingQuery;
    }
    return cachedResult;
  };

  return {
    // Promise interface implementation
    then<TResult1 = T[], TResult2 = never>(
      onfulfilled?:
        | ((value: T[]) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): Promise<TResult1 | TResult2> {
      return getArrayPromise().then(onfulfilled, onrejected);
    },

    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): Promise<T[] | TResult> {
      return getArrayPromise().catch(onrejected);
    },

    finally(onfinally?: (() => void) | undefined | null): Promise<T[]> {
      return getArrayPromise().finally(onfinally);
    },

    [Symbol.toStringTag]: "PgQueryResult",

    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      try {
        // Use cursor for true streaming - returns AsyncIterable<T[]>
        const cursor = pendingQuery.cursor();
        for await (const rows of cursor) {
          // cursor returns batches of rows
          for (const row of rows) {
            yield row;
          }
        }
      } catch (error) {
        throw wrapError(error);
      }
    },

    async *batches(size: number): AsyncIterable<T[]> {
      if (size <= 0) {
        throw new Error("Batch size must be greater than 0");
      }

      try {
        // Use cursor with specified batch size for efficient batching
        const cursor = pendingQuery.cursor(size);
        for await (const batch of cursor) {
          yield batch;
        }
      } catch (error) {
        throw wrapError(error);
      }
    },

    async toArray(): Promise<T[]> {
      try {
        const result = await getResult();
        // RowList extends array, so we can spread it
        return [...result];
      } catch (error) {
        throw wrapError(error);
      }
    },

    async count(): Promise<number> {
      try {
        const result = await getResult();
        // RowList has length property
        return result.length;
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}
