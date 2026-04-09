# gorilla-shell

Drop into: `src/core/gorilla-shell/`

## Files
- `GorillaModeShell.tsx` — full merged component (GorillaModeShell + XTermShell)
- `index.ts` — barrel export

## Install deps (if not already present)
```bash
npm i @xterm/xterm @xterm/addon-fit lucide-react
```

## CSS import (add to your entry file / agent.html bundle)
```ts
import '@xterm/xterm/css/xterm.css';
```

## Usage
```tsx
import { GorillaModeShell, GorillaModeHandle } from '@/core/gorilla-shell';
// or relative: '../core/gorilla-shell'

const shellRef = useRef<GorillaModeHandle>(null);

<GorillaModeShell
  ref={shellRef}
  onClose={() => setShellOpen(false)}
  workspaceLabel="inneranimalmedia"
  workspaceId="ws_inneranimalmedia"
  productLabel="Agent Sam"
  workspaceCdCommand="cd ~/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
  showWelcomeBar={true}
  problems={lintProblems}
  outputLines={buildOutput}
/>

// Imperative API
shellRef.current?.runCommand('pm2 status');
shellRef.current?.writeToTerminal('build complete');
shellRef.current?.triggerPump();   // gorilla chest-pump + coins
shellRef.current?.triggerError();  // gorilla shake + screen flash
shellRef.current?.setActiveTab('problems');
```

## Themes
Cycle via toolbar button or `4.` quick action: NIGHT → DAY → LAVA → VOID

## AI Buddy (Agent Sam)
- Click `SAM` button in toolbar, or press `Ctrl+A` in terminal
- Slides in as right panel with 8k chars of terminal context
- Hits `POST /api/agent/chat` with SSE streaming
- Quick action pills: explain error / suggest fix / D1 status / summarize session

## Auto game reactions (wired to PTY output)
- `deployed successfully` / `gate passed` / `PASS` → gorilla pump + coin spawn
- `error` / `failed` / `exception` → gorilla shake + screen red flash

## APIs consumed
| Endpoint | Purpose |
|---|---|
| `GET /api/agentsam/config` | Resolve workspace_cd_command, iam_origin |
| `GET /api/agent/terminal/socket-url` | PTY WebSocket URL |
| `GET /api/terminal/session/resume` | Session resume on reconnect |
| `GET /api/agent/terminal/config-status` | Config validation |
| `GET /api/agent/memory/list` | STARTUP_GREETING memory key |
| `GET /api/tunnel/status` | Cloudflare tunnel health |
| `POST /api/tunnel/restart` | Tunnel restart trigger |
| `POST /api/agent/terminal/run` | Fallback HTTP command run (WS offline) |
| `POST /api/agent/terminal/complete` | execution_id completion webhook |
| `POST /api/agent/chat` | Agent Sam SSE chat stream |
