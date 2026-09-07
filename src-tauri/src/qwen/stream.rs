use crate::error::{AppError, AppResult};

/// Decode complete SSE lines as UTF-8, since network chunks can split a character.
#[derive(Default)]
pub(crate) struct QwenStream {
    pending: Vec<u8>,
}

impl QwenStream {
    pub(crate) fn push(
        &mut self,
        chunk: &[u8],
        mut token: impl FnMut(String) -> AppResult<()>,
    ) -> AppResult<bool> {
        self.pending.extend_from_slice(chunk);
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let bytes: Vec<_> = self.pending.drain(..=end).collect();
            let line = std::str::from_utf8(&bytes)
                .map_err(|_| AppError::Message("Qwen returned invalid text.".into()))?
                .trim();
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let value: serde_json::Value = serde_json::from_str(data.trim())?;
            match value["type"].as_str() {
                Some("chat.end") => return Ok(true),
                Some("message.delta") => {
                    if let Some(content) = value["content"].as_str().filter(|text| !text.is_empty())
                    {
                        token(content.to_owned())?;
                    }
                }
                Some("error" | "chat.error") => {
                    return Err(AppError::Message(
                        "Qwen could not finish this response. Check LM Studio and try again."
                            .into(),
                    ));
                }
                _ => {}
            }
        }
        if self.pending.len() > 1_000_000 {
            return Err(AppError::Message(
                "Qwen returned an oversized stream event.".into(),
            ));
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_unicode_at_every_network_boundary() {
        let stream = "event: message.delta\r\ndata: {\"type\":\"message.delta\",\"content\":\"café 🌱\"}\r\n\r\ndata:{\"type\":\"chat.end\"}\n\n";
        for split in 0..stream.len() {
            let mut decoder = QwenStream::default();
            let mut output = String::new();
            let mut emit = |text: String| {
                output.push_str(&text);
                Ok(())
            };
            let first = decoder
                .push(&stream.as_bytes()[..split], &mut emit)
                .unwrap();
            let second = decoder
                .push(&stream.as_bytes()[split..], &mut emit)
                .unwrap();
            assert!(first || second);
            assert_eq!(output, "café 🌱");
        }
    }

    #[test]
    fn incomplete_stream_never_reports_completion() {
        let mut decoder = QwenStream::default();
        assert!(!decoder
            .push(
                b"data: {\"type\":\"message.delta\",\"content\":\"partial\"}\n",
                |_| Ok(())
            )
            .unwrap());
    }

    #[test]
    fn reports_server_errors_and_closed_consumers() {
        assert!(QwenStream::default()
            .push(b"data: {\"type\":\"error\"}\n", |_| Ok(()))
            .is_err());
        assert!(QwenStream::default()
            .push(
                b"data: {\"type\":\"message.delta\",\"content\":\"hi\"}\n",
                |_| Err(AppError::Message("closed".into()))
            )
            .is_err());
    }
}
