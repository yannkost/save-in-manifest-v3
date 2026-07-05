# Save In MV3

A `wxt` + Vue Chrome extension that recreates the core Manifest V3-compatible workflow of the old **Save In…** extension: right-click a page, link, media item, or text selection and route the download into a folder relative to your Downloads directory.

## What is implemented

- Manifest V3 extension scaffolded with `wxt`
- Context menu entry (**Save In MV3**) for saving:
  - page
  - link
  - image
  - audio
  - video
  - selection text
- **Menu entries** with optional nested **menu groups** and dividers, managed from the options page
- **Workflow rules** that define how a save is routed:
  - a **path template** (folder, relative to Downloads)
  - an optional **filename template**
  - a **shortcut output** mode: `none`, `.url`, `.desktop`, or an HTML redirect file
  - optional **matchers** (see below)
- **Rules-based routing / auto-match** — the **Best matching rule** context-menu item picks the first workflow rule whose matchers match the current save
- **Capture groups** — matcher regex capture groups are exposed to templates as `:$0:`, `:$1:`, …
- **Tab-strip bulk save** from the popup: save the active tab, highlighted tabs, tabs to the right, or child tabs
- **Import / export** of the full configuration (menu entries + workflow rules) as JSON
- Preview of token expansion in the options page
- Folder paths are **relative to Chrome's default Downloads directory**
- More reliable pending-download matching via `downloadId` when available

### Matchers

A workflow rule can match on any combination of:

- context (`page`, `link`, `media`, `selection`, `tab`)
- page domain / page URL
- source domain / source URL
- file extension
- link text

Each matcher is a regular expression; a rule matches only when **all** of its non-empty matchers match.

### Behavior settings

- prefer a media element's link target over its source URL
- notify on auto-route match
- auto-route miss behavior: do nothing, notify, or prompt with a Save As dialog
- download transport: direct, or fetch with the page referrer
- enable/disable the tab-save popup actions
- close a tab after saving it

### Dynamic folder/filename tokens

- `:date:`
- `:isodate:`
- `:unixdate:`
- `:year:` `:month:` `:day:` `:hour:` `:minute:` `:second:`
- `:pageurl:` `:sourceurl:`
- `:pagedomain:` `:sourcedomain:`
- `:pagetitle:` `:linktext:` `:selectiontext:`
- `:filename:` `:fileext:`
- `:naivefilename:` `:naivefileext:`
- `:$0:` `:$1:` … — matcher capture groups

## Folder creation

Yes: the extension routes downloads using the `chrome.downloads` filename path, which supports subdirectories relative to the Downloads directory. This is the MV3-compatible way to create nested download targets like:

```text
:date:/:pageurl:/
media/:date:/
:pagedomain:/:fileext:/
```

This only applies inside the browser's allowed Downloads area. The extension cannot write to arbitrary absolute paths.

## Typical workflow

1. define workflow rules and menu entries in the options page
2. right-click a page, link, media item, or text selection
3. choose a menu entry from **Save In MV3** (or let **Best matching rule** pick one)
4. let the background script render tokens and route the download into the final relative path

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Test & type-check

```bash
npm test
npm run compile
```
