import { describe, it, expect } from 'vitest';
import { PgAdapterError } from '../index';

describe('PgAdapterError', () => {
  it('should create an error with message and code', () => {
    const error = new PgAdapterError('Connection failed', 'ECONNREFUSED');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PgAdapterError);
    expect(error.message).toBe('Connection failed');
    expect(error.code).toBe('ECONNREFUSED');
    expect(error.name).toBe('PgAdapterError');
  });

  it('should create an error with PostgreSQL error details', () => {
    const originalError = new Error('Original error');
    const error = new PgAdapterError(
      'Constraint violation',
      '23505',
      originalError,
      {
        severity: 'ERROR',
        detail: 'Key (email)=(test@example.com) already exists.',
        hint: 'Try using a different email address.',
      }
    );
    
    expect(error.code).toBe('23505');
    expect(error.severity).toBe('ERROR');
    expect(error.detail).toBe('Key (email)=(test@example.com) already exists.');
    expect(error.hint).toBe('Try using a different email address.');
    expect(error.originalError).toBe(originalError);
  });

  describe('isRetryable', () => {
    it('should return true for retryable error codes', () => {
      const retryableCodes = [
        '40001', // serialization_failure
        '40P01', // deadlock_detected
        '57P03', // cannot_connect_now
        'EHOSTUNREACH',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNRESET',
      ];

      for (const code of retryableCodes) {
        const error = new PgAdapterError('Error', code);
        expect(error.isRetryable()).toBe(true);
      }
    });

    it('should return false for non-retryable error codes', () => {
      const nonRetryableCodes = [
        '42P01', // undefined_table
        '23505', // unique_violation
        'ENOENT', // file not found
        undefined,
      ];

      for (const code of nonRetryableCodes) {
        const error = new PgAdapterError('Error', code);
        expect(error.isRetryable()).toBe(false);
      }
    });
  });

  describe('isConstraintViolation', () => {
    it('should return true for constraint violation codes', () => {
      const constraintCodes = [
        '23000', // integrity_constraint_violation
        '23001', // restrict_violation
        '23502', // not_null_violation
        '23503', // foreign_key_violation
        '23505', // unique_violation
        '23514', // check_violation
      ];

      for (const code of constraintCodes) {
        const error = new PgAdapterError('Error', code);
        expect(error.isConstraintViolation()).toBe(true);
      }
    });

    it('should return false for non-constraint violation codes', () => {
      const nonConstraintCodes = [
        '42P01', // undefined_table
        '40001', // serialization_failure
        '24000', // invalid_cursor_state
        'ECONNREFUSED',
        undefined,
      ];

      for (const code of nonConstraintCodes) {
        const error = new PgAdapterError('Error', code);
        expect(error.isConstraintViolation()).toBe(false);
      }
    });
  });
});