param(
    [Parameter(Mandatory)][string]$CandidateRoot,
    [ValidateSet('hunter-arc','hunter-ghost','warlock-nova','warlock-radiance','titan-arc','e3-18','e3-19','e3-20','e3-21','e3-22','e3-23','e3-24','e3-25')][string]$Character = 'hunter-arc',
    [switch]$EquipSmg
)
$ErrorActionPreference = 'Stop'
$destination = Join-Path $CandidateRoot "profile\director\$Character"
[IO.Directory]::CreateDirectory($destination) | Out-Null
$isE3 = $Character.StartsWith('e3-')
$source = Join-Path $CandidateRoot $(if ($isE3) { "profile\$Character" } else { 'profile' })
foreach ($file in Get-ChildItem -LiteralPath $source -Filter 'talent*.json' -File -ErrorAction SilentlyContinue) {
    $target = Join-Path $destination $file.Name
    if (!(Test-Path -LiteralPath $target)) { [IO.File]::Copy($file.FullName, $target, $false) }
}
$path = Join-Path $destination 'equipment.json'
if (Test-Path -LiteralPath $path) {
    # Opening a saved character is read-only unless a kit was requested.
    if (!$EquipSmg) { return }
    $equipment = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
} else {
    $slots = @{'1'='0000000300000202';'2'='0000000300000003';'3'='0000000300000004';'4'='0000000300000005';'5'='0000000300000006';'6'='0000000300000007';'7'='0000000300000107';'8'='0000000300000403';'9'='0000000300000402'}
    if ($isE3) {
        $preset = [int]$Character.Substring(3)
        $slots['1'] = '00000003{0:x8}' -f (0x2000 + $preset)
        $rows = Get-Content -LiteralPath (Join-Path $CandidateRoot 'server-dist/bungie-access-protocol/rsat/mocks/e3-weapons.native.json') -Raw | ConvertFrom-Json
        foreach ($slot in 7,8,9) { $slots[[string]$slot] = '0000000000000000' }
        foreach ($row in $rows | Where-Object preset -eq $preset) { $slots[[string]$row.slot] = $row.soid }
    } else {
        $slots['1'] = @{ 'hunter-arc'='0000000300000202';'hunter-ghost'='0000000300000204';'warlock-nova'='0000000300000200';'warlock-radiance'='0000000300000201';'titan-arc'='0000000300000203' }[$Character]
        if ($Character -eq 'titan-arc') {
            foreach ($slot in 2..6) { $slots[[string]$slot]='00000003{0:x8}' -f (0x420+$slot-2) }
        }
        if ($Character.StartsWith('warlock-')) {
            foreach ($slot in 2..6) { $slots[[string]$slot]='00000003{0:x8}' -f (0x425+$slot-2) }
        }
    }
    $equipment = @{schema=2;version=1;slots=$slots}
}
if ($EquipSmg) {
    $equipment.slots['7'] = '0000000300000107'
    $equipment.slots['8'] = '0000000300000401'
    $equipment.slots['9'] = '0000000300000402'
}
if (Test-Path -LiteralPath $path) {
    [IO.File]::Copy($path, "$path.before-$(Get-Date -Format yyyyMMddHHmmssfff).json", $false)
    $equipment.version = if ($equipment.version -eq 0x7fffffff) {1} else {$equipment.version + 1}
}
$equipment | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$path.tmp" -Encoding utf8NoBOM
Move-Item -LiteralPath "$path.tmp" -Destination $path -Force
