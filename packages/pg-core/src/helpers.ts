import type { PgConnection, PgClient, PgQueryResult, MaybeRow } from "./index";

/**
 * Helper class that provides convenient methods on top of the minimal PgConnection interface
 */
export class PgHelper {
  constructor(private connection: PgConnection) {}

  /**
   * Execute a query and return the result stream
   */
  query<T extends MaybeRow = any>(
    sql: string,
    params?: any[],
  ): PgQueryResult<T> {
    return this.connection.query(sql, params);
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

  /**
   * Execute a function within a transaction
   */
  async begin<T>(fn: (helper: PgClientHelper) => Promise<T>): Promise<T> {
    const client = await this.connection.reserve();
    const clientHelper = new PgClientHelper(client);

    try {
      await clientHelper.execute("BEGIN");
      const result = await fn(clientHelper);
      await clientHelper.execute("COMMIT");
      return result;
    } catch (error) {
      await clientHelper.execute("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Alias for begin()
   */
  async transaction<T>(fn: (helper: PgClientHelper) => Promise<T>): Promise<T> {
    return this.begin(fn);
  }

  /**
   * Execute a function with an auto-released client
   */
  async withClient<T>(
    fn: (helper: PgClientHelper) => Promise<T> | T,
  ): Promise<T> {
    const client = await this.connection.reserve();
    const clientHelper = new PgClientHelper(client);

    try {
      return await fn(clientHelper);
    } finally {
      client.release();
    }
  }

  /**
   * Listen to a channel
   */
  listen(
    channel: string,
    callback: (payload: string | null) => void,
  ): Promise<{ unlisten: () => void }> {
    return this.connection.listen(channel, callback);
  }

  /**
   * Reserve a client for manual management
   */
  reserve(): Promise<PgClient> {
    return this.connection.reserve();
  }

  /**
   * Close the connection/pool
   */
  end(): Promise<void> {
    return this.connection.end();
  }
}

/**
 * Helper class for PgClient with convenient methods
 */
export class PgClientHelper {
  constructor(private client: PgClient) {}

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

  /**
   * Execute a function within a savepoint
   */
  async savepoint<T>(
    fn: (helper: PgClientHelper) => Promise<T>,
    name?: string,
  ): Promise<T> {
    // Use provided name or generate a unique one
    const savepointName =
      name || `sp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      await this.execute(`SAVEPOINT ${savepointName}`);
      const result = await fn(this);
      await this.execute(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await this.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw error;
    }
  }

  /**
   * Release the client (delegates to underlying client)
   */
  release(): void {
    this.client.release();
  }
}
