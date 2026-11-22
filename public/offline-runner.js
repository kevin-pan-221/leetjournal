// Each run still gets a fresh worker (isolated Python globals, WASM memory released on exit), but a
// worker starts loading Python as soon as it is created, so the app can keep one warm before Run/Submit.
import { loadPyodide } from './python/pyodide.mjs'
// The harness reports each hidden test as it starts, so a timeout can name the last executed input.
self.reportProgress = index => self.postMessage({ type: 'progress', index })
const loading = (async () => {
  const python = await loadPyodide({ indexURL: new URL('./python/', self.location.href).href,
    stdout: () => {}, stderr: () => {} })
  const response = await fetch(new URL('./offline-harness.py', self.location.href))
  if (!response.ok) throw new Error('Bundled test runner is missing. Reinstall LeetJournal.')
  return { python, harness: await response.text() }
})()
// A load failure is reported when a payload arrives; tell an idle owner too so it can replace this worker.
loading.then(() => self.postMessage({ type: 'loaded' }), () => self.postMessage({ type: 'load-failed' }))
self.onmessage = async ({ data }) => {
  try {
    const { python, harness } = await loading
    self.postMessage({ type: 'ready' })
    python.globals.set('_offline_payload', JSON.stringify(data))
    await python.runPythonAsync(harness)
    self.postMessage({ type: 'result', results: JSON.parse(python.globals.get('_offline_result')) })
  } catch (error) {
    const text = String(error)
    // Deep recursion or freeing huge nested structures can overflow the WebAssembly stack.
    const overflow = /Maximum call stack|too much recursion|stack overflow/i.test(text)
    self.postMessage({ type: 'error', overflow, error: overflow
      ? 'RecursionError: the Python call stack overflowed. Offline Python supports about 1000 nested calls; use iteration or reduce recursion depth.'
      : text.slice(0, 4000) })
  }
}
