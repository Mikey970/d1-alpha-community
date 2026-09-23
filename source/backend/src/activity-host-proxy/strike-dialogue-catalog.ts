/** Authored cue identities, verified against native client hashes and audio chains.
 * Evidence: runtime/analysis-dialogue-r454-20260907/audit.py and README.md.
 * Durations describe packaged timelines; elapsed time is not a native completion receipt.
 */
export const STRIKE_DIALOGUE_BUNDLE = '0A302429';

export const STRIKE_DIALOGUE_CUES = {
  engineeringIntro: {path:'engineering_phase.md_s1_m1_d010', sequence:23, nameHash:0x422111fd, sequenceTag:0x80b08fde, wavTag:0x80b0c062, durationSeconds:4.478400230407715},
  engineeringArrival: {path:'engineering_phase.md_s1_m1_d020', sequence:21, nameHash:0x3f210d24, sequenceTag:0x80b08fdc, wavTag:0x80b0c05c, durationSeconds:2.0651299953460693},
  engineeringComplete: {path:'engineering_phase.md_s1_m1_d030', sequence:22, nameHash:0x40210e97, sequenceTag:0x80b08fdd, wavTag:0x80b0c05f, durationSeconds:1.875020146369934},
  digSiteFirst: {path:'dig_site_phase.md_s1_m2_d010_trigger._dialog_sequence', sequence:33, nameHash:0x1628e0e3, sequenceTag:0x80b08fdf, wavTag:0x80b0c065, durationSeconds:6.605329990386963},
  digSiteSecond: {path:'dig_site_phase.md_s1_m2_d020_trigger._dialog_sequence', sequence:34, nameHash:0x1aadaa18, sequenceTag:0x80b08fe0, wavTag:0x80b0c068, durationSeconds:2.372270107269287},
  ruinsIntro: {path:'ruins_phase.md_s1_m3_d010_trigger._dialog_sequence', sequence:69, nameHash:0x2b2ccaf5, sequenceTag:0x80b08fdb, wavTag:0x80b0c059, durationSeconds:2.6804399490356445},
  ruinsSecond: {path:'ruins_phase.md_s1_m3_d020', sequence:63, nameHash:0xb43785b6, sequenceTag:0x80b08fd8, wavTag:0x80b0c050, durationSeconds:3.4964001178741455},
  ruinsThird: {path:'ruins_phase.md_s1_m3_d030', sequence:64, nameHash:0xb5378729, sequenceTag:0x80b08fd9, wavTag:0x80b0c053, durationSeconds:1.815790057182312},
  ruinsComplete: {path:'ruins_phase.md_s1_m3_d040', sequence:65, nameHash:0xb637889c, sequenceTag:0x80b08fda, wavTag:0x80b0c056, durationSeconds:6.122710227966309},
} as const;

export type StrikeDialogueCue = keyof typeof STRIKE_DIALOGUE_CUES;

/** Existing Engineering FSM uses logical labels 21/22/23, not native sensor IDs. */
export function engineeringDialogueCue(logicalSequence:number): StrikeDialogueCue | undefined {
  switch(logicalSequence) {
    case 21: return 'engineeringIntro';
    case 22: return 'engineeringArrival';
    case 23: return 'engineeringComplete';
    default: return undefined;
  }
}
