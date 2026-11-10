# RL1 local start. Node.js 18 or newer is required.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 18 or newer first.' }
& node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)'
if ($LASTEXITCODE -ne 0) { throw 'Node.js 18 or newer is required.' }
$entry = Join-Path $PSScriptRoot 'hub-relay.js'
$config = Join-Path $PSScriptRoot 'relay.json'
if (($args -notcontains '--config') -and (-not $env:HUB_RELAY_CONFIG) -and (Test-Path -LiteralPath $config)) {
    & node $entry --config $config @args
} else { & node $entry @args }
exit $LASTEXITCODE
