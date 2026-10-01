import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'p',
  'br',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'img',
  'blockquote',
  'hr',
  'pre',
  'code',
  'sub',
  'sup',
  'colgroup',
  'col',
];

const ALLOWED_ATTR = [
  'href',
  'title',
  'alt',
  'src',
  'width',
  'height',
  'colspan',
  'rowspan',
  'align',
  'style',
  'class',
  'id',
  'data-type',
  'data-page-break',
  'target',
  'rel',
];

function getPurify() {
  const root = typeof window !== 'undefined' ? window : undefined;
  if (!root) return null;
  // DOMPurify may export a factory or a ready instance depending on bundler/DOM.
  const maybeFactory = DOMPurify as unknown as ((w: Window) => typeof DOMPurify) & typeof DOMPurify;
  if (typeof maybeFactory === 'function' && !('sanitize' in maybeFactory && typeof maybeFactory.sanitize === 'function')) {
    return maybeFactory(root);
  }
  if (typeof maybeFactory.addHook === 'function' || typeof maybeFactory.sanitize === 'function') {
    return maybeFactory;
  }
  return maybeFactory(root);
}

function fallbackSanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

export function sanitizeHtml(html: string): string {
  try {
    const purify = getPurify();
    if (purify?.sanitize) {
      const cleaned = purify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: true,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
        FORBID_ATTR: [
          'onerror',
          'onclick',
          'onload',
          'onmouseover',
          'onfocus',
          'onblur',
          'onchange',
          'onsubmit',
        ],
      });
      // Guard against environments where DOMPurify is a no-op
      if (cleaned.includes('<script') || /\sonerror=/i.test(cleaned)) {
        return fallbackSanitize(cleaned);
      }
      return cleaned;
    }
  } catch (err) {
    console.error(err);
  }
  return fallbackSanitize(html);
}

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith('javascript:')) return false;
  if (trimmed.startsWith('data:text/html')) return false;
  if (trimmed.startsWith('vbscript:')) return false;
  return (
    trimmed.startsWith('http:') ||
    trimmed.startsWith('https:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/')
  );
}
