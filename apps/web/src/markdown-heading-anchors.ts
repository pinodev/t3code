/**
 * GitHub-style heading anchors for chat markdown. Headings get `user-content-<slug>` ids, the
 * same shape rehype-sanitize gives authored ids, and a fragment such as `#Turning-it-on` finds
 * the heading "Turning it on" regardless of case, URL encoding, or that prefix.
 */

export const MARKDOWN_FRAGMENT_ID_PREFIX = "user-content-";

// github-slugger keeps letters, marks, numbers, connector punctuation (`_`), spaces and
// hyphens, then turns each space into a hyphen.
const SLUG_REMOVED_CHARACTERS = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

export function slugifyMarkdownHeading(text: string): string {
  return text.toLowerCase().replace(SLUG_REMOVED_CHARACTERS, "").replaceAll(" ", "-");
}

/** Dedupes slugs within one document the way github-slugger does: `a`, `a-1`, `a-2`. */
export function createMarkdownHeadingSlugger() {
  const occurrences = new Map<string, number>();
  return (text: string): string => {
    const base = slugifyMarkdownHeading(text);
    if (base.length === 0) return base;
    let slug = base;
    while (occurrences.has(slug)) {
      const count = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, count);
      slug = `${base}-${count}`;
    }
    occurrences.set(slug, 0);
    return slug;
  };
}

/** The comparable form of a fragment or element id: decoded, unprefixed, lowercase. */
export function normalizeMarkdownFragment(fragment: string): string {
  let id = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  try {
    id = decodeURIComponent(id);
  } catch {
    // Keep the raw fragment when it is not valid percent-encoding.
  }
  while (id.startsWith(MARKDOWN_FRAGMENT_ID_PREFIX)) {
    id = id.slice(MARKDOWN_FRAGMENT_ID_PREFIX.length);
  }
  return id.toLowerCase();
}

const FENCE_OPENING = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^(?: {0,3}> ?)* {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const ATX_CLOSING_SEQUENCE = /(?:^|[ \t]+)#+$/;

/** Rendered text of a heading's inline markdown, close enough for slug comparison. */
function headingSourceText(source: string): string {
  // Code spans render verbatim; only the text around them carries link and emphasis syntax.
  return source
    .replace(ATX_CLOSING_SEQUENCE, "")
    .replace(/(`+)(.*?)\1|[^`]+/g, (segment, _ticks, code: string | undefined) =>
      code !== undefined
        ? code
        : segment
            .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
            .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/<[^>]+>/g, "")
            .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, "$1"),
    )
    .trim();
}

/**
 * Slugs of a message's ATX headings, in order and deduped like the rendered ids. Scans source
 * text so virtualized messages that are not in the DOM can still be searched.
 */
export function markdownHeadingSlugs(markdown: string): string[] {
  const slug = createMarkdownHeadingSlugger();
  const slugs: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMarker = FENCE_OPENING.exec(line)?.[1];
    if (fence !== null) {
      const closes =
        fenceMarker !== undefined &&
        fenceMarker[0] === fence[0] &&
        fenceMarker.length >= fence.length &&
        line.trimEnd().endsWith(fenceMarker);
      if (closes) fence = null;
      continue;
    }
    if (fenceMarker) {
      fence = fenceMarker;
      continue;
    }
    const heading = ATX_HEADING.exec(line);
    if (!heading) continue;
    const id = slug(headingSourceText(heading[1] ?? ""));
    if (id.length > 0) slugs.push(id);
  }
  return slugs;
}

export function markdownContainsHeadingFragment(markdown: string, fragment: string): boolean {
  const target = normalizeMarkdownFragment(fragment);
  // Cheap reject before the line scan: every heading needs a `#`.
  return (
    target.length > 0 && markdown.includes("#") && markdownHeadingSlugs(markdown).includes(target)
  );
}

/**
 * Picks the message to reveal for a heading fragment: the source message when it has the
 * heading, otherwise the latest message that does.
 */
export function findMarkdownHeadingMessageId<T extends { id: string; text: string }>(
  messages: ReadonlyArray<T>,
  fragment: string,
  sourceMessageId: string | null,
): T["id"] | null {
  const source =
    sourceMessageId === null
      ? undefined
      : messages.find((message) => message.id === sourceMessageId);
  if (source && markdownContainsHeadingFragment(source.text, fragment)) return source.id;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message !== source && markdownContainsHeadingFragment(message.text, fragment)) {
      return message.id;
    }
  }
  return null;
}

/** Finds the element a fragment names inside `root`, matching ids loosely. */
export function findMarkdownFragmentElement(
  root: ParentNode,
  fragment: string,
): HTMLElement | null {
  const target = normalizeMarkdownFragment(fragment);
  if (target.length === 0) return null;
  for (const element of root.querySelectorAll<HTMLElement>("[id]")) {
    if (normalizeMarkdownFragment(element.id) === target) return element;
  }
  return null;
}

interface HeadingHastNode {
  type?: string;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: HeadingHastNode[];
}

const HEADING_TAG = /^h[1-6]$/;

function hastText(node: HeadingHastNode): string {
  if (node.type === "text") return typeof node.value === "string" ? node.value : "";
  return node.children?.map(hastText).join("") ?? "";
}

/** Gives rendered headings their anchor ids. Runs after sanitize, which would prefix them. */
export function rehypeMarkdownHeadingIds() {
  return (tree: HeadingHastNode) => {
    const slug = createMarkdownHeadingSlugger();
    const visit = (node: HeadingHastNode) => {
      if (node.type === "element" && node.tagName && HEADING_TAG.test(node.tagName)) {
        const id = slug(hastText(node));
        if (id.length > 0 && node.properties?.id === undefined) {
          node.properties = { ...node.properties, id: `${MARKDOWN_FRAGMENT_ID_PREFIX}${id}` };
        }
        return;
      }
      // Headings never sit inside code blocks.
      if (node.tagName === "pre") return;
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
