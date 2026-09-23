import { describe, expect, it } from 'vitest';
import { encodeActorChannelScript } from './actor-channel-script';

describe('native actor channel script', () => {
  it('matches the independently packed native door-open fixture', () => {
    // audit-actor-command-codec.py: kind37 decoder and descriptor chain.
    const result = encodeActorChannelScript(1, 0x80296344, [1, 1, 1, 1]);
    expect(result.bitCount).toBe(221);
    expect(result.bytes.toString('hex')).toBe(
      '2640000000800e1802963443f8000003f8000003f8000003f8000000',
    );
  });

  it('rejects values that would truncate or become nonfinite in native fields', () => {
    expect(() => encodeActorChannelScript(0x80000000, 0x80296344, [0, 0, 0, 0])).toThrow();
    expect(() => encodeActorChannelScript(1, -1, [0, 0, 0, 0])).toThrow();
    expect(() => encodeActorChannelScript(1, 0x80296344, [1e100, 0, 0, 0])).toThrow();
    expect(() => encodeActorChannelScript(1, 0x80296344, [NaN, 0, 0, 0])).toThrow();
  });
});
