/* eslint-disable no-control-regex */

/** Standard mIRC 16-color palette. */
const MIRC_COLORS: readonly string[] = [
  '#ffffff', // 0 white
  '#000000', // 1 black
  '#00007f', // 2 navy
  '#009300', // 3 green
  '#ff0000', // 4 red
  '#7f0000', // 5 maroon
  '#9c009c', // 6 purple
  '#fc7f00', // 7 orange
  '#ffff00', // 8 yellow
  '#00fc00', // 9 light green
  '#009393', // 10 teal
  '#00ffff', // 11 cyan
  '#0000fc', // 12 blue
  '#ff00ff', // 13 pink
  '#7f7f7f', // 14 grey
  '#d2d2d2', // 15 light grey
];

/** Escape HTML special characters. */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Get a CSS color value for a mIRC color code (0-98). */
function getMircColor(code: number): string | null {
  if (code >= 0 && code <= 15) return MIRC_COLORS[code];
  if (code >= 16 && code <= 98) {
    const idx = code - 16;
    const row = Math.floor(idx / 12);
    const col = idx % 12;
    const hue = col * 30;
    const lightness = 85 - row * 10;
    return `hsl(${hue}, 60%, ${lightness}%)`;
  }
  return null;
}

/**
 * Parse mIRC formatting codes and return safe HTML with inline styles.
 * Handles: bold (\x02), italic (\x1D), underline (\x1F), strikethrough (\x1E),
 * monospace (\x11), reverse (\x16), color (\x03), reset (\x0F).
 */
function parseFormatting(text: string): string {
  if (!text) return '';

  let bold = false;
  let italic = false;
  let underline = false;
  let strikethrough = false;
  let monospace = false;
  let fg: number | null = null;
  let bg: number | null = null;
  let reverse = false;

  let html = '';
  let i = 0;

  while (i < text.length) {
    const ch = text.charCodeAt(i);

    switch (ch) {
      case 0x02: // Bold toggle
        bold = !bold;
        i++;
        break;

      case 0x1d: // Italic toggle
        italic = !italic;
        i++;
        break;

      case 0x1f: // Underline toggle
        underline = !underline;
        i++;
        break;

      case 0x1e: // Strikethrough toggle
        strikethrough = !strikethrough;
        i++;
        break;

      case 0x11: // Monospace toggle
        monospace = !monospace;
        i++;
        break;

      case 0x16: // Reverse toggle
        reverse = !reverse;
        i++;
        break;

      case 0x0f: // Reset all
        bold = false;
        italic = false;
        underline = false;
        strikethrough = false;
        monospace = false;
        fg = null;
        bg = null;
        reverse = false;
        i++;
        break;

      case 0x03: {
        // Color: \x03[fg[,bg]]
        i++;
        const colorMatch = text.slice(i).match(/^(\d{1,2})(?:,(\d{1,2}))?/);
        if (colorMatch) {
          fg = parseInt(colorMatch[1], 10);
          if (colorMatch[2] !== undefined) {
            bg = parseInt(colorMatch[2], 10);
          }
          i += colorMatch[0].length;
        } else {
          fg = null;
          bg = null;
        }
        break;
      }

      case 0x04: {
        // Hex color: \x04RRGGBB[,RRGGBB] — skip for now
        i++;
        const hexMatch = text.slice(i).match(/^([0-9a-fA-F]{6})(?:,([0-9a-fA-F]{6}))?/);
        if (hexMatch) {
          i += hexMatch[0].length;
        }
        break;
      }

      default: {
        const styles: string[] = [];
        const classes: string[] = [];

        if (bold) classes.push('font-bold');
        if (italic) classes.push('italic');
        if (underline) classes.push('underline');
        if (strikethrough) classes.push('line-through');
        if (monospace) classes.push('font-mono');

        const fgColor = reverse ? bg : fg;
        const bgColor = reverse ? fg : bg;

        if (fgColor !== null) {
          const color = getMircColor(fgColor);
          if (color) styles.push(`color:${color}`);
        }
        if (bgColor !== null) {
          const color = getMircColor(bgColor);
          if (color) styles.push(`background-color:${color}`);
        }

        const escaped = escapeHtml(text[i]);

        if (styles.length > 0 || classes.length > 0) {
          const attrs: string[] = [];
          if (classes.length) attrs.push(`class="${classes.join(' ')}"`);
          if (styles.length) attrs.push(`style="${styles.join(';')}"`);
          html += `<span ${attrs.join(' ')}>${escaped}</span>`;
        } else {
          html += escaped;
        }
        i++;
        break;
      }
    }
  }

  return html;
}

/** Strip all mIRC formatting codes from text (plain text output). */
function stripFormatting(text: string): string {
  if (!text) return '';
  return text.replace(
    /\x02|\x1D|\x1F|\x1E|\x11|\x16|\x0F|\x03(\d{1,2}(,\d{1,2})?)?|\x04([0-9a-fA-F]{6}(,[0-9a-fA-F]{6})?)?/g,
    '',
  );
}

/** Check if text contains mIRC formatting codes. */
function hasFormatting(text: string): boolean {
  if (!text) return false;
  return /[\x02\x03\x04\x0F\x11\x1D\x1E\x1F\x16]/.test(text);
}

export { parseFormatting, stripFormatting, hasFormatting, getMircColor, MIRC_COLORS };
