# 🎮 Publishing STRIKEZONE to Steam

STRIKEZONE is now wrapped as a **native desktop app** with Electron, so it can be
built into installers that Steam distributes.

## 🏗️ Build the desktop app (on your Mac mini M4)

```bash
# One-time: deps are already installed (electron, electron-builder)

# Build a runnable Mac app (unpacked, fast):
npm run desktop            # builds + launches it locally to test

# Build distributable installers:
npm run dist:mac           # → dist-electron/*.dmg  (Mac)
npm run dist:win           # → dist-electron/*.exe  (Windows installer, NSIS)
npm run dist:linux         # → dist-electron/*.AppImage
```

Outputs land in **`dist-electron/`**.

> ⚠️ **Windows builds:** `dist:win` cross-builds from Mac and usually works, but
> the most reliable Windows `.exe` is built **on a Windows PC** (or a cloud CI).
> Steam's biggest audience is Windows, so plan to produce a Windows build.

## 🎨 Before you ship
- **Icon:** add `build/icon.png` (1024×1024) and `build/icon.ico` — electron-builder
  picks them up automatically (right now it uses the default Electron icon).
- Test the app: `npm run desktop`. Press **F11** for fullscreen.

## 🟢 Getting it ON Steam (what YOU do)
1. Create a **Steamworks** account: https://partner.steamgames.com
2. Pay the **$100 Steam Direct fee** (per game; refunded after $1,000 in sales).
3. Complete **tax + bank** info (needed for payouts). You must be **18+** — if not,
   a parent/guardian sets this up.
4. Create your **App** in Steamworks → set up the **store page** (name, capsule
   images, screenshots, description, trailer).
5. Upload your build with **SteamPipe** (`steamcmd` + a depot script) — Steam's
   docs walk you through it: https://partner.steamgames.com/doc/sdk/uploading
6. Set an **age rating**, price, and submit for **review**.

## 🧩 Optional: Steamworks features (achievements, overlay)
To add Steam achievements/overlay, integrate the Steamworks SDK via a library like
[`steamworks.js`](https://github.com/ceifa/steamworks.js) in `electron/main.js`.
Not required to ship — you can add it later.

## 💡 Reality check
- The `.app` is ~580 MB because Electron bundles Chromium — that's normal for
  Electron games.
- A browser-based game wrapped in Electron **works**, but Steam players expect
  polish — screenshots, a trailer, and a solid store page matter a lot.
- **Easier first step:** publish the web build to **itch.io** (free, instant) to
  get players and feedback while you set up Steam.

---
Built with [Claude Code](https://claude.com/claude-code).
