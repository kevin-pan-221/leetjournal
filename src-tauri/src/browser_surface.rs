//! DOM reserves the slot; this adapter owns native geometry, frame and clipping.
//! CSS coordinates are relative to the main WKWebView, NOT its NSWindow.
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Webview};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct SurfaceRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceLayout {
    rect: SurfaceRect,
    viewport_width: f64,
    viewport_height: f64,
    device_pixel_ratio: f64,
    radius: f64,
    inset: f64,
    border_width: f64,
    border_color: [f64; 4],
    background: [f64; 4],
}

impl SurfaceLayout {
    fn validate(&self) -> AppResult<()> {
        let r = self.rect;
        let numbers = [
            r.x,
            r.y,
            r.width,
            r.height,
            self.viewport_width,
            self.viewport_height,
            self.device_pixel_ratio,
            self.radius,
            self.inset,
            self.border_width,
        ];
        if numbers
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 100_000.0)
            || r.width <= self.inset * 2.0
            || r.height <= self.inset * 2.0
            || self.viewport_width <= 0.0
            || self.viewport_height <= 0.0
            || self.device_pixel_ratio <= 0.0
            || self.radius < 0.0
            || self.inset < 0.0
            || self.border_width < 0.0
            || self.border_width > self.inset
            || self
                .border_color
                .iter()
                .chain(self.background.iter())
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return Err(AppError::Message("Invalid browser surface layout".into()));
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceReport {
    sequence: u64,
    visible: bool,
    actual: Option<SurfaceRect>,
}

fn authorize(source: &Webview, label: &str) -> AppResult<()> {
    if source.label() != "main" || !label.starts_with("browser-surface-") {
        return Err(AppError::Message(
            "Browser surfaces require the main app view".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_browser_surface(
    webview: Webview,
    app: AppHandle,
    webview_label: String,
    sequence: u64,
    layout: Option<SurfaceLayout>,
) -> AppResult<SurfaceReport> {
    authorize(&webview, &webview_label)?;
    if let Some(value) = &layout {
        value.validate()?;
    }
    let child = app
        .get_webview(&webview_label)
        .ok_or_else(|| AppError::Message("Browser surface is closed".into()))?;
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        webview
            .with_webview(move |source| {
                // Both callbacks run on the UI thread. Retain the source in a
                // thread-local registry, never send an AppKit object across threads.
                native::remember_source(&webview_label, source.inner());
                let _ = child.with_webview(move |target| {
                    let _ = tx.send(native::apply(
                        &webview_label,
                        target.inner(),
                        sequence,
                        layout,
                    ));
                });
            })
            .map_err(|e| AppError::Message(e.to_string()))?;
        rx.await
            .map_err(|_| AppError::Message("Browser surface update was interrupted".into()))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        // On other platforms the CSS frame remains visible around the inset
        // child. Platform-specific clipping can be added behind this contract.
        if let Some(l) = layout {
            let r = l.rect;
            let actual = SurfaceRect {
                x: r.x + l.inset,
                y: r.y + l.inset,
                width: r.width - 2.0 * l.inset,
                height: r.height - 2.0 * l.inset,
            };
            child
                .set_bounds(tauri::Rect {
                    position: tauri::LogicalPosition::new(actual.x, actual.y).into(),
                    size: tauri::LogicalSize::new(actual.width, actual.height).into(),
                })
                .map_err(|e| AppError::Message(e.to_string()))?;
            child.show().map_err(|e| AppError::Message(e.to_string()))?;
            Ok(SurfaceReport {
                sequence,
                visible: true,
                actual: Some(r),
            })
        } else {
            child.hide().map_err(|e| AppError::Message(e.to_string()))?;
            Ok(SurfaceReport {
                sequence,
                visible: false,
                actual: None,
            })
        }
    }
}

#[tauri::command]
pub async fn dispose_browser_surface(
    webview: Webview,
    app: AppHandle,
    webview_label: String,
) -> AppResult<()> {
    authorize(&webview, &webview_label)?;
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            native::dispose(&webview_label);
            let _ = tx.send(());
        })
        .map_err(|e| AppError::Message(e.to_string()))?;
        rx.await
            .map_err(|_| AppError::Message("Browser surface cleanup was interrupted".into()))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use objc2::{rc::Retained, MainThreadMarker};
    use objc2_app_kit::{NSAutoresizingMaskOptions, NSColor, NSView};
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use objc2_quartz_core::CATransaction;
    use std::{cell::RefCell, collections::HashMap, ffi::c_void};

    struct Surface {
        source: Retained<NSView>,
        container: Option<Retained<NSView>>,
        sequence: u64,
    }
    impl Drop for Surface {
        fn drop(&mut self) {
            if let Some(view) = &self.container {
                view.removeFromSuperview();
            }
        }
    }
    thread_local! { static SURFACES: RefCell<HashMap<String, Surface>> = RefCell::new(HashMap::new()); }

    pub fn remember_source(label: &str, source: *mut c_void) {
        SURFACES.with_borrow_mut(|surfaces| {
            surfaces.entry(label.to_owned()).or_insert_with(|| Surface {
                // Tauri supplies a live WKWebView (an NSView subclass) here.
                source: unsafe {
                    Retained::retain(source.cast::<NSView>()).expect("live main view")
                },
                container: None,
                sequence: 0,
            });
        });
    }

    pub fn dispose(label: &str) {
        SURFACES.with_borrow_mut(|surfaces| {
            surfaces.remove(label);
        });
    }

    pub fn apply(
        label: &str,
        target: *mut c_void,
        sequence: u64,
        layout: Option<SurfaceLayout>,
    ) -> AppResult<SurfaceReport> {
        SURFACES.with_borrow_mut(|surfaces| {
            let surface = surfaces
                .get_mut(label)
                .ok_or_else(|| AppError::Message("Missing browser surface".into()))?;
            let browser = unsafe { &*target.cast::<NSView>() };
            if sequence <= surface.sequence {
                return Ok(SurfaceReport {
                    sequence: surface.sequence,
                    visible: !browser.isHidden(),
                    actual: None,
                });
            }
            surface.sequence = sequence;
            let hide = || {
                browser.setHidden(true);
                if let Some(container) = &surface.container {
                    container.setHidden(true);
                }
                SurfaceReport {
                    sequence,
                    visible: false,
                    actual: None,
                }
            };
            let Some(l) = layout else {
                return Ok(hide());
            };
            let source = &surface.source;
            // WKWebView's DOM viewport excludes AppKit's safe/title-bar inset.
            // Its NSView bounds can still extend underneath that area. Converting
            // from the safe rectangle avoids the windowed/fullscreen y offset.
            let source_bounds = source.safeAreaRect();
            let window = source
                .window()
                .ok_or_else(|| AppError::Message("Browser window is closed".into()))?;
            let backing = window.backingScaleFactor();
            // WKWebView page zoom changes innerWidth without changing DPR.
            // Derive CSS-to-native scale from the actual viewport, keeping the
            // monitor backing scale separate for physical-pixel alignment.
            let scale = source_bounds.size.width / l.viewport_width;
            // A resize can reach AppKit before the DOM. Never display geometry
            // measured against an old viewport; the next layout event retries.
            if !scale.is_finite()
                || scale <= 0.0
                || backing <= 0.0
                || (source_bounds.size.height - l.viewport_height * scale).abs() > 2.0
            {
                return Ok(hide());
            }
            let parent = unsafe { source.superview() }
                .ok_or_else(|| AppError::Message("Browser has no native parent".into()))?;
            let r = l.rect;
            let local = NSRect::new(
                NSPoint::new(
                    source_bounds.origin.x + r.x * scale,
                    source_bounds.origin.y
                        + if source.isFlipped() {
                            r.y * scale
                        } else {
                            source_bounds.size.height - (r.y + r.height) * scale
                        },
                ),
                NSSize::new(r.width * scale, r.height * scale),
            );
            let frame = parent.convertRect_fromView(local, Some(source));
            // Align both edges to the actual display pixel grid in AppKit's
            // backing coordinates, instead of rounding CSS pixels independently.
            let pixels = parent.convertRectToBacking(frame);
            let aligned = NSRect::new(
                NSPoint::new(pixels.origin.x.round(), pixels.origin.y.round()),
                NSSize::new(
                    (pixels.origin.x + pixels.size.width).round() - pixels.origin.x.round(),
                    (pixels.origin.y + pixels.size.height).round() - pixels.origin.y.round(),
                ),
            );
            let frame = parent.convertRectFromBacking(aligned);
            let mtm = MainThreadMarker::new().expect("Tauri UI thread");
            let container = surface.container.get_or_insert_with(|| {
                let view = NSView::new(mtm);
                view.setHidden(true);
                view.setAutoresizingMask(NSAutoresizingMaskOptions::ViewNotSizable);
                view.setWantsLayer(true);
                parent.addSubview(&view);
                view.addSubview(browser);
                browser.setAutoresizingMask(
                    NSAutoresizingMaskOptions::ViewWidthSizable
                        | NSAutoresizingMaskOptions::ViewHeightSizable,
                );
                view
            });
            // One main-thread transaction owns frame, border, clip and reveal.
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            container.setFrame(frame);
            let inset = (l.inset * scale * backing).round() / backing;
            let radius = (l.radius * scale)
                .min(frame.size.width / 2.0)
                .min(frame.size.height / 2.0);
            if let Some(layer) = container.layer() {
                let c = l.border_color;
                let b = l.background;
                layer.setCornerRadius(radius);
                layer.setMasksToBounds(true);
                layer.setBorderWidth(l.border_width * scale);
                layer.setBorderColor(Some(
                    &NSColor::colorWithSRGBRed_green_blue_alpha(c[0], c[1], c[2], c[3]).CGColor(),
                ));
                layer.setBackgroundColor(Some(
                    &NSColor::colorWithSRGBRed_green_blue_alpha(b[0], b[1], b[2], b[3]).CGColor(),
                ));
                layer.setContentsScale(backing);
            }
            browser.setWantsLayer(true);
            browser.setFrame(NSRect::new(
                NSPoint::new(inset, inset),
                NSSize::new(
                    frame.size.width - 2.0 * inset,
                    frame.size.height - 2.0 * inset,
                ),
            ));
            if let Some(layer) = browser.layer() {
                layer.setCornerRadius((radius - inset).max(0.0));
                layer.setMasksToBounds(true);
                layer.setContentsScale(backing);
            }
            browser.setHidden(false);
            container.setHidden(false);
            CATransaction::commit();
            let actual = source.convertRect_fromView(container.frame(), Some(&parent));
            Ok(SurfaceReport {
                sequence,
                visible: true,
                actual: Some(SurfaceRect {
                    x: (actual.origin.x - source_bounds.origin.x) / scale,
                    y: if source.isFlipped() {
                        (actual.origin.y - source_bounds.origin.y) / scale
                    } else {
                        (source_bounds.origin.y + source_bounds.size.height
                            - actual.origin.y
                            - actual.size.height)
                            / scale
                    },
                    width: actual.size.width / scale,
                    height: actual.size.height / scale,
                }),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout() -> SurfaceLayout {
        SurfaceLayout {
            rect: SurfaceRect {
                x: 12.25,
                y: 10.0,
                width: 900.5,
                height: 700.0,
            },
            viewport_width: 1280.0,
            viewport_height: 792.0,
            device_pixel_ratio: 2.0,
            radius: 17.0,
            inset: 4.0,
            border_width: 1.0,
            border_color: [0.8, 0.8, 0.8, 1.0],
            background: [1.0; 4],
        }
    }

    #[test]
    fn accepts_fractional_surface_geometry() {
        assert!(layout().validate().is_ok());
    }

    #[test]
    fn rejects_invalid_native_geometry() {
        for value in [f64::NAN, f64::INFINITY, 100_001.0] {
            let mut l = layout();
            l.rect.x = value;
            assert!(l.validate().is_err());
        }
        let mut l = layout();
        l.rect.width = l.inset * 2.0;
        assert!(l.validate().is_err());
        let mut l = layout();
        l.viewport_width = 0.0;
        assert!(l.validate().is_err());
        let mut l = layout();
        l.border_width = l.inset + 1.0;
        assert!(l.validate().is_err());
        let mut l = layout();
        l.background[3] = 1.1;
        assert!(l.validate().is_err());
    }
}
