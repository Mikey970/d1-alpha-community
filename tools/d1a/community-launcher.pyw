"""Community candidate controls; destination selection remains in the native Director."""
from __future__ import annotations

import json
import importlib.util
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import uuid
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / 'runtime/candidate-community-r576-20260921'
TOOLS = ROOT / 'tools/d1a'
CHARACTERS = {
    'Hunter · Arc': 'hunter-arc', 'Hunter · Ghost Gun': 'hunter-ghost',
    'Warlock · Nova Bomb': 'warlock-nova', 'Warlock · Radiance': 'warlock-radiance',
    'Titan · Fist of Havoc': 'titan-arc',
    **{f'E3 test character {n}': f'e3-{n}' for n in range(18, 26)},
}
KEEP = 'Keep saved weapon'


def powershell() -> str | None:
    bundled = ROOT / 'runtimes/powershell/pwsh.exe'
    if bundled.is_file():
        return str(bundled)
    found = shutil.which('pwsh')
    if found:
        return found
    installed = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'PowerShell/7/pwsh.exe'
    return str(installed) if installed.is_file() else None


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('D1 Alpha · Community candidate')
        self.configure(bg='#121412')
        self.minsize(600, 540)
        self.events = queue.Queue()
        self.busy = False
        self.run_root: Path | None = None
        self.catalog: dict[int, dict[str, str]] = {}
        self.roster = {'Original character': '0000000200000002'}
        self.last_log: Path | None = None
        self.shell = powershell()
        bundled_node = ROOT / 'runtimes/node/node.exe'
        self.node = str(bundled_node) if bundled_node.is_file() else shutil.which('node')
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('.', background='#121412', foreground='#ece9df', font=('Segoe UI', 10))
        style.configure('TCombobox', fieldbackground='#292c28', background='#292c28', foreground='#ece9df')
        style.map('TCombobox',
                  fieldbackground=[('disabled', '#20231f'), ('readonly', '#292c28')],
                  foreground=[('disabled', '#92958d'), ('readonly', '#ece9df')],
                  selectbackground=[('readonly', '#425c70')],
                  selectforeground=[('readonly', '#ffffff')])
        style.configure('TButton', padding=(14, 10), background='#292e28', borderwidth=0)
        style.configure('Play.TButton', background='#d5c18f', foreground='#171a15', font=('Segoe UI', 12, 'bold'))
        style.map('Play.TButton', background=[('disabled', '#292e28'), ('active', '#e6d7b2')],
                  foreground=[('disabled', '#92958d'), ('active', '#171a15')])
        style.configure('TNotebook.Tab', background='#292c28', foreground='#ece9df', padding=(12, 8))
        style.map('TNotebook.Tab', background=[('selected', '#425c70'), ('active', '#37423b')],
                  foreground=[('selected', '#ffffff'), ('active', '#ffffff')])
        style.map('TButton',
                  background=[('disabled', '#20231f'), ('active', '#425c70')],
                  foreground=[('disabled', '#92958d'), ('active', '#ffffff')])
        style.map('TCheckbutton', background=[('disabled', '#121412'), ('active', '#121412')],
                  foreground=[('disabled', '#92958d'), ('active', '#ece9df')])
        style.configure('Heading.TLabel', font=('Segoe UI', 24))
        style.configure('Muted.TLabel', foreground='#b3b5ac')
        panel = ttk.Frame(self, padding=26)
        panel.pack(fill='both', expand=True)
        ttk.Label(panel, text='D1 ALPHA', style='Heading.TLabel').pack(anchor='w')
        ttk.Label(panel, text='Community test build', style='Muted.TLabel').pack(anchor='w', pady=(0, 16))
        ttk.Label(panel, text='Choose your loadout. Pick a destination in the game.', wraplength=580).pack(anchor='w', pady=(0, 18))
        ttk.Label(panel, text='Save / starter class').pack(anchor='w')
        self.character = ttk.Combobox(panel, values=list(CHARACTERS), state='readonly')
        self.character.current(0)
        self.character.pack(fill='x', pady=(5, 15))
        self.character.bind('<<ComboboxSelected>>', self.change_profile)
        ttk.Label(panel, text='Character').pack(anchor='w')
        self.equipment_character = ttk.Combobox(panel, values=list(self.roster), state='readonly')
        self.equipment_character.current(0)
        self.equipment_character.pack(fill='x', pady=(5, 15))
        self.equipment_character.bind('<<ComboboxSelected>>', lambda _: self.load_catalog())
        self.weapons = {}
        for slot, label in ((7, 'Primary'), (8, 'Special'), (9, 'Heavy')):
            row = ttk.Frame(panel)
            row.pack(fill='x', pady=4)
            ttk.Label(row, text=label, width=12).pack(side='left')
            choice = ttk.Combobox(row, state='readonly', values=[KEEP])
            choice.set(KEEP)
            choice.pack(side='left', fill='x', expand=True)
            self.weapons[slot] = choice
        self.allowance = tk.BooleanVar(value=False)
        self.minutes = tk.StringVar(value='30')
        actions = ttk.Frame(panel)
        actions.pack(fill='x', pady=(26, 12))
        self.buttons = {}
        for action, label in (('Start', 'Play'), ('Stop', 'Stop game')):
            button = ttk.Button(actions, text=label, style='Play.TButton' if action == 'Start' else 'TButton',
                                command=lambda a=action: self.execute(a))
            button.pack(side='left', fill='x', expand=action == 'Start', padx=(0, 8))
            self.buttons[action] = button
        self.settings_button = ttk.Button(actions, text='Settings', command=self.open_settings)
        self.settings_button.pack(side='left')
        self.status = ttk.Label(panel, text='Loading inventory…', wraplength=540, style='Muted.TLabel')
        self.status.pack(anchor='w', pady=(6, 14))
        footer = ttk.Frame(panel)
        footer.pack(fill='x', side='bottom')
        help_button = ttk.Menubutton(footer, text='Help')
        self.help_menu = tk.Menu(help_button, tearoff=False, background='#292e28', foreground='#ece9df')
        self.help_menu.add_command(label='Check setup', command=lambda: self.execute('Check'))
        self.help_menu.add_command(label='Read me', command=self.open_readme)
        self.help_menu.add_command(label='Open logs', command=self.open_logs)
        help_button.configure(menu=self.help_menu)
        help_button.pack(side='right')
        ttk.Label(footer, text='Closing the game stops its server.', style='Muted.TLabel').pack(side='left')
        if not (CANDIDATE / 'game/default.xex').is_file():
            ttk.Button(panel, text='Install game', command=self.open_setup).pack(anchor='w')
        self.reconnect()
        self.bind('<FocusIn>', self.refresh_session)
        self.after(150, self.poll)
        if not self.run_root:
            self.load_catalog()

    def reconnect(self):
        receipts = []
        for path in CANDIDATE.glob('runs/*/launch.json'):
            try:
                receipts.append((path.stat().st_mtime, path))
            except OSError:
                continue
        for _, path in sorted(receipts, reverse=True):
            if (path.parent / 'stop.json').exists():
                continue
            try:
                receipt = json.loads(path.read_text(encoding='utf-8-sig'))
            except (OSError, ValueError):
                continue
            if receipt.get('owner') == 'd1a-community' and receipt.get('status') == 'running':
                self.run_root = path.parent
                for label, character in CHARACTERS.items():
                    if character == receipt.get('character'):
                        self.character.set(label)
                        break
                equipped = receipt.get('loadoutCharacter', '0000000200000002')
                if not isinstance(equipped, str) or not re.fullmatch(r'00000002[0-9a-f]{8}', equipped):
                    equipped = '0000000200000002'
                label = 'Original character' if equipped == '0000000200000002' else f'Saved character · {equipped[-4:]}'
                self.roster = {label: equipped}
                self.equipment_character.configure(values=[label])
                self.equipment_character.set(label)
                minutes = receipt.get('boundedMinutes')
                if type(minutes) is int and 1 <= minutes <= 120:
                    self.minutes.set(str(minutes))
                self.allowance.set(receipt.get('sandboxAllowance') is True)
                self.status.configure(text='A session is running. Stop it to change your loadout.')
                break
        self.update_controls()

    def refresh_session(self, _event=None):
        # Pick up sessions started by another launcher.
        if not self.busy and self.run_root is None:
            self.reconnect()

    def update_controls(self):
        editable = not self.busy and self.run_root is None
        for widget in [self.character, self.equipment_character, *self.weapons.values()]:
            widget.configure(state='readonly' if editable else 'disabled')
        installed = (CANDIDATE / 'game/default.xex').is_file()
        self.help_menu.entryconfigure(0, state='normal' if editable and installed else 'disabled')
        self.settings_button.configure(state='normal' if editable and installed else 'disabled')
        for action, button in self.buttons.items():
            enabled = not self.busy and (self.run_root is not None if action == 'Stop' else editable)
            if action != 'Stop' and not installed:
                enabled = False
            button.configure(state='normal' if enabled else 'disabled')

    def spawn(self, operation: str, arguments: list[str], log: Path | None = None):
        self.busy = True
        self.update_controls()
        def work():
            try:
                # Pipes would wait for inherited game handles and leave Stop disabled.
                with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                    result = subprocess.run(arguments, cwd=ROOT, stdout=output, stderr=errors,
                                            creationflags=subprocess.CREATE_NO_WINDOW,
                                            timeout=90 if operation == 'catalog' else None)
                    output.seek(0)
                    stdout = output.read().decode('utf-8', errors='replace')
                    errors.seek(0)
                    stderr = errors.read().decode('utf-8', errors='replace')
                if log:
                    log.parent.mkdir(parents=True, exist_ok=True)
                    log.write_text(stdout + stderr, encoding='utf-8')
                self.events.put((operation, result.returncode, stdout, stderr))
            except Exception as exc:
                self.events.put((operation, 1, '', str(exc)))
        threading.Thread(target=work, daemon=True).start()

    def change_profile(self, _event=None):
        self.roster = {'Original character': '0000000200000002'}
        self.equipment_character.configure(values=list(self.roster))
        self.equipment_character.current(0)
        self.load_catalog()

    def load_catalog(self):
        if self.busy or self.run_root:
            return
        self.catalog.clear()
        for choice in self.weapons.values():
            choice.configure(values=[KEEP]); choice.set(KEEP)
        if not self.node:
            self.status.configure(text='Node.js is missing. Install Node.js and reopen this launcher.')
            return
        self.status.configure(text='Reading saved inventory…')
        self.spawn('catalog', [self.node, str(TOOLS / 'community-loadout.cjs'), str(CANDIDATE),
                              CHARACTERS[self.character.get()], 'catalog', '{}', self.roster[self.equipment_character.get()]])

    def execute(self, action: str):
        if self.busy or (action != 'Stop' and self.run_root):
            return
        if not self.shell:
            self.status.configure(text='PowerShell 7 is missing. Install it and reopen this launcher.')
            return
        args = [self.shell, '-NoProfile', '-File', str(TOOLS / 'community-runtime.ps1'), '-Action', action]
        name = f'r576-{action.lower()}-{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}'
        if action == 'Stop':
            if not self.run_root:
                return
            args += ['-RunRoot', str(self.run_root)]
        else:
            args += ['-CandidateRoot', str(CANDIDATE), '-RunName', name, '-Character', CHARACTERS[self.character.get()], '-BoundedMinutes', self.minutes.get()]
            selected = {str(slot): self.catalog[slot][choice.get()] for slot, choice in self.weapons.items() if choice.get() != KEEP}
            args += ['-Loadout', json.dumps(selected), '-LoadoutCharacter', self.roster[self.equipment_character.get()]]
            if self.allowance.get():
                args.append('-SandboxAllowance')
        self.last_log = ROOT / 'runtime/launcher-logs' / f'{name}.log'
        self.pending_run = CANDIDATE / 'runs' / name
        self.status.configure(text=f'{action} in progress…')
        self.spawn(action, args, self.last_log)

    def poll(self):
        try:
            while True:
                operation, code, stdout, stderr = self.events.get_nowait()
                self.busy = False
                if code:
                    self.status.configure(text=f'{operation} failed: {(stderr or stdout).strip()[-420:]}')
                elif operation == 'catalog':
                    try:
                        data = json.loads(stdout)
                        self.roster = {item['label']: item['soid'] for item in data['roster']}
                        self.equipment_character.configure(values=list(self.roster))
                        self.equipment_character.set(next(label for label, soid in self.roster.items() if soid == data['characterId']))
                        for slot, choice in self.weapons.items():
                            items = {item['label']: item['soid'] for item in data['items'] if item['slot'] == slot}
                            self.catalog[slot] = items
                            choice.configure(values=[KEEP, *items])
                        self.status.configure(text='Ready. Saved weapons stay equipped unless you choose replacements.')
                    except (ValueError, KeyError, TypeError, StopIteration) as exc:
                        self.status.configure(text=f'Inventory could not be loaded: {exc}')
                elif operation == 'Start':
                    self.run_root = self.pending_run
                    self.status.configure(text='Game started. Select a destination in the native Director.')
                elif operation == 'Stop':
                    self.run_root = None
                    self.status.configure(text='Session stopped.')
                    self.load_catalog()
                else:
                    self.status.configure(text='Setup check passed.' if operation == 'Check' else 'Backend startup passed and helpers stopped. Gameplay is still unverified.')
                self.update_controls()
        except queue.Empty:
            pass
        if not self.busy and self.run_root and (self.run_root / 'stop.json').exists():
            self.run_root = None
            self.status.configure(text='Session ended. Saved equipment is retained.')
            self.update_controls()
            self.load_catalog()
        self.after(250, self.poll)

    def open_logs(self):
        target = self.run_root or self.last_log
        if target and target.exists():
            os.startfile(target)

    def open_settings(self):
        self.refresh_session()
        if self.busy or self.run_root:
            return
        try:
            spec = importlib.util.spec_from_file_location('community_settings', TOOLS / 'community-settings.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            def can_edit():
                self.refresh_session()
                return not self.busy and self.run_root is None
            window = module.Settings(self, CANDIDATE / 'xenia-canary-netplay.config.toml', can_edit)
            window.grab_set()
        except (OSError, ValueError) as error:
            messagebox.showerror('Settings', str(error), parent=self)

    def open_readme(self):
        for path in (ROOT / 'README.txt', ROOT / 'restoration/COMMUNITY-README.md'):
            if path.is_file():
                os.startfile(path)
                return

    def open_setup(self):
        subprocess.Popen([str(ROOT / 'runtimes/python/pythonw.exe'), '-I', str(TOOLS / 'community-setup.py')], cwd=ROOT)


if __name__ == '__main__':
    Launcher().mainloop()
