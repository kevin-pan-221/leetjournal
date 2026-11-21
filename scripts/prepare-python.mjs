// Ship only the core runtime: no CDN, package installation, or system Python at run time.
import { copyFile, mkdir } from 'node:fs/promises'
const source = new URL('../node_modules/pyodide/', import.meta.url)
const target = new URL('../public/python/', import.meta.url)
await mkdir(target, { recursive: true })
for (const name of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  await copyFile(new URL(name, source), new URL(name, target))
}
