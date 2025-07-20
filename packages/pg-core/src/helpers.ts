import type { PgConnection } from "./index";

/**
 * Create helper methods for a PgConnection
 */
export function createPgHelpers(connection: PgConnection) {
  return {
    /**
     * Send a NOTIFY
     */
    async notify(channel: string, payload?: string): Promise<void> {
      await connection.execute("SELECT pg_notify($1, $2)", [
        channel,
        payload ?? "",
      ]);
    },
  };
}

/**
 * Helper methods return type
 */
export type PgHelpers = ReturnType<typeof createPgHelpers>;
