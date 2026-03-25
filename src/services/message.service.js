/**
 * Message formatting service.
 * Handles URL detection, linkification, and image preview with anti-hotlinking fallback.
 */

/** Image file extensions to detect for inline preview. */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

/** Regex to match URLs in text. */
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;

/** Cache of image URL load results: url → 'ok' | 'fail' | 'loading' */
const imageCache = new Map();

/**
 * Check if a URL points to an image file by extension.
 * @param {string} url
 * @returns {boolean}
 */
function isImageUrl(url) {
  try {
    const parsed = new URL(url.startsWith('www.') ? `https://${url}` : url);
    const ext = parsed.pathname.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  } catch {
    return false;
  }
}

/**
 * Normalize a raw URL to a full href.
 * @param {string} rawUrl
 * @returns {string}
 */
function normalizeUrl(rawUrl) {
  return rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
}

/**
 * Preload an image to check if it loads successfully.
 * Caches the result to avoid repeated requests.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function preloadImage(url) {
  const cached = imageCache.get(url);
  if (cached === 'ok') return Promise.resolve(true);
  if (cached === 'fail') return Promise.resolve(false);
  if (cached === 'loading') {
    // Wait for the in-flight request
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const status = imageCache.get(url);
        if (status !== 'loading') {
          clearInterval(check);
          resolve(status === 'ok');
        }
      }, 100);
    });
  }

  imageCache.set(url, 'loading');

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, 'ok');
      resolve(true);
    };
    img.onerror = () => {
      // Try with no-referrer to bypass hotlink protection
      const img2 = new Image();
      img2.referrerPolicy = 'no-referrer';
      img2.onload = () => {
        imageCache.set(url, 'ok');
        resolve(true);
      };
      img2.onerror = () => {
        imageCache.set(url, 'fail');
        resolve(false);
      };
      img2.src = url;
    };
    img.src = url;
  });
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
 * @returns {string}
 */
function linkifyText(text) {
  let lastIndex = 0;
  let result = '';

  URL_REGEX.lastIndex = 0;
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));

    const rawUrl = match[0];
    const href = normalizeUrl(rawUrl);
    const escapedHref = escapeHtml(href);
    const escapedDisplay = escapeHtml(rawUrl);

    result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="underline break-all opacity-80 hover:opacity-100">${escapedDisplay}</a>`;

    if (isImageUrl(rawUrl)) {
      const imgId = `img-${Math.random().toString(36).slice(2, 8)}`;
      result += `<img id="${imgId}" src="${escapedHref}" alt="" referrerpolicy="no-referrer" class="my-1 block max-h-64 w-3/4 max-w-3/4 rounded-lg object-contain" loading="lazy" onerror="this.style.display='none'" />`;
      // Trigger preload to update cache
      preloadImage(href);
    }

    lastIndex = match.index + rawUrl.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Process plain text content: escape HTML and linkify URLs.
 * @param {string} text — raw plain text
 * @returns {string} — safe HTML
 */
function formatPlainContent(text) {
  if (!text) return '';
  return linkifyText(text);
}

/**
 * Process HTML content (from mIRC parser): find URLs in text nodes and linkify them.
 * @param {string} html — HTML from parseFormatting()
 * @returns {string} — HTML with URLs linkified
 */
function formatHtmlContent(html) {
  if (!html) return '';
  const parts = html.split(/(<[^>]+>)/);
  return parts
    .map((part) => {
      if (part.startsWith('<')) return part;
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

export { formatPlainContent, formatHtmlContent, hasUrls, isImageUrl, preloadImage };
