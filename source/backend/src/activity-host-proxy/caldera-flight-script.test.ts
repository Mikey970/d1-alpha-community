import { describe, expect, it } from 'vitest';
import { encodeCalderaFlightScript } from './caldera-flight-script';
import fixtures from './caldera-flight-wire.fixture.json';

describe('Caldera native flight commands', () => {
  it('matches independent native-field packing for all twelve authored paths', () => {
    expect(fixtures).toHaveLength(12);
    for (const fixture of fixtures) {
      const encoded = encodeCalderaFlightScript(fixture.path, fixture.cookie);
      expect(encoded.bitCount, `path ${fixture.path}`).toBe(fixture.bitCount);
      expect(encoded.bytes.toString('hex'), `path ${fixture.path}`).toBe(fixture.hex);
    }
  });
  it('rejects unrelated paths and invalid command cookies', () => {
    expect(() => encodeCalderaFlightScript(175, 1)).toThrow();
    expect(() => encodeCalderaFlightScript(275, 0)).toThrow();
    expect(() => encodeCalderaFlightScript(275, 0x80000000)).toThrow();
  });
});
