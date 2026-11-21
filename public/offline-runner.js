// A fresh worker per run isolates Python globals and releases WASM memory on stop/exit.
import { loadPyodide } from './python/pyodide.mjs'
// The harness reports each hidden test as it starts, so a timeout can name the last executed input.
self.reportProgress = index => self.postMessage({ type: 'progress', index })
self.onmessage = async ({ data }) => {
  try {
    const python = await loadPyodide({ indexURL: new URL('./python/', self.location.href).href,
      stdout: () => {}, stderr: () => {} })
    const response = await fetch(new URL('./offline-harness.py', self.location.href))
    if (!response.ok) throw new Error('Bundled test runner is missing. Reinstall LeetJournal.')
    const harness = await response.text()
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
