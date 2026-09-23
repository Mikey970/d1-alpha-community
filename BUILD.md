# Source layout

Use the ZIP under Releases to install and run. GitHub's automatic source ZIP
does not include the bundled runtime binaries.

- `tools/d1a`: installer, launcher, settings, server/process management and package builder.
- `source/backend`: backend source and npm lockfile.
- `source/api`: local API server.
- `source/emulator`: emulator source overlays, original patch and build instructions.
- `source/7zip`: matching extractor source.
- `patches`: game deltas and input manifests used by setup.

The package builder currently targets the restoration workspace layout documented
by its `ROOT`, `REL` and `SOURCE` paths. Building a replacement package requires
the original base download under `game/`, the candidate runtime under `REL`,
the hash-audited emulator source tree, installed locked backend dependencies,
the bundled Python and PowerShell directories, and the x64 Visual C++ redist folder.
Use `--backend-source`, `--python`, `--powershell` and `--vc-runtime` to select them.
It compiles the backend and verifies every mapped base file before creating deltas.

Run the focused installer checks with Python 3.13:

```text
python tests/community-package.py
```

Gameplay is still under development. Packaging checks do not prove full missions,
dialogue or multiplayer completion.
