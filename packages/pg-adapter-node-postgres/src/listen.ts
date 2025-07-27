import type { Pool, PoolClient } from "pg";
import { ident } from "@graphile/pg-core";

export interface ListenError extends Error {
  /** The original error that caused the failure */
  originalError: Error;
  /** Number of connection attempts made */
  attempts: number;
  /** Delay in milliseconds until next retry */
  retryDelay: number;
  /** The channel that failed to listen */
  channel: string;
}

export interface ListenConfig {
  pool: Pool;
  channel: string;
  onnotify: (payload: string | null) => void;
  onError?: (error: Error) => void;
}

export function createListenClient(config: ListenConfig): {
  unlisten: () => Promise<void>;
} {
  const { pool, channel, onnotify, onError } = config;

  let listenClient: PoolClient | null = null;
  let stopped = false;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let attempts = 0;
  const MAX_DELAY = 60_000; // 60 seconds max delay

  // Escape channel name once using standardized function
  const escapedChannel = ident(channel);

  const cleanup = async () => {
    stopped = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (listenClient) {
      // Remove all listeners before releasing
      listenClient.removeAllListeners();

      // Try to unlisten before releasing
      try {
        await listenClient.query(`UNLISTEN ${escapedChannel}`);
      } catch {
        // Ignore errors during unlisten
      }

      listenClient.release();
      listenClient = null;
    }
  };

  const reconnectWithExponentialBackoff = (err: Error) => {
    if (stopped) return;

    attempts++;

    // Jitter to avoid thundering herd
    const jitter = 0.5 + Math.sqrt(Math.random()) / 2;

    // Backoff calculation with max cap
    const delay = Math.ceil(
      jitter * Math.min(MAX_DELAY, 50 * Math.exp(attempts)),
    );

    if (onError) {
      const listenError: ListenError = Object.assign(
        new Error(
          `LISTEN error on channel "${channel}" (retry in ${delay}ms): ${err.message}`,
        ),
        {
          name: "ListenError",
          originalError: err,
          attempts,
          retryDelay: delay,
          channel,
        },
      );
      onError(listenError);
    }

    // Clean up current client if exists
    if (listenClient) {
      listenClient.removeAllListeners();
      listenClient.release();
      listenClient = null;
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      if (!stopped) {
        startListening();
      }
    }, delay);
  };

  const startListening = async () => {
    if (stopped) return;

    try {
      // Get a dedicated connection for LISTEN
      listenClient = await pool.connect();

      // Handle errors on the listen client
      listenClient.on("error", (err) => {
        reconnectWithExponentialBackoff(err);
      });

      // Set up notification handler
      listenClient.on("notification", (msg) => {
        if (msg.channel === channel) {
          onnotify(msg.payload ?? null);
        }
      });

      // Start listening
      await listenClient.query(`LISTEN ${escapedChannel}`);

      // Reset attempts on successful connection
      attempts = 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      reconnectWithExponentialBackoff(err);
    }
  };

  // Start initial connection
  startListening();

  // Return unlisten function
  return {
    unlisten: async () => {
      cleanup();
    },
  };
}
