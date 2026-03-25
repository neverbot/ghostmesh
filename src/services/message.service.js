/**
 * Message formatting service.
 * Handles URL detection, linkification, and image preview with anti-hotlinking fallback.
 */

import config from '@/config.js';

/** Image file extensions to detect for inline preview. */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

/** Regex to match URLs in text. */
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;

/** Free image proxy to bypass anti-hotlinking (403). */
const IMAGE_PROXY = 'https://image-proxy.invalid/?url=';

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
 * Build the proxy URL for an image via image-proxy.invalid.
 * @param {string} url — original image URL
 * @returns {string}
 */
function proxyUrl(url) {
  return IMAGE_PROXY + encodeURIComponent(url);
}

/**
 * Handle image load error with fallback chain.
 * Called inline from the img onerror attribute.
 *
 * Fallback order:
 *   1. Original URL with referrerpolicy="no-referrer" (already set in the tag)
 *   2. image-proxy.invalid proxy (bypasses hotlinking from server side)
 *   3. Hide the image (all fallbacks exhausted)
 *
 * TODO: Add additional fallback proxies here if image-proxy.invalid becomes unavailable.
 *       Options: self-hosted wsrv instance, Cloudflare Worker, own backend endpoint.
 *
 * @param {HTMLImageElement} img — the img element that failed
 */
function handleImageError(img) {
  const attempt = parseInt(img.dataset.attempt || '0', 10);

  if (attempt === 0) {
    // First failure: try via image-proxy.invalid proxy
    img.dataset.attempt = '1';
    img.src = proxyUrl(img.dataset.originalSrc);
    img.onload = () => {
      // Proxy succeeded — add caption if configured
      if (config.images.showProxyCaption && !img.dataset.captionAdded) {
        img.dataset.captionAdded = '1';
        const caption = document.createElement('span');
        caption.className = 'block text-right text-[9px] text-slate-400 italic -mt-0.5 mb-1';
        caption.textContent = 'Served through image-proxy.invalid';
        img.insertAdjacentElement('afterend', caption);
      }
    };
  } else {
    // Proxy also failed — hide the image
    // TODO: future fallbacks could be added here before hiding
    img.style.display = 'none';
  }
}

// Expose globally so inline onerror can call it
if (typeof window !== 'undefined') {
  window.__ghostmeshImageError = handleImageError;
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
      result += `<img src="${escapedHref}" data-original-src="${escapedHref}" data-attempt="0" alt="" referrerpolicy="no-referrer" class="my-1 block max-w-full rounded-lg" loading="lazy" onerror="window.__ghostmeshImageError?.(this)" />`;
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

export { formatPlainContent, formatHtmlContent, hasUrls, isImageUrl };
