import { describe, expect, it } from 'vitest';
import { isVenusHeadlandsEntryIncident, isVenusSouthernEntryIncident } from './venus-entry-incident';

// r373 21:59:04 native PlayerTrigger137, independently observed fired at+F4.
const captured = Buffer.from('1dd6d986f1600001a7e2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8089811c9dc50', 'hex');
const southern = Buffer.from('1dd6d986f1600001a7a2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8093811c9dc50', 'hex');
describe('Headlands native entry incident', () => {
  it('keeps the r394 Southern147 event separate from Headlands137', () => {
    expect(isVenusSouthernEntryIncident(southern)).toBe(true);
    expect(isVenusHeadlandsEntryIncident(southern)).toBe(false);
    expect(isVenusSouthernEntryIncident(captured)).toBe(false);
    expect(isVenusSouthernEntryIncident(southern.subarray(1))).toBe(false);
  });
  it('recognizes the captured authored trigger event', () => {
    expect(isVenusHeadlandsEntryIncident(captured)).toBe(true);
  });
  it('rejects incomplete, batched and differently identified events', () => {
    expect(isVenusHeadlandsEntryIncident(captured.subarray(1))).toBe(false);
    for (const [byte, mask] of [[0,0x20], [1,1], [40,1], [43,0x40], [45,0x10], [49,1]]) {
      const wrong = Buffer.from(captured); wrong[byte] ^= mask;
      expect(isVenusHeadlandsEntryIncident(wrong)).toBe(false);
    }
  });
});
