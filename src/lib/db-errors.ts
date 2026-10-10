/**
 * Postgres error handling for server actions.
 *
 * PostgREST surfaces the Postgres SQLSTATE in `error.code`. Raw messages like
 * `duplicate key value violates unique constraint "clubs_slug_key"` must never
 * reach a form, so actions map the codes they expect to specific messages and
 * pass everything else through `friendlyDbError`.
 */

type DbError = { code?: string; message: string };

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const INSUFFICIENT_PRIVILEGE = "42501"; // what RLS denials surface as

export function isUniqueViolation(error: DbError): boolean {
  return error.code === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: DbError): boolean {
  return error.code === FOREIGN_KEY_VIOLATION;
}

/**
 * Generic user-facing message for a database error the caller has no specific
 * wording for. The real error is logged server-side, never shown.
 */
export function friendlyDbError(error: DbError, action: string): string {
  console.error(`Database error while ${action}:`, error.code, error.message);

  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return "You don't have permission to do that.";
  }
  if (error.code === CHECK_VIOLATION) {
    return "Some of those values aren't allowed. Check the dates, capacity and other fields and try again.";
  }
  return "Something went wrong. Please try again.";
}
