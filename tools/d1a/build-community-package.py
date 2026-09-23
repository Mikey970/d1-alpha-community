"""Build an offline Windows candidate from an explicit file allowlist, without saves/game assets."""
from pathlib import Path
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
REL = Path('runtime/candidate-community-r576-20260921')

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)

def tree(source, destination, exclude=()):
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', *exclude))

def build(out, pwsh, python, backend_source, text_clean_source, emulator=None, vc_runtime=None):
    source = backend_source.resolve()
    text_clean_source = text_clean_source.resolve()
    prior = ROOT / REL
    text_package_name = '360_investment_globals_0071_0.pkg'
    clean_check = json.loads((text_clean_source / 'check.json').read_text())
    clean_manifest = text_clean_source / 'name-manifest.json'
    clean_package = text_clean_source / text_package_name
    if (clean_check.get('blankedDescriptions') != 303 or not clean_check.get('roundtripPassed')
            or clean_check.get('sourceSha256') != sha(prior / 'game/packages' / text_package_name)
            or clean_check.get('packageSha256') != sha(clean_package)
            or json.loads(clean_manifest.read_text()).get('packageSha256') != clean_check['packageSha256']):
        raise ValueError('Clean text package does not match the accepted runtime and its audit.')
    if vc_runtime is None:
        raise ValueError('Supply --vc-runtime with the toolchain x64 Microsoft.VC*.CRT redistributable folder.')
    required_crt = ('msvcp140.dll', 'msvcp140_atomic_wait.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
    for name in required_crt:
        if not (vc_runtime / name).is_file():
            raise ValueError(f'Missing x64 Visual C++ runtime: {name}')
    custom_emulator = emulator is not None
    out = out.resolve()
    if out.exists():
        raise ValueError('Output already exists; use a new build directory.')
    out.mkdir(parents=True)
    candidate = out / REL
    candidate.mkdir(parents=True)
    for name in ('community-setup.py', 'community-launcher.pyw', 'community-settings.py', 'community-preflight.ps1', 'community-runtime.ps1', 'community-process.ps1', 'community-config.ps1',
                 'community-guard.ps1', 'community-node-runner.cjs', 'community-loadout.cjs', 'prepare-director-profile.ps1'):
        copy(ROOT / 'tools/d1a' / name, out / 'tools/d1a' / name)
    copy(ROOT / 'Launch Community Candidate.cmd', out / 'Launch Community Candidate.cmd')
    (out / 'Setup.cmd').write_text('@echo off\r\n"%~dp0runtimes\\python\\python.exe" -I "%~dp0tools\\d1a\\community-setup.py"\r\nif errorlevel 1 pause\r\n')
    tree(prior / 'api', candidate / 'api')
    # Compile the source included below. Reusing a candidate's old server-dist
    # can silently package binaries that do not match the shipped source.
    node_path = shutil.which('node')
    if not node_path:
        raise ValueError('Node is required to compile the packaged backend.')
    node = Path(node_path)
    subprocess.run([
        str(node), str(source / 'node_modules/typescript/bin/tsc'),
        '-p', str(source / 'tsconfig.build.json'),
        '--outDir', str(candidate / 'server-dist'), '--incremental', 'false',
    ], cwd=source, check=True)
    def comparable_files(folder):
        result = {}
        for path in folder.rglob('*'):
            if not path.is_file() or path.name.endswith(('.js.map', '.tsbuildinfo')):
                continue
            data = path.read_bytes()
            if path.suffix == '.json':
                data = data.replace(str(ROOT).replace('\\', '\\\\').encode(), b'<workspace>')
            result[path.relative_to(folder)] = hashlib.sha256(data).hexdigest()
        return result

    expected = comparable_files(prior / 'server-dist')
    compiled = comparable_files(candidate / 'server-dist')
    if compiled != expected:
        raise ValueError('Compiled backend differs from the accepted runtime. Validate and promote the runtime before packaging it.')
    if sum(path.suffix == '.js' for path in compiled) != 235:
        raise ValueError('Unexpected compiled backend module count.')
    for path in (candidate / 'server-dist').rglob('*.js.map'):
        path.unlink()
    copy(clean_manifest, candidate / 'name-overrides/manifest.json')
    copy(text_clean_source / 'check.json', out / 'source/text-clean.json')
    for folder in ('profile', 'content', 'storage/patches'):
        (candidate / folder).mkdir(parents=True, exist_ok=True)
    emulator = (emulator or prior / 'xenia.r576-input-audit.exe').resolve()
    if not emulator.is_file() or not emulator.name.startswith('xenia.') or emulator.suffix != '.exe':
        raise ValueError('Emulator must be an existing xenia.*.exe candidate.')
    copy(emulator, candidate / emulator.name)
    # App-local CRT deployment: a developer machine's system DLLs must not hide
    # prerequisites missing on a clean installation. Only use the redist tree.
    crt_files = []
    for path in sorted(vc_runtime.glob('*.dll')):
        copy(path, candidate / path.name)
        crt_files.append({'name': path.name, 'sha256': sha(path)})
    runtime_script = out / 'tools/d1a/community-runtime.ps1'
    runtime_text = runtime_script.read_text()
    original_hash = 'EA17E45E74321DC2BF4BB8402B1595F497363BDEA1F95000DCF9F9AC65469BE3'
    if runtime_text.count(original_hash) != 1 or runtime_text.count('xenia.r576-input-audit.exe') != 2:
        raise ValueError('Runtime executable guard changed; update the package builder.')
    runtime_script.write_text(runtime_text.replace('xenia.r576-input-audit.exe', emulator.name)
                              .replace(original_hash, sha(emulator).upper()))
    emulator_audit = ROOT / 'runtime/analysis-community-r576-20260921/clean-combat-emulator.json'
    if custom_emulator and not emulator_audit.is_file():
        raise ValueError('Custom emulator requires its source/build audit.')
    if emulator_audit.is_file():
        audit = json.loads(emulator_audit.read_text())
        if custom_emulator and audit.get('exeSha256') != sha(emulator):
            raise ValueError('Custom emulator does not match its source/build audit.')
        if audit.get('exeSha256') == sha(emulator):
            emulator_source = Path(audit['sourceTree'])
            audit['sourceTree'] = emulator_source.relative_to(ROOT).as_posix()
            source_out = out / 'source/emulator'
            source_out.mkdir(parents=True)
            (source_out / 'audit.json').write_text(json.dumps(audit, indent=2))
            copy(emulator_audit.parent / 'emulator-origin-dirty.patch', source_out / 'origin-dirty.patch')
            for relative in ('src/xenia/cpu/backend/x64/x64_emitter.cc',
                             'src/xenia/hid/winkey/winkey_input_driver.cc',
                             'src/xenia/hid/winkey/winkey_input_driver.h',
                             'src/xenia/config.cc', 'CMakeLists.txt', 'version.h.in'):
                if sha(emulator_source / relative) != audit.get('sourceFilesSha256', {}).get(relative):
                    raise ValueError(f'Emulator source differs from its build audit: {relative}')
                copy(emulator_source / relative, source_out / relative)
            (source_out / 'README.txt').write_text(
                f'Base Xenia commit: {audit["baseCommit"]}\n'
                'Apply origin-dirty.patch to that checkout with its submodules initialized.\n'
                'Then overlay CMakeLists.txt, version.h.in and src/ from this folder.\n'
                'Configure with CMake/Ninja Multi-Config in an x64 MSVC developer environment.\n'
                'Build target xenia-app, configuration Release; tests/misc OFF.\n'
                'Tested toolchain: MSVC14.50.35717. See audit.json for the exact binary and limited gameplay checks.\n'
                'Byte-for-byte rebuild identity and full gameplay acceptance are not claimed.\n')
    copy(prior / 'storage/patches/41560907-destiny-36735.patch.toml', candidate / 'storage/patches/41560907-destiny-36735.patch.toml')
    config = (prior / 'xenia-canary-netplay.config.toml').read_text()
    config = re.sub(r'(?m)^(logged_profile_slot_[0-3]_xuid\s*=)\s*"[^"]*"', r'\1 ""', config)
    config = re.sub(r'(?m)^(host_(?:input_state|screenshot_request)_file\s*=)\s*"[^"]*"', r'\1 ""', config)
    config = re.sub(r'(?m)^\[D1 Alpha\](?=\r?$)', '["D1 Alpha"]', config)
    portable_settings = {'network_guid': '""', 'api_list': '"127.0.0.1:36000/"',
                         'window_size_x': '1280', 'window_size_y': '720'}
    for key, value in portable_settings.items():
        config, count = re.subn(r'(?m)^(' + key + r'\s*=)\s*(?:"[^"]*"|\d+)',
                                lambda match: match[1] + ' ' + value, config)
        if count != 1:
            raise ValueError(f'Missing or duplicate emulator setting: {key}')
    (candidate / 'xenia-canary-netplay.config.toml').write_text(config)
    for name in ('package.json', 'package-lock.json'):
        copy(source / name, candidate / name)
    lock = json.loads((source / 'package-lock.json').read_text())
    licenses = []
    for name, metadata in lock['packages'].items():
        if not name.startswith('node_modules/') or metadata.get('dev') or metadata.get('link'):
            continue
        dependency = source / name
        if not dependency.is_dir():
            if metadata.get('optional'):
                continue
            raise ValueError(f'Missing locked dependency: {name}')
        target = candidate / name
        if not target.exists():
            tree(dependency, target)
        licenses.append({'path': name, 'version': metadata.get('version'), 'license': metadata.get('license'),
                         'integrity': metadata.get('integrity'), 'resolved': metadata.get('resolved')})
    # Generated Prisma files are separate from npm's package graph.
    if (source / 'node_modules/.prisma').is_dir():
        tree(source / 'node_modules/.prisma', candidate / 'node_modules/.prisma')
    print(f'Copied backend and {len(licenses)} runtime dependencies.', flush=True)
    copy(node, out / 'runtimes/node/node.exe')
    node_version = subprocess.check_output([str(node), '--version'], text=True).strip()
    urllib.request.urlretrieve(f'https://raw.githubusercontent.com/nodejs/node/{node_version}/LICENSE', out / 'runtimes/node/LICENSE')
    tree(pwsh, out / 'runtimes/powershell')
    for path in python.iterdir():
        if path.is_file() and (path.suffix in ('.exe', '.dll') or path.name == 'LICENSE.txt'):
            copy(path, out / 'runtimes/python' / path.name)
    for name in ('Lib', 'DLLs', 'tcl'):
        tree(python / name, out / 'runtimes/python' / name, ('site-packages', 'test', 'tests', 'idlelib', 'ensurepip'))
    sevenzip = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / '7-Zip'
    for name in ('7z.exe', '7z.dll', 'License.txt', 'readme.txt'):
        copy(sevenzip / name, out / 'runtimes/7zip' / name)
    if not (sevenzip / 'readme.txt').read_text().startswith('7-Zip 25.01'):
        raise ValueError('Update the matching 7-Zip source archive before changing the bundled extractor version.')
    sevenzip_source = ROOT / 'vendor/7zip-source/7z2501-src.tar.xz'
    if sha(sevenzip_source) != 'ed087f83ee789c1ea5f39c464c55a5c9d4008deb0efe900814f2df262b82c36e':
        raise ValueError('7-Zip source archive hash mismatch')
    copy(sevenzip_source, out / 'source/7zip/7z2501-src.tar.xz')
    (out / 'licenses').mkdir()
    (out / 'licenses/VC-RUNTIME.json').write_text(json.dumps({
        'sourceDirectory': vc_runtime.name, 'files': crt_files,
        'deployment': 'application-local; update with each package release',
        'documentation': 'https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files',
    }, indent=2))
    copy(ROOT / 'vendor/xenia-d1a/LICENSE', out / 'licenses/XENIA.txt')
    (out / 'licenses/dependencies.json').write_text(json.dumps(licenses, indent=2))
    (out / 'licenses/PROVENANCE.txt').write_text(
        f'Xenia custom binary: {emulator.name}; SHA256 {sha(candidate / emulator.name)}\n'
        'Upstream: https://github.com/craftycodie/xenia-canary\n'
        'Backend upstream: https://github.com/Blam-Network/web-tiger\n'
        'Backend package metadata: private=true, license=UNLICENSED. Public redistribution permission is not established.\n'
        'This archive is a local testing candidate, not a cleared public release.\n'
        'Backend source and npm lockfile are included; dependency licenses remain in each installed package.\n'
        'Emulator acceptance is limited to the checks recorded in RELEASE-STATUS.md; full gameplay and byte-for-byte reproducibility remain unverified.\n'
        f'Bundled Node: {node_version}; Python: {sys.version.split()[0]}; PowerShell: copied host runtime with LICENSE.txt.\n')
    tree(source / 'src', out / 'source/backend/src')
    for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'vitest.config.ts'):
        copy(source / name, out / 'source/backend' / name)
    original = ROOT / 'runtime/extracted-destiny-36735'
    game = prior / 'game'
    # Inventory the accepted game, excluding console saves, system updates and the old executable backup.
    paths = [p.relative_to(game) for p in sorted(game.rglob('*')) if p.is_file()
             and p.relative_to(game).parts[0] not in ('$SystemUpdate', 'default.original.xex')
             and not re.fullmatch(r'[0-9A-Fa-f]{16}', p.relative_to(game).parts[0])]
    spec = importlib.util.spec_from_file_location('base_import', ROOT / 'tools/d1a/build-base-import.py')
    base_import = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base_import)
    # The research extraction may already include edits (notably init.txt).
    # Derive deltas against the actual unchanged download, not that extraction.
    with tempfile.TemporaryDirectory(prefix='d1a-base-') as temporary:
        build_game_import(out, original, game, paths, base_import, Path(temporary), clean_package)
    # Research metadata contains local source paths; strip the author's workspace from the shipped copy.
    for path in [*candidate.rglob('*.json'), *(out / 'source/backend/src').rglob('*.json')]:
        text = path.read_text(encoding='utf-8-sig')
        if str(ROOT).replace(chr(92), chr(92) * 2) in text:
            text = text.replace(str(ROOT).replace('\\', '\\\\'), '<workspace>')
            path.write_text(text, encoding='utf-8')
    copy(ROOT / 'restoration/COMMUNITY-PACKAGE-STATUS.md', out / 'RELEASE-STATUS.md')
    copy(ROOT / 'restoration/COMMUNITY-README.md', out / 'README.txt')
    files = [{'path': p.relative_to(out).as_posix(), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in sorted(out.rglob('*')) if p.is_file()]
    (out / 'package-manifest.json').write_text(json.dumps({'schema': 1, 'version': 'r576', 'releaseReady': False,
        'mutableAfterInstall': [(REL / 'xenia-canary-netplay.config.toml').as_posix()], 'files': files}, indent=2))
    print(f'Built portable folder: {out}; {len(files)} files. Create ZIP only after installation checks.', flush=True)


def build_game_import(out, original, game, paths, base_import, clean_inputs, clean_package):
    base_import.build_base_map(ROOT / 'game', [{'path': p.as_posix(), 'sourceSha256': sha(original / p)} for p in paths],
                               out / 'base-import.json', clean_inputs)
    rows = []
    for relative in paths:
        old = original / relative
        new = clean_package if relative == Path('packages/360_investment_globals_0071_0.pkg') else game / relative
        if (clean_inputs / relative).is_file():
            old = clean_inputs / relative
        row = {'path': relative.as_posix(), 'sourceSha256': sha(old), 'targetSha256': sha(new), 'targetBytes': new.stat().st_size}
        if row['sourceSha256'] != row['targetSha256']:
            patch_name = f'game-patches/{len(rows)}.delta.gz'
            patch_path = out / patch_name
            patch_path.parent.mkdir(exist_ok=True)
            with old.open('rb') as before, new.open('rb') as after, gzip.open(patch_path, 'wb', compresslevel=9) as patch:
                patch.write(b'D1APATCH')
                offset = 0
                while data := after.read(4096):
                    if data != before.read(4096):
                        patch.write(struct.pack('>QI', offset, len(data)))
                        patch.write(data)
                    offset += len(data)
            row['patch'] = patch_name
            print(f'Game delta: {relative} ({patch_path.stat().st_size} bytes)', flush=True)
        rows.append(row)
    (out / 'game-import.json').write_text(json.dumps({'schema': 1, 'build': '36735.13.12.02.1953.alpha', 'files': rows}, indent=2))

def archive(out):
    """Archive a verified build without silently refreshing or trusting changed files."""
    destination = out.with_suffix('.zip')
    if destination.exists():
        raise ValueError('Archive already exists. Build to a new output directory.')
    manifest_path = out / 'package-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    rows = []
    seen = set()
    for row in manifest['files']:
        relative = Path(row['path'])
        path = (out / relative).resolve()
        key = relative.as_posix().casefold()
        if relative.is_absolute() or '..' in relative.parts or not path.is_relative_to(out.resolve()) or key in seen:
            raise ValueError(f'Unsafe or duplicate archive path: {relative}')
        seen.add(key)
        if relative.is_relative_to(REL) and relative.relative_to(REL).parts[0] in ('game', 'profile', 'content', 'runs', 'captures'):
            raise ValueError(f'Private or game file in archive allowlist: {relative}')
        if not path.is_file() or path.stat().st_size != row['bytes'] or sha(path) != row['sha256']:
            raise ValueError(f'Build changed after its manifest was written: {relative}. Rebuild before packaging.')
        rows.append(row)
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for row in rows:
            bundle.write(out / row['path'], row['path'])
        bundle.write(manifest_path, 'package-manifest.json')
    with zipfile.ZipFile(destination) as bundle:
        bad = bundle.testzip()
        if bad:
            raise ValueError(f'ZIP verification failed: {bad}')
    checksum = sha(destination)
    destination.with_suffix('.zip.sha256').write_text(f'{checksum}  {destination.name}\n')
    print(json.dumps({'archive': str(destination), 'bytes': destination.stat().st_size, 'sha256': checksum, 'files': len(rows) + 1}), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--powershell', type=Path)
    parser.add_argument('--archive-only', action='store_true')
    parser.add_argument('--python', type=Path, default=Path(sys.executable).parent)
    parser.add_argument('--emulator', type=Path, help='Explicit custom emulator candidate; copied and pinned by SHA256 in the packaged launcher.')
    parser.add_argument('--vc-runtime', type=Path, help='x64 Microsoft.VC*.CRT folder from the matching Visual Studio redistributable tree.')
    parser.add_argument('--backend-source', type=Path, help='Explicit backend source tree with its locked dependencies installed.')
    parser.add_argument('--text-clean-source', type=Path, help='Audited text package that removes unsupported descriptions.')
    args = parser.parse_args()
    if args.archive_only:
        archive(args.output.resolve())
    elif args.powershell and args.backend_source and args.text_clean_source:
        build(args.output, args.powershell, args.python, args.backend_source, args.text_clean_source, args.emulator, args.vc_runtime)
    else:
        parser.error('--powershell, --backend-source and --text-clean-source are required when building a new folder')
