/**
 * Adapter for PGLite (embedded PostgreSQL)
 * https://github.com/electric-sql/pglite
 */

import {
  PGlite,
  type PGliteOptions,
  type Transaction,
} from "@electric-sql/pglite";
import type {
  PgConnection,
  PgClient,
  PgQueryResult,
  MaybeRow,
  PgPool as PgPoolAdapter,
} from "@graphile/pg-core";
import { PgAdapterError, createPgPool } from "@graphile/pg-core";

/**
 * Create a PostgreSQL connection using PGLite
 * @param dataDirOrDb - Either a data directory path (or undefined for in-memory) or a pre-configured PGLite instance
 * @param options - PGLite options (only used when creating a new instance)
 */
export function createPGLitePool(
  dataDirOrDb?: string | PGlite,
  options?: PGliteOptions,
): PgPoolAdapter {
  let db: PGlite;

  if (dataDirOrDb instanceof PGlite) {
    // Pre-configured PGLite instance provided
    db = dataDirOrDb;
  } else {
    // Data directory path provided (or undefined for in-memory)
    db = new PGlite(dataDirOrDb, options);
  }

  const connection = createPGLiteConnection(db);
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

function createPGLiteConnection(db: PGlite): PgConnection {
  let closed = false;

  async function withPgClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    if (closed) {
      throw new Error("Connection is closed");
    }

    return await db.runExclusive(async () => {
      const client = createPGLiteClient(db, wrapError);
      return await callback(client);
    });
  }

  return {
    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
      _options?: { prepare?: boolean },
    ): Promise<PgQueryResult<T>> {
      try {
        const result = await db.query<T>(sql, params);
        return {
          command: (result as any).command || "SELECT",
          rowCount: result.rows.length,
          rows: result.rows,
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
      if (closed) {
        throw new Error("Connection is closed");
      }

      return db.transaction(async (tx) => {
        const client = createPGLiteTransactionClient(tx, wrapError);
        return await callback(client);
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

      // PGLite supports LISTEN/NOTIFY
      try {
        const unsubscribe = await db.listen(channel, (payload) => {
          onnotify(payload);
        });

        return {
          unlisten: async () => {
            await unsubscribe();
          },
        };
      } catch (error) {
        const wrappedError = wrapError(error);
        if (onError) {
          onError(wrappedError);
        }
        throw wrappedError;
      }
    },

    getPoolSize(): number {
      return 1;
    },

    async end(): Promise<void> {
      closed = true;
      await db.close();
    },
  };
}

function createPGLiteClient(
  db: PGlite,
  wrapError: (error: unknown) => PgAdapterError,
): PgClient {
  return {
    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
      _options?: { prepare?: boolean },
    ): Promise<PgQueryResult<T>> {
      try {
        const result = await db.query<T>(sql, params);
        return {
          command: (result as any).command || "SELECT",
          rowCount: result.rows.length,
          rows: result.rows,
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

function createPGLiteTransactionClient(
  tx: Transaction,
  wrapError: (error: unknown) => PgAdapterError,
): PgClient {
  return {
    async query<T extends MaybeRow = any>(
      sql: string,
      params?: any[],
      _options?: { prepare?: boolean },
    ): Promise<PgQueryResult<T>> {
      try {
        const result = await tx.query<T>(sql, params);
        return {
          command: (result as any).command || "SELECT",
          rowCount: result.rows.length,
          rows: result.rows,
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
