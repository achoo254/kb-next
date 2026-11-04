const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from a URL or a body are checked before a query: Postgres rejects a malformed uuid with an error. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
