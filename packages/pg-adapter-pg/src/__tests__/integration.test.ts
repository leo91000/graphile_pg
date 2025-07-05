import { describe } from 'vitest'
import { createIntegrationTestSuite } from '../../../../test/integration-suite'
import { createNodePostgresConnection } from '../index'

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/test'

describe('@graphile/pg-adapter-pg integration tests', () => {
  createIntegrationTestSuite(async () => {
    const connection = await createNodePostgresConnection(DATABASE_URL, {
      max: 5,
    })
    return connection
  })()
})