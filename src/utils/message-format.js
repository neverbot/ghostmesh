/**
 * Image file extensions to detect for inline preview.
 * @type {string[]}
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

/**
 * Regex to match URLs in text.
 * Matches http://, https://, and bare www. URLs.
 */
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;

/**
 * Check if a URL points to an image file.
 * @param {string} url
 * @returns {boolean}
 */
function isImageUrl(url) {
  try {
    const pathname = new URL(url.startsWith('www.') ? `https://${url}` : url).pathname;
    const ext = pathname.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  } catch {
    return false;
  }
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replace URLs in a plain text segment with link/image HTML.
 * @param {string} text — plain text (no HTML)
 * @returns {string} — HTML string
 */
function linkifyText(text) {
  let lastIndex = 0;
  let result = '';

  URL_REGEX.lastIndex = 0;
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));

    const rawUrl = match[0];
    const href = rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
    const escapedHref = escapeHtml(href);
    const escapedDisplay = escapeHtml(rawUrl);

    if (isImageUrl(rawUrl)) {
      result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="underline break-all opacity-80 hover:opacity-100">${escapedDisplay}</a>`;
      result += `<img src="${escapedHref}" alt="" class="my-1 block max-h-48 max-w-xs rounded-lg object-contain" loading="lazy" onerror="this.style.display='none'" />`;
    } else {
      result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="underline break-all opacity-80 hover:opacity-100">${escapedDisplay}</a>`;
    }

    lastIndex = match.index + rawUrl.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Process plain text content: escape HTML and linkify URLs.
 * Use for messages without mIRC formatting.
 * @param {string} text — raw plain text
 * @returns {string} — safe HTML
 */
function formatPlainContent(text) {
  if (!text) return '';
  return linkifyText(text);
}

/**
 * Process HTML content (from mIRC parser): find URLs in text nodes and linkify them.
 * Preserves existing HTML tags from mIRC formatting.
 * @param {string} html — HTML from parseFormatting()
 * @returns {string} — HTML with URLs linkified
 */
function formatHtmlContent(html) {
  if (!html) return '';
  // Split into tags and text segments, only linkify text segments
  const parts = html.split(/(<[^>]+>)/);
  return parts
    .map((part) => {
      // Skip HTML tags
      if (part.startsWith('<')) return part;
      // Process text nodes (already escaped by mIRC parser)
      // Unescape → linkify (which re-escapes)
      const unescaped = part
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      return linkifyText(unescaped);
    })
    .join('');
}

/**
 * Check if text contains any URLs.
 * @param {string} text
 * @returns {boolean}
 */
function hasUrls(text) {
  if (!text) return false;
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}

export { formatPlainContent, formatHtmlContent, hasUrls, isImageUrl };
