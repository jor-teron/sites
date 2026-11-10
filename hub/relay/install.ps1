# RL1: irm https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.ps1 | iex
# No administrator access, services, npm, firewall or network-route changes.
& {
    $ErrorActionPreference = 'Stop'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 18 or newer from https://nodejs.org/ first.' }
    & node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)'
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 18 or newer is required.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $base = 'https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay'
    $root = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $HOME }
    $dir = if ($env:HUB_RELAY_DIR) { $env:HUB_RELAY_DIR } else { Join-Path $root 'sites-hub-relay' }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('sites-hub-relay-' + [Guid]::NewGuid().ToString('N'))
    $files = @('hub-relay.js', 'relay_config.js', 'relay_core.js', 'relay_security.js', 'relay_ws.js',
        'mod_mcp.js', 'mod_tcp.js', 'mod_fetch.js', 'start-relay.sh', 'start-relay.ps1',
        'config.example.json', 'tcp_allowlist.example.txt', 'README.md')
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        Write-Host 'Downloading RL1 from jor-teron/sites main...'
        foreach ($name in $files) {
            $target = Join-Path $tmp $name
            Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $target -TimeoutSec 60
            if ((Get-Item -LiteralPath $target).Length -eq 0) { throw "Empty download: $name" }
            if ($name.EndsWith('.js')) {
                & node --check $target
                if ($LASTEXITCODE -ne 0) { throw "Invalid JavaScript: $name" }
            }
        }
        & node (Join-Path $tmp 'hub-relay.js') --help
        if ($LASTEXITCODE -ne 0) { throw 'Incomplete relay download.' }
        & node -e "require(process.argv[1]).loadConfig(['--config',process.argv[2]],{})" (Join-Path $tmp 'relay_config.js') (Join-Path $tmp 'config.example.json')
        if ($LASTEXITCODE -ne 0) { throw 'Invalid example configuration.' }
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $backup = $null
        foreach ($name in $files) {
            $old = Join-Path $dir $name
            if (Test-Path -LiteralPath $old) {
                if (-not $backup) {
                    $backup = Join-Path $dir ('before-RL1-' + [Guid]::NewGuid().ToString('N'))
                    New-Item -ItemType Directory -Path $backup | Out-Null
                }
                Copy-Item -LiteralPath $old -Destination (Join-Path $backup $name)
            }
        }
        foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $tmp $name) -Destination (Join-Path $dir $name) -Force }
        $config = Join-Path $dir 'relay.json'
        if (-not (Test-Path -LiteralPath $config)) { Copy-Item -LiteralPath (Join-Path $dir 'config.example.json') -Destination $config }
        Write-Host "Installed in $dir. TCP/fetch deny all targets until configured in relay.json."
        if ($backup) { Write-Host "Previous runtime files kept in $backup" }
    } finally { Remove-Item -LiteralPath $tmp -Recurse -Force }
    if ($env:HUB_RELAY_INSTALL_ONLY -ne '1') {
        # Run Node directly, without changing PowerShell script execution policy.
        & node (Join-Path $dir 'hub-relay.js') --config (Join-Path $dir 'relay.json')
        if ($LASTEXITCODE -ne 0) { throw "Relay exited with code $LASTEXITCODE" }
    }
}
