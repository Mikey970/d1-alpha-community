#Requires -Version 7.0
param([Parameter(Mandatory)][string]$RunRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'community-process.ps1')
$launch = Get-Content -LiteralPath (Join-Path $RunRoot 'launch.json') -Raw | ConvertFrom-Json
if ($launch.schema -ne 1 -or $launch.owner -ne 'd1a-community' -or $launch.status -ne 'running') { throw 'Invalid running receipt' }
$game = @($launch.processIdentities | Where-Object role -eq 'game')
if ($game.Count -ne 1) { throw 'Expected exactly one owned game' }
$deadline = ([DateTime]$launch.startUtc).ToUniversalTime().AddMinutes($launch.boundedMinutes)
while (!(Test-Path -LiteralPath (Join-Path $RunRoot 'stop.json'))) {
    try {
        if ([DateTime]::UtcNow -ge $deadline) { Stop-CommunityRun $RunRoot 'session deadline'; break }
        if (!(Test-CommunityProcessIdentity $game[0])) { Stop-CommunityRun $RunRoot 'game exited'; break }
    } catch { Write-Warning $_.Exception.Message }
    Start-Sleep -Seconds 2
}
