#Requires -Version 7.0
function Repair-CommunityConfig([string]$Path) {
    # This emulator serializes its custom category as an invalid bare TOML key.
    # Repair only that exact header; keep every user setting and an original copy.
    $text = [IO.File]::ReadAllText($Path)
    $fixed = [regex]::Replace($text, '(?m)^\[D1 Alpha\](?=\r?$)', '["D1 Alpha"]')
    if ($fixed -ceq $text) { return }
    $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    $backup = "$Path.$hash.invalid-header.bak"
    if (!(Test-Path -LiteralPath $backup)) { [IO.File]::Copy($Path, $backup) }
    $temporary = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, $fixed, [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporary, $Path, $true)
}
