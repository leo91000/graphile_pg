/**
 * Core interfaces for PostgreSQL adapters
 */

export interface Row {
  [column: string]: any;
}

export type MaybeRow = Row | undefined;

export interface PgQueryResult<T extends MaybeRow>
  extends AsyncIterable<T>,
    Promise<T[]> {
  /**
   * Process rows in batches
   */
  batches(size: number): AsyncIterable<T[]>;

  /**
   * Collect all rows into array (for small result sets)
   */
  toArray(): Promise<T[]>;

  /**
   * Just get the count (consumes the stream)
   */
  count(): Promise<number>;
}

export interface PgClient {
  /**
   * Stream-first query method
   */
  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T>;

  /**
   * Release the client back to the pool
   */
  release(): void;
}

export interface PgConnection {
  /**
   * Stream-first query method
   */
  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T>;

  /**
   * Get a client from the pool
   */
  reserve(): Promise<PgClient>;

  /**
   * LISTEN support
   */
  listen(
    channel: string,
    onnotify: (payload: string | null) => void,
  ): Promise<{ unlisten: () => void }>;

  /**
   * Properly close the connection/pool
   */
  end(): Promise<void>;
}

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

    /** Common retryable PostgreSQL error codes */
    const retryableCodes = [
      "40001" /** serialization_failure */,
      "40P01" /** deadlock_detected */,
      "57P03" /** cannot_connect_now */,
      "EHOSTUNREACH" /** no connection to the server */,
      "ETIMEDOUT" /** timeout */,
      "ECONNREFUSED" /** connection refused */,
      "ECONNRESET" /** connection reset */,
    ];

    return retryableCodes.includes(this.code);
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

export { PgHelper, PgClientHelper } from "./helpers";
