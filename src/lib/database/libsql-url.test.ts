import { describe, expect, test } from 'bun:test';
import { parseLibSQLConnection } from './libsql-url';

describe('parseLibSQLConnection', () => {
  test('extracts authToken from DATABASE_URL and removes it from the runtime URL', () => {
    const result = parseLibSQLConnection('libsql://example.turso.io?authToken=secret-jwt&tls=1');

    expect(result.authToken).toBe('secret-jwt');
    expect(result.url).not.toContain('secret-jwt');
    expect(result.url).not.toContain('authToken');
    expect(result.url).toContain('tls=1');
  });

  test('uses fallback token without adding it to the runtime URL', () => {
    const result = parseLibSQLConnection('libsql://example.turso.io', 'separate-token');

    expect(result.authToken).toBe('separate-token');
    expect(result.url).not.toContain('separate-token');
  });
});
