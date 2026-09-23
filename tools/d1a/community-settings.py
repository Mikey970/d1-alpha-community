"""Small, validated editor for supported emulator settings; preserve other options."""
import hashlib
import json
import os
from pathlib import Path
import re
import tkinter as tk
from tkinter import ttk
import tomllib
import uuid

KEY_NAMES = {'0x20': 'Space', '0x0D': 'Enter', '0x09': 'Tab', '0x08': 'Backspace',
             '0xBA': ';', '0xDE': "'", '0x25': 'Left arrow', '0x26': 'Up arrow',
             '0x27': 'Right arrow', '0x28': 'Down arrow', '0xBC': ',', '0xBE': '.',
             '0xBF': '/', '0x10': 'Shift'}
KEY_CHOICES = {**{x: x for x in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'},
               **{label: key for key, label in KEY_NAMES.items()}}
BINDINGS = [
    ('left_thumb_up', 'Move forward'), ('left_thumb_down', 'Move backward'),
    ('left_thumb_left', 'Move left'), ('left_thumb_right', 'Move right'),
    ('right_thumb_up', 'Look up'), ('right_thumb_down', 'Look down'),
    ('right_thumb_left', 'Look left'), ('right_thumb_right', 'Look right'),
    ('left_thumb', 'Sprint / left stick'), ('right_thumb', 'Melee / right stick'),
    ('left_trigger', 'Aim'), ('right_trigger', 'Fire'),
    ('a', 'Jump / confirm (A)'), ('b', 'Crouch / back (B)'),
    ('x', 'Reload / interact (X)'), ('y', 'Switch weapon (Y)'),
    ('back', 'Ghost / activity map'), ('start', 'Character menu'),
    ('left_shoulder', 'Grenade / previous tab'), ('right_shoulder', 'Ability / next tab'),
    ('dpad_up', 'D-pad up'), ('dpad_down', 'D-pad down'),
    ('dpad_left', 'D-pad left'), ('dpad_right', 'D-pad right'),
]

def read_config(path):
    original = path.read_text(encoding='utf-8-sig')
    # This build writes an unquoted header. Repair in memory, then atomically on save.
    text = re.sub(r'(?m)^\[D1 Alpha\](?=\r?$)', '["D1 Alpha"]', original)
    return original, text, tomllib.loads(text)

def binding_label(value):
    labels = []
    for token in value.split():
        prefix = 'Shift + ' if token.startswith('^') else ''
        labels.append(prefix + KEY_NAMES.get(token.lstrip('_^'), token.lstrip('_^')))
    return ' / '.join(labels)

def save_config(path, original, text, changes):
    if path.read_text(encoding='utf-8-sig') != original:
        raise ValueError('The configuration changed while Settings was open. Close Settings and reopen it before saving.')
    for (section, key), value in changes.items():
        if section == 'HID.WinKey':
            if key not in {'keybind_' + name for name, _ in BINDINGS} or not re.fullmatch(r'[_^]?(?:[A-Z0-9]|0x[0-9A-Fa-f]{2})(?: [_^]?(?:[A-Z0-9]|0x[0-9A-Fa-f]{2}))*', value):
                raise ValueError('Unsupported keyboard binding')
        elif (section, key) in {('APU', 'mute'), ('Display', 'fullscreen'), ('GPU', 'vsync')}:
            if type(value) is not bool:
                raise ValueError('Expected an on/off setting')
        elif section == 'GPU' and key in ('draw_resolution_scale_x', 'draw_resolution_scale_y'):
            if type(value) is not int or value not in (1, 2, 3):
                raise ValueError('Resolution scale must be 1, 2 or 3')
        else:
            raise ValueError('Unsupported setting')
        # Replace only the selected keys, preserving unrelated settings.
        header = re.search(r'(?m)^\[' + re.escape(section) + r'\][^\n]*\n', text)
        if not header:
            raise ValueError(f'Missing configuration section: {section}')
        end = re.search(r'(?m)^\[', text[header.end():])
        stop = header.end() + end.start() if end else len(text)
        body, count = re.subn(r'(?m)^(' + re.escape(key) + r'\s*=\s*)(?:"[^"\n]*"|[^\s#]+)',
                              lambda m: m[1] + json.dumps(value), text[header.end():stop])
        if count != 1:
            raise ValueError(f'Missing or duplicate setting: {key}')
        text = text[:header.end()] + body + text[stop:]
    tomllib.loads(text)
    backup = path.with_name(path.name + '.' + hashlib.sha256(original.encode()).hexdigest()[:16] + '.settings.bak')
    if not backup.exists():
        backup.write_text(original, encoding='utf-8')
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    os.replace(temporary, path)

class Settings(tk.Toplevel):
    def __init__(self, parent, path, can_edit):
        super().__init__(parent)
        self.title('D1 Alpha — Settings')
        self.transient(parent)
        self.minsize(740, 620)
        self.path, self.can_edit = Path(path), can_edit
        try:
            self.original, self.text, data = read_config(self.path)
        except (OSError, ValueError) as error:
            ttk.Label(self, text=str(error), wraplength=650).pack(padx=24, pady=24)
            return
        panel = ttk.Frame(self, padding=20)
        panel.pack(fill='both', expand=True)
        ttk.Label(panel, text='Settings', font=('Segoe UI', 20)).pack(anchor='w')
        ttk.Label(panel, text='Changes take effect next time you start the game. Your saves are preserved.').pack(anchor='w', pady=(4, 16))
        tabs = ttk.Notebook(panel)
        tabs.pack(fill='both', expand=True)
        display = ttk.Frame(tabs, padding=18)
        tabs.add(display, text='Display & audio')
        self.values = {}
        for section, key, label in [('Display', 'fullscreen', 'Start in fullscreen'), ('GPU', 'vsync', 'VSync'), ('APU', 'mute', 'Mute audio')]:
            var = tk.BooleanVar(value=data[section][key])
            ttk.Checkbutton(display, text=label, variable=var).pack(anchor='w', pady=10)
            self.values[(section, key)] = var
        ttk.Label(display, text='Render resolution scale').pack(anchor='w', pady=(18, 5))
        self.scale = ttk.Combobox(display, state='readonly', values=['1 — fastest', '2 — sharper', '3 — demanding'])
        self.scale.set(str(data['GPU']['draw_resolution_scale_x']))
        self.scale.pack(anchor='w')
        ttk.Label(display, text='1× is the best starting point for a slower PC. Higher scales need more GPU power.\nXbox-compatible controllers work without keyboard setup.', wraplength=620).pack(anchor='w', pady=16)
        self.bindings = {}
        for title, rows in [('Movement & combat', BINDINGS[:12]), ('Buttons & menus', BINDINGS[12:])]:
            frame = ttk.Frame(tabs, padding=16)
            tabs.add(frame, text=title)
            frame.columnconfigure(1, weight=1)
            for index, (name, label) in enumerate(rows):
                current = data['HID']['WinKey']['keybind_' + name]
                options = dict(KEY_CHOICES)
                modifier = '^' if name.startswith('dpad_') else '_' if name.startswith('left_thumb_') else ''
                options = {(('Shift + ' if modifier == '^' else '') + label): modifier + token for label, token in options.items()}
                options[binding_label(current)] = current
                ttk.Label(frame, text=label).grid(row=index, column=0, sticky='w', padx=(0, 20), pady=4)
                box = ttk.Combobox(frame, values=list(options), state='readonly', width=28)
                box.set(binding_label(current))
                box.grid(row=index, column=1, sticky='ew', pady=4)
                self.bindings[name] = (box, options, current)
        session = ttk.Frame(tabs, padding=18)
        tabs.add(session, text='Session')
        ttk.Label(session, text='Session limit (minutes)').pack(anchor='w', pady=(6, 8))
        self.minutes = ttk.Combobox(session, state='readonly', width=12, values=['30', '60', '120'])
        self.minutes.set(parent.minutes.get())
        self.minutes.pack(anchor='w')
        ttk.Label(session, text='The game and local server close when the limit is reached.', wraplength=600).pack(anchor='w', pady=12)
        self.allowance = tk.BooleanVar(value=parent.allowance.get())
        ttk.Checkbutton(session, text='Test currency for vendors', variable=self.allowance).pack(anchor='w', pady=12)
        ttk.Label(session, text='Adds a sandbox allowance to the selected save when you play.', wraplength=600).pack(anchor='w')
        self.status = ttk.Label(panel, text='A backup of the configuration is kept when you save.', wraplength=680)
        self.status.pack(anchor='w', pady=12)
        actions = ttk.Frame(panel)
        actions.pack(fill='x')
        ttk.Button(actions, text='Cancel', command=self.destroy).pack(side='right')
        ttk.Button(actions, text='Save settings', command=self.save).pack(side='right', padx=8)

    def save(self):
        try:
            if not self.can_edit():
                raise ValueError('Stop the current game session before saving settings.')
            changes = {key: value.get() for key, value in self.values.items()}
            scale = int(self.scale.get().split()[0])
            # Preserve a custom asymmetric scale unless explicitly changed.
            if self.scale.get() != str(tomllib.loads(self.text)['GPU']['draw_resolution_scale_x']):
                changes.update({('GPU', 'draw_resolution_scale_' + axis): scale for axis in ('x', 'y')})
            for name, (box, options, original) in self.bindings.items():
                value = options[box.get()]
                if value != original:
                    changes[('HID.WinKey', 'keybind_' + name)] = value
            save_config(self.path, self.original, self.text, changes)
            self.master.minutes.set(self.minutes.get())
            self.master.allowance.set(self.allowance.get())
            self.destroy()
        except (OSError, ValueError, KeyError) as error:
            self.status.configure(text=str(error))
