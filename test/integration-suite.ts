import { PgConnection, PgTransaction, Row } from '../packages/pg-core/src'

/**
 * Shared integration test suite for PostgreSQL adapters
 */
export function createIntegrationTestSuite(
  getConnection: () => Promise<PgConnection>
) {
  return () => {
    let rootConnection: PgConnection

    beforeAll(async () => {
      rootConnection = await getConnection()
    })

    afterAll(async () => {
      await rootConnection.end()
    })

    describe('Query Execution', () => {

      it('should execute a simple query', async () => {
        const result = await connection.query<{ num: number }>('SELECT 1 as num')
        const rows = await result.toArray()
        
        expect(rows).toHaveLength(1)
        expect(rows[0]).toEqual({ num: 1 })
      })

      it('should execute parameterized queries', async () => {
        const result = await connection.query<{ result: number }>(
          'SELECT $1::int + $2::int as result',
          [5, 10]
        )
        const rows = await result.toArray()
        
        expect(rows).toHaveLength(1)
        expect(rows[0].result).toBe(15)
      })

      it('should handle empty results', async () => {
        const result = await connection.query<Row>(
          'SELECT * FROM (VALUES (1), (2), (3)) as t(n) WHERE n > 10'
        )
        const rows = await result.toArray()
        
        expect(rows).toHaveLength(0)
      })

      it('should stream large result sets', async () => {
        const result = await connection.query<{ n: number }>(
          'SELECT generate_series(1, 1000) as n'
        )
        
        let count = 0
        for await (const row of result) {
          count++
          expect(row.n).toBe(count)
        }
        
        expect(count).toBe(1000)
      })

      it('should handle batched iteration', async () => {
        const result = await connection.query<{ n: number }>(
          'SELECT generate_series(1, 100) as n'
        )
        
        const batches: number[] = []
        for await (const batch of result.batches(10)) {
          batches.push(batch.length)
        }
        
        expect(batches).toHaveLength(10)
        expect(batches.every(size => size === 10)).toBe(true)
      })

      it('should count rows without materializing', async () => {
        const result = await connection.query<{ n: number }>(
          'SELECT generate_series(1, 100) as n'
        )
        
        const count = await result.count()
        expect(count).toBe(100)
      })
    })

    describe('Transaction Management', () => {
      let connection: PgConnection

      beforeEach(async () => {
        connection = await getConnection()
        // Clean up test table
        await connection.query('DROP TABLE IF EXISTS test_table')
        await connection.query('CREATE TABLE test_table (id SERIAL PRIMARY KEY, value TEXT)')
      })

      afterEach(async () => {
        await connection.end()
      })

      it('should commit transactions', async () => {
        await connection.transaction(async (tx) => {
          await tx.query("INSERT INTO test_table (value) VALUES ('test')")
        })
        
        // Verify the data was committed
        const result = await connection.query<{ value: string }>('SELECT value FROM test_table')
        const rows = await result.toArray()
        expect(rows).toHaveLength(1)
        expect(rows[0].value).toBe('test')
      })

      it('should rollback transactions', async () => {
        try {
          await connection.transaction(async (tx) => {
            await tx.query("INSERT INTO test_table (value) VALUES ('should_not_exist')")
            throw new Error('Rollback test')
          })
        } catch (err) {
          // Expected error
        }
        
        // Verify the data was not committed
        const result = await connection.query<Row>('SELECT * FROM test_table')
        const rows = await result.toArray()
        expect(rows).toHaveLength(0)
      })

      it('should handle nested transactions with savepoints', async () => {
        const tx1 = await connection.beginTransaction()
        
        await tx1.query("INSERT INTO test_table (value) VALUES ('level1')")
        
        const tx2 = await tx1.beginTransaction()
        await tx2.query("INSERT INTO test_table (value) VALUES ('level2')")
        await tx2.rollback()
        
        await tx1.commit()
        
        // Only level1 should be committed
        const result = await connection.query<{ value: string }>('SELECT value FROM test_table ORDER BY id')
        const rows = await result.toArray()
        expect(rows).toHaveLength(1)
        expect(rows[0].value).toBe('level1')
      })
    })

    describe('Error Handling', () => {
      let connection: PgConnection

      beforeEach(async () => {
        connection = await getConnection()
      })

      afterEach(async () => {
        await connection.end()
      })

      it('should handle SQL syntax errors', async () => {
        await expect(
          connection.query('SELECT * FROM nonexistent_table')
        ).rejects.toThrow()
      })

      it('should handle constraint violations', async () => {
        await connection.query('DROP TABLE IF EXISTS test_unique')
        await connection.query('CREATE TABLE test_unique (id INT PRIMARY KEY)')
        await connection.query('INSERT INTO test_unique VALUES (1)')
        
        await expect(
          connection.query('INSERT INTO test_unique VALUES (1)')
        ).rejects.toThrow()
      })

      it('should handle query timeouts', async () => {
        await expect(
          connection.query('SELECT pg_sleep(10)', [], { timeout: 100 })
        ).rejects.toThrow()
      })
    })

    describe('LISTEN/NOTIFY', () => {
      let connection: PgConnection

      beforeEach(async () => {
        connection = await getConnection()
      })

      afterEach(async () => {
        await connection.end()
      })

      it('should receive notifications', async () => {
        const notifications: any[] = []
        
        const listener = await connection.listen('test_channel', (msg) => {
          notifications.push(msg)
        })
        
        // Send notification
        await connection.query("NOTIFY test_channel, 'hello world'")
        
        // Wait a bit for the notification
        await new Promise(resolve => setTimeout(resolve, 100))
        
        expect(notifications).toHaveLength(1)
        expect(notifications[0].channel).toBe('test_channel')
        expect(notifications[0].payload).toBe('hello world')
        
        await listener.unlisten()
      })

      it('should handle multiple channels', async () => {
        const channel1Msgs: any[] = []
        const channel2Msgs: any[] = []
        
        const listener1 = await connection.listen('channel1', (msg) => {
          channel1Msgs.push(msg)
        })
        
        const listener2 = await connection.listen('channel2', (msg) => {
          channel2Msgs.push(msg)
        })
        
        // Send notifications
        await connection.query("NOTIFY channel1, 'msg1'")
        await connection.query("NOTIFY channel2, 'msg2'")
        
        // Wait for notifications
        await new Promise(resolve => setTimeout(resolve, 100))
        
        expect(channel1Msgs).toHaveLength(1)
        expect(channel2Msgs).toHaveLength(1)
        expect(channel1Msgs[0].payload).toBe('msg1')
        expect(channel2Msgs[0].payload).toBe('msg2')
        
        await listener1.unlisten()
        await listener2.unlisten()
      })
    })
  }
}