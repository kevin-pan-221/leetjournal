use block2::RcBlock;
use objc2_foundation::{NSDistributedNotificationCenter, NSNotification, NSString};
use std::ptr::NonNull;
use tauri::{AppHandle, Emitter};

pub fn install(app: AppHandle) {
    let center = NSDistributedNotificationCenter::defaultCenter();
    // Spotify desktop's notification is a best-effort signal, not a public API
    // contract. The widget keeps periodic/focus refreshes as a fallback.
    let name = NSString::from_str("com.spotify.client.PlaybackStateChanged");
    let handler = RcBlock::new(move |_: NonNull<NSNotification>| {
        // Cross-process notification data is untrusted. Forward only a wake-up;
        // the enabled, visible widget reads real state from Spotify itself.
        let _ = app.emit_to("main", "spotify-playback-changed", ());
    });
    // Setup runs once on the main thread. The center retains the copied block.
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(Some(&name), None, None, &handler)
    };
    // Like the app's Escape monitor, this observer has process lifetime. It
    // launches no helper or playback reads when the widget is hidden/disabled.
    std::mem::forget(observer);
}
