export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export function isForeignKeyConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

function sqlStateClass(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return;
  const code = (error as { code: unknown }).code;
  return typeof code === "string" && code.length === 5
    ? code.slice(0, 2)
    : undefined;
}

/**
 * A statement the client's payload made illegal: a data exception (22xxx) or an
 * integrity violation (23xxx). These describe one mutation, so the mutation is
 * rejected on its own rather than aborting everything it travelled with.
 *
 * Deliberately excluded are the transient classes — a lock timeout, a
 * serialization failure, or a dropped connection say nothing about the payload
 * and must surface so the request can be retried.
 */
export function isRejectableMutationViolation(error: unknown): boolean {
  const violationClass = sqlStateClass(error);
  return violationClass === "22" || violationClass === "23";
}

/**
 * Contention rather than fault: the caller should retry instead of being told
 * the request failed.
 */
export function isTransientContentionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  const code = (error as { code: unknown }).code;
  return code === "55P03" || code === "40001" || code === "40P01";
}
