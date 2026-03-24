# mIRC Formatting Codes — Implementation Status

mIRC formatting is a de facto standard originating from the mIRC client. It uses inline control characters (bytes 0x02–0x1F) embedded in message text. All IRC servers pass these bytes transparently — there is no negotiation or capability flag. Any client can send them, and any server will relay them.

Reference: [mIRC Colors - Modern IRC](https://modern.ircdocs.horse/formatting)

## Control Codes

| Code   | Hex  | Name          | Description                       | Status |
| ------ | ---- | ------------- | --------------------------------- | ------ |
| `\x02` | 0x02 | Bold          | Toggle bold text                  | Done   |
| `\x1D` | 0x1D | Italic        | Toggle italic text                | Done   |
| `\x1F` | 0x1F | Underline     | Toggle underline text             | Done   |
| `\x1E` | 0x1E | Strikethrough | Toggle strikethrough text         | Done   |
| `\x11` | 0x11 | Monospace     | Toggle monospace text             | Done   |
| `\x16` | 0x16 | Reverse       | Swap foreground/background colors | Done   |
| `\x0F` | 0x0F | Reset         | Reset all formatting              | Done   |
| `\x03` | 0x03 | Color         | Set foreground/background color   | Done   |
| `\x04` | 0x04 | Hex Color     | Set color using hex RGB           | —      |

## Color Syntax

### mIRC Color (`\x03`)

```
\x03<fg>           — set foreground only
\x03<fg>,<bg>      — set foreground and background
\x03               — reset colors (no digits)
```

Where `<fg>` and `<bg>` are 1–2 digit numbers (0–99).

### Standard 16 colors (0–15)

| Code | Color       |
| ---- | ----------- |
| 0    | White       |
| 1    | Black       |
| 2    | Navy        |
| 3    | Green       |
| 4    | Red         |
| 5    | Maroon      |
| 6    | Purple      |
| 7    | Orange      |
| 8    | Yellow      |
| 9    | Light Green |
| 10   | Teal        |
| 11   | Cyan        |
| 12   | Blue        |
| 13   | Pink        |
| 14   | Grey        |
| 15   | Light Grey  |

Codes 16–98 are extended colors (not universally supported).

### Hex Color (`\x04`)

```
\x04RRGGBB           — set foreground
\x04RRGGBB,RRGGBB    — set foreground and background
\x04                  — reset colors
```

## Detection

mIRC formatting cannot be negotiated — servers always pass it through. We detect it by scanning incoming messages for control characters (0x02, 0x03, 0x04, 0x0F, 0x1D, 0x1E, 0x1F, 0x11, 0x16). If any are found, the server is marked as sending mIRC-formatted content.

## Implementation Status

### Done
- Bold → `font-bold` class
- Italic → `italic` class
- Underline → `underline` class
- Strikethrough → `line-through` class
- Monospace → `font-mono` class
- Reverse video → swap fg/bg colors
- Reset → close all formatting
- Color codes 0–15 → inline CSS with exact mIRC hex values
- Extended colors 16–98 → inline CSS with HSL approximation
- Foreground and background colors
- Auto-detection of mIRC formatting per server
- User toggle: auto-detect / always on / always off (persisted in localStorage)

### Pending
- Hex color codes (`\x04RRGGBB`)
