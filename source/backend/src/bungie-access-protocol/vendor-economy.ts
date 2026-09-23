import {characterLocal} from './character-context';
import {characterSetting} from './character-context';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface EconomyInventoryItem {
  soid: bigint;
  defIndex: number;
  bucket: number;
  slot: number;
  quantity: number;
  artArrangement: number;
  sandboxPattern: number;
  stats: readonly (readonly [number, number])[];
  equipReady: boolean;
}

interface VendorOffer {
  reward: number;
  rewardQuantity: number;
  rewardBucket: number;
  price: number;
  priceQuantity: number;
}

interface PersistedPurchase {
  soid: string;
  defIndex: number;
  bucket: number;
  quantity: number;
}

interface PersistedEconomy {
  schema: 1;
  version: number;
  nextSerial: number;
  balances: Record<string, number>;
  purchases: PersistedPurchase[];
  talentSelections?: Record<string, PersistedTalentSelection>;
}

export interface PersistedTalentSelection {
  definition: number;
  grid: number;
  purchased: number[];
  version: number;
  testXp: number;
}

function validTalentSelection(key: string, value: PersistedTalentSelection): boolean {
  const identities: Record<string, readonly [number, number]> = {
    '300000200': [442,251], '300000201': [441,250], '300000202': [437,246],
    '300000203': [434,243], '300000204': [438,247],
  };
  const identity = identities[key];
  return !!value && !!identity && value.definition === identity[0] && value.grid === identity[1] &&
    Number.isSafeInteger(value.version) && value.version >= 1 &&
    (value.testXp === 49000 || (value.grid < 250 && value.testXp === 129000)) &&
    Array.isArray(value.purchased) && value.purchased.length <= 50 &&
    value.purchased.every(node => Number.isInteger(node) && node >= 0 && node < 50) &&
    new Set(value.purchased).size === value.purchased.length;
}

export interface PurchaseResult {
  accepted: boolean;
  changed: boolean;
  reason: "accepted" | "unsupported-offer" | "insufficient-funds" | "bucket-full";
  version: number;
  rewardDefinition?: number;
}

// Exact E3 purchase rows recovered from investment vendor tags 21-25.
// Names are intentionally absent: the packaged UI banks resolve these items to strNNNN.
const OFFERS = new Map<string, VendorOffer>();
const offer = (vendor: number, index: number, value: VendorOffer) =>
  OFFERS.set(`${vendor}/${index}`, value);

offer(21, 0, { reward: 462, rewardQuantity: 1, rewardBucket: 0, price: 461, priceQuantity: 3 });
offer(21, 1, { reward: 460, rewardQuantity: 1, rewardBucket: 0, price: 461, priceQuantity: 3 });

[974, 975, 976, 977, 978, 979, 980, 981, 982].forEach((reward, index) =>
  offer(22, index, {
    reward,
    rewardQuantity: 1,
    rewardBucket: index < 4 ? 3 : index < 6 || index === 8 ? 4 : 5,
    price: 456,
    priceQuantity: 250,
  })
);

[729, 720, 726, 723, 729, 720, 726, 723, 729, 720, 726, 723, 729, 720, 726,
  729, 720, 726, 723, 734, 734, 734, 734, 734, 734].forEach((reward, index) =>
  offer(23, index, { reward, rewardQuantity: 1, rewardBucket: 1, price: 456, priceQuantity: 200 })
);
offer(23, 25, { reward: 732, rewardQuantity: 1, rewardBucket: 1, price: 470, priceQuantity: 2 });
offer(23, 26, { reward: 733, rewardQuantity: 1, rewardBucket: 1, price: 471, priceQuantity: 2 });

[715, 716, 717, 718, 719].forEach((reward, index) =>
  offer(24, index, { reward, rewardQuantity: 1, rewardBucket: 1, price: 922 + index, priceQuantity: 1 })
);
[849, 846, 843].forEach((reward, index) =>
  offer(25, index, { reward, rewardQuantity: 1, rewardBucket: 3, price: 462, priceQuantity: 5 })
);

const BUCKET_CAPACITY: Readonly<Record<number, number>> = {
  0: 10, 1: 20, 3: 10, 4: 10, 5: 10, 6: 20,
};
const BUCKET_TO_EQUIP_SLOT: Readonly<Record<number, number>> = { 3: 7, 4: 8, 5: 9 };
const CURRENCY_BUCKET: Readonly<Record<number, number>> = {
  456: 0, 460: 0, 461: 0, 462: 0, 470: 6, 471: 6,
  922: 1, 923: 1, 924: 1, 925: 1, 926: 1,
};
// Complete packaged equipment tuples already extracted into restoration/items.json.
const EQUIPMENT: Readonly<Record<number, { art: number; pattern: number; stats: readonly (readonly [number, number])[] }>> = {
  843:{art:580,pattern:1,stats:[[5,0],[6,2],[9,4],[10,4],[11,0],[8,2],[7,2]]},
  846:{art:589,pattern:5,stats:[[5,0],[6,5],[9,0],[10,2],[11,1],[8,2],[7,3]]},
  849:{art:594,pattern:8,stats:[[5,0],[6,1],[9,5],[10,4],[11,0],[8,2],[7,2]]},
  974:{art:698,pattern:1,stats:[[5,0],[6,2],[9,4],[10,4],[11,0],[8,2],[7,2]]},
  975:{art:702,pattern:5,stats:[[5,0],[6,3],[9,3],[10,3],[11,1],[8,3],[7,1]]},
  976:{art:704,pattern:9,stats:[[5,0],[6,3],[9,4],[10,2],[11,2],[8,2],[7,2]]},
  977:{art:700,pattern:12,stats:[[5,0],[6,3],[9,2],[10,3],[11,1],[8,2],[7,2]]},
  978:{art:705,pattern:10,stats:[[5,0],[6,3],[9,2],[15,2],[11,3],[8,2],[7,1]]},
  979:{art:699,pattern:11,stats:[[5,0],[6,6],[9,0],[17,3],[11,2],[8,0],[7,3]]},
  980:{art:701,pattern:14,stats:[[5,0],[6,5],[9,0],[10,1],[11,3],[8,1],[7,3]]},
  981:{art:703,pattern:15,stats:[[5,0],[6,4],[9,5],[17,2],[18,1],[8,2],[10,3]]},
  982:{art:706,pattern:13,stats:[[5,0],[6,3],[9,3],[10,2],[11,2],[8,2],[7,2]]},
};
const TEST_ALLOWANCE: Readonly<Record<number, number>> = {
  456: 250_000,
  461: 100_000,
  462: 100_000,
  470: 1_000,
  471: 1_000,
  922: 1_000,
  923: 1_000,
  924: 1_000,
  925: 1_000,
  926: 1_000,
};

function initialState(seedAllowance: boolean): PersistedEconomy {
  return {
    schema: 1,
    version: 1,
    nextSerial: 1,
    balances: Object.fromEntries(Object.entries(seedAllowance ? TEST_ALLOWANCE : {})),
    purchases: [],
  };
}

function statePathFromEnvironment(): string | undefined {
  if (characterSetting('D1A_VENDOR_ECONOMY_PROFILE')) return characterSetting('D1A_VENDOR_ECONOMY_PROFILE');
  const equipment = characterSetting('D1A_EQUIPMENT_PROFILE');
  return equipment ? `${equipment}.vendor.json` : undefined;
}

/** Local character economy. Every accepted purchase is committed before its reply. */
export class VendorEconomy {
  private state: PersistedEconomy;

  constructor(
    private readonly file = statePathFromEnvironment(),
    seedAllowance = process.env.D1A_VENDOR_TEST_ALLOWANCE === "1"
  ) {
    this.state = initialState(seedAllowance);
    if (file && existsSync(file)) {
      this.state = this.read(file);
      if (seedAllowance) {
        const missing = Object.entries(TEST_ALLOWANCE).filter(([definition]) =>
          this.state.balances[definition] === undefined
        );
        if (missing.length) {
          const next = JSON.parse(JSON.stringify(this.state)) as PersistedEconomy;
          for (const [definition, quantity] of missing) next.balances[definition] = quantity;
          next.version = next.version === 0x7fffffff ? 1 : next.version + 1;
          this.commit(next);
          this.state = next;
        }
      }
    } else if (file && seedAllowance) this.commit(this.state);
  }

  get version(): number {
    return this.state.version;
  }

  talentSelection(soid: bigint): PersistedTalentSelection | undefined {
    const value = this.state.talentSelections?.[soid.toString(16)];
    return value && {...value, purchased: [...value.purchased]};
  }

  /** One durable replacement contains both the new selection and its charge.
   * Native grids243/246/247/250/251 step+50/+54 cost item456 x100; +5C is zero.
   * Once present, this record supersedes the preserved legacy talent file. */
  commitTalentSelection(soid: bigint, selection: PersistedTalentSelection, swap: boolean): boolean {
    if (!this.file) throw new Error('Talent swap persistence path missing');
    const key = soid.toString(16);
    if (!validTalentSelection(key, selection)) throw new Error('Invalid talent selection');
    const price = swap ? 100 : 0;
    const balance = this.state.balances['456'] ?? 0;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid talent currency balance');
    if (balance < price) return false;
    const next = JSON.parse(JSON.stringify(this.state)) as PersistedEconomy;
    if (price) next.balances['456'] = balance - price;
    next.talentSelections ??= {};
    next.talentSelections[key] = {...selection, purchased: [...selection.purchased]};
    next.version = next.version === 0x7fffffff ? 1 : next.version + 1;
    this.commit(next);
    this.state = next;
    return true;
  }

  inventoryItems(): readonly EconomyInventoryItem[] {
    const balances = Object.entries(this.state.balances)
      .map(([definition, quantity]) => ({ definition: Number(definition), quantity }))
      .filter(({ quantity }) => quantity > 0)
      .map(({ definition, quantity }) => this.item(
        BigInt(0x300001000 + definition), definition, CURRENCY_BUCKET[definition] ?? 0, quantity
      ));
    return [
      ...balances,
      ...this.state.purchases.map((entry) => this.item(
        BigInt(`0x${entry.soid}`), entry.defIndex, entry.bucket, entry.quantity
      )),
    ];
  }

  purchase(vendorIndex: number, purchaseIndex: number, occupied: Readonly<Record<number, number>>): PurchaseResult {
    const selected = OFFERS.get(`${vendorIndex}/${purchaseIndex}`);
    if (!selected) return this.result(false, false, "unsupported-offer");
    if ((this.state.balances[String(selected.price)] ?? 0) < selected.priceQuantity) {
      return this.result(false, false, "insufficient-funds");
    }

    const stackable = CURRENCY_BUCKET[selected.reward] !== undefined;
    const alreadyStacked = stackable && (this.state.balances[String(selected.reward)] ?? 0) > 0;
    const capacity = BUCKET_CAPACITY[selected.rewardBucket] ?? 0;
    if (!alreadyStacked && (occupied[selected.rewardBucket] ?? 0) >= capacity) {
      return this.result(false, false, "bucket-full");
    }

    const next = JSON.parse(JSON.stringify(this.state)) as PersistedEconomy;
    next.balances[String(selected.price)] -= selected.priceQuantity;
    if (stackable) {
      next.balances[String(selected.reward)] =
        (next.balances[String(selected.reward)] ?? 0) + selected.rewardQuantity;
    } else {
      next.purchases.push({
        soid: (0x300100000n + BigInt(next.nextSerial++)).toString(16).padStart(16, "0"),
        defIndex: selected.reward,
        bucket: selected.rewardBucket,
        quantity: selected.rewardQuantity,
      });
    }
    next.version = next.version === 0x7fffffff ? 1 : next.version + 1;
    this.commit(next);
    this.state = next;
    return { ...this.result(true, true, "accepted"), rewardDefinition: selected.reward };
  }

  private item(soid: bigint, defIndex: number, bucket: number, quantity: number): EconomyInventoryItem {
    const equipment = EQUIPMENT[defIndex];
    return {
      soid, defIndex, bucket, quantity,
      slot: BUCKET_TO_EQUIP_SLOT[bucket] ?? -1,
      artArrangement: equipment?.art ?? -1,
      sandboxPattern: equipment?.pattern ?? -1,
      stats: equipment?.stats ?? [],
      equipReady: equipment !== undefined,
    };
  }

  private result(accepted: boolean, changed: boolean, reason: PurchaseResult["reason"]): PurchaseResult {
    return { accepted, changed, reason, version: this.state.version };
  }

  private read(file: string): PersistedEconomy {
    const value = JSON.parse(readFileSync(file, "utf8")) as PersistedEconomy;
    if (value.schema !== 1 || !Number.isInteger(value.version) || value.version < 1 ||
        !Number.isInteger(value.nextSerial) || value.nextSerial < 1 ||
        !value.balances || typeof value.balances !== "object" || !Array.isArray(value.purchases)) {
      throw new Error(`Invalid vendor economy profile: ${file}`);
    }
    if (value.talentSelections !== undefined && (!value.talentSelections ||
        typeof value.talentSelections !== 'object' || Array.isArray(value.talentSelections) ||
        Object.entries(value.talentSelections).some(([key, selected]) => !validTalentSelection(key, selected)))) {
      throw new Error(`Invalid talent selections in economy profile: ${file}`);
    }
    return value;
  }

  private commit(value: PersistedEconomy): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, this.file);
  }
}

export const vendorEconomy = characterLocal(() => new VendorEconomy());
