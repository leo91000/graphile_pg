import type { PgConnection, PgClient, PgQueryResult, MaybeRow } from "./index";

/**
 * Create helper methods for a PgConnection
 */
export function createPgHelpers(connection: PgConnection) {
  return {

    /**
     * Execute a query without returning results
     */
    async execute(sql: string, params?: any[]): Promise<void> {
      const result = connection.query(sql, params);
      await result; // Consume the result
    },

    /**
     * Send a NOTIFY
     */
    async notify(channel: string, payload?: string): Promise<void> {
      await this.execute("SELECT pg_notify($1, $2)", [channel, payload ?? ""]);
    },
  };
}

/**
 * Helper methods return type
 */
export type PgHelpers = ReturnType<typeof createPgHelpers>;

/**
 * Helper class for PgClient with convenient methods
 */
export class PgClientHelper {
  constructor(private client: PgClient) { }

  /**
   * Execute a query and return the result stream
   */
  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    return this.client.query(sql, params);
  }

  /**
   * Execute a query without returning results
   */
  async execute(sql: string, params?: any[]): Promise<void> {
    // Since PgQueryResult extends Promise, we can just await it
    await this.query(sql, params);
  }

  /**
   * Send a NOTIFY
   */
  async notify(channel: string, payload?: string): Promise<void> {
    await this.execute("SELECT pg_notify($1, $2)", [channel, payload ?? ""]);
  }

}
