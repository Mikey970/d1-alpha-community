"""Offline portable setup. Import only hash-identified game files; never import saves."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import struct
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import uuid
from contextlib import contextmanager

class InstallCancelled(Exception):
    pass

def check_cancel(cancel):
    if cancel is not None and cancel.is_set():
        raise InstallCancelled('Installation cancelled. Run Setup again to resume verified files.')

@contextmanager
def install_lock():
    # Windows releases this lock even if the installer process crashes.
    import msvcrt
    with (ROOT / 'installation.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise ValueError('Another setup is running in this folder.') from error
        try:
            yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / 'runtime/candidate-community-r576-20260921'

def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def safe_child(root, relative):
    value = (root / relative).resolve()
    if not value.is_relative_to(root.resolve()) or value == root.resolve():
        raise ValueError(f'Unsafe package path: {relative}')
    return value

def verify_package(report=print, cancel=None):
    manifest = json.loads((ROOT / 'package-manifest.json').read_text())
    report('Checking package files...')
    installed = (ROOT / 'installation.json').is_file()
    for row in manifest['files']:
        check_cancel(cancel)
        if installed and row['path'] in manifest.get('mutableAfterInstall', []):
            continue
        path = safe_child(ROOT, row['path'])
        if not path.is_file() or digest(path) != row['sha256']:
            raise ValueError(f'Package is missing or damaged: {row["path"]}. Extract a fresh copy of the ZIP.')
    report('Package integrity verified.')

def import_game(source, report=print, cancel=None):
    with install_lock():
        _import_game(source, report, cancel)

def check_machine(report=print):
    report('Checking this PC and the bundled tools...')
    result = subprocess.run([str(ROOT / 'runtimes/powershell/pwsh.exe'), '-NoProfile', '-File',
                             str(ROOT / 'tools/d1a/community-preflight.ps1')], capture_output=True,
                            text=True, encoding='utf-8', errors='replace', timeout=90,
                            env={key: value for key, value in os.environ.items()
                                 if key.upper() not in ('NODE_OPTIONS', 'NODE_PATH', 'NODE_ENV')},
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip())
    for line in json.loads(result.stdout)['checks']:
        report(line)

def base_source(source, report, cancel):
    """Accept the original archive or its untouched extracted folder."""
    manifest_path = ROOT / 'base-import.json'
    if not manifest_path.is_file():
        return source, None
    manifest = json.loads(manifest_path.read_text())
    if source.is_file():
        check_cancel(cancel)
        game = json.loads((ROOT / 'game-import.json').read_text())
        required = sum(row['bytes'] for row in manifest['sources']) + sum(row['targetBytes'] for row in game['files']) + 20 * 1024**3
        if shutil.disk_usage(ROOT).free < required:
            raise ValueError(f'Free at least {required / 1024**3:.1f} GB on this drive for extraction, installation and runtime caches.')
        stage = ROOT / 'base.importing'
        stage.mkdir(exist_ok=True)
        report('Unpacking the original download with bundled 7-Zip...')
        result = subprocess.run([str(ROOT / 'runtimes/7zip/7z.exe'), 'x', str(source),
                                 '-o' + str(stage), '-y', '-bsp0', '-bso0', '--',
                                 *[row['path'] for row in manifest['sources']]],
                                capture_output=True, text=True, errors='replace',
                                creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:
            raise ValueError('Could not unpack this download: ' + result.stderr[-600:])
        source = stage
    if (source / 'default.xex').is_file():
        return source, None
    roots = [source, *[p for p in source.iterdir() if p.is_dir()]]
    matches = [p for p in roots if all(safe_child(p, r['path']).is_file() for r in manifest['sources'])]
    if len(matches) != 1:
        raise ValueError('Choose the original Dec 3, 2013 prototype archive, or its full extracted folder containing tiger_release_internal_unlock.xex. No manual edits are needed.')
    source = matches[0]
    report('Checking the untouched base download...')
    for row in manifest['sources']:
        check_cancel(cancel)
        path = safe_child(source, row['path'])
        if path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError(f'The base download is incomplete or changed: {row["path"]}')
    return source, manifest

def copy_base_file(source, chunks, target, cancel):
    with target.open('wb') as output:
        for relative, offset, size in chunks:
            check_cancel(cancel)
            path = safe_child(source, relative)
            if offset < 0 or size < 0 or offset + size > path.stat().st_size:
                raise ValueError('Invalid base import range')
            with path.open('rb') as stream:
                stream.seek(offset)
                while size:
                    data = stream.read(min(size, 1024 * 1024))
                    if not data:
                        raise ValueError('Truncated base download')
                    output.write(data)
                    size -= len(data)

def write_installation_receipt(count):
    temporary = ROOT / ('installation.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps({'schema': 1, 'gameFiles': count, 'gameplayVerified': False}, indent=2), encoding='utf-8')
    os.replace(temporary, ROOT / 'installation.json')

def _import_game(source, report, cancel):
    verify_package(report, cancel)
    manifest = json.loads((ROOT / 'game-import.json').read_text())
    destination = CANDIDATE / 'game'
    if destination.exists():
        for row in manifest['files']:
            check_cancel(cancel)
            path = safe_child(destination, row['path'])
            if not path.is_file() or digest(path) != row['targetSha256']:
                raise ValueError('The installed game differs from this package. Use a new extracted package folder; existing files were preserved.')
        if not (ROOT / 'installation.json').is_file():
            write_installation_receipt(len(manifest['files']))
        report('This game is already installed and verified. Profiles are unchanged.')
        return
    if source is None:
        raise ValueError('The game is not installed. Run Setup and choose the original base download.')
    source = Path(source).resolve()
    if source == destination.resolve() or not source.exists():
        raise ValueError('Choose the original download or its extracted folder.')
    source, base = base_source(source, report, cancel)
    stage = safe_child(CANDIDATE, 'game.importing')
    # Keep and reuse only files whose final bytes have already been verified.
    reusable = set()
    for row in manifest['files']:
        check_cancel(cancel)
        existing = safe_child(stage, row['path'])
        if existing.is_file() and existing.stat().st_size == row['targetBytes'] and digest(existing) == row['targetSha256']:
            reusable.add(row['path'])
    required = sum(row['targetBytes'] for row in manifest['files'] if row['path'] not in reusable)
    if shutil.disk_usage(CANDIDATE).free < required + 20 * 1024**3:
        raise ValueError('The installation drive needs space for the game plus 20 GB free for runtime caches.')
    validated = []
    for row in manifest['files']:
        check_cancel(cancel)
        if base:
            validated.append((row, None, row['sourceSha256']))
            continue
        path = safe_child(source, row['path'])
        if not path.is_file():
            raise ValueError(f'Missing game file: {row["path"]}. Select the extracted 36735 prealpha folder.')
        checksum = digest(path)
        if checksum not in (row['sourceSha256'], row['targetSha256']):
            raise ValueError(f'Unsupported game file: {row["path"]}. Choose the original Dec 3, 2013 prototype download instead. Setup applies the changes for you.')
        validated.append((row, path, checksum))
    report(f'Validated {len(validated)} game files. Copying into this installation...')
    stage.mkdir(exist_ok=True)
    try:
        for index, (row, source_path, checksum) in enumerate(validated, 1):
            check_cancel(cancel)
            if row['path'] in reusable:
                continue
            target = safe_child(stage, row['path'])
            target.parent.mkdir(parents=True, exist_ok=True)
            if base:
                copy_base_file(source, base['files'][row['path']], target, cancel)
                if digest(target) != row['sourceSha256']:
                    raise ValueError(f'Base import verification failed: {row["path"]}')
            else:
                shutil.copyfile(source_path, target)
            if checksum != row['targetSha256']:
                patch = safe_child(ROOT, row['patch'])
                with gzip.open(patch, 'rb') as changes, target.open('r+b') as output:
                    if changes.read(8) != b'D1APATCH':
                        raise ValueError('Invalid game patch header')
                    while header := changes.read(12):
                        if len(header) != 12:
                            raise ValueError('Truncated game patch header')
                        offset, size = struct.unpack('>QI', header)
                        if not 0 < size <= 4096 or offset + size > row['targetBytes']:
                            raise ValueError('Invalid game patch range')
                        payload = changes.read(size)
                        if len(payload) != size:
                            raise ValueError('Invalid game patch range')
                        output.seek(offset)
                        output.write(payload)
                    output.truncate(row['targetBytes'])
            if digest(target) != row['targetSha256']:
                raise ValueError(f'Import verification failed: {row["path"]}')
            if index % 15 == 0 or index == len(validated):
                report(f'Imported {index}/{len(validated)} files')
        check_cancel(cancel)
        os.rename(stage, destination)
    except Exception:
        report(f'Incomplete import retained for inspection: {stage}')
        raise
    report('Game import complete. Your source files and all existing profiles were preserved.')
    write_installation_receipt(len(validated))

class Setup(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('D1 Alpha — Install community test candidate')
        self.geometry('690x510')
        self.events = queue.Queue()
        self.cancel = threading.Event()
        self.installing = False
        self.closing = False
        self.protocol('WM_DELETE_WINDOW', self.close)
        panel = ttk.Frame(self, padding=24)
        panel.pack(fill='both', expand=True)
        ttk.Label(panel, text='D1 Alpha setup', font=('Segoe UI', 22)).pack(anchor='w')
        ttk.Label(panel, text='Offline installation • Windows x64 • no administrator needed', wraplength=620).pack(anchor='w', pady=10)
        ttk.Label(panel, text='Choose the original Dec 3, 2013 prototype download.\nSetup includes the tools and applies all included patches automatically.\nYour original download stays unchanged. This is still a test build.', wraplength=620).pack(anchor='w', pady=10)
        self.select = ttk.Button(panel, text='Choose base download and install', command=self.choose)
        self.select.pack(anchor='w', pady=10)
        self.folder = ttk.Button(panel, text='Already extracted? Choose folder', command=lambda: self.choose(folder=True))
        self.folder.pack(anchor='w', pady=(0, 10))
        self.progress = ttk.Progressbar(panel, mode='indeterminate')
        self.progress.pack(fill='x', pady=(0, 10))
        self.log = tk.Text(panel, height=9, wrap='word', state='disabled')
        self.log.pack(fill='both', expand=True)
        self.launch = ttk.Button(panel, text='Open launcher', state='disabled', command=self.open_launcher)
        self.launch.pack(anchor='e', pady=10)
        self.after(100, self.poll)
        if (CANDIDATE / 'game').is_dir():
            self.after(150, lambda: self.install(None))
    def choose(self, folder=False):
        source = (filedialog.askdirectory(title='Choose the full extracted base download', parent=self) if folder else
                  filedialog.askopenfilename(title='Choose the original base download', parent=self, filetypes=[('Game download', '*.rar *.zip *.7z')]))
        if not source:
            return
        self.install(source)

    def install(self, source):
        self.select.configure(state='disabled')
        self.folder.configure(state='disabled')
        self.progress.start()
        self.launch.configure(state='disabled')
        self.cancel.clear()
        self.installing = True
        def work():
            try:
                check_machine(lambda text: self.events.put(('log', text)))
                import_game(source, lambda text: self.events.put(('log', text)), self.cancel)
                self.events.put(('done', 'Ready to launch.'))
            except Exception as error:
                self.events.put(('error', str(error)))
        threading.Thread(target=work, daemon=True).start()
    def close(self):
        if self.installing:
            self.closing = True
            self.cancel.set()
            self.select.configure(text='Stopping after the current file...')
        else:
            self.destroy()
    def poll(self):
        while not self.events.empty():
            kind, text = self.events.get()
            self.log.configure(state='normal')
            self.log.insert('end', text + '\n')
            self.log.see('end')
            self.log.configure(state='disabled')
            if kind == 'done':
                self.progress.stop()
                self.installing = False
                self.launch.configure(state='normal')
                self.select.configure(state='normal')
                self.folder.configure(state='normal')
            elif kind == 'error':
                self.progress.stop()
                self.installing = False
                self.select.configure(state='normal')
                self.folder.configure(state='normal')
                if not self.closing:
                    messagebox.showerror('Setup could not finish', text, parent=self)
        if self.closing and not self.installing:
            self.destroy()
            return
        self.after(100, self.poll)
    def open_launcher(self):
        subprocess.Popen([str(ROOT / 'runtimes/python/pythonw.exe'), '-I', str(ROOT / 'tools/d1a/community-launcher.pyw')], cwd=ROOT)

if __name__ == '__main__':
    import sys
    if sys.stdout is not None:
        sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', type=Path)
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--check-installed', action='store_true')
    args = parser.parse_args()
    if args.verify_only:
        verify_package()
    elif args.check_installed:
        check_machine()
        import_game(None)
    elif args.game:
        check_machine()
        import_game(args.game)
    else:
        Setup().mainloop()
