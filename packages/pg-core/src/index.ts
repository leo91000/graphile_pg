/**
 * Core interfaces for PostgreSQL adapters
 */

import { createPgHelpers, PgHelpers } from "./helpers";

export interface Row {
  [column: string]: any;
}

export type MaybeRow = Row | undefined;

export interface PgQueryResult<T extends MaybeRow = Row> {
  /**
   * The SQL command that was executed (e.g., "SELECT", "INSERT", "UPDATE")
   */
  command: string;

  /**
   * Number of rows affected or returned
   */
  rowCount: number;

  /**
   * The actual row data
   */
  rows: T[];

  /**
   * Field/column metadata (optional, not all adapters provide this)
   */
  fields?: Array<{
    name: string;
    dataTypeID?: number;
  }>;
}

export interface PgClient {
  /**
   * Execute a query without returning results (for DDL, DML, transaction control)
   */
  execute(sql: string, params?: any[]): Promise<void>;

  /**
   * Execute a query and return results with metadata
   */
  query<T extends MaybeRow = Row>(
    sql: string,
    params?: any[],
  ): Promise<PgQueryResult<T>>;
}

export interface PgConnection extends PgClient {
  /**
   * Execute operations with a client from the pool
   */
  withPgClient<T>(callback: (client: PgClient) => Promise<T>): Promise<T>;

  /**
   * Transaction support
   */
  withTransaction<T>(callback: (client: PgClient) => Promise<T>): Promise<T>;

  /**
   * LISTEN support with provider-specific reconnection handling
   */
  listen(
    channel: string,
    onnotify: (payload: string | null) => void,
    onError?: (error: Error) => void,
  ): Promise<{ unlisten: () => Promise<void> }>;

  /**
   * Get the total number of connections in the pool
   */
  getPoolSize(): number;

  /**
   * Properly close the connection/pool
   */
  end(): Promise<void>;
}

const RETRYABLE_ERROR_CODES = new Set([
  "40001" /** serialization_failure */,
  "40P01" /** deadlock_detected */,
  "57P03" /** cannot_connect_now */,
  "EHOSTUNREACH" /** no connection to the server */,
  "ETIMEDOUT" /** timeout */,
  "ECONNREFUSED" /** connection refused */,
  "ECONNRESET",
]);

/**
 * Standard error class for PostgreSQL adapter errors
 */
export class PgAdapterError extends Error {
  /**
   * PostgreSQL error code (e.g., "40001" for serialization_failure)
   * or system error code (e.g., "ETIMEDOUT", "EHOSTUNREACH")
   */
  public readonly code: string | undefined;

  /**
   * PostgreSQL error severity (e.g., "ERROR", "FATAL", "PANIC")
   */
  public readonly severity?: string;

  /**
   * PostgreSQL error detail message
   */
  public readonly detail?: string;

  /**
   * PostgreSQL error hint
   */
  public readonly hint?: string;

  /**
   * The original error from the underlying driver
   */
  public readonly originalError: unknown;

  constructor(
    message: string,
    code?: string,
    originalError?: unknown,
    options?: {
      severity?: string;
      detail?: string;
      hint?: string;
    },
  ) {
    super(message);
    this.name = "PgAdapterError";
    this.code = code;
    this.originalError = originalError;
    this.severity = options?.severity;
    this.detail = options?.detail;
    this.hint = options?.hint;
  }

  /**
   * Check if this is a retryable error based on the error code
   */
  isRetryable(): boolean {
    if (!this.code) return false;
    return RETRYABLE_ERROR_CODES.has(this.code);
  }

  /**
   * Check if this is a constraint violation
   */
  isConstraintViolation(): boolean {
    if (!this.code) return false;
    /** PostgreSQL constraint violation codes all start with '23' */
    return this.code.startsWith("23");
  }
}

/**
 * A PgConnection with all helper methods merged in
 */
export interface PgPool extends PgConnection, PgHelpers {}

/**
 * Create a PgPool from a PgConnection adapter
 * This merges the connection with helper methods for convenience
 */
export function createPgPool(adapter: PgConnection): PgPool {
  const helpers = createPgHelpers(adapter);

  return {
    ...adapter,
    ...helpers,
  };
}

export { createPgHelpers } from "./helpers";
