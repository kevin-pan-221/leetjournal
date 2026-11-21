//! Cache only small raster diagrams from known LeetCode asset hosts, never active HTML/SVG.
use base64::{engine::general_purpose::STANDARD, Engine};
use scraper::{Html, Selector};
use serde_json::{Map, Value};
use std::time::Duration;

fn image_url(source: &str) -> Option<reqwest::Url> {
    let base = reqwest::Url::parse("https://leetcode.com/").ok()?;
    let url = base.join(source).ok()?;
    (url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "assets.leetcode.com"
                    | "leetcode.com"
                    | "www.leetcode.com"
                    | "s3-lc-upload.s3.amazonaws.com"
            )
        ))
    .then_some(url)
}

fn raster_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("webp")
    } else {
        None
    }
}

fn sources(html: &str) -> Vec<String> {
    let document = Html::parse_fragment(html);
    let selector = Selector::parse("img[src]").expect("static image selector");
    let mut urls = Vec::new();
    for node in document.select(&selector) {
        if let Some(src) = node.value().attr("src") {
            if !urls.iter().any(|url| url == src) {
                urls.push(src.to_owned());
            }
        }
        if urls.len() >= 12 {
            break;
        }
    }
    urls
}

async fn download(client: &reqwest::Client, url: reqwest::Url) -> Option<String> {
    let mut response = client
        .get(url)
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > 1_000_000 {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    let kind = raster_type(&bytes)?;
    Some(format!(
        "data:image/{kind};base64,{}",
        STANDARD.encode(bytes)
    ))
}

pub async fn cache(client: &reqwest::Client, question: &mut Value, previous: Option<&Value>) {
    let urls = sources(question["content"].as_str().unwrap_or_default());
    let mut images = Map::new();
    let mut size = 0;
    // Retain usable earlier diagrams if a refresh is interrupted or a CDN is unavailable.
    for source in &urls {
        if let Some(value) = previous.and_then(|p| p["images"][source].as_str()) {
            if size + value.len() <= 6_000_000 {
                size += value.len();
                images.insert(source.clone(), Value::String(value.into()));
            }
        }
    }
    let work = async {
        for source in urls {
            if images.contains_key(&source) {
                continue;
            }
            if let Some(url) = image_url(&source) {
                if let Some(data) = download(client, url).await {
                    if size + data.len() > 6_000_000 {
                        continue;
                    }
                    size += data.len();
                    images.insert(source, Value::String(data));
                }
            }
        }
    };
    let _ = tokio::time::timeout(Duration::from_secs(12), work).await;
    question["images"] = Value::Object(images);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagrams_cannot_fetch_arbitrary_hosts_or_active_content() {
        for url in [
            "http://assets.leetcode.com/a.png",
            "https://127.0.0.1/a",
            "https://assets.leetcode.com.evil.test/a",
            "https://assets.leetcode.com:444/a",
            "https://user:pass@assets.leetcode.com/a",
            "file:///a",
            "data:image/svg+xml,test",
        ] {
            assert!(image_url(url).is_none(), "{url}");
        }
        assert!(image_url("https://assets.leetcode.com/uploads/a.png").is_some());
        assert!(image_url("/uploads/a.png").is_some());
        assert_eq!(raster_type(b"<svg>bad</svg>"), None);
        assert_eq!(raster_type(b"\x89PNG\r\n\x1a\nbytes"), Some("png"));
    }
    #[test]
    fn html_image_sources_are_decoded_deduplicated_and_bounded() {
        assert_eq!(
            sources("<img src='/a?x=1&amp;y=2'><img src='/a?x=1&amp;y=2'>"),
            vec!["/a?x=1&y=2"]
        );
        assert_eq!(
            sources(
                &(0..100)
                    .map(|i| format!("<img src='/{i}'>"))
                    .collect::<String>()
            )
            .len(),
            12
        );
    }
}
