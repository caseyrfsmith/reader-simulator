// Fetches docs the way a coding agent does: plain HTTP, no browser, markdown preferred over HTML.
const AGENT_HEADERS = {
  'User-Agent': 'reader-simulator-agent/1.0 (+llms.txt)',
  'Accept': 'text/markdown, text/plain;q=0.9, text/html;q=0.5'
};

async function tryFetch(url, headers = AGENT_HEADERS) {
  try {
    const response = await fetch(url, { headers, redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    return { url: response.url, contentType, body };
  } catch (e) {
    return null;
  }
}

// Lots of sites return their HTML shell with a 200 for any path, so check the body too
function looksLikeMarkdown(result) {
  if (!result) return false;
  if (result.contentType.includes('text/html')) return false;
  const start = result.body.trimStart().substring(0, 100).toLowerCase();
  return !start.startsWith('<!doctype') && !start.startsWith('<html');
}

// Find llms.txt at the start path first, then at the site root
export async function findLlmsTxt(startUrl) {
  const start = new URL(startUrl);
  const candidates = [];

  if (start.pathname !== '/' && start.pathname !== '') {
    candidates.push(new URL('llms.txt', start.href.endsWith('/') ? start.href : start.href + '/').href);
  }
  candidates.push(new URL('/llms.txt', start.origin).href);

  for (const candidate of candidates) {
    const result = await tryFetch(candidate);
    if (looksLikeMarkdown(result)) return candidate;
  }

  return null;
}

// Markdown variants to try for a page URL, following the llms.txt convention of appending .md
function markdownCandidates(url) {
  const parsed = new URL(url);
  parsed.hash = '';

  if (/\.(md|mdx|txt)$/i.test(parsed.pathname)) {
    return [{ url: parsed.href, source: 'direct markdown' }];
  }

  const withoutSlash = parsed.href.replace(/\/$/, '');
  const withSlash = withoutSlash + '/';

  return [
    { url: withoutSlash + '.md', source: '.md suffix' },
    { url: withSlash + 'index.md', source: 'index.md' },
    { url: withSlash + 'index.html.md', source: 'index.html.md' }
  ];
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// Returns the same shape as extractPageContent so journey.js can treat both alike
export async function fetchMarkdownPage(url, maxChars = 5000) {
  let result = null;
  let source = null;

  for (const candidate of markdownCandidates(url)) {
    const fetched = await tryFetch(candidate.url);
    if (looksLikeMarkdown(fetched)) {
      result = fetched;
      source = candidate.source;
      break;
    }
  }

  // Content negotiation on the original URL
  if (!result) {
    const fetched = await tryFetch(url);
    if (looksLikeMarkdown(fetched)) {
      result = fetched;
      source = 'Accept: text/markdown';
    } else if (fetched) {
      // No markdown anywhere, so read the HTML as stripped text like a fetch tool would
      result = { ...fetched, body: htmlToText(fetched.body) };
      source = 'html-fallback (no markdown available)';
    }
  }

  if (!result) {
    return null;
  }

  const raw = result.body;
  const headings = raw
    .split('\n')
    .filter(line => /^#{1,4}\s/.test(line))
    .map(line => line.replace(/^#+\s*/, '').trim())
    .filter(h => h.length > 0 && h.length < 200);

  const titleMatch = raw.match(/^#\s+(.+)$/m);

  return {
    title: titleMatch ? titleMatch[1].trim() : new URL(url).pathname,
    headings: headings,
    contentPreview: raw.substring(0, 1000),
    fullContent: raw.substring(0, maxChars),
    rawContent: raw,
    totalLength: raw.length,
    url: url,
    fetchedUrl: result.url,
    contentSource: source,
    usingConfig: false
  };
}

// Pull [text](url) links out of markdown, keeping any llms.txt-style ": description" after the link
export function extractMarkdownLinks(markdown, currentUrl) {
  const links = [];
  const seen = new Set();
  const current = new URL(currentUrl);
  current.hash = '';

  const linkRegex = /(!?)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?::\s*([^\n]+))?/g;
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const [, bang, text, href, description] = match;
    if (bang) continue; // Images
    if (href.startsWith('#') || href.startsWith('mailto:')) continue;

    let resolved;
    try {
      resolved = new URL(href, current.href);
    } catch (e) {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;

    resolved.hash = '';
    if (resolved.href === current.href || seen.has(resolved.href)) continue;
    seen.add(resolved.href);

    links.push({
      text: description ? `${text.trim()} - ${description.trim()}` : text.trim(),
      href: resolved.href,
      type: 'markdown'
    });
  }

  return links;
}
