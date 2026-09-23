# Candidate 32 checks

The ZIP has 10,906 entries and 10,905 manifest files. CRC, package hashes and the
148 imported game files passed. The imported game differs from the accepted runtime
in one text package: 303 unsupported local fallback descriptions were blanked in
14 banks. Its names, IDs and other decoded text were preserved and each bank passed
a native package round trip. All 235 compiled backend modules match the accepted
runtime. ZIP SHA256:

`6f5e2753273a6c9e9218b90f22991f5e73d14d7c9880e72c301c47650edf7039`

Candidate 32 installed from the untouched original RAR into a new folder outside
the workspace on the development PC. Bundled runtime and machine checks, backend
smoke, `--check-installed`, Setup reopening and Help → Check setup passed. Changed
VSync and a D-pad binding remained after rechecking. A local profile account and
savegame kept their hashes after the post-run check. Seven focused package tests
passed, including corruption rejection in a disposable fixture.

The first bounded native run opened Xenia and connected to the local server. The
60-minute setting reached the launch receipt. It stopped at the Hunter roster
because the white ring, which is the native selection cursor, had not been moved
onto a card. A later run selected Hunter with the shipped keyboard mapping,
reached Orbit, selected Venus Patrol in the native Director, and rendered a
first-person scene. Movement changed the view, firing reduced visible ammo from
24 to 15, and reload restored it to 24. The launcher stopped its exact owned
game, API and backend processes. A post-run `--check-installed` passed.

The first gameplay run used a new local Xenia profile loaded at boot. Because the
PC initially had 18.4 GiB free, that diagnostic run used an 18 GiB reserve in
the extracted QA script. After reversible compression of a disposable earlier
QA copy recovered space, a second run passed the packaged 20 GiB reserve and
repeated Hunter login, Orbit, Venus Patrol, movement, firing and reload. The
local Xenia config was restored after stopping. The ZIP, game, emulator and
backend bytes were unchanged. Full missions, dialogue, PvP matches, multiplayer,
every destination and a second PC installation remain unverified.
