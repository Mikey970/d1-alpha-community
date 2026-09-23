import {configuredCharacterClass} from './configured-character-class';
import {rewardCatalogForClass} from './reward-catalog';

/** Explicit local alpha balance, not recovered Bungie probabilities. */
export const LOOT_BALANCE={ordinaryChance:0.04,
  ordinaryTierWeights:[[1,75],[2,23],[3,2]],
  bossTierWeights:[[1,10],[2,75],[3,15]]} as const;

export function ordinaryLootChance(raw=process.env.D1A_ORDINARY_LOOT_CHANCE):number {
  if(raw===undefined)return LOOT_BALANCE.ordinaryChance;
  const value=Number(raw);
  if(!raw.trim()||!Number.isFinite(value)||value<0||value>1)throw Error('Invalid ordinary loot chance');
  return value;
}

/** Separate tier and within-tier rolls avoid catalog-size rarity bias. */
export function chooseLoot(mode:'ordinary'|'boss',tierRoll:number,itemRoll:number){
  if(![tierRoll,itemRoll].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw Error('Invalid loot roll');
  const weights=mode==='ordinary'?LOOT_BALANCE.ordinaryTierWeights:LOOT_BALANCE.bossTierWeights;
  let cumulative=0,tier:number=weights[weights.length-1]![0];
  for(const [candidate,weight] of weights){cumulative+=weight;if(tierRoll*100<cumulative){tier=candidate;break;}}
  const pool=rewardCatalogForClass(configuredCharacterClass()).filter(item=>item.tier===tier);
  if(!pool.length)throw Error('Empty selected native reward tier');
  return pool[Math.floor(itemRoll*pool.length)]!;
}
