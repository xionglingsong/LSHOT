import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTranscript, dedupeCues, groupCues, transcriptBody, youtubeId } from "../backend/parse.ts";

const url = "https://www.youtube.com/watch?list=example&v=abcdefghijk";
test("accepts video URLs with reordered parameters, rejects lookalike hosts", () => {
  for (const u of [url, "https://youtu.be/abcdefghijk?t=10", "https://m.youtube.com/shorts/abcdefghijk"]) assert.equal(youtubeId(u), "abcdefghijk");
  for (const u of ["https://youtube.com.evil/watch?v=abcdefghijk", "https://evil/youtube.com/watch?v=abcdefghijk", "javascript:alert(1)"]) assert.equal(youtubeId(u), null);
});
test("VTT/SRT preserve precision, decode entities and use seconds for paragraph gaps", () => {
  const cues = parseTranscript("WEBVTT\n\n00:00:01.250 --> 00:00:02.000 align:start\n<c>Hello &amp; welcome.</c>\n\n00:00:05.100 --> 00:00:06.000\nNext speaker.\n");
  assert.equal(cues[0].start, 1.25);
  assert.equal(cues[0].text, "Hello & welcome.");
  assert.equal(groupCues(cues).length, 2);
  assert.deepEqual(parseTranscript("1\n01:02:03,456 --> 01:02:04,567\nHello\nworld"), [{ start: 3723.456, end: 3724.567, text: "Hello world" }]);
});
test("only overlapping rolling captions lose repeated words; later repetitions remain", () => {
  assert.deepEqual(dedupeCues([
    { start: 0, end: 3, text: "Hello wonderful world" },
    { start: 2, end: 4, text: "wonderful world again" },
    { start: 6, end: 7, text: "wonderful world again" },
  ]).map(c => c.text), ["Hello wonderful world", "again", "wonderful world again"]);
});
test("unpunctuated captions are bounded and CJK joins without added spaces", () => {
  const groups = groupCues(Array.from({ length: 100 }, (_, i) => ({ start: i, end: i + 1, text: `word${i}` })));
  assert.ok(groups.length >= 4);
  assert.equal(groupCues([{ start: 0, text: "你好" }, { start: 1, text: "世界" }])[0].text, "你好世界");
  const long = "word ".repeat(15000);
  const parts = groupCues([{ start: 0, text: long }]);
  assert.ok(parts.every(p => p.text.length <= 1200));
  assert.equal(parts.map(p => p.text).join(" "), long.trim());
});
test("JSON3 and clipper HTML/Markdown imports retain timestamp links without executable HTML", () => {
  const json = JSON.stringify({ events: [{ tStartMs: 1234, dDurationMs: 1000, segs: [{ utf8: "hello " }, { utf8: "world" }] }] });
  assert.equal(parseTranscript(json)[0].text, "hello world");
  const html = '<div class="youtube transcript"><h2>Transcript</h2><p class="transcript-segment"><strong><span class="timestamp" data-timestamp="12.5" data-end="15">00:12</span></strong> · Hello &amp; welcome<script>evil()</script></p></div>';
  const body = transcriptBody(html, url, "manual");
  assert.equal(body.cues, 1);
  assert.match(body.html, /t=12s/);
  assert.match(body.html, /<code>00:12<\/code>/);
  assert.match(body.text, /Hello & welcome/);
  assert.doesNotMatch(body.html, /script|evil\(\)/);
  assert.deepEqual(parseTranscript("# Transcript\n\n**[01:02](https://youtube.com/watch?v=abcdefghijk&t=62)** · Hello\nworld\n\n[01:32] Next"), [
    { start: 62, text: "Hello world" }, { start: 92, text: "Next" },
  ]);
  assert.match(transcriptBody(JSON.stringify([{ start: 0, text: '<img src=x onerror="evil()">' }]), url, "unknown").html, /&lt;img/);
});
test("rejects missing, reversed and invalid timestamps and non-subtitle files", () => {
  for (const raw of ["ordinary page text", "{}", "null", "[null]", '[{"start":-1,"text":"bad"}]', '00:60:00 --> 00:60:10\nbad',
    '[{"start":2,"text":"first"},{"start":1,"text":"second"}]', '00:00:10 --> 00:00:01\nbad']) {
    assert.throws(() => parseTranscript(raw));
  }
});
