//! Start an installed local service, never the desktop GUI or an installer.
use super::{AppError, AppResult, Duration, LM_STUDIO_BASE_URL};
use std::{path::PathBuf, process::Stdio};

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn startup_reports_missing_executables_and_failed_commands() {
        tauri::async_runtime::block_on(async {
            assert!(
                command(std::path::Path::new("/nonexistent/leetjournal-lms"), &[])
                    .await
                    .is_err()
            );
            assert!(command(std::path::Path::new("/usr/bin/false"), &[])
                .await
                .is_err());
            assert!(command(std::path::Path::new("/usr/bin/true"), &[])
                .await
                .is_ok());
        });
    }
}

fn cli_path() -> AppResult<PathBuf> {
    // Finder-launched apps do not inherit the user's interactive shell PATH.
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(home) = home {
        let path = PathBuf::from(home).join(".lmstudio/bin/lms");
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(AppError::Message(
        "Set up LM Studio first using the link in Settings → Local AI.".into(),
    ))
}

async fn command(cli: &std::path::Path, args: &[&str]) -> AppResult<()> {
    let status = tokio::time::timeout(
        Duration::from_secs(30),
        tokio::process::Command::new(cli)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await
    .map_err(|_| {
        AppError::Message(
            "LM Studio headless startup timed out. Check your llmster installation and try again."
                .into(),
        )
    })?
    .map_err(|error| AppError::Message(format!("Could not start LM Studio headlessly: {error}")))?;
    if !status.success() {
        return Err(AppError::Message(format!(
            "LM Studio headless startup failed. Run `lms {}` in Terminal to diagnose; check that llmster is installed.", args.join(" ")
        )));
    }
    Ok(())
}

pub(super) async fn ensure_running(client: &reqwest::Client) -> AppResult<()> {
    match client
        .get(format!("{LM_STUDIO_BASE_URL}/api/v1/models"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        // A responding server may require authentication or report an error.
        // Let the model lookup explain it; do not start a competing service.
        Ok(_) => return Ok(()),
        Err(error) if error.is_connect() => {}
        Err(error) => {
            return Err(AppError::Message(format!(
                "LM Studio is not responding: {error}"
            )))
        }
    }
    let cli = cli_path()?;
    command(&cli, &["daemon", "up"]).await?;
    command(
        &cli,
        &["server", "start", "--port", "1234", "--bind", "127.0.0.1"],
    )
    .await?;
    Ok(())
}
