import {NATIVE_REWARD_CATALOG} from './reward-catalog';

/** Class3 Superior armor from the packaged catalog. Local starter identities
 * are separate from mission rewards and the existing Hunter/Titan items. */
export const WARLOCK_STARTER_ARMOR = [330,317,323,336,327].map((definition, index) => {
  const row = NATIVE_REWARD_CATALOG.find(item => item.defIndex === definition);
  if (!row || row.characterClass !== 3 || row.tier !== 3 || row.slot !== index + 2) {
    throw Error('Warlock starter armor does not match its native catalog');
  }
  return {...row, soid: 0x300000425n + BigInt(index)};
});
