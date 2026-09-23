import { describe, expect, it } from 'vitest';
import { isVenusDeviceInteractionIncident } from './venus-device-incident';

const capture = Buffer.from('1e882d22f1300001a7aa000000020000000200000002000000020f46800000000000061d9c8031359d411c00', 'hex');
describe('Southern device interaction incident', () => {
  it('accepts the real Hold X capture and permits changing native context', () => {
    expect(isVenusDeviceInteractionIncident(capture)).toBe(true);
    const later = Buffer.from(capture); later[10] ^= 1;
    expect(isVenusDeviceInteractionIncident(later)).toBe(true);
  });
  it('rejects the right header with the wrong encounter, framing or tail', () => {
    for (const [byte, mask] of [[0,0x20], [1,1], [38,1], [42,4], [43,1]]) {
      const wrong = Buffer.from(capture); wrong[byte] ^= mask;
      expect(isVenusDeviceInteractionIncident(wrong)).toBe(false);
    }
    expect(isVenusDeviceInteractionIncident(capture.subarray(1))).toBe(false);
    expect(isVenusDeviceInteractionIncident(Buffer.concat([capture,capture]))).toBe(false);
  });
});
