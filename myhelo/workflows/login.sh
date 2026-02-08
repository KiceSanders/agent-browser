set -euo pipefail
agent-browser close

agent-browser open provider.myhelo.com

agent-browser wait --text "myhELO"

agent-browser snapshot

# Use click + type instead of fill for JS-heavy frameworks
# fill sets the DOM value directly but may not trigger framework state updates
# type simulates real keystrokes which properly trigger input event listeners

agent-browser click @e1
agent-browser type @e1 klawprovider@moxeehealth.com

agent-browser click @e2
agent-browser type @e2 Klawprovider1

agent-browser click @e3

agent-browser wait 1000
agent-browser frame sub

agent-browser wait --fn "document.querySelectorAll('.component.loading').length === 0"

# agent-browser snapshot

# agent-browser screenshot /Users/kicesanders/dev/agent-browser-fork/myhelo/screenshots/after_login.png

agent-browser frame main