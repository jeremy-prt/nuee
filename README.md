# Nuée

A desktop app (macOS, Windows, Linux) to run and orchestrate coding agents.

Status: pre-alpha, nothing usable yet.

Stack: Tauri 2 (Rust) + Vue 3, Pinia, Tailwind 4, TypeScript, Vite.

## Requirements

- Node 24 and pnpm 12
- Rust stable (`rustup`), with `cargo` on your `PATH`
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) (Xcode CLT on macOS, WebView2 + MSVC on Windows, webkit2gtk-4.1 on Linux)

## Run

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

This only builds for the current OS. For all three, run the **Build installers** workflow from the Actions tab: it runs the checks first, then uploads the installers as workflow artifacts. Pushing a `v*` tag does the same and also creates a draft release.

Binaries are not signed yet: macOS and Windows will show a warning on first launch.

## Translations

The UI follows the system language and falls back to English. Available: English, French, Spanish, Portuguese (Brazil), Japanese and Simplified Chinese.

To add a language: copy `src/i18n/locales/en.ts` to `<code>.ts`, translate it, and register it in `src/i18n/index.ts`. `pnpm type-check` fails if a key is missing.

## License

[MIT](LICENSE)
