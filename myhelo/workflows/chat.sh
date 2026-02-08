set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/login.sh"

agent-browser snapshot -i -C
agent-browser click @e3
agent-browser wait 500

agent-browser frame sub

agent-browser snapshot -i -C

# agent-browser click @e29

# agent-browser screenshot /Users/kicesanders/dev/agent-browser-fork/myhelo/screenshots/thread.png