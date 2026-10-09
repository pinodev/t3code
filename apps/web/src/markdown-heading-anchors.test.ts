import { describe, expect, it } from "vite-plus/test";

import {
  createMarkdownHeadingSlugger,
  findMarkdownHeadingMessageId,
  markdownContainsHeadingFragment,
  markdownHeadingSlugs,
  normalizeMarkdownFragment,
  rehypeMarkdownHeadingIds,
  slugifyMarkdownHeading,
} from "./markdown-heading-anchors";

describe("slugifyMarkdownHeading", () => {
  it.each([
    ["Turning it on", "turning-it-on"],
    ["What's new in v2.0?", "whats-new-in-v20"],
    ["snake_case & more", "snake_case--more"],
    ["Réglages – avancés", "réglages--avancés"],
    ["  padded  ", "--padded--"],
  ])("slugs %j as %j", (text, expected) => {
    expect(slugifyMarkdownHeading(text)).toBe(expected);
  });
});

describe("createMarkdownHeadingSlugger", () => {
  it("dedupes repeated headings like github-slugger", () => {
    const slug = createMarkdownHeadingSlugger();
    expect(["Setup", "Setup", "Setup-1", "Setup"].map(slug)).toEqual([
      "setup",
      "setup-1",
      "setup-1-1",
      "setup-2",
    ]);
  });
});

describe("normalizeMarkdownFragment", () => {
  it.each([
    ["#Turning-it-on", "turning-it-on"],
    ["user-content-turning-it-on", "turning-it-on"],
    ["#user-content-user-content-Setup", "setup"],
    ["#r%C3%A9glages", "réglages"],
    ["#100%", "100%"],
  ])("normalizes %j to %j", (fragment, expected) => {
    expect(normalizeMarkdownFragment(fragment)).toBe(expected);
  });
});

describe("markdownHeadingSlugs", () => {
  it("collects ATX headings with inline markdown and closing sequences", () => {
    const markdown = [
      "# Intro ##",
      "Some text with # not a heading",
      "## [Turning it on](https://example.com) `now`",
      "### `__init__` and _emphasis_",
      "#### ![logo](logo.png) **Bold**",
      "> ## Quoted",
      "#NoSpace",
      "####### Seven",
    ].join("\n");
    expect(markdownHeadingSlugs(markdown)).toEqual([
      "intro",
      "turning-it-on-now",
      "__init__-and-emphasis",
      "bold",
      "quoted",
    ]);
  });

  it("skips headings inside fenced code and dedupes within the message", () => {
    const markdown = [
      "## Setup",
      "```sh",
      "# not a heading",
      "~~~",
      "## still code",
      "```js",
      "## still code",
      "```",
      "## Setup",
      "~~~~",
      "# also code",
      "~~~~",
    ].join("\r\n");
    expect(markdownHeadingSlugs(markdown)).toEqual(["setup", "setup-1"]);
  });
});

describe("markdownContainsHeadingFragment", () => {
  it("matches fragments case-insensitively, prefixed or encoded", () => {
    const markdown = "Intro\n\n## Turning it on\n\n## Réglages";
    expect(markdownContainsHeadingFragment(markdown, "#Turning-it-on")).toBe(true);
    expect(markdownContainsHeadingFragment(markdown, "#user-content-turning-it-on")).toBe(true);
    expect(markdownContainsHeadingFragment(markdown, "#R%C3%A9glages")).toBe(true);
    expect(markdownContainsHeadingFragment(markdown, "#turning")).toBe(false);
    expect(markdownContainsHeadingFragment(markdown, "#")).toBe(false);
  });
});

describe("findMarkdownHeadingMessageId", () => {
  const messages = [
    { id: "a", text: "## Setup\n\n## Usage" },
    { id: "b", text: "No headings here" },
    { id: "c", text: "## Setup" },
  ];

  it("prefers the source message when it has the heading", () => {
    expect(findMarkdownHeadingMessageId(messages, "#setup", "a")).toBe("a");
  });

  it("falls back to the latest message with the heading", () => {
    expect(findMarkdownHeadingMessageId(messages, "#setup", "b")).toBe("c");
    expect(findMarkdownHeadingMessageId(messages, "#Usage", null)).toBe("a");
    expect(findMarkdownHeadingMessageId(messages, "#missing", null)).toBeNull();
  });
});

describe("rehypeMarkdownHeadingIds", () => {
  it("assigns prefixed, deduped ids that agree with the source scan", () => {
    const heading = (tagName: string, ...text: string[]) => ({
      type: "element",
      tagName,
      properties: {},
      children: text.map((value) => ({ type: "text", value })),
    });
    const authored = { ...heading("h2", "Authored"), properties: { id: "user-content-kept" } };
    const tree = {
      type: "root",
      children: [
        heading("h1", "Turning it ", "on"),
        heading("p", "Setup"),
        heading("h2", "Setup"),
        { type: "element", tagName: "blockquote", children: [heading("h3", "Setup")] },
        { type: "element", tagName: "pre", children: [heading("h4", "Ignored")] },
        authored,
      ],
    };
    rehypeMarkdownHeadingIds()(tree);
    const ids = [
      tree.children[0],
      tree.children[2],
      tree.children[3]?.children?.[0],
      tree.children[4]?.children?.[0],
      authored,
    ].map((node) => (node as { properties?: { id?: unknown } }).properties?.id);
    expect(ids).toEqual([
      "user-content-turning-it-on",
      "user-content-setup",
      "user-content-setup-1",
      undefined,
      "user-content-kept",
    ]);
  });
});
