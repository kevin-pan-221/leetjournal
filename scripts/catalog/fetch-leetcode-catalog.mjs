// Refreshes src-tauri/data/leetcode_catalog.json from LeetCode's public problem list.
//   npm run catalog:fetch
// Sends no account data: anonymous GraphQL requests, 100 problems per page, one page at a time.
import { writeFile } from 'node:fs/promises'

const query = `query list($skip: Int, $limit: Int) {
  questionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
    totalNum
    data { questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name } }
  }
}`
const page = async skip => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/' },
      body: JSON.stringify({ query, variables: { skip, limit: 100 } }),
    })
    if (response.ok) return (await response.json()).data.questionList
    if (attempt === 4) throw new Error(`LeetCode returned ${response.status} at offset ${skip}`)
    await new Promise(r => setTimeout(r, 2000 * attempt))
  }
}

const rows = []
let total = Infinity
while (rows.length < total) {
  const { totalNum, data } = await page(rows.length)
  total = totalNum
  if (!data.length) break
  rows.push(...data)
  process.stdout.write(`\r${rows.length} / ${total}`)
  await new Promise(r => setTimeout(r, 400))
}
const problems = rows
  .filter(q => /^\d+$/.test(q.questionFrontendId) && /^[a-z0-9-]+$/.test(q.titleSlug))
  .map(q => ({
    id: q.titleSlug,
    number: Number(q.questionFrontendId),
    title: q.title,
    difficulty: q.difficulty,
    category: q.topicTags[0]?.name ?? 'Other',
    paidOnly: q.isPaidOnly,
  }))
  .sort((a, b) => a.number - b.number)
const catalog = { source: 'https://leetcode.com/problemset/', fetchedAt: new Date().toISOString().slice(0, 10), problems }
await writeFile(new URL('../../src-tauri/data/leetcode_catalog.json', import.meta.url), JSON.stringify(catalog) + '\n')
console.log(`\nSaved ${problems.length} problems (${problems.filter(p => !p.paidOnly).length} free)`)
