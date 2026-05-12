# Pi Notify Extension

Sends native terminal notification when Pi finishes a turn and waits for input.

## User-facing surface

- Shows a "Pi" notification with "Ready for input".
- Plays bundled sound on supported macOS terminals unless `CRUMBS_NOTIFY_SOUND=none`.

## How it works

The extension listens for Pi input-required events and uses terminal-specific notification mechanisms such as AppleScript, OSC 777, OSC 99, or Windows toast.
