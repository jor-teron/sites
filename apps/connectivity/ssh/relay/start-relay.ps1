# SSH relay for the SSH app (Windows PowerShell). Needs Python 3 and: py -m pip install websockify
# Usage: .\start-relay.ps1 [-Addr 0.0.0.0] [-Port 8022]
#   Only allow your LAN / VPN to reach this port (Windows Firewall: Private networks only).
#   Edit allowlist.txt to choose target hosts. For wss:// put cert.pem and key.pem here (see README.md).
param([string]$Addr = "0.0.0.0", [int]$Port = 8022)
Set-Location -Path $PSScriptRoot
$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }
$tls = @()
if ((Test-Path cert.pem) -and (Test-Path key.pem)) { $tls = @("--cert=cert.pem", "--key=key.pem"); Write-Host "TLS on: use wss://<this-pc>:$Port" }
else { Write-Host "No cert.pem/key.pem: plain ws://<this-pc>:$Port (LAN/VPN only)" }
$env:PYTHONPATH = "$PSScriptRoot;$env:PYTHONPATH"
& $py -m websockify @tls "--token-plugin=ssh_allowlist.Allowlist" "--token-source=$PSScriptRoot\allowlist.txt" "${Addr}:$Port"
