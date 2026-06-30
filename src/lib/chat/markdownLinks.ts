const MARKDOWN_CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;
const BARE_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;
const CJK_URL_BOUNDARY_PATTERN = /[，。！？、；：]/;
const ASCII_TRAILING_PUNCTUATION_PATTERN = /[.,!?;:]+$/;

export function normalizeBareUrlsForMarkdown(markdown: string): string {
  if (!markdown) return markdown;

  return markdown
    .split(MARKDOWN_CODE_SEGMENT_PATTERN)
    .map(segment => {
      if (segment.startsWith('`')) return segment;
      return linkifyBareUrls(segment);
    })
    .join('');
}

function linkifyBareUrls(text: string): string {
  return text.replace(BARE_URL_PATTERN, (candidate, offset: number) => {
    if (isInsideMarkdownLink(text, offset)) return candidate;

    const { url, suffix } = splitUrlCandidate(candidate);
    if (!url) return candidate;
    return `[${url}](${url})${suffix}`;
  });
}

function isInsideMarkdownLink(text: string, offset: number): boolean {
  const prefix = text.slice(Math.max(0, offset - 2), offset);
  if (prefix === '](') return true;
  if (text[offset - 1] === '[') return true;
  return false;
}

function splitUrlCandidate(candidate: string): { url: string; suffix: string } {
  const cjkBoundaryIndex = candidate.search(CJK_URL_BOUNDARY_PATTERN);
  let url = cjkBoundaryIndex >= 0 ? candidate.slice(0, cjkBoundaryIndex) : candidate;
  let suffix = cjkBoundaryIndex >= 0 ? candidate.slice(cjkBoundaryIndex) : '';

  const trailingPunctuation = url.match(ASCII_TRAILING_PUNCTUATION_PATTERN)?.[0] ?? '';
  if (trailingPunctuation) {
    url = url.slice(0, -trailingPunctuation.length);
    suffix = `${trailingPunctuation}${suffix}`;
  }

  return { url, suffix };
}
