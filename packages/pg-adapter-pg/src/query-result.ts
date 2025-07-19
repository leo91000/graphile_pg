import type { Pool, PoolClient, QueryResult } from "pg";
import Cursor from "pg-cursor";
import type { PgQueryResult, MaybeRow } from "@graphile/pg-core";
import { PgAdapterError } from "@graphile/pg-core";

export type WrapError = (error: unknown) => PgAdapterError;

/**
 * Create a query result for pool-level queries that need to manage their own connections
 */
export function createPoolQueryResult<T extends MaybeRow>(
  pool: Pool,
  sql: string,
  params: any[] | undefined,
  wrapError: WrapError,
): PgQueryResult<T> {
  let cachedResult: QueryResult<any> | null = null;
  let arrayPromise: Promise<T[]> | null = null;

  const getArrayPromise = (): Promise<T[]> => {
    if (!arrayPromise) {
      arrayPromise = executeQuery();
    }
    return arrayPromise;
  };

  const executeQuery = async (): Promise<T[]> => {
    try {
      const result = await pool.query(sql, params);
      cachedResult = result;
      return result.rows as T[];
    } catch (error) {
      throw wrapError(error);
    }
  };

  const getResult = async (): Promise<QueryResult<any>> => {
    if (cachedResult === null) {
      cachedResult = await pool.query(sql, params);
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
      // Get a client for streaming
      const client = await pool.connect();
      try {
        const cursor = client.query(new Cursor(sql, params));

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
        throw wrapError(error);
      } finally {
        client.release();
      }
    },

    async *batches(size: number): AsyncIterable<T[]> {
      if (size <= 0) {
        throw new Error("Batch size must be greater than 0");
      }

      const client = await pool.connect();
      try {
        const cursor = client.query(new Cursor(sql, params));

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
        throw wrapError(error);
      } finally {
        client.release();
      }
    },

    async toArray(): Promise<T[]> {
      try {
        const result = await getResult();
        return result.rows as T[];
      } catch (error) {
        throw wrapError(error);
      }
    },

    async count(): Promise<number> {
      try {
        const result = await getResult();
        return result.rowCount ?? result.rows.length;
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}

/**
 * Create a query result for client-level queries
 */
export function createClientQueryResult<T extends MaybeRow>(
  client: PoolClient,
  sql: string,
  params: any[] | undefined,
  wrapError: WrapError,
): PgQueryResult<T> {
  let cachedResult: QueryResult<any> | null = null;
  let arrayPromise: Promise<T[]> | null = null;

  const getArrayPromise = (): Promise<T[]> => {
    if (!arrayPromise) {
      arrayPromise = executeQuery();
    }
    return arrayPromise;
  };

  const executeQuery = async (): Promise<T[]> => {
    try {
      const result = await client.query(sql, params);
      cachedResult = result;
      return result.rows as T[];
    } catch (error) {
      throw wrapError(error);
    }
  };

  const getResult = async (): Promise<QueryResult<any>> => {
    if (cachedResult === null) {
      cachedResult = await client.query(sql, params);
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
      const cursor = client.query(new Cursor(sql, params));

      try {
        let rows: T[];
        do {
          rows = await cursor.read(1);
          if (rows.length > 0) {
            yield rows[0];
          }
        } while (rows.length > 0);
      } catch (error) {
        throw wrapError(error);
      } finally {
        await cursor.close();
      }
    },

    async *batches(size: number): AsyncIterable<T[]> {
      if (size <= 0) {
        throw new Error("Batch size must be greater than 0");
      }

      const cursor = client.query(new Cursor(sql, params));

      try {
        let rows: T[];
        do {
          rows = await cursor.read(size);
          if (rows.length > 0) {
            yield rows;
          }
        } while (rows.length > 0);
      } catch (error) {
        throw wrapError(error);
      } finally {
        await cursor.close();
      }
    },

    async toArray(): Promise<T[]> {
      try {
        const result = await getResult();
        return result.rows as T[];
      } catch (error) {
        throw wrapError(error);
      }
    },

    async count(): Promise<number> {
      try {
        const result = await getResult();
        return result.rowCount ?? result.rows.length;
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}
