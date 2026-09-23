#Requires -Version 7.0
param(
    [ValidateSet('Check','Smoke','Start','Stop')][string]$Action = 'Check',
    [string]$CandidateRoot = (Join-Path $PSScriptRoot '../../runtime/candidate-community-r576-20260921'),
    [string]$RunName = ('r576-community-' + (Get-Date -Format yyyyMMdd-HHmmss)),
    [string]$RunRoot,
    [ValidateRange(1,120)][int]$BoundedMinutes = 30,
    [ValidateSet('hunter-arc','hunter-ghost','warlock-nova','warlock-radiance','titan-arc','e3-18','e3-19','e3-20','e3-21','e3-22','e3-23','e3-24','e3-25')][string]$Character = 'hunter-arc',
    [switch]$SandboxAllowance,
    [string]$Loadout = '{}',
    [ValidatePattern('^00000002[0-9a-f]{8}$')][string]$LoadoutCharacter = '0000000200000002'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'community-process.ps1')
. (Join-Path $PSScriptRoot 'community-config.ps1')
if ($Action -eq 'Stop') {
    if (!$RunRoot) { throw 'Stop requires an exact RunRoot' }
    Stop-CommunityRun (Resolve-Path -LiteralPath $RunRoot).Path
    return
}
# Clean the parent too: profile preparation invokes Node before the servers start.
foreach ($key in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ($key -match '^(D1A_|D1_|SIGNON_|DATAMINE_|DEMONWARE_|BAP_|ACTIVITY_HOST_PROXY_)' -or
        $key -in @('NODE_OPTIONS','NODE_PATH','NODE_ENV','BNET_DATABASE','HOSTNAME')) {
        [Environment]::SetEnvironmentVariable($key, $null, 'Process')
    }
}
$candidate = (Resolve-Path -LiteralPath $CandidateRoot).Path
$bundledNode = Join-Path $PSScriptRoot '../../runtimes/node/node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { (Resolve-Path -LiteralPath $bundledNode).Path } else { (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }
$shell = (Get-Process -Id $PID).Path
$required = @('api/destiny_server.js','server-dist/main.js','game/default.xex',
    'xenia.r576-input-audit.exe','storage/patches/41560907-destiny-36735.patch.toml',
    'name-overrides/manifest.json','xenia-canary-netplay.config.toml')
foreach ($file in $required) { if (!(Test-Path -LiteralPath (Join-Path $candidate $file) -PathType Leaf)) { throw "Missing runtime file: $file" } }
$exe = Join-Path $candidate 'xenia.r576-input-audit.exe'
$patch = Join-Path $candidate 'storage/patches/41560907-destiny-36735.patch.toml'
if ((Get-FileHash -LiteralPath $exe).Hash -ne 'EA17E45E74321DC2BF4BB8402B1595F497363BDEA1F95000DCF9F9AC65469BE3') { throw 'Xenia executable provenance mismatch' }
if ((Get-FileHash -LiteralPath $patch).Hash -ne '0D666906344F27DE364364CF54D4BDC09295FC41960EF8A2E43FFE73CB32923C') { throw 'Native destination patch provenance mismatch' }
$names = Get-Content -LiteralPath (Join-Path $candidate 'name-overrides/manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath (Join-Path $candidate "game/packages/$($names.package)")).Hash -ne $names.packageSha256) { throw 'Native package provenance mismatch' }
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($candidate))
if ($drive.AvailableFreeSpace -lt 20GB) { throw 'At least 20 GB free is required on the runtime drive' }
if (Get-CimInstance Win32_Process | Where-Object Name -Like 'xenia*') { throw 'An existing Xenia session is active; preserve it and stop its owned run first' }
$ports = @(36000,1020,1021,1011,32000,32001,32004,32005,32008,32009,32556,37000,37001)
$occupied = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In $ports)
if ($occupied.Count) { throw ('Required ports already occupied: ' + (($occupied | ForEach-Object { "$($_.LocalPort) (PID $($_.OwningProcess))" }) -join ', ')) }
if ($Action -eq 'Check') {
    $python = Join-Path $PSScriptRoot '../../runtimes/python/python.exe'
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot '../../package-manifest.json')) {
        & $python -I (Join-Path $PSScriptRoot 'community-setup.py') --check-installed
        if ($LASTEXITCODE -ne 0) { throw 'Installed package verification failed' }
    }
    @{readyForLaunch=$true;runtimeVerified=$false;candidate=$candidate;node=$node;freeGiB=[math]::Round($drive.AvailableFreeSpace/1GB,2)} | ConvertTo-Json
    return
}
if ($RunName -notmatch '^r[0-9]+-[a-z0-9-]+$') { throw 'Use a simple revision-prefixed run name' }
$RunRoot = Join-Path $candidate "runs/$RunName"
if (Test-Path -LiteralPath $RunRoot) { throw 'Run name already exists' }
New-Item -ItemType Directory -Path $RunRoot | Out-Null
$receipt = @{schema=1;owner='d1a-community';status='starting';startUtc=[DateTime]::UtcNow;
    boundedMinutes=$BoundedMinutes;character=$Character;loadoutCharacter=$LoadoutCharacter;activityRouting='native';
    sandboxAllowance=[bool]$SandboxAllowance;processIdentities=@()}
$receiptPath = Join-Path $RunRoot 'launch.json'
Write-CommunityReceipt $receiptPath $receipt
$children = [Collections.Generic.List[Diagnostics.Process]]::new()
function Start-Owned([string]$Role,[string]$Executable,[string[]]$Arguments,[hashtable]$Environment) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$Executable; $info.WorkingDirectory=$candidate
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.WindowStyle=if ($Role -eq 'game') { [Diagnostics.ProcessWindowStyle]::Normal } else { [Diagnostics.ProcessWindowStyle]::Hidden }
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    foreach ($key in $Environment.Keys) { $info.Environment[$key]=[string]$Environment[$key] }
    $process = [Diagnostics.Process]::Start($info)
    $children.Add($process)
    $identity = Get-CommunityProcessIdentity $process
    $identity.role=$Role
    $receipt.processIdentities += $identity
    Write-CommunityReceipt $receiptPath $receipt
    return $process
}
function Wait-OwnedPorts([Diagnostics.Process]$Process,[int[]]$Expected) {
    $deadline=[DateTime]::UtcNow.AddSeconds(30)
    do {
        if ($Process.HasExited) { throw "Owned process $($Process.Id) exited during startup" }
        $listening=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $Process.Id | Select-Object -ExpandProperty LocalPort)
        if (!@($Expected | Where-Object { $_ -notin $listening }).Count) { return }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Owned process $($Process.Id) did not open its required ports"
}
try {
    if ($Action -eq 'Start') {
        Repair-CommunityConfig (Join-Path $candidate 'xenia-canary-netplay.config.toml')
        & (Join-Path $PSScriptRoot 'prepare-director-profile.ps1') -CandidateRoot $candidate -Character $Character
        & $node (Join-Path $PSScriptRoot 'community-loadout.cjs') $candidate $Character apply $Loadout $LoadoutCharacter | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Character loadout validation failed; no runtime started' }
        $profile = Join-Path $candidate "profile/director/$Character"
    } else {
        $profile = Join-Path $RunRoot 'smoke-profile'
        New-Item -ItemType Directory -Path $profile | Out-Null
    }
    $envs = @{D1A_ISOLATED_RUNTIME='1';D1A_ACTIVITY_ROUTING='native';D1A_NATIVE_CHARACTERS='1';D1A_INVENTORY_PROBE_ITEM='1';D1A_TALENT_PROBE='1';D1A_ARMOR_TALENT_PROBE='1';
        D1A_DIRECTOR_CHARACTER=$Character;D1A_EQUIPMENT_PROFILE=(Join-Path $profile 'equipment.json');
        D1A_TALENT_STATE_PATH=(Join-Path $profile 'talent.json');D1A_VENDOR_ECONOMY='1';
        D1A_VENDOR_ECONOMY_PROFILE=(Join-Path $profile 'equipment.json.vendor.json');
        D1A_CHARACTER_LEVEL15='1';D1A_INVENTORY_CAPTURE_PATH=(Join-Path $RunRoot 'inventory-requests.jsonl');
        D1A_VENDOR_CAPTURE_PATH=(Join-Path $RunRoot 'vendor-requests.jsonl')}
    if ($Character.StartsWith('hunter-')) { $envs.D1A_HUNTER_ARC='1' }
    if ($Character.StartsWith('e3-')) { $envs.D1A_E3_ABILITY_PRESET=$Character.Substring(3) }
    if ($SandboxAllowance) { $envs.D1A_VENDOR_TEST_ALLOWANCE='1' }
    # Node's runner routes diagnostics to this run without shell quoting or pipes.
    $runner = Join-Path $PSScriptRoot 'community-node-runner.cjs'
    $api=Start-Owned 'api' $node @($runner,(Join-Path $candidate 'api/destiny_server.js'),(Join-Path $RunRoot 'api')) @{D1_SERVER_HOST='127.0.0.1'}
    $envs.HOSTNAME='127.0.0.1'
    $envs.DEMONWARE_BIND_HOST='127.0.0.1'
    $envs.DEMONWARE_LOBBY_PORT='1011'
    $envs.BAP_SIGNON_IP='127.0.0.1'
    $envs.BAP_SIGNON_PORT='37000'
    $envs.ACTIVITY_HOST_PROXY_IP='127.0.0.1'
    $envs.ACTIVITY_HOST_PROXY_PORT='37001'
    Wait-OwnedPorts $api @(36000,1020,1021)
    $backend=Start-Owned 'backend' $node @($runner,(Join-Path $candidate 'server-dist/main.js'),(Join-Path $RunRoot 'server')) $envs
    Wait-OwnedPorts $backend @(1011,32000,32001,32004,32005,32008,32009,32556,37000,37001)
    if ($Action -eq 'Smoke') {
        $receipt.status='backend-smoke-passed';Write-CommunityReceipt $receiptPath $receipt
        Stop-CommunityRun $RunRoot 'backend startup check complete' | Out-Null
        @{backendStartup=$true;runtimeVerified=$false;runRoot=$RunRoot} | ConvertTo-Json
        return
    }
    $game=Start-Owned 'game' $exe @((Join-Path $candidate 'game/default.xex'),
        "--storage_root=$(Join-Path $candidate 'storage')","--content_root=$(Join-Path $candidate 'content')",
        "--config=$(Join-Path $candidate 'xenia-canary-netplay.config.toml')",
        # Disable lab hooks even if an older config still names their files.
        # Host input also enables the emulator's timed sign-in acceptance.
        '--host_input_state_file=','--host_screenshot_request_file=',
        "--log_file=$(Join-Path $RunRoot 'xenia.log')") @{}
    $receipt.status='running';$receipt.pid=$game.Id;$receipt.serverPid=$backend.Id
    Write-CommunityReceipt $receiptPath $receipt
    $guardInfo=[Diagnostics.ProcessStartInfo]::new()
    $guardInfo.FileName=$shell;$guardInfo.UseShellExecute=$false;$guardInfo.CreateNoWindow=$true
    $guardInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    foreach($argument in @('-NoProfile','-File',(Join-Path $PSScriptRoot 'community-guard.ps1'),'-RunRoot',$RunRoot)) { $guardInfo.ArgumentList.Add($argument) }
    $guard=[Diagnostics.Process]::Start($guardInfo)
    Start-Sleep -Milliseconds 500
    if ($guard.HasExited) { throw 'Independent session guard failed to start' }
    $receipt.guardPid=$guard.Id;Write-CommunityReceipt $receiptPath $receipt
    $receipt | ConvertTo-Json -Depth 8
} catch {
    $failure=$_
    # These Process objects retain handles opened at creation; no PID-name sweep.
    foreach($child in $children) {
        try { if (!$child.HasExited) { $child.Kill(); $child.WaitForExit(5000) | Out-Null } }
        catch { Write-Warning "Owned process rollback requires receipt check: $($_.Exception.Message)" }
    }
    $receipt.status='failed';$receipt.error=$failure.Exception.Message
    Write-CommunityReceipt $receiptPath $receipt
    Stop-CommunityRun $RunRoot 'startup failed' | Out-Null
    throw $failure
}
