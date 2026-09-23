#Requires -Version 7.0
param([switch]$CreateShortcuts)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$candidate = Join-Path $root 'runtime/candidate-community-r576-20260921'
if ($CreateShortcuts) {
    # Distinguish side-by-side installations and never overwrite another shortcut.
    $id = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($root))).Substring(0,8)
    $shell = New-Object -ComObject WScript.Shell
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
        $path = Join-Path $folder "D1 Alpha ($id).lnk"
        if (Test-Path -LiteralPath $path) { continue }
        $shortcut = $shell.CreateShortcut($path)
        $shortcut.TargetPath = Join-Path $root 'runtimes/python/pythonw.exe'
        $shortcut.Arguments = '-I "' + (Join-Path $root 'tools/d1a/community-launcher.pyw') + '"'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = 'D1 Alpha community test candidate'
        $shortcut.IconLocation = (Join-Path $candidate 'xenia.r576-input-audit.exe') + ',0'
        $shortcut.Save()
    }
    'Desktop and Start menu shortcuts are ready.'
    return
}
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64' -or
    [Environment]::OSVersion.Version.Build -lt 19041) {
    throw 'Use Windows 10 (version 2004 or newer) or Windows 11 on an x64 PC.'
}
if (![Runtime.Intrinsics.X86.Avx]::IsSupported) { throw 'This emulator requires a CPU and Windows installation with AVX enabled.' }
$checks = [Collections.Generic.List[string]]::new()
$checks.Add('Windows x64 and AVX supported')
foreach ($name in @('msvcp140.dll','msvcp140_atomic_wait.dll','vcruntime140.dll','vcruntime140_1.dll')) {
    $path = Join-Path $candidate $name
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing bundled Visual C++ runtime: $name. Extract a fresh copy of the package." }
    $handle = [Runtime.InteropServices.NativeLibrary]::Load($path)
    [Runtime.InteropServices.NativeLibrary]::Free($handle)
}
$checks.Add('Bundled Visual C++ runtime loads')
$node = Join-Path $root 'runtimes/node/node.exe'
$nodeVersion = & $node --version
if ($LASTEXITCODE -ne 0) { throw 'Bundled Node could not start. Extract a fresh package.' }
$checks.Add("Bundled Node $nodeVersion starts")
$python = Join-Path $root 'runtimes/python/python.exe'
& $python -I -c 'import tkinter; t = tkinter.Tk(); t.withdraw(); t.destroy()'
if ($LASTEXITCODE -ne 0) { throw 'Bundled Python/Tk could not start. Extract a fresh package.' }
$checks.Add('Bundled Python and Tk start')
$checks.Add("Bundled PowerShell $($PSVersionTable.PSVersion) starts")
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D1AlphaGraphicsCheck {
    [DllImport("d3d12.dll", ExactSpelling=true)]
    public static extern int D3D12CreateDevice(IntPtr adapter, uint level, ref Guid iid, out IntPtr device);
}
'@
$iid = [Guid]'189819F1-1DB6-4B57-BE54-1821339B85F7'
$device = [IntPtr]::Zero
$result = [D1AlphaGraphicsCheck]::D3D12CreateDevice([IntPtr]::Zero, 0xb000, [ref]$iid, [ref]$device)
if ($result -lt 0) { throw 'Direct3D 12 could not create a device. Install the current graphics driver from your GPU manufacturer, then retry setup.' }
if ($device -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::Release($device) | Out-Null }
$checks.Add('Direct3D 12 device available (gameplay performance not measured)')
@{checks=$checks.ToArray();gameplayVerified=$false} | ConvertTo-Json
