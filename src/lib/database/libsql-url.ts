const LIBSQL_SECRET_QUERY_PARAMS = ['authToken', 'token', 'auth_token', 'jwt'] as const;

export function parseLibSQLConnection(url: string, fallbackAuthToken?: string) {
  const parsedURL = new URL(url);
  let authToken = '';

  for (const key of LIBSQL_SECRET_QUERY_PARAMS) {
    const value = parsedURL.searchParams.get(key)?.trim();
    if (value) {
      authToken = value;
      break;
    }
  }

  for (const key of LIBSQL_SECRET_QUERY_PARAMS) {
    parsedURL.searchParams.delete(key);
  }

  if (!authToken) {
    authToken = fallbackAuthToken?.trim() || '';
  }

  return {
    url: parsedURL.toString(),
    authToken
  };
}
