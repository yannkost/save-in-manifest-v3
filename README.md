# Save In MV3

A `wxt` + Vue Chrome extension that recreates the core Manifest V3-compatible workflow of the old **Save In…** extension.

## What is implemented

- Manifest V3 extension scaffolded with `wxt`
- Popup UI to manage folder presets stored in extension storage
- Optional **menu groups** for future-friendly nested context-menu organization
- Folder paths are **relative to Chrome's default Downloads directory**
- Context menu entry for saving:
  - page
  - link
  - image
  - audio
  - video
  - selection text
- Automatic **last used** target shortcut in the context menu
- Dynamic folder tokens:
  - `:date:`
  - `:isodate:`
  - `:unixdate:`
  - `:year:` `:month:` `:day:` `:hour:` `:minute:` `:second:`
  - `:pageurl:` `:sourceurl:`
  - `:pagedomain:` `:sourcedomain:`
  - `:pagetitle:` `:selectiontext:`
  - `:filename:` `:fileext:`
  - `:naivefilename:` `:naivefileext:`
- Preview of token expansion in the popup
- More reliable pending-download matching via `downloadId` when available

## Folder creation

Yes: the extension routes downloads using the `chrome.downloads` filename path, which supports subdirectories relative to the Downloads directory. This is the MV3-compatible way to create nested download targets like:

```text
:date:/:pageurl:/
media/:date:/
:pagedomain:/:fileext:/
```

This only applies inside the browser's allowed Downloads area. The extension cannot write to arbitrary absolute paths.

## Current scope

This version now supports the stronger day-to-day workflow from the original extension:

1. define grouped folder presets in the popup
2. right-click a page, link, media item, or text selection
3. choose a folder preset from **Save In MV3**
4. let the background script render tokens and route the download into the final relative path
5. reuse the **Last used** shortcut for repeated saves

## Still intentionally out of scope

Not implemented yet:

- rules-based routing / capture groups
- shortcut outputs like `.url`, `.desktop`, or HTML redirect files
- tab-strip bulk save features
- import/export configuration
- link-text token parity

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
