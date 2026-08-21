/**
 * Zero-dependency robust HTML parser for meta tags, links, and JSON-LD scripts
 */

export interface ParsedHtmlMeta {
  name?: string;
  property?: string;
  content: string;
}

export interface ParsedHtmlLink {
  rel: string;
  href: string;
  type?: string;
}

export interface ParsedHtml {
  title?: string;
  meta: ParsedHtmlMeta[];
  links: ParsedHtmlLink[];
  jsonLdRaw: string[];
  headings: string[];
  canonicalUrl?: string;
  paymentLinkCandidates: string[];
}

export function parseHtml(html: string): ParsedHtml {
  const result: ParsedHtml = {
    meta: [],
    links: [],
    jsonLdRaw: [],
    headings: [],
    paymentLinkCandidates: [],
  };

  if (!html || typeof html !== 'string') {
    return result;
  }

  // 1. Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    result.title = decodeHtmlEntities(titleMatch[1].trim());
  }

  // 2. Extract <meta ...> tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrString = match[1];
    const attrs = parseAttributes(attrString);
    const content = attrs['content'] || '';
    const name = attrs['name'] || attrs['http-equiv'];
    const property = attrs['property'];
    if (content || name || property) {
      result.meta.push({
        name,
        property,
        content: decodeHtmlEntities(content),
      });
    }
  }

  // 3. Extract <link ...> tags
  const linkRegex = /<link\s+([^>]*?)>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const attrString = match[1];
    const attrs = parseAttributes(attrString);
    if (attrs['href'] && attrs['rel']) {
      const linkItem: ParsedHtmlLink = {
        rel: attrs['rel'].toLowerCase(),
        href: attrs['href'],
        type: attrs['type'],
      };
      result.links.push(linkItem);
      if (linkItem.rel === 'canonical') {
        result.canonicalUrl = linkItem.href;
      }
    }
  }

  // 4. Extract <script type="application/ld+json">...</script>
  const scriptRegex = /<script\s+[^>]*?type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = scriptRegex.exec(html)) !== null) {
    const jsonStr = match[1].trim();
    if (jsonStr) {
      result.jsonLdRaw.push(jsonStr);
    }
  }

  // Also check if type is without quotes or has extra spaces
  const scriptRegex2 = /<script\s+type=application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = scriptRegex2.exec(html)) !== null) {
    const jsonStr = match[1].trim();
    if (jsonStr && !result.jsonLdRaw.includes(jsonStr)) {
      result.jsonLdRaw.push(jsonStr);
    }
  }

  // 5. Extract headings (h1, h2)
  const headingRegex = /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi;
  while ((match = headingRegex.exec(html)) !== null) {
    const headingText = stripTags(match[1]).trim();
    if (headingText) {
      result.headings.push(decodeHtmlEntities(headingText));
    }
  }

  // 6. Detect payment links (e.g. buy.stripe.com, solana:, algorand:, x402 endpoints)
  const paymentRegex = /(https:\/\/(?:buy\.stripe\.com|checkout\.stripe\.com|commerce\.coinbase\.com|pay\.solana\.com)\/[a-zA-Z0-9_\-\.\/\?=&]+)/gi;
  while ((match = paymentRegex.exec(html)) !== null) {
    if (!result.paymentLinkCandidates.includes(match[1])) {
      result.paymentLinkCandidates.push(match[1]);
    }
  }

  return result;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_\-:]+)(?:\s*=\s*(?:(?:"([^"]*)")|(?:'([^']*)')|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, ' ');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
