# Token Tracker

A cross-platform desktop app that shows real-time and historical token usage + costs for **Anthropic (Claude)** and **OpenAI (GPT)** APIs.

Built with **Tauri v2** (Rust backend) + **React 19 + TypeScript** (frontend).

---

## Install

```sh
npm install -g token-tracker
token-tracker
```

Or download a binary directly from the [latest release](https://github.com/ani0x53/token-tracker/releases/latest).

---

## Features

- **Real-time polling** — fetches usage from Anthropic and OpenAI APIs on a configurable interval (default 5 min)
- **30-day history** — stored locally in SQLite, persists across restarts
- **Daily line chart** — cost over time per provider
- **Model breakdown bar chart** — cost per model (Claude Sonnet, Opus, GPT-4o, etc.)
- **Spending alerts** — OS-level notifications when daily/monthly thresholds are exceeded
- **System tray** — shows today's total cost, click to open window
- **Dark UI** — Tailwind CSS dark theme

---

## Prerequisites

### macOS / Windows
Tauri's prerequisites are automatically handled by the platform toolchain.

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config
```

### Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

---

## Setup

```bash
# 1. Install JS dependencies
npm install

# 2. Run in development mode
npm run tauri dev

# 3. Build a release binary
npm run tauri build
```

---

## Configuration

On first launch, click **Settings** in the top-right corner and enter:

| Setting | Description |
|---------|-------------|
| **Anthropic Admin Key** | `sk-ant-admin-...` — Admin API key (NOT a standard key) |
| **OpenAI API Key** | `sk-...` |
| **Poll Interval** | Seconds between data fetches (default 300) |
| **Daily Alert ($)** | Trigger OS notification when daily spend exceeds this |
| **Monthly Alert ($)** | Trigger OS notification when monthly spend exceeds this |

Settings are saved locally in your OS app data directory (not committed to git).

---

## Architecture

```
token-tracker/
├── src/                          # React frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── Dashboard.tsx         # Main layout
│   │   ├── ProviderCard.tsx      # Per-provider summary card
│   │   ├── UsageChart.tsx        # Line chart — daily usage
│   │   ├── ModelBreakdown.tsx    # Bar chart — cost per model
│   │   └── AlertSettings.tsx    # Settings modal
│   ├── hooks/
│   │   ├── useUsageData.ts       # SQLite query + event listeners
│   │   └── useAlerts.ts          # Spending alert logic
│   └── store/
│       └── settingsStore.ts      # Zustand store for settings
├── src-tauri/
│   └── src/
│       ├── lib.rs                # Tauri commands + app setup
│       ├── api/
│       │   ├── anthropic.rs      # Anthropic usage API client
│       │   └── openai.rs         # OpenAI usage API client
│       ├── poller.rs             # Background polling loop
│       ├── storage.rs            # SQLite schema constants
│       └── tray.rs               # System tray setup
```

### Data flow

1. Rust `poller` fetches both APIs every N seconds
2. New snapshots are emitted as `new-snapshots` Tauri events
3. Frontend `useUsageData` hook receives events and upserts into local SQLite
4. React Query re-fetches from DB and re-renders charts
5. Tray tooltip is updated with today's total cost

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Tauri v2 |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| State | Zustand |
| DB | SQLite (tauri-plugin-sql) |
| HTTP | reqwest (Rust) |
| Notifications | tauri-plugin-notification |
