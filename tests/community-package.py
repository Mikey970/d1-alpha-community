"""Small regression checks for interrupted imports and immutable archive creation."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools/d1a' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

setup = load('community_setup', 'community-setup.py')
builder = load('community_builder', 'build-community-package.py')
settings = load('community_settings', 'community-settings.py')
sha = lambda data: hashlib.sha256(data).hexdigest()

class PackageChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='d1a-package-audit-')
        self.root = Path(self.directory.name)
        setup.ROOT = self.root
        setup.CANDIDATE = self.root / 'candidate'
        setup.CANDIDATE.mkdir()
        self.source = self.root / 'original'
        self.source.mkdir()
        (self.source / 'default.xex').write_bytes(b'original-executable')
        (self.source / 'package.pkg').write_bytes(b'original-package')
        with gzip.open(self.root / 'update.gz', 'wb') as stream:
            stream.write(b'D1APATCH' + struct.pack('>QI', 0, 7) + b'updated')
        files = [
            {'path': 'default.xex', 'sourceSha256': sha(b'original-executable'), 'targetSha256': sha(b'original-executable'), 'targetBytes': 19},
            {'path': 'package.pkg', 'sourceSha256': sha(b'original-package'), 'targetSha256': sha(b'updatedl-package'), 'targetBytes': 16, 'patch': 'update.gz'},
        ]
        (self.root / 'game-import.json').write_text(json.dumps({'files': files}))
        entries = [{'path': name, 'bytes': (self.root / name).stat().st_size, 'sha256': setup.digest(self.root / name)} for name in ('game-import.json', 'update.gz')]
        (self.root / 'package-manifest.json').write_text(json.dumps({'files': entries}))
    def tearDown(self):
        self.directory.cleanup()
    def test_cancel_then_resume_without_copying_verified_files(self):
        cancelled = threading.Event()
        def progress(message):
            if message.startswith('Imported 2/2'):
                cancelled.set()
        with self.assertRaises(setup.InstallCancelled):
            setup.import_game(self.source, progress, cancelled)
        self.assertFalse((setup.CANDIDATE / 'game').exists())
        self.assertTrue((setup.CANDIDATE / 'game.importing/default.xex').is_file())
        with patch.object(setup.shutil, 'copyfile', side_effect=AssertionError('Verified file copied again')):
            setup.import_game(self.source, lambda _: None)
        self.assertEqual((self.source / 'package.pkg').read_bytes(), b'original-package')
        self.assertEqual((setup.CANDIDATE / 'game/package.pkg').read_bytes(), b'updatedl-package')
        self.assertTrue((self.root / 'installation.json').is_file())
    def test_concurrent_installer_is_rejected(self):
        with setup.install_lock(), self.assertRaisesRegex(ValueError, 'Another setup'):
            setup.import_game(self.source, lambda _: None)
        self.assertFalse((setup.CANDIDATE / 'game').exists())
    def test_archive_rejects_changed_build_without_rehashing_manifest(self):
        original = (self.root / 'package-manifest.json').read_bytes()
        (self.root / 'update.gz').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Build changed'):
            builder.archive(self.root)
        self.assertEqual((self.root / 'package-manifest.json').read_bytes(), original)
        self.assertFalse(self.root.with_suffix('.zip').exists())
    def test_archive_rejects_paths_outside_package(self):
        (self.root / 'package-manifest.json').write_text(json.dumps({'files': [{'path': '../outside.txt'}]}))
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            builder.archive(self.root)

    def test_setup_rejects_damaged_package_file(self):
        (self.root / 'update.gz').write_bytes(b'damaged fixture')
        with self.assertRaisesRegex(ValueError, 'Package is missing or damaged: update.gz'):
            setup.verify_package(lambda _: None)

    def test_settings_preserve_profiles_and_reject_concurrent_changes(self):
        path = self.root / 'config.toml'
        original = '[Display]\nfullscreen = false # comment\n[Profiles]\nxuid = "earned-profile"\n'
        path.write_text(original)
        settings.save_config(path, original, original, {('Display', 'fullscreen'): True})
        self.assertEqual(path.read_text(), original.replace('false', 'true'))
        self.assertEqual(next(self.root.glob('*.settings.bak')).read_text(), original)
        with self.assertRaisesRegex(ValueError, 'changed while Settings'):
            settings.save_config(path, original, original, {('Display', 'fullscreen'): False})

    def test_base_ranges_reject_escape_and_truncation(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            setup.copy_base_file(self.source, [['../private.txt', 0, 1]], self.root / 'target', None)
        with self.assertRaisesRegex(ValueError, 'Invalid base import range'):
            setup.copy_base_file(self.source, [['package.pkg', 0, 100]], self.root / 'target', None)
        setup.copy_base_file(self.source, [['package.pkg', 0, 8], ['package.pkg', 9, 7]], self.root / 'target', None)
        self.assertEqual((self.root / 'target').read_bytes(), b'originalpackage')

if __name__ == '__main__':
    unittest.main()
