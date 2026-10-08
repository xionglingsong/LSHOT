import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { translationParts } from "@aihot/backend/editorial/translation-parts";
import { shield, unshield } from "@aihot/backend/editorial/translate";

test("splitting long inline HTML preserves text, entities, Unicode, markup and link destinations", () => {
  const html = `<em>before <a href="https://example.org/path?a=1&amp;b=2">${"A &amp; B 😀 中文 ".repeat(1500)}</a> after</em>`;
  const parts = translationParts(html, 3500);
  assert.ok(parts.length > 5);
  assert.ok(parts.every(p => p.length <= 3500));
  const text = (s: string) => cheerio.load(s, null, false).root().text();
  assert.equal(parts.map(text).join(""), text(html));
  for (const part of parts) {
    const $ = cheerio.load(part, null, false);
    assert.equal($("em").length, 1);
    assert.equal($("a").attr("href"), "https://example.org/path?a=1&b=2");
    assert.equal(unshield(shield(part).html, shield(part)), part);
  }
});
test("oversized code and media are kept whole and replaced by small placeholders", () => {
  const html = `<code>${"code ".repeat(2000)}</code><img src="https://example.org/image.png"><strong>${"text ".repeat(900)}</strong>`;
  const parts = translationParts(html, 3500);
  const $ = cheerio.load(parts.join(""), null, false);
  assert.equal($("code").length, 1);
  assert.equal($("code").text(), "code ".repeat(2000));
  assert.equal($("img").length, 1);
  assert.equal($("strong").text(), "text ".repeat(900));
  assert.ok(parts.map(p => shield(p).html).every(p => p.length <= 3500));
});
test("empty HTML cannot stand in for a translated paragraph", () => {
  assert.equal(unshield("<em> </em>", shield("A sentence")), null);
});
