export function errorMessage(error: unknown): string {
  return String(error).replace(/^Error:\s*/, '')
}
