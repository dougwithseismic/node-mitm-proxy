# MITM Proxy for Node.js

A terminal CLI man-in-the-middle proxy for intercepting, inspecting, and modifying HTTP/HTTPS traffic from Node.js applications.

## Features

- **HTTPS Interception** — Auto-generates certificates signed by a local CA
- **Request/Response CRUD** — View, edit, replay, and export captured traffic
- **Interactive CLI** — Real-time commands while proxy runs
- **JSON Pretty-Print** — Auto-formats JSON bodies
- **curl Export** — Generate curl commands from captured requests

## Installation

```bash
cd standalone/tools/mitm-proxy
npm install
```

## Usage

### 1. Start the Proxy

```bash
node proxy.js
# Or with options:
node proxy.js --port 9999 --verbose
```

### 2. Configure Your Node.js App

**PowerShell:**
```powershell
$env:HTTP_PROXY = "http://127.0.0.1:8888"
$env:HTTPS_PROXY = "http://127.0.0.1:8888"
$env:NODE_EXTRA_CA_CERTS = "$PWD\.certs\ca.crt"
node yourapp.js
```

**Bash:**
```bash
HTTP_PROXY=http://127.0.0.1:8888 \
HTTPS_PROXY=http://127.0.0.1:8888 \
NODE_EXTRA_CA_CERTS=./.certs/ca.crt \
node yourapp.js
```

**CMD:**
```cmd
set HTTP_PROXY=http://127.0.0.1:8888
set HTTPS_PROXY=http://127.0.0.1:8888
set NODE_EXTRA_CA_CERTS=path\to\.certs\ca.crt
node yourapp.js
```

## CLI Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `list [n]` | `ls` | List last n requests (default 20) |
| `show <id>` | `s` | Show full request/response details |
| `body <id> [req\|res] [--sse]` | `b` | Show body (--sse parses SSE streams) |
| `headers <id>` | `h` | Show all headers |
| `replay <id>` | `r` | Replay a captured request |
| `edit <id>` | `e` | Edit request JSON and send modified |
| `filter <pattern>` | `f` | Show requests matching URL pattern |
| `curl <id>` | | Generate curl command |
| `export <id> <file>` | | Export request to JSON file |
| `clear` | | Clear request history |
| `help` | `?` | Show help |
| `quit` | `q` | Exit proxy |

## Breakpoints

Pause requests/responses matching a URL pattern, edit them, then forward or drop.

### Setting Breakpoints

```
bp req <pattern>      # Break on request URLs containing pattern
bp res <pattern>      # Break on response URLs containing pattern
bp list               # List all breakpoints
bp del <index>        # Delete breakpoint by index
bp toggle <index>     # Enable/disable breakpoint
bp clear              # Remove all breakpoints
```

### When Paused

When a breakpoint hits, the proxy pauses and writes the request/response to a temp JSON file:

```
⏸ BREAKPOINT HIT  [5] REQUEST
  POST https://api.anthropic.com/v1/messages?beta=true
  Edit: .bp-5-request.json
  Commands: forward (send as-is), edit (apply changes), drop (abort)
```

| Command | Alias | Description |
|---------|-------|-------------|
| `forward` | `f` | Send request/response as-is |
| `edit` | `e` | Read modified JSON from temp file and send |
| `drop` | `d` | Abort the request (returns 499) |
| `show` | `s` | Display current data |

### Example: Modify API Request

```
mitm> bp req /v1/messages
✓ Request breakpoint added: /v1/messages

# ... make a request from your app ...

⏸ BREAKPOINT HIT  [1] REQUEST
  POST https://api.anthropic.com/v1/messages?beta=true
  Edit: .bp-1-request.json

# Edit .bp-1-request.json in your editor (change model, prompt, etc.)

mitm> edit
✓ Forwarding modified request
[1] POST   200   3.2KB https://api.anthropic.com/v1/messages... [MOD] [BP]
```

### Example: Modify API Response

```
mitm> bp res /v1/messages
✓ Response breakpoint added: /v1/messages

# ... make a request ...

⏸ BREAKPOINT HIT  [2] RESPONSE
  POST https://api.anthropic.com/v1/messages?beta=true
  Edit: .bp-2-response.json

# Edit .bp-2-response.json to modify the response body

mitm> edit
✓ Forwarding modified response
```

## Examples

### Inspect Claude Code API Traffic

```
# Start proxy
node proxy.js

# In another terminal, run Claude Code through proxy
$env:HTTP_PROXY = "http://127.0.0.1:8888"
$env:HTTPS_PROXY = "http://127.0.0.1:8888"
$env:NODE_EXTRA_CA_CERTS = "..\.certs\ca.crt"
claude
```

Then in the proxy CLI:

```
mitm> list
[1] POST   200  298B  https://api.anthropic.com/v1/messages?beta=true
[2] GET    200   40B  https://api.anthropic.com/api/hello
[3] POST   200  3.4KB https://api.anthropic.com/v1/messages?beta=true

mitm> body 1 req
{
  "model": "claude-sonnet-4-20250514",
  "messages": [{"role": "user", "content": "hello"}],
  ...
}

mitm> body 3
{
  "content": [{"type": "text", "text": "Hello! How can I help..."}],
  ...
}

mitm> filter /v1/messages
[1] POST   200  298B  https://api.anthropic.com/v1/messages?beta=true
[3] POST   200  3.4KB https://api.anthropic.com/v1/messages?beta=true

mitm> curl 1
curl -X POST \
  -H 'content-type: application/json' \
  -H 'x-api-key: sk-...' \
  -d '{"model":"claude-sonnet-4-20250514",...}' \
  'https://api.anthropic.com/v1/messages?beta=true'

mitm> export 3 conversation.json
Exported to conversation.json
```

### Edit and Replay a Request

```
mitm> edit 1
Edit the request in: .edit-1.json
Press Enter when done editing, or type "cancel" to abort

# Modify the JSON file, then press Enter

Sending modified request...
✓ Modified request sent as 4, status 200
```

### View Request Details

```
mitm> show 1

═══ Request 1 ═══
Method:  POST
URL:     https://api.anthropic.com/v1/messages?beta=true
Time:    2026-02-11T12:34:56.789Z
Duration: 561ms

── Request Headers ──
content-type: application/json
x-api-key: sk-ant-...
anthropic-version: 2023-06-01

── Request Body ──
(1247 bytes)

── Response 200 ──
content-type: application/json
x-request-id: req_abc123

Body: 3412 bytes
```

## SSE Stream Parsing

For Server-Sent Events responses (like Claude API streaming), use `--sse` to reconstruct the full text:

```
mitm> body 8
event: message_start
data: {"type":"message_start",...}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"Hello"}}
...

mitm> body 8 --sse
Reconstructed SSE content:
Hello! How can I help you today?
```

This extracts all `content_block_delta` text chunks and concatenates them.

## Certificate Setup

On first run, the proxy generates a Certificate Authority (CA) in `.certs/`:
- `ca.key` — Private key (keep secret)
- `ca.crt` — Certificate (trust this in your apps)

The proxy dynamically generates per-host certificates signed by this CA, allowing HTTPS interception.

### Trust the CA System-Wide (Optional)

**Windows:**
1. Double-click `.certs/ca.crt`
2. Install Certificate → Local Machine → Trusted Root Certification Authorities

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .certs/ca.crt
```

**Linux:**
```bash
sudo cp .certs/ca.crt /usr/local/share/ca-certificates/mitm-proxy.crt
sudo update-ca-certificates
```

## Export Format

Exported JSON files contain:

```json
{
  "method": "POST",
  "url": "https://api.example.com/endpoint",
  "requestHeaders": { "content-type": "application/json", ... },
  "requestBody": "base64-encoded-body",
  "responseStatus": 200,
  "responseHeaders": { "content-type": "application/json", ... },
  "responseBody": "base64-encoded-body",
  "timestamp": "2026-02-11T12:34:56.789Z",
  "duration": 234
}
```

## Options

```
node proxy.js [options]

Options:
  -p, --port <number>  Proxy port (default: 8888)
  -v, --verbose        Verbose logging (show CONNECT requests)
  --no-intercept       Pass through without MITM (no HTTPS decryption)
  -h, --help           Show help
```

## Troubleshooting

### "UNABLE_TO_VERIFY_LEAF_SIGNATURE" or "CERT_UNTRUSTED"

The app isn't trusting the CA certificate. Make sure `NODE_EXTRA_CA_CERTS` points to the correct `ca.crt` path.

### Proxy Not Intercepting Traffic

1. Check the app respects `HTTP_PROXY`/`HTTPS_PROXY` env vars
2. Some apps use their own HTTP clients that ignore proxy settings
3. Try `--verbose` to see connection attempts

### Port Already in Use

```bash
node proxy.js --port 9999
```

## Files

```
mitm-proxy/
├── proxy.js          # Main proxy server + CLI
├── package.json      # Dependencies
├── test-client.js    # Test script
├── run-test.bat      # Run test with env vars
├── mitm.ps1          # PowerShell launcher
├── README.md         # This file
└── .certs/           # Generated certificates
    ├── ca.key        # CA private key
    └── ca.crt        # CA certificate (trust this)
```

## Dependencies

- `node-forge` — Certificate generation
- `commander` — CLI argument parsing
- `chalk` — Terminal colors
