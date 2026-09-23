# Source layout

Use the ZIP under Releases to install and run. GitHub's automatic source ZIP
does not include the bundled runtime binaries.

- `tools/d1a`: installer, launcher, settings, server/process management and package builder.
- `source/backend`: backend source and npm lockfile.
- `source/api`: local API server.
- `source/emulator`: emulator source overlays, original patch and build instructions.
- `source/7zip`: matching extractor source.
- `patches`: game deltas and input manifests used by setup.

The package builder targets the restoration workspace layout documented by its
`ROOT`, `REL` and `SOURCE` paths. It needs the original base files under `game/`,
the accepted candidate runtime under `REL`, the audited clean text package,
the accepted backend source with locked dependencies, the audited emulator source,
bundled Python and PowerShell, and the x64 Visual C++ runtime. Pass their paths with
`--text-clean-source`, `--backend-source`, `--python`, `--powershell` and `--vc-runtime`.
The builder checks that all 235 compiled backend modules match the accepted runtime
and that the staged text package matches its audit. It copies that audit to
`source/text-clean.json` and verifies every base file before creating deltas. The
clean text package was staged from the accepted
runtime by removing 303 unsupported local fallback descriptions while preserving
native names and other package content.

Run the focused installer checks with Python 3.13:

```text
python tests/community-package.py
```

Gameplay is still under development. Packaging checks do not prove full missions,
dialogue or multiplayer completion.
