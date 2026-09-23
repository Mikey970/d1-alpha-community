Base Xenia commit: 356db303f00503dcc636f69e1caec92dac74ac43
Apply origin-dirty.patch to that checkout with its submodules initialized.
Then overlay CMakeLists.txt, version.h.in and src/ from this folder.
Configure with CMake/Ninja Multi-Config in an x64 MSVC developer environment.
Build target xenia-app, configuration Release; tests/misc OFF.
Tested toolchain: MSVC14.50.35717. See audit.json for the exact binary and limited gameplay checks.
Byte-for-byte rebuild identity and full gameplay acceptance are not claimed.
