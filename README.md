# Smart Rename

A Raycast extension for macOS that renames selected Finder items using GPT-5.5.

Select one or more files or folders in Finder, run **Smart Rename**, and the extension shows a loading toast while it asks OpenAI for cleaner names.

## Setup

1. Run `bun install`
2. Open the extension in Raycast with `bun run dev`
3. Add your OpenAI API key in **Raycast Settings → Extensions → Smart Rename**
4. Optionally customize the rename prompt

## Usage

1. Select items in Finder
2. Open Raycast and run **Smart Rename**
3. Wait for the **Renaming** toast to finish

The extension removes noisy filename clutter such as resolutions, dates, version numbers, hashes, and awkward separators.

## Undo

Run **Undo Rename** to revert the most recent Smart Rename operation. If you renamed multiple Finder items in one batch, a single undo restores all of them.

Run **Redo Rename** to re-apply the most recently undone batch.

Rename history is stored locally with Raycast `LocalStorage` and keeps up to 100 undo and redo batches. Starting a new Smart Rename clears the redo history.

## Development

```bash
bun install
bun run dev
bun run lint
bun run build
```
