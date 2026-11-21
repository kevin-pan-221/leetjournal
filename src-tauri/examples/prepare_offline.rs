// Uses the same queue as Library > Save book offline, without opening a window.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 2 {
        return Err(
            "Usage: cargo run --example prepare_offline -- <existing database path> <book id>"
                .into(),
        );
    }
    tauri::async_runtime::block_on(leetjournal_lib::prepare_existing_book(
        std::path::Path::new(&args[0]),
        &args[1],
    ))
}
