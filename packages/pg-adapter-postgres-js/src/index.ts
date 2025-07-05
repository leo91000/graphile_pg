/**
 * Adapter for the `postgres` module (postgres.js).
 * https://github.com/porsager/postgres
 */
import type {
  PgConnection,
  PgTransaction,
  PgQueryResult,
  PgListenRequest,
  PgAdapterError,
} from "@graphile/pg-core";
import { PgAdapterError as BasePgAdapterError } from "@graphile/pg-core";
import type { MaybeRow, Sql, TransactionSql } from "postgres";
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

  async execute(sql: string, params?: any[]): Promise<void> {
    try {
      await (params ? this.sql.unsafe(sql, params) : this.sql.unsafe(sql));
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    try {
      await this.sql.notify(channel, payload ?? "");
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async transaction<T>(fn: (tx: PgTransaction) => Promise<T>): Promise<T> {
    try {
      const result = await this.sql.begin(async (txSql) => {
        const tx = new PostgresJsTransaction(txSql, this.wrapError.bind(this));
        return await fn(tx);
      });
      return result as T;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  listen(
    channel: string,
    onnotify: (payload: string | null) => void,
  ): PgListenRequest {
    if (this.closed) {
      throw new Error("Connection is closed");
    }

    // postgres.js listen returns a promise that resolves with unlisten method
    const listenPromise = this.sql.listen(channel, (payload: string) => {
      onnotify(payload || null);
    });

    // Wrap the postgres.js promise to match our interface
    return listenPromise.then(
      (postgresListenMeta) => ({
        unlisten: () => postgresListenMeta.unlisten(),
      }),
      (error) => {
        throw this.wrapError(error);
      },
    ) as PgListenRequest;
  }

  async end(): Promise<void> {
    this.closed = true;
    await this.sql.end();
  }

  async withClient<T>(
    fn: (client: PgConnection) => Promise<T> | T,
  ): Promise<T> {
    const reserved = await this.sql.reserve();
    try {
      const connection = new PostgresJsConnection(reserved);
      return await fn(connection);
    } finally {
      reserved.release();
    }
  }

  private wrapError(error: unknown): PgAdapterError {
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

    // Handle non-PostgreSQL errors
    const message = error instanceof Error ? error.message : String(error);
    return new BasePgAdapterError(message, undefined, error);
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

class PostgresJsTransaction implements PgTransaction {
  constructor(
    private txSql: TransactionSql<Record<string, unknown>>,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    const pendingQuery = params
      ? this.txSql.unsafe(sql, params)
      : this.txSql.unsafe(sql);

    // @ts-expect-error: Incompatible types in assignment
    return new PostgresJsQueryResult<T>(pendingQuery, this.wrapError);
  }

  async execute(sql: string, params?: any[]): Promise<void> {
    try {
      await (params ? this.txSql.unsafe(sql, params) : this.txSql.unsafe(sql));
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    try {
      // Use pg_notify in transactions since txSql doesn't have .notify method
      await this.txSql`SELECT pg_notify(${channel}, ${payload ?? ""})`;
    } catch (error) {
      throw this.wrapError(error);
    }
  }
}
