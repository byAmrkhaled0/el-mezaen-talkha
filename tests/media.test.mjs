import test from "node:test";
import assert from "node:assert/strict";
import { isVideoContent, videoSource } from "../src/media.js";

test("recognizes direct and supported social video URLs", () => {
  assert.equal(videoSource("https://cdn.example.com/news/video.mp4").kind, "direct");
  assert.match(videoSource("https://youtu.be/dQw4w9WgXcQ").url, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(videoSource("https://www.facebook.com/page/videos/123").provider, "facebook");
  assert.match(videoSource("https://www.tiktok.com/@name/video/7351234567890123456").url, /tiktok\.com\/player\/v1\/7351234567890123456/);
});

test("marks video content without treating image posts as videos", () => {
  assert.equal(isVideoContent({ mediaType: "video" }), true);
  assert.equal(isVideoContent({ videoUrl: "https://example.com/a.mp4" }), true);
  assert.equal(isVideoContent({ mediaType: "image", imageUrl: "/a.webp" }), false);
});
