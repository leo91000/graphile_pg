import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@graphile/pg-adapter-postgres-js',
    environment: 'node',
    includeSource: ['src/**/*.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', '__tests__/**/*.test.ts'],
  },
})