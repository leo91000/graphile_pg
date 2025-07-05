/**
 * Adapter for the `pg` module (node-postgres).
 * https://github.com/brianc/node-postgres
 */
import type {
  Pool as PgPoolNative,
  PoolClient as PgPoolClientNative,
  PoolConfig,
  QueryResult,
} from "pg";
import * as pg from "pg";
import Cursor from "pg-cursor";
import type {
  PgConnection,
  PgClient,
  PgQueryResult,
  MaybeRow,
} from "@graphile/pg-core";
import { PgAdapterError } from "@graphile/pg-core";

const PgPoolConstructor: typeof PgPoolNative =
  pg.Pool ?? (pg as any).default?.Pool;

/**
 * Create a PostgreSQL connection using node-postgres (pg)
 */
export async function createNodePostgresConnection(
  connectionString: string,
  poolConfig?: PoolConfig,
): Promise<PgConnection> {
  const pool = new PgPoolConstructor({
    connectionString,
    ...poolConfig,
  });

  return new NodePostgresConnection(pool);
}

class NodePostgresConnection implements PgConnection {
  private closed = false;

  constructor(private pool: PgPoolNative) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    // For pool-level queries, we need to handle the connection internally
    return new NodePostgresPoolQueryResult<T>(
      this.pool,
      sql,
      params,
      this.wrapError.bind(this),
    );
  }

  async reserve(): Promise<PgClient> {
    const client = await this.pool.connect();
    return new NodePostgresClient(client, this.wrapError.bind(this));
  }

  async listen(
    channel: string,
    onnotify: (payload: string | null) => void,
  ): Promise<{ unlisten: () => void }> {
    if (this.closed) {
      throw new Error("Connection is closed");
    }

    // Get a dedicated connection for LISTEN
    const listenClient = await this.pool.connect();

    // Set up notification handler
    listenClient.on("notification", (msg) => {
      if (msg.channel === channel) {
        onnotify(msg.payload ?? null);
      }
    });

    // Handle errors on the listen client
    listenClient.on("error", (err) => {
      console.error("Listen client error:", err);
      // Could implement reconnection logic here
    });

    // Start listening
    try {
      await listenClient.query(`LISTEN "${channel.replace(/"/g, '""')}"`);
    } catch (error) {
      listenClient.release();
      throw this.wrapError(error);
    }

    // Return unlisten function
    return {
      unlisten: () => {
        listenClient
          .query(`UNLISTEN "${channel.replace(/"/g, '""')}"`)
          .catch(() => {
            // Ignore errors during unlisten
          })
          .finally(() => {
            listenClient.release();
          });
      },
    };
  }

  async end(): Promise<void> {
    this.closed = true;
    await this.pool.end();
  }

  private wrapError(error: unknown): PgAdapterError {
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
}

class NodePostgresClient implements PgClient {
  constructor(
    private client: PgPoolClientNative,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    return new NodePostgresQueryResult<T>(
      this.client,
      sql,
      params,
      this.wrapError,
    );
  }

  release(): void {
    this.client.release();
  }
}

// Query result for pool-level queries that need to manage their own connections
class NodePostgresPoolQueryResult<T extends MaybeRow>
  implements PgQueryResult<T>
{
  private cachedResult: QueryResult<any> | null = null;
  private arrayPromise: Promise<T[]> | null = null;

  constructor(
    private pool: PgPoolNative,
    private sql: string,
    private params: any[] | undefined,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  private getArrayPromise(): Promise<T[]> {
    if (!this.arrayPromise) {
      // Create the promise lazily
      this.arrayPromise = this.executeQuery();
    }
    return this.arrayPromise;
  }

  private async executeQuery(): Promise<T[]> {
    try {
      const result = await this.pool.query(this.sql, this.params);
      this.cachedResult = result;
      return result.rows as T[];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

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
    return this.getArrayPromise().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | undefined
      | null,
  ): Promise<T[] | TResult> {
    return this.getArrayPromise().catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<T[]> {
    return this.getArrayPromise().finally(onfinally);
  }

  // Make it a proper thenable
  [Symbol.toStringTag] = "NodePostgresPoolQueryResult";

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    // Get a client for streaming
    const client = await this.pool.connect();
    try {
      const cursor = client.query(new Cursor(this.sql, this.params));

      try {
        let rows: T[];
        do {
          rows = await cursor.read(1);
          if (rows.length > 0) {
            yield rows[0];
          }
        } while (rows.length > 0);
      } finally {
        await cursor.close();
      }
    } catch (error) {
      throw this.wrapError(error);
    } finally {
      client.release();
    }
  }

  async *batches(size: number): AsyncIterable<T[]> {
    if (size <= 0) {
      throw new Error("Batch size must be greater than 0");
    }

    const client = await this.pool.connect();
    try {
      const cursor = client.query(new Cursor(this.sql, this.params));

      try {
        let rows: T[];
        do {
          rows = await cursor.read(size);
          if (rows.length > 0) {
            yield rows;
          }
        } while (rows.length > 0);
      } finally {
        await cursor.close();
      }
    } catch (error) {
      throw this.wrapError(error);
    } finally {
      client.release();
    }
  }

  async toArray(): Promise<T[]> {
    try {
      const result = await this.getResult();
      return result.rows as T[];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async count(): Promise<number> {
    try {
      const result = await this.getResult();
      return result.rowCount ?? result.rows.length;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async getResult(): Promise<QueryResult<any>> {
    if (this.cachedResult === null) {
      // Use pool.query for simple non-streaming queries
      this.cachedResult = await this.pool.query(this.sql, this.params);
    }
    return this.cachedResult;
  }
}

// Query result for client-level queries
class NodePostgresQueryResult<T extends MaybeRow> implements PgQueryResult<T> {
  private cachedResult: QueryResult<any> | null = null;
  private arrayPromise: Promise<T[]> | null = null;

  constructor(
    private client: PgPoolClientNative,
    private sql: string,
    private params: any[] | undefined,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  private getArrayPromise(): Promise<T[]> {
    if (!this.arrayPromise) {
      // Create the promise lazily
      this.arrayPromise = this.executeQuery();
    }
    return this.arrayPromise;
  }

  private async executeQuery(): Promise<T[]> {
    try {
      const result = await this.client.query(this.sql, this.params);
      this.cachedResult = result;
      return result.rows as T[];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

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
    return this.getArrayPromise().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | undefined
      | null,
  ): Promise<T[] | TResult> {
    return this.getArrayPromise().catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<T[]> {
    return this.getArrayPromise().finally(onfinally);
  }

  // Make it a proper thenable
  [Symbol.toStringTag] = "NodePostgresQueryResult";

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const cursor = this.client.query(new Cursor(this.sql, this.params));

    try {
      let rows: T[];
      do {
        rows = await cursor.read(1);
        if (rows.length > 0) {
          yield rows[0];
        }
      } while (rows.length > 0);
    } catch (error) {
      throw this.wrapError(error);
    } finally {
      await cursor.close();
    }
  }

  async *batches(size: number): AsyncIterable<T[]> {
    if (size <= 0) {
      throw new Error("Batch size must be greater than 0");
    }

    const cursor = this.client.query(new Cursor(this.sql, this.params));

    try {
      let rows: T[];
      do {
        rows = await cursor.read(size);
        if (rows.length > 0) {
          yield rows;
        }
      } while (rows.length > 0);
    } catch (error) {
      throw this.wrapError(error);
    } finally {
      await cursor.close();
    }
  }

  async toArray(): Promise<T[]> {
    try {
      const result = await this.getResult();
      return result.rows as T[];
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async count(): Promise<number> {
    try {
      const result = await this.getResult();
      return result.rowCount ?? result.rows.length;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async getResult(): Promise<QueryResult<any>> {
    if (this.cachedResult === null) {
      this.cachedResult = await this.client.query(this.sql, this.params);
    }
    return this.cachedResult;
  }
}
