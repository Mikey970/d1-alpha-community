'use strict';
const fs = require('node:fs');
const path = require('node:path');
const [root, character, action = 'catalog', selection = '{}', characterId = '0000000200000002'] = process.argv.slice(2);
if (!root || !/^(hunter-(arc|ghost)|warlock-(nova|radiance)|titan-arc|e3-(18|19|20|21|22|23|24|25))$/.test(character)) throw new Error('Invalid character');
if (!['catalog', 'apply'].includes(action)) throw new Error('Invalid loadout operation');
const candidate = path.resolve(root);
const legacyProfile = path.join(candidate, 'profile', 'director', character, 'equipment.json');
for (const key of Object.keys(process.env)) if (key.startsWith('D1A_')) delete process.env[key];
Object.assign(process.env, {D1A_ISOLATED_RUNTIME:'1',D1A_DIRECTOR_CHARACTER: character, D1A_INVENTORY_PROBE_ITEM:'1', D1A_TALENT_PROBE:'1',
  D1A_CHARACTER_LEVEL15:'1',D1A_EQUIPMENT_PROFILE:legacyProfile,D1A_TALENT_STATE_PATH:path.join(path.dirname(legacyProfile),'talent.json'),
  D1A_VENDOR_ECONOMY:'1',D1A_VENDOR_ECONOMY_PROFILE:`${legacyProfile}.vendor.json`});
if (character.startsWith('e3-')) process.env.D1A_E3_ABILITY_PRESET=character.slice(3);
if (character.startsWith('hunter-')) process.env.D1A_HUNTER_ARC='1';
const {CharacterStore} = require(path.join(candidate,'server-dist/bungie-access-protocol/character-store.js'));
const {withCharacter} = require(path.join(candidate,'server-dist/bungie-access-protocol/character-context.js'));
const environment = Object.fromEntries(['D1A_EQUIPMENT_PROFILE','D1A_TALENT_STATE_PATH',
  'D1A_VENDOR_ECONOMY_PROFILE','D1A_DIRECTOR_CHARACTER','D1A_E3_ABILITY_PRESET','D1A_HUNTER_ARC']
  .map(name => [name, process.env[name]]));
const store = new CharacterStore({environment}, path.dirname(legacyProfile));
if (!/^00000002[0-9a-f]{8}$/.test(characterId) || !store.has(BigInt(`0x${characterId}`))) throw new Error('Unknown saved character');
const roster = store.ids().map(id => {
  const creation = store.creation(id);
  return {soid: id.toString(16).padStart(16,'0'), label: creation
    ? `${['Titan','Hunter','Warlock'][creation.identity.classIndex]} · ${['Human','Awoken','Exo'][creation.identity.race]} · ${id.toString(16).slice(-4)}`
    : 'Original character'};
});
withCharacter(store.context(BigInt(`0x${characterId}`)), () => {
const profile = store.context(BigInt(`0x${characterId}`)).environment.D1A_EQUIPMENT_PROFILE;
const loadout = require(path.join(candidate,'server-dist/bungie-access-protocol/rsat/mocks/loadout.js'));
const labels = {1:'Auto Rifle',5:'Pulse Rifle',9:'Scout Rifle',10:'Shotgun',11:'Fusion Rifle',12:'Hand Cannon',13:'Sniper Rifle',14:'Machine Gun',15:'Rocket Launcher',26:'Prototype SMG'};
const items = [...loadout.characterItemDefinitions().filter(item=>[7,8,9].includes(item.slot)).map(item=>({...item,soid:loadout.itemSoidForSlot(item.slot)})),
  ...loadout.inventoryWeapons().filter(item=>[7,8,9].includes(item.slot)&&item.equipReady!==false)]
  .map(item=>({slot:item.slot,soid:item.soid.toString(16).padStart(16,'0'),definition:item.defIndex,
    label:`${labels[item.sandboxPattern] || 'Weapon'} · ${item.defIndex} · ${item.soid.toString(16).slice(-4)}`}));
if (action==='apply') {
  const choices=JSON.parse(selection);
  if (!choices || typeof choices!=='object' || Array.isArray(choices)) throw new Error('Expected slot selections');
  const soids=Object.entries(choices).map(([slot,soid])=>{
    if (!['7','8','9'].includes(slot)||!items.some(item=>item.slot===Number(slot)&&item.soid===soid)) throw new Error(`Invalid owned weapon for slot ${slot}`);
    return BigInt(`0x${soid}`);
  });
  if (soids.length) {
    if (fs.existsSync(profile)) fs.copyFileSync(profile, `${profile}.before-loadout-${Date.now()}.json`, fs.constants.COPYFILE_EXCL);
    if (!loadout.equipInventoryLoadout(soids)) throw new Error('Loadout rejected; profile retained');
  }
}
process.stdout.write(JSON.stringify({character,characterId,roster,items,selected:Object.fromEntries([7,8,9].map(slot=>[slot,loadout.equippedItemSoid(slot).toString(16).padStart(16,'0')]))}));
});
