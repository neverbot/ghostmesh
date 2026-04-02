/**
 * Message formatting service.
 * Handles URL detection, linkification, and image preview with anti-hotlinking fallback.
 */

import config from '@/config.ts';
import type { ImageProvider, ImageProviderResult } from '@/services/image-providers.ts';
import { resolveImageProvider, providers } from '@/services/image-providers.ts';
import { imageProxyUrl, fetchWithProxy } from '@/services/proxy-services.ts';
import * as imageCache from '@/services/image-cache.ts';

/** Image file extensions to detect for inline preview. */
const IMAGE_EXTENSIONS: string[] = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
];

/** URLs that have already failed preview resolution — not retried during this session. */
const failedPreviews: Set<string> = new Set();
const MAX_FAILED_PREVIEWS = 500;

/** Track a failed preview URL, evicting the oldest entry if the set is full. */
function trackFailedPreview(src: string): void {
  if (failedPreviews.size >= MAX_FAILED_PREVIEWS) {
    const oldest = failedPreviews.values().next().value;
    if (oldest) failedPreviews.delete(oldest);
  }
  failedPreviews.add(src);
}

/** Regex to match URLs in text. */
const URL_REGEX: RegExp = /(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;

/**
 * Check if a URL points to an image file by extension.
 * @param {string} url
 * @returns {boolean}
 */
function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('www.') ? `https://${url}` : url);
    const ext = parsed.pathname.split('.').pop()!.toLowerCase();
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
function normalizeUrl(rawUrl: string): string {
  return rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
}

/**
 * Build the proxy URL for an image via image-proxy.invalid.
 * @param {string} url — original image URL
 * @returns {string}
 */

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
function handleImageError(img: HTMLImageElement): void {
  const attempt = parseInt(img.dataset.attempt || '0', 10);

  if (attempt === 0) {
    // First failure: try via image-proxy.invalid proxy
    img.dataset.attempt = '1';
    const proxyUrl: string = imageProxyUrl(img.dataset.originalSrc!);
    img.onerror = null; // Clear previous error handler to prevent re-entry
    img.onload = null; // Clear any previous load handler
    img.src = proxyUrl;
    img.onload = (): void => {
      // Cache the proxy URL (resolved differs from original)
      imageCache.set(img.dataset.originalSrc!, proxyUrl);
      // Proxy succeeded — add caption if configured
      if (config.images.showProxyCaption && !img.dataset.captionAdded) {
        img.dataset.captionAdded = '1';
        const caption: HTMLSpanElement = document.createElement('span');
        caption.className = 'block text-right text-[9px] text-slate-400 italic -mt-0.5 mb-1';
        caption.textContent = 'Served through image-proxy.invalid';
        img.insertAdjacentElement('afterend', caption);
      }
    };
  } else {
    // Proxy also failed — show retry button
    const src: string = img.dataset.originalSrc!;
    console.warn(`[GhostMesh] Image failed to load: ${src} (proxy also failed)`);
    trackFailedPreview(src);
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.className =
      'my-1 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] text-slate-400';
    wrapper.innerHTML =
      '<span class="truncate">Image failed to load</span>' +
      '<button class="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors" title="Retry">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-3 w-3">' +
      '<path fill-rule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.84a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clip-rule="evenodd"/>' +
      '</svg></button>';
    wrapper.querySelector('button')!.addEventListener('click', (): void => {
      failedPreviews.delete(src);
      const newImg: HTMLImageElement = document.createElement('img');
      newImg.src = src;
      newImg.dataset.originalSrc = src;
      newImg.dataset.attempt = '0';
      newImg.alt = '';
      newImg.referrerPolicy = 'no-referrer';
      newImg.className = 'mt-1 block max-w-full rounded-lg animate-preview';
      newImg.style.maxHeight = '70vh';
      newImg.style.width = 'auto';
      newImg.loading = 'lazy';
      newImg.onerror = (): void => handleImageError(newImg);
      wrapper.replaceWith(newImg);
    });
    img.replaceWith(wrapper);
  }
}

// Expose globally so inline onerror can call it
if (typeof window !== 'undefined') {
  window.__ghostmeshImageError = handleImageError;
}

/**
 * Resolve an async image provider and replace the placeholder element.
 * @param {string} asyncMarker — format: "async:providerName:id"
 * @param {string} placeholderId — DOM id of the placeholder element
 */
async function resolveAsyncImage(asyncMarker: string, placeholderId: string): Promise<void> {
  const parts: string[] = asyncMarker.split(':');
  const providerName: string = parts[1];
  const id: string = parts.slice(2).join(':');

  const provider: ImageProvider | undefined = providers.find(
    (p: ImageProvider) => p.name.toLowerCase().replace(/\s+/g, '-') === providerName && p.resolve,
  );

  const placeholder: HTMLElement | null = document.getElementById(placeholderId);
  if (!placeholder) return;

  if (!provider) {
    placeholder.textContent = 'Preview not available';
    return;
  }

  // Check image cache before fetching
  const cachedUrl: string | null = imageCache.get(asyncMarker);
  if (cachedUrl) {
    const img: HTMLImageElement = document.createElement('img');
    img.alt = '';
    img.className = 'mt-1 block max-w-full rounded-lg animate-preview';
    img.style.maxHeight = '70vh';
    img.style.width = 'auto';
    if (cachedUrl.startsWith('data:')) {
      img.src = cachedUrl;
    } else {
      img.src = cachedUrl;
      img.dataset.originalSrc = cachedUrl;
      img.dataset.attempt = '0';
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.onerror = (): void => handleImageError(img);
    }
    placeholder.replaceWith(img);
    return;
  }

  try {
    const dataUrl: string | null = await provider.resolve!(id, { fetchWithProxy });
    const el: HTMLElement | null = document.getElementById(placeholderId);
    if (!el) return;

    if (dataUrl && dataUrl.startsWith('error:')) {
      // Provider could not reach the content (proxy error, rate limit, etc.)
      console.warn(`[GhostMesh] Async image proxy error: ${asyncMarker}`);
      replaceWithRetry(el, asyncMarker, placeholderId, 'Could not fetch preview — click to retry');
    } else if (dataUrl) {
      // Cache async resolved images (data: URIs, proxy URLs) where resolved differs from original
      imageCache.set(asyncMarker, dataUrl);
      const img: HTMLImageElement = document.createElement('img');
      img.alt = '';
      img.className = 'mt-1 block max-w-full rounded-lg animate-preview';
      img.style.maxHeight = '70vh';
      img.style.width = 'auto';
      if (dataUrl.startsWith('data:')) {
        img.src = dataUrl;
      } else {
        // URL from provider — use fallback chain (no-referrer → proxy)
        img.src = dataUrl;
        img.dataset.originalSrc = dataUrl;
        img.dataset.attempt = '0';
        img.referrerPolicy = 'no-referrer';
        img.loading = 'lazy';
        img.onerror = (): void => handleImageError(img);
      }
      el.replaceWith(img);
    } else {
      console.warn(`[GhostMesh] Async image not available: ${asyncMarker}`);
      trackFailedPreview(asyncMarker);
      replaceWithRetry(el, asyncMarker, placeholderId, 'Image expired or unavailable');
    }
  } catch (err: unknown) {
    console.warn(`[GhostMesh] Async image failed: ${asyncMarker}`, err);
    trackFailedPreview(asyncMarker);
    const el: HTMLElement | null = document.getElementById(placeholderId);
    if (el) replaceWithRetry(el, asyncMarker, placeholderId, 'Preview failed');
  }
}

/**
 * Replace a placeholder element with a failure message and a retry button.
 * @param {HTMLElement} el — the element to replace
 * @param {string} asyncMarker — the async marker for retrying
 * @param {string} placeholderId — the placeholder DOM id
 * @param {string} message — failure message to display
 */
function replaceWithRetry(
  el: HTMLElement,
  asyncMarker: string,
  placeholderId: string,
  message: string,
): void {
  el.className = 'my-1 flex items-center gap-1.5 text-[10px] italic opacity-60';
  el.innerHTML = '';
  const span: HTMLSpanElement = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  const btn: HTMLButtonElement = document.createElement('button');
  btn.className = 'shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors';
  btn.title = 'Retry';
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-3 w-3">' +
    '<path fill-rule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.84a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clip-rule="evenodd"/>' +
    '</svg>';
  btn.addEventListener('click', (): void => {
    failedPreviews.delete(asyncMarker);
    el.className = 'my-1 text-[10px] italic opacity-60';
    el.innerHTML = '';
    el.textContent = 'Loading preview...';
    el.id = placeholderId;
    resolveAsyncImage(asyncMarker, placeholderId).catch(() => {});
  });
  el.appendChild(btn);
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface LinkifyOptions {
  resolveImages?: boolean;
}

/**
 * Replace URLs in a plain text segment with link/image HTML.
 * @param {string} text — plain text (no HTML)
 * @param {{ resolveImages?: boolean }} [options]
 * @returns {string}
 */
function linkifyText(text: string, { resolveImages = true }: LinkifyOptions = {}): string {
  let lastIndex: number = 0;
  let result: string = '';

  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));

    const rawUrl: string = match[0];
    const href: string = normalizeUrl(rawUrl);
    const escapedHref: string = escapeHtml(href);
    const escapedDisplay: string = escapeHtml(rawUrl);

    result += `<a href="${escapedHref}" target="_blank" rel="noopener" class="underline break-all opacity-80 hover:opacity-100">${escapedDisplay}</a>`;

    // Determine image src: direct image URL, or resolved from hosting provider
    let imageSrc: string | null = null;
    const wouldHavePreview: boolean = isImageUrl(rawUrl) || resolveImageProvider(href) !== null;
    if (resolveImages) {
      if (isImageUrl(rawUrl)) {
        imageSrc = href;
      } else {
        const resolved: ImageProviderResult | null = resolveImageProvider(href);
        if (resolved) imageSrc = resolved.imageUrl;
      }
      // Skip URLs that previously failed
      if (imageSrc && failedPreviews.has(imageSrc)) {
        imageSrc = null;
      }
    } else if (wouldHavePreview) {
      result +=
        '<div class="my-0.5 text-[10px] italic opacity-50">Preview hidden for this user · <a href="#" data-action="open-blocked-settings" class="not-italic underline opacity-70 hover:opacity-100">view settings</a></div>';
    }

    if (imageSrc && imageSrc.startsWith('async:')) {
      // Async provider — render placeholder, resolve in background
      const placeholderId: string = `img-async-${Math.random().toString(36).slice(2, 8)}`;
      result += `<div id="${placeholderId}" class="my-1 text-[10px] italic opacity-60">Loading preview...</div>`;
      // Defer until Vue renders the HTML into the DOM (short timeout, not rAF)
      const src = imageSrc;
      setTimeout((): void => {
        // Skip if placeholder was removed (channel switch, message trimmed)
        if (!document.getElementById(placeholderId)) return;
        resolveAsyncImage(src, placeholderId).catch((): void => {
          const el: HTMLElement | null = document.getElementById(placeholderId);
          if (el) el.textContent = 'Preview failed';
        });
      }, 0);
    } else if (imageSrc) {
      const escapedSrc: string = escapeHtml(imageSrc);
      result += `<img src="${escapedSrc}" data-original-src="${escapedSrc}" data-attempt="0" alt="" referrerpolicy="no-referrer" class="mt-1 block max-w-full rounded-lg animate-preview" style="max-height:70vh;width:auto" loading="lazy" onerror="window.__ghostmeshImageError?.(this)" />`;
    }

    lastIndex = match.index + rawUrl.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Process plain text content: escape HTML and linkify URLs.
 * @param {string} text — raw plain text
 * @param {{ resolveImages?: boolean }} [options]
 * @returns {string} — safe HTML
 */
function formatPlainContent(text: string, { resolveImages = true }: LinkifyOptions = {}): string {
  if (!text) return '';
  return linkifyText(text, { resolveImages });
}

/**
 * Process HTML content (from mIRC parser): find URLs in text nodes and linkify them.
 * @param {string} html — HTML from parseFormatting()
 * @param {{ resolveImages?: boolean }} [options]
 * @returns {string} — HTML with URLs linkified
 */
function formatHtmlContent(html: string, { resolveImages = true }: LinkifyOptions = {}): string {
  if (!html) return '';
  const parts: string[] = html.split(/(<[^>]+>)/);
  return parts
    .map((part: string): string => {
      if (part.startsWith('<')) return part;
      const unescaped: string = part
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      return linkifyText(unescaped, { resolveImages });
    })
    .join('');
}

/**
 * Check if text contains any URLs.
 * @param {string} text
 * @returns {boolean}
 */
function hasUrls(text: string): boolean {
  if (!text) return false;
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}

export { formatPlainContent, formatHtmlContent, hasUrls, isImageUrl };
