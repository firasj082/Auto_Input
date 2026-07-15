# Auto-Input

A lightweight Windows desktop macro recorder and playback tool built with **Tauri v2** (Rust + React/TypeScript). Auto-Input captures keyboard and mouse input using low-level Win32 hooks and replays it with precise timing.

[![Latest Release](https://img.shields.io/github/v/release/firasj082/auto-input?label=Download&style=for-the-badge)](https://github.com/firasj082/Auto_Input/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge)](#)

---

## Features

- **Record** keyboard and mouse input globally using `WH_KEYBOARD_LL` and `WH_MOUSE_LL` hooks
- **Playback** recorded macros with accurate timing via `SendInput`
- Transparent on-screen overlay for recording/playback status
- Hold `Esc` to instantly abort recording or playback
- Save and load macros for reuse
- Native performance — no Electron, built entirely on Tauri v2

---

## Installation

### Option 1: Download the installer (recommended)

Download the latest Windows installer from the [Releases page](https://github.com/firasj082/Auto_Input/releases/latest).

1. Download `auto-input-setup.exe` (or `.msi`) from the latest release
2. Run the installer
3. Launch **Auto-Input** from the Start Menu

### Option 2: Build from source

**Prerequisites:**
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri v2 prerequisites for Windows](https://v2.tauri.app/start/prerequisites/)

```bash
# Clone the repository
git clone https://github.com/<your-username>/auto-input.git
cd auto-input

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build a production installer
npm run tauri build
```

The built installer will be located in `src-tauri/target/release/bundle/`.

---

## Usage

1. Open Auto-Input
2. Click **Record** (or use the configured hotkey) to start capturing input
3. Perform the actions you want to automate
4. Press **Esc** or click **Stop** to end recording
5. Click **Play** to replay the recorded macro
6. Save the macro if you want to reuse it later

---

## Tech Stack

| Layer      | Technology                      |
|------------|----------------------------------|
| Frontend   | React + TypeScript               |
| Backend    | Rust                              |
| Framework  | Tauri v2                          |
| Input      | Win32 API (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`, `SendInput`) |

---

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/<your-username>/auto-input/issues).

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to the branch and open a Pull Request
