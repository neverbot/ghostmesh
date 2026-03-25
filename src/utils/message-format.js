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
 * Process message text: convert URLs to clickable links and image URLs to inline previews.
 * Returns HTML string.
 * @param {string} text — plain text (already mIRC-processed or stripped)
 * @returns {string}
 */
function formatMessageContent(text) {
  if (!text) return '';

  let lastIndex = 0;
  let result = '';
  let match;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    result += escapeHtml(text.slice(lastIndex, match.index));

    const rawUrl = match[0];
    const href = rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
    const escapedHref = escapeHtml(href);
    const escapedDisplay = escapeHtml(rawUrl);

    if (isImageUrl(rawUrl)) {
      // Image: clickable link + inline preview
      result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="text-emerald-500 underline">${escapedDisplay}</a>`;
      result += `<img src="${escapedHref}" alt="" class="mt-1 max-h-48 max-w-full rounded-lg object-contain" loading="lazy" />`;
    } else {
      // Regular link
      result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="text-emerald-500 underline hover:text-emerald-400">${escapedDisplay}</a>`;
    }

    lastIndex = match.index + rawUrl.length;
  }

  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
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

export { formatMessageContent, hasUrls, isImageUrl };
