import { diffOutput } from './diff'

/** Output with the parts that differ from the expected value highlighted, as LeetCode does. */
export function DiffView({ actual, expected, ordered }: { actual: unknown; expected: unknown; ordered: boolean }) {
  const { parts, note } = diffOutput(actual, expected, ordered)
  return <>
    <pre className="offline-diff">{parts.map((part, i) => part.changed ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</pre>
    {note && <small className="offline-diff-note">{note}</small>}
  </>
}
