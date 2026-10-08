# Embedded browser surfaces

The DOM reserves a slot; a native adapter owns the browser's actual frame,
border, inset, clipping and visibility. Do not independently reposition the
Tauri webview after it has been attached to this surface.

## Responsibilities

- `src/LeetCodeWorkspace.tsx`: trusted URL validation, persistent browser store,
  serialized creation/close, cache reuse. New browsers start offscreen and are
  revealed only after native layout completes.
- `src/browser/BrowserSurface.tsx`: measures the slot and observes layout events.
  Changes are microtask-coalesced, not dependent on animation frames (WebKit can
  throttle those when obscured). Animation frames are used only to follow live
  layout animations. No resize timers or window-size nudges.
- `src/browser/SurfaceController.ts`: one current mount lease and one in-flight
  native update. Resize bursts replace pending geometry; stale mounts cannot
  reposition or hide a remounted cache. Explicit hide suspends further updates.
- `src-tauri/src/browser_surface.rs`: validates requests and maps CSS coordinates
  into the native view hierarchy on the main thread. The rounded native
  container owns the border and masks its inset browser in one transaction.

## Coordinate contract

Measurements are CSS pixels relative to the main webview's viewport, **not the
NSWindow**. On macOS the main NSView bounds may include title-bar space that is
excluded from the DOM viewport. Use its `safeAreaRect`, then AppKit's view
conversion APIs; do not add a guessed title-bar offset. Derive the CSS scale
from that rectangle and the reported viewport width: WKWebView page zoom does
not necessarily change `devicePixelRatio`.

Both edges are aligned using AppKit's backing-coordinate conversion. Monitor
scale is separate from page zoom. Border radius, border width, colors and inset
come from the measured CSS frame, including responsive changes. The returned
native rectangle is converted back to CSS coordinates for regression checks.

The slot currently requires an axis-aligned, uniformly rounded frame with
uniform border/padding and an RGB background. Arbitrary rotated transforms or
ancestor clipping need an explicit extension of this contract. Native webviews
sit above HTML: modal owners must hide the surface, and compact layouts must
reserve space for the tools panel rather than overlap it using CSS z-index.
Backgrounding the app does not hide the surface; WebKit document visibility is
not a reliable proxy for native sibling visibility.

macOS has native rounded clipping. The fallback on other platforms only places
the child inside a CSS frame; it is not equivalent or validated. Re-run the
native harness when upgrading Tauri/Wry or changing window decorations.

## Regression checks

```bash
npm run check:all
node --experimental-strip-types --test tests/*.test.mjs

# In a separate terminal, start the test frontend:
npm run dev
# Then run the real native geometry checks:
cargo run --manifest-path src-tauri/Cargo.toml --example browser_surface_probe
```

The probe has a separate app identifier and a local mock browser page. It never
opens the journal database, loads AI models or uses LeetCode login data. Look for
`ALL NATIVE SURFACE CHECKS PASSED`: it checks cold creation, normal/narrow window
sizes, sidebar changes, hide/show, remounts, page zoom, and fullscreen transitions.
For manual corner inspection, run it with `LEETJOURNAL_SURFACE_INSPECT=1`; the
orange edge and colored corner markers must stay within the rounded frame.
If macOS refuses a programmatic fullscreen transition, the harness fails
explicitly rather than accepting the unchanged windowed geometry. Use the
isolated preview's green window button to verify fullscreen visually in that
environment; do not interpret the refused transition as a geometry pass.

The automated comparison permits at most one CSS pixel of rounding error.
Hardware testing on different display scales is still required before claiming
mixed-monitor coverage; page-zoom tests are not a substitute for that.
