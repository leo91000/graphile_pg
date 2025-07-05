/**
 * Adapter for the `postgres` module (postgres.js).
 * https://github.com/porsager/postgres
 */
import type {
  PgConnection,
  PgClient,
  PgQueryResult,
  PgAdapterError,
  MaybeRow,
} from "@graphile/pg-core";
import { PgAdapterError as BasePgAdapterError } from "@graphile/pg-core";
import type { Sql, ReservedSql } from "postgres";
import postgres from "postgres";

/**
 * Create a PostgreSQL connection using postgres.js
 */
export async function createPostgresJsConnection<
  T extends Record<string, postgres.PostgresType> = {},
>(
  connectionString: string,
  options?: postgres.Options<T> | undefined,
): Promise<PgConnection> {
  const sql = postgres(connectionString, options);
  return new PostgresJsConnection(sql);
}

class PostgresJsConnection implements PgConnection {
  private closed = false;

  constructor(private sql: Sql) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    const pendingQuery = params
      ? this.sql.unsafe<T[]>(sql, params)
      : this.sql.unsafe<T[]>(sql);

    return new PostgresJsQueryResult<T>(
      pendingQuery,
      this.wrapError.bind(this),
    );
  }

  async reserve(): Promise<PgClient> {
    const reserved = await this.sql.reserve();
    return new PostgresJsClient(reserved, this.wrapError.bind(this));
  }

  async listen(
    channel: string,
    onnotify: (payload: string | null) => void,
  ): Promise<{ unlisten: () => void }> {
    if (this.closed) {
      throw new Error("Connection is closed");
    }

    try {
      // postgres.js listen returns a promise that resolves with unlisten method
      const postgresListenMeta = await this.sql.listen(
        channel,
        (payload: string) => {
          onnotify(payload || null);
        },
      );

      return {
        unlisten: () => postgresListenMeta.unlisten(),
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async end(): Promise<void> {
    this.closed = true;
    await this.sql.end();
  }

  private wrapError<T = unknown>(error: T): PgAdapterError | T {
    if (error && typeof error === "object" && "code" in error) {
      const pgError = error as any;
      return new BasePgAdapterError(
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

    return error;
  }
}

class PostgresJsClient implements PgClient {
  constructor(
    private reserved: ReservedSql,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    const pendingQuery = params
      ? this.reserved.unsafe<T[]>(sql, params)
      : this.reserved.unsafe<T[]>(sql);

    return new PostgresJsQueryResult<T>(pendingQuery, this.wrapError);
  }

  release(): void {
    this.reserved.release();
  }
}

class PostgresJsQueryResult<T extends MaybeRow> implements PgQueryResult<T> {
  private pendingQuery: postgres.PendingQuery<T[]>;
  private cachedResult: postgres.RowList<T[]> | null = null;

  constructor(
    pendingQuery: postgres.PendingQuery<T[]>,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {
    this.pendingQuery = pendingQuery;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    try {
      // Use cursor for true streaming - returns AsyncIterable<T[]>
      const cursor = this.pendingQuery.cursor();
      for await (const rows of cursor) {
        // cursor returns batches of rows
        for (const row of rows) {
          yield row;
        }
      }
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async *batches(size: number): AsyncIterable<T[]> {
    if (size <= 0) {
      throw new Error("Batch size must be greater than 0");
    }

    try {
      // Use cursor with specified batch size for efficient batching
      const cursor = this.pendingQuery.cursor(size);
      for await (const batch of cursor) {
        yield batch;
      }
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async toArray(): Promise<T[]> {
    try {
      const result = await this.getResult();
      // RowList extends array, so we can spread it
      return [...result];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async count(): Promise<number> {
    try {
      const result = await this.getResult();
      // RowList has length property
      return result.length;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async getResult(): Promise<postgres.RowList<T[]>> {
    if (this.cachedResult === null) {
      // Await the PendingQuery to get the RowList
      this.cachedResult = await this.pendingQuery;
    }
    return this.cachedResult;
  }
}
