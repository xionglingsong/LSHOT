import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

/** Split a leaf block without cutting entities, surrogate pairs, links or inline markup. */
export function translationParts(html: string, limit: number): string[] {
  if (html.length <= limit) return [html];
  const $ = cheerio.load(html, null, false);
  const escapeText = (text: string) => $("<span></span>").text(text).html()!;
  const pack = (parts: string[], budget: number): string[] => {
    const out: string[] = [];
    for (const part of parts) {
      if (out.length && out.at(-1)!.length + part.length <= budget) out[out.length - 1] += part;
      else out.push(part);
    }
    return out;
  };
  const split = (node: AnyNode, budget: number): string[] => {
    const outer = $.html(node);
    if (outer.length <= budget || budget < 12) return [outer];
    if (node.type === "text") {
      const parts: string[] = [];
      let text = node.data;
      while (text) {
        let end = Math.min(Math.floor(budget / 6), text.length); // entities can expand to six characters
        if (end < text.length) {
          const boundary = text.lastIndexOf(" ", end - 1);
          if (boundary > end / 2) end = boundary + 1;
          if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
        }
        parts.push(escapeText(text.slice(0, end)));
        text = text.slice(end);
      }
      return pack(parts, budget);
    }
    if (node.type !== "tag") return [outer];
    const el = node as Element;
    // Media and code stay indivisible; shield() replaces them before the model is asked.
    if (["img", "picture", "video", "code"].includes(el.name)) return [outer];
    const empty = $(el).clone().empty().toString();
    const close = `</${el.name}>`;
    if (!empty.endsWith(close)) return [outer];
    const open = empty.slice(0, -close.length);
    const innerBudget = budget - empty.length;
    if (innerBudget < 12) return [outer];
    return pack(el.children.flatMap(child => split(child, innerBudget)), innerBudget).map(part => `${open}${part}${close}`);
  };
  return pack($.root().contents().toArray().flatMap(node => split(node, limit)), limit);
}
