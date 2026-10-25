/** The hash segment at `i` (`#funds/<id>` → id), decoded; a malformed escape such as `%E0%A4%A` is kept as typed instead of throwing. */
export function hashPart(i: number, hash = location.hash): string {
  const raw = hash.split('/')[i] ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
