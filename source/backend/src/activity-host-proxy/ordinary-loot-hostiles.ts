/** Selected combat-member blueprints, each rechecked at byte+0x10 in the
 * existing extracted808003D1 assets. Census locations relative to workspace:
 * runtime/analysis-super-abilities-20260906/servitor-native/engineering-authored-class-census.json
 * runtime/analysis-weapon-inventory-20260906/ruins-native/ruins-authored-class-census.json
 * Dreg additionally matches the real r421 EAD kill fixture. Other classes use
 * authored combat census evidence; no runtime kill coverage is claimed for all.
 */
export const ORDINARY_LOOT_HOSTILES=[
  {hash:0x54cfab9c,name:'fallen_dreg',blueprint:0x80b09049},
  {hash:0xf0b819f4,name:'fallen_vandal',blueprint:0x80b0904a},
  {hash:0xbe5ed7cd,name:'fallen_shank',blueprint:0x80b09031},
  {hash:0xfe72dfc2,name:'engineering_combatant',blueprint:0x80b09053},
  {hash:0x6adf06ae,name:'fallen_servitor',blueprint:0x80b0908e},
  {hash:0x424e0f82,name:'vex_minotaur',blueprint:0x80b09072},
  {hash:0x0e99eecc,name:'vex_goblin',blueprint:0x80b09073},
  {hash:0x6cf5473d,name:'vex_hobgoblin',blueprint:0x80b09085},
  {hash:0x661ad563,name:'vex_harpy',blueprint:0x80b0907d},
] as const;
// Boss blueprint284A01A8 / observed class04D9CE0E are deliberately absent.
