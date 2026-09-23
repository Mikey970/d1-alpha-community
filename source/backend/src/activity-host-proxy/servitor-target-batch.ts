/** Bounded r428 recovery correlation; real Servitor runtime proof pending.
 * Requires independent class AND complete census proof. The strings below
 * identify that proof; constructing this class does not establish it.
 * Never invents wire victim identifiers or per-packet actor assignments.
 */
import {decodeEadKill, isPlayerToAiKill} from './ead-kill-decoder';
import type {EadKill} from './ead-kill-decoder';

type Target = 19 | 16 | 17 | 18;
type Proof = {
  classHash: number;
  classEvidence: string;
  /** Covers every possible AI victim in the loaded AH scope, including ambient. */
  closedCensusEvidence: string;
  retirementSemanticsEvidence: string;
};
type Binding = {squad: Target; allocationToken: string; boundAt: number;
  sequence: number; fullAt?: number; terminalAt?: number};
export type TargetBatchEvidence = {
  kind: 'targetGroupKillEvidence';
  provenance: 'closed_census_ead_plus_qualified_cohort_batch';
  runId: string; connectionLifetime: string;
  authoredIdentifier: 0xed8bf764;
  wireVictimSquadIdentifier: null;
  /** Set-level relation only. No packet-to-squad mapping is asserted. */
  targets: {squad: Target; allocationToken: string; fullAt: number; terminalAt: number}[];
  packetIds: string[];
  proof: Proof;
};

export class ServitorTargetBatchDraft {
  private readonly bindings = new Map<Target, Binding>();
  private readonly packets = new Map<string, {at: number; event: EadKill}>();
  private lastAt = -Infinity;
  private invalidReason?: string;
  private emitted = false;
  private readonly scope: {runId: string; connectionLifetime: string};
  private readonly group: readonly Target[];
  private readonly proof: Proof;
  private readonly player: {platformIdentity: string; characterId: string};
  constructor(scope: {runId: string; connectionLifetime: string},
    group: readonly Target[], proof: Proof,
    player: {platformIdentity: string; characterId: string}) {
    if (!['19', '16', '17,18'].includes(group.join(',')) || !scope.runId || !scope.connectionLifetime
      || !Number.isInteger(proof.classHash) || !proof.classEvidence.trim()
      || !proof.closedCensusEvidence.trim() || !proof.retirementSemanticsEvidence.trim())
      throw new Error('Missing independent authored class/census/retirement evidence');
    this.scope = {...scope}; this.group = [...group]; this.proof = {...proof}; this.player = {...player};
  }
  get blockedReason(): string | undefined { return this.invalidReason; }
  eligibleAt(at: number): boolean {
    return !this.invalidReason && !this.emitted && [...this.bindings.values()].some(b =>
      b.fullAt !== undefined && b.fullAt <= at &&
      (b.terminalAt === undefined || Math.abs(at-b.terminalAt) <= 3000));
  }
  invalidate(reason: string): void {
    this.invalidReason = reason || 'Binding/census invalidated';
    this.bindings.clear(); this.packets.clear();
  }
  private clock(at: number): boolean {
    if (this.invalidReason || this.emitted) return false;
    if (!Number.isFinite(at) || at < this.lastAt) {
      this.invalidate('Non-monotonic local receipt clock'); return false;
    }
    this.lastAt = at; return true;
  }
  /** Call only after one authored [1] allocation is issued. No target refills. */
  bind(squad: Target, allocationToken: string, at: number): void {
    if (!this.clock(at)) return;
    if (!this.group.includes(squad) || !allocationToken || this.bindings.has(squad)) {
      this.invalidate('Unexpected target, replacement or repeated allocation'); return;
    }
    this.bindings.set(squad, {squad, allocationToken, boundAt: at, sequence: -1});
  }
  /** Input must be a committed qualified StrikeSquadObservations row, not raw
   * activationCount. Omitted deltas are handled in that existing tracker.
   * Invalidate separately on unload, reset, removal or membership ambiguity.
   */
  cohort(row: {squad: Target; allocationToken: string; sequence: number;
    currentCohortCount: number; retirementRoster: readonly number[]}, at: number): TargetBatchEvidence | null {
    if (!this.clock(at)) return null;
    const b = this.bindings.get(row.squad);
    if (!b || b.allocationToken !== row.allocationToken) {
      this.invalidate('Unproven target allocation scope'); return null;
    }
    if (!Number.isInteger(row.sequence) || row.sequence <= b.sequence) return null;
    const full = row.currentCohortCount === 1 && row.retirementRoster.length === 1 && row.retirementRoster[0] === 0;
    const terminal = row.currentCohortCount === 0 && row.retirementRoster.length === 1 && row.retirementRoster[0] === 1;
    if ((!full && !terminal) || (terminal && b.fullAt === undefined) || (full && b.terminalAt !== undefined)) {
      this.invalidate('Cohort did not follow the single allocated member lifecycle'); return null;
    }
    b.sequence = row.sequence;
    if (full) b.fullAt ??= at;
    else b.terminalAt ??= at;
    return this.finish();
  }
  /** Actual FAH Incident payload only. Caller verifies this exact connection's
   * current physical7/activity4/bundle0A302429 ownership before calling.
   */
  incident(raw: Uint8Array, connectionKind: number, at: number): TargetBatchEvidence | null {
    if (!this.clock(at)) return null;
    let event: EadKill;
    try { event = decodeEadKill(raw, connectionKind); } catch { return null; }
    return this.decoded(event, at);
  }
  /** Exposed solely to test synthetic reducer contracts; runtime uses incident. */
  decoded(event: EadKill, at: number): TargetBatchEvidence | null {
    if (!this.clock(at) || !isPlayerToAiKill(event, this.player) || event.victim.baseHash !== this.proof.classHash)
      return null;
    if (this.packets.has(event.eventId)) return null;
    if (![...this.bindings.values()].some(b => b.fullAt !== undefined && b.fullAt <= at)) {
      this.invalidate('Qualifying kill before any target had a qualified full cohort'); return null;
    }
    this.packets.set(event.eventId, {at, event});
    if (this.packets.size > this.group.length) {
      this.invalidate('Extra same-class kill contradicts closed target census'); return null;
    }
    return this.finish();
  }
  private finish(): TargetBatchEvidence | null {
    const targets = this.group.map(id => this.bindings.get(id));
    if (targets.some(b => !b || b.fullAt === undefined || b.terminalAt === undefined)
      || this.packets.size !== this.group.length) return null;
    const packets = [...this.packets.values()];
    const compatible = (b: Binding, p: {at: number}) => p.at >= b.fullAt!
      && Math.abs(p.at - b.terminalAt!) <= 3000;
    // At most two targets. A bijection may exist without being unique: emit
    // the entire set atomically, never arbitrarily choose one assignment.
    const matching = compatible(targets[0]!, packets[0]!) && (targets.length === 1
      || compatible(targets[1]!, packets[1]!))
      || targets.length === 2 && compatible(targets[0]!, packets[1]!) && compatible(targets[1]!, packets[0]!);
    if (!matching) return null;
    this.emitted = true;
    return {kind: 'targetGroupKillEvidence', provenance: 'closed_census_ead_plus_qualified_cohort_batch',
      ...this.scope, authoredIdentifier: 0xed8bf764, wireVictimSquadIdentifier: null,
      targets: targets.map(b => ({squad: b!.squad, allocationToken: b!.allocationToken,
        fullAt: b!.fullAt!, terminalAt: b!.terminalAt!})),
      packetIds: [...this.packets.keys()].sort(), proof: {...this.proof}};
  }
}
