import native from './reward-catalog-native.json';
export const NATIVE_REWARD_CATALOG=native.map(item=>({...item,
 stats:item.stats.map(([index,value])=>[index!,value!] as const)}));
/** Native complete tuples, not a claim that every model/perk has runtime coverage.
 * Armor eligibility uses the recovered requirement families; unknown families and
 * incomplete/exotic placeholders are deliberately excluded by the extractor. */
export function rewardCatalogForClass(characterClass:number){
 if(![1,2,3].includes(characterClass))throw Error('Unknown reward character class');
 return NATIVE_REWARD_CATALOG.filter(item=>item.characterClass===0||item.characterClass===characterClass);
}
