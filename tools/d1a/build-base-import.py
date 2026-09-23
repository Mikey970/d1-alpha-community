"""Build a byte-range import map for the unchanged 36735 download.

SVOD addressing follows Xenia's BSD-licensed svod_container_device.cc.
The installer consumes a hash-pinned map, not a general disc parser.
"""
import hashlib
import json
import mmap
from pathlib import Path
import struct

def build_base_map(base, wanted, destination, originals=None):
    data0, = base.rglob('Data0000')
    header = Path(str(data0.parent)[:-5]).read_bytes()
    descriptor = header[0x379:0x39d]
    start = int.from_bytes(descriptor[28:31], 'little') * 2
    enhanced = bool(descriptor[24] & 0x40)
    fragments = sorted(data0.parent.glob('Data[0-9][0-9][0-9][0-9]'))
    handles = [p.open('rb') for p in fragments]
    maps = [mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) for f in handles]
    def location(block):
        true = block - start + (2 if enhanced else 0)
        if true < 0:
            raise ValueError('Negative SVOD block')
        index, local = divmod(true, 0x14388)
        tables = local // 0x198 + 1
        offset = local * 0x800 + (tables + tables // 0xa1c4 + 1) * 0x1000
        return index, offset
    def read(block, offset, size):
        result = bytearray()
        while size:
            i, pos = location(block + offset // 0x800)
            length = min(size, 0x800 - offset % 0x800)
            part = maps[i][pos + offset % 0x800:pos + offset % 0x800 + length]
            if len(part) != length:
                raise ValueError('Truncated SVOD data')
            result.extend(part)
            offset += length
            size -= length
        return result
    entries, seen = {}, set()
    def visit(block, ordinal, parent):
        if (block, ordinal) in seen or len(seen) > 10000:
            raise ValueError('Invalid directory tree')
        seen.add((block, ordinal))
        left, right, sector, size, flags, length = struct.unpack('<HHIIBB', read(block, ordinal * 4, 14))
        name = read(block, ordinal * 4 + 14, length).decode('cp1252')
        if not name or name in ('.', '..') or '/' in name or '\\' in name:
            raise ValueError('Invalid directory name')
        path = parent / name
        if left:
            visit(block, left, parent)
        if flags & 16:
            if size:
                visit(sector, 0, path)
        else:
            entries[path.as_posix()] = (sector, size)
        if right:
            visit(block, right, parent)
    try:
        if maps[0][0x2000:0x2014] != b'MICROSOFT*XBOX*MEDIA':
            raise ValueError('Unexpected base download layout')
        visit(struct.unpack_from('<I', maps[0], 0x2014)[0], 0, Path())
        files = {}
        for row in wanted:
            path = row['path']
            if path == 'default.xex':
                source = base / 'tiger_release_internal_unlock.xex'
                chunks = [[source.relative_to(base).as_posix(), 0, source.stat().st_size]]
                checksum = hashlib.sha256(source.read_bytes()).hexdigest()
            else:
                block, length = entries[path]
                chunks, digest = [], hashlib.sha256()
                for offset in range(0, length, 0x800):
                    index, address = location(block + offset // 0x800)
                    size = min(0x800, length - offset)
                    source = fragments[index].relative_to(base).as_posix()
                    digest.update(maps[index][address:address + size])
                    if chunks and chunks[-1][0] == source and chunks[-1][1] + chunks[-1][2] == address:
                        chunks[-1][2] += size
                    else:
                        chunks.append([source, address, size])
                checksum = digest.hexdigest()
            if checksum != row['sourceSha256']:
                if originals is None:
                    raise ValueError(f'Untouched download differs from expected source: {path}')
                target = originals / path
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('wb') as output:
                    for name, offset, size in chunks:
                        with (base / name).open('rb') as stream:
                            stream.seek(offset)
                            output.write(stream.read(size))
            files[path] = chunks
        sources = []
        for name in sorted({c[0] for chunks in files.values() for c in chunks}):
            with (base / name).open('rb') as stream:
                checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
            sources.append({'path': name, 'sha256': checksum, 'bytes': (base / name).stat().st_size})
        destination.write_text(json.dumps({'schema': 1, 'sources': sources, 'files': files}, indent=2))
    finally:
        for mapping in maps:
            mapping.close()
        for handle in handles:
            handle.close()
