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
  PgTransaction,
  PgQueryResult,
  PgListenRequest,
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

  const client = await pool.connect();
  return new NodePostgresConnection(client, pool);
}

class NodePostgresConnection implements PgConnection {
  private closed = false;

  constructor(
    private client: PgPoolClientNative,
    private pool: PgPoolNative,
  ) {}

  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    return new NodePostgresQueryResult<T>(
      this.client,
      sql,
      params,
      this.wrapError.bind(this),
    );
  }

  async execute(sql: string, params?: any[]): Promise<void> {
    try {
      await this.client.query(sql, params);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    try {
      await this.client.query("SELECT pg_notify($1, $2)", [
        channel,
        payload ?? "",
      ]);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async transaction<T>(fn: (tx: PgTransaction) => Promise<T>): Promise<T> {
    try {
      await this.client.query("BEGIN");
      try {
        const tx = new NodePostgresTransaction(
          this.client,
          this.wrapError.bind(this),
        );
        const result = await fn(tx);
        await this.client.query("COMMIT");
        return result;
      } catch (error) {
        await this.client.query("ROLLBACK");
        throw error;
      }
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

    // Create a promise that sets up the listener
    const setupListener = async (): Promise<{ unlisten: () => Promise<void> }> => {
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
        unlisten: async () => {
          try {
            await listenClient.query(`UNLISTEN "${channel.replace(/"/g, '""')}"`);
          } catch (error) {
            // Ignore errors during unlisten
          } finally {
            listenClient.release();
          }
        },
      };
    };

    return setupListener() as PgListenRequest;
  }

  async close(): Promise<void> {
    this.closed = true;
    
    // Release the main client
    this.client.release();
    
    // End the pool
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

class NodePostgresQueryResult<T extends MaybeRow> implements PgQueryResult<T> {
  private cachedResult: QueryResult<any> | null = null;

  constructor(
    private client: PgPoolClientNative,
    private sql: string,
    private params: any[] | undefined,
    private wrapError: (error: unknown) => PgAdapterError,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    // Use cursor for true streaming - read 1 row at a time for minimal memory usage
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

    // Use cursor with the specified batch size
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
      // For toArray() and count(), use regular query without cursor
      this.cachedResult = await this.client.query(this.sql, this.params);
    }
    return this.cachedResult;
  }
}

class NodePostgresTransaction implements PgTransaction {
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

  async execute(sql: string, params?: any[]): Promise<void> {
    try {
      await this.client.query(sql, params);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    try {
      await this.client.query("SELECT pg_notify($1, $2)", [
        channel,
        payload ?? "",
      ]);
    } catch (error) {
      throw this.wrapError(error);
    }
  }
}