// Adds LeetCode's Python method signatures for the given problems to signatures.json.
//   node scripts/judge/fetch-signatures.mjs course-schedule-iii majority-element …
// Anonymous public GraphQL requests; free problems only.
import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('./signatures.json', import.meta.url)
const signatures = JSON.parse(await readFile(file, 'utf8'))
for (const slug of process.argv.slice(2)) {
  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/problems/${slug}/` },
    body: JSON.stringify({ query: 'query q($s: String!) { question(titleSlug: $s) { metaData isPaidOnly } }', variables: { s: slug } }),
  })
  const question = (await response.json()).data?.question
  if (!question) throw new Error(`${slug}: not found`)
  const meta = JSON.parse(question.metaData)
  if (!meta.name || !meta.params) throw new Error(`${slug}: not a single-method problem (${question.metaData.slice(0, 120)})`)
  signatures[slug] = { name: meta.name, params: meta.params.map(({ name, type }) => ({ name, type })), return: { type: meta.return.type } }
  console.log(slug, JSON.stringify(signatures[slug]))
  await new Promise(r => setTimeout(r, 300))
}
await writeFile(file, JSON.stringify(signatures, null, 1) + '\n')
