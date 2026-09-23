#Requires -Version 7.0
# Shared ownership checks for startup rollback, Stop, and the independent guard.
function Get-CommunityProcessIdentity([Diagnostics.Process]$Process) {
    # Windows can expose the PID before CIM supplies its path and command line.
    # Keep the original Process handle, and bound the wait to startup only.
    $identityDeadline = [Diagnostics.Stopwatch]::StartNew()
    do {
        if ($Process.HasExited) {
            throw "Owned process PID $($Process.Id) exited during startup (exit code $($Process.ExitCode))"
        }
        $actual = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)"
        if ($actual.ExecutablePath -and $actual.CommandLine) { break }
        if ($identityDeadline.ElapsedMilliseconds -ge 2000) {
            throw "Cannot establish identity for owned PID $($Process.Id) within 2 seconds"
        }
        Start-Sleep -Milliseconds 50
    } while ($true)
    if ([math]::Abs(($actual.CreationDate.ToUniversalTime() - $Process.StartTime.ToUniversalTime()).TotalSeconds) -gt 1) {
        throw 'Process changed before ownership was recorded'
    }
    return @{ProcessId=$actual.ProcessId; ExecutablePath=$actual.ExecutablePath;
        CommandLine=$actual.CommandLine; CreationUtc=$actual.CreationDate.ToUniversalTime().ToString('o')}
}

function Test-CommunityProcessIdentity($Identity) {
    $actual = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$Identity.ProcessId)"
    return ($actual -and $actual.ExecutablePath -eq $Identity.ExecutablePath -and
        $actual.CommandLine -eq $Identity.CommandLine -and
        $actual.CreationDate.ToUniversalTime() -eq ([DateTime]$Identity.CreationUtc).ToUniversalTime())
}

function Write-CommunityReceipt([string]$Path, $Value) {
    $temporary = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporary, $Path, $true)
}

function Stop-CommunityRun([string]$RunRoot, [string]$Reason = 'requested stop') {
    $receiptPath = Join-Path $RunRoot 'launch.json'
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($receipt.schema -ne 1 -or $receipt.owner -ne 'd1a-community') { throw 'Not a community run receipt' }
    $targets = @($receipt.processIdentities)
    if ($targets.Count -gt 3) { throw 'Unexpected process count' }
    $outcomes = foreach ($target in ($targets | Sort-Object role -Descending)) {
        $actual = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$target.ProcessId)"
        if (!$actual) { @{pid=$target.ProcessId; result='already exited'}; continue }
        if (!(Test-CommunityProcessIdentity $target)) {
            @{pid=$target.ProcessId; result='identity changed; preserved'}; continue
        }
        $process = $null
        try {
            $process = Get-Process -Id $target.ProcessId -ErrorAction Stop
            # Retain a handle before rechecking ownership so PID reuse cannot redirect Kill.
            $null = $process.SafeHandle
            if (!(Test-CommunityProcessIdentity $target)) {
                @{pid=$target.ProcessId; result='identity changed; preserved'}; continue
            }
            $process.Kill()
            if (!$process.WaitForExit(5000)) { throw 'Owned process is still running' }
            @{pid=$target.ProcessId; result='stopped'}
        } catch {
            if (!(Test-CommunityProcessIdentity $target)) {
                @{pid=$target.ProcessId; result='already exited'}
            } else {
                @{pid=$target.ProcessId; result='stop failed';error=$_.Exception.Message}
            }
        } finally { if ($process) { $process.Dispose(); $process=$null } }
    }
    if (@($outcomes | Where-Object result -eq 'stop failed').Count) {
        Write-CommunityReceipt (Join-Path $RunRoot 'stop-error.json') @{utc=[DateTime]::UtcNow;reason=$Reason;outcomes=@($outcomes)}
        throw 'Some owned processes could not be stopped; see stop-error.json and retry Stop.'
    }
    Write-CommunityReceipt (Join-Path $RunRoot 'stop.json') @{utc=[DateTime]::UtcNow;reason=$Reason;outcomes=@($outcomes)}
    $outcomes
}
