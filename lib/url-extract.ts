const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

const stripTrailingPunctuation = (value: string): { url: string; suffix: string } => {
  const match = value.match(/(.*?)([.,;!?]*)$/);
  return { url: match?.[1] ?? value, suffix: match?.[2] ?? "" };
};

export function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(URL_PATTERN), (match) => stripTrailingPunctuation(match[0]).url);
}

export function replaceUrlsInText(
  text: string,
  replacements: ReadonlyMap<string, string>
): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const { url, suffix } = stripTrailingPunctuation(match[0]);
    parts.push(text.slice(cursor, match.index), replacements.get(url) ?? url, suffix);
    cursor = match.index + match[0].length;
  }

  parts.push(text.slice(cursor));
  return parts.join("");
}
