# MITM Proxy launcher for PowerShell
# Usage: .\mitm.ps1 [args...]
# Then in another terminal: $env:HTTP_PROXY="http://127.0.0.1:8888"; $env:HTTPS_PROXY="http://127.0.0.1:8888"; $env:NODE_EXTRA_CA_CERTS="$PSScriptRoot\.certs\ca.crt"; node yourapp.js

param(
    [int]$Port = 8888,
    [switch]$Verbose,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
MITM Proxy for Node.js

Usage: .\mitm.ps1 [-Port 8888] [-Verbose]

After starting, configure your Node.js app:
  `$env:HTTP_PROXY = "http://127.0.0.1:$Port"
  `$env:HTTPS_PROXY = "http://127.0.0.1:$Port"
  `$env:NODE_EXTRA_CA_CERTS = "$PSScriptRoot\.certs\ca.crt"
  node yourapp.js

CLI Commands:
  list [n]           List last n requests
  show <id>          Show request details
  body <id> [req|res] Show body
  headers <id>       Show headers
  replay <id>        Replay request
  edit <id>          Edit and replay
  filter <pattern>   Filter by URL
  curl <id>          Generate curl command
  export <id> <file> Export to file
  clear              Clear history
  quit               Exit
"@
    exit
}

$args = @("--port", $Port)
if ($Verbose) { $args += "--verbose" }

Push-Location $PSScriptRoot
try {
    node proxy.js @args
} finally {
    Pop-Location
}
