# Package checks

Candidate 29 adds the smaller launcher: character and weapons, Play, Stop and
Settings. Session options moved into Settings; diagnostics moved into Help.
The UI was inspected, a 60-minute session setting was saved and used by Play,
and Stop closed all owned game/server processes. The six focused checks and
bundled-tool preflight pass. Unused shortcut code and redundant comments were removed.

The installer, base-import map, emulator, server and decompressed game patches
are unchanged from the successful installation below. Candidate 29's 10,670 ZIP
entries pass CRC and its 10,669 manifest files pass integrity verification.

Candidate 29 ZIP SHA256:
`feb08d92c755df65b5724415ef81f20716476ffd2a0b18ac6d06f1fe25e88b48`

Candidate 28, 2026-09-22 (local date):

- Package integrity and ZIP CRC passed: 10,669 manifest files, 10,670 ZIP entries.
- Six focused installer/settings tests passed.
- Candidate 27 installed all 148 game files from the unchanged original RAR in
  a new folder outside the workspace, with development tools removed from PATH.
- Bundled Python/Tk, Node, PowerShell, Visual C++ runtime and Direct3D 12 checks passed.
- The local server started and shut down cleanly.
- The installed launcher displayed the inventory, opened settings, saved a configuration
  backup, launched Xenia to its first-run local-profile screen, and stopped its owned session.
- The running emulator loaded all four required Visual C++ DLLs from the package folder.
- Candidate 28 differs only in settings-tab contrast. Its installer, base-import map,
  runtime binaries and decompressed game patches match the fresh-install test.
- The resulting game files match Candidate 25; all 235 compiled backend modules
  match the previously tested main candidate. The experimental cooperative slot change
  remains outside this release.

This was a clean installation on the development PC, not a second-machine test.
Full missions, all dialogue, multiplayer and complete match flow are not verified.

Candidate 28 ZIP SHA256:
`2db2f41d4ceaaaed0da93dc35f4edcb4803513ace6a1b30ed5da483396c72a7f`
