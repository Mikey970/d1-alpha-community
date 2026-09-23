/** Explicit exploration launch to original Caldera default insertion.
 * Uses the native membership/teleport handshake, without mission credit.
 */
export class CalderaInsertion {
  readonly enabled = process.env.D1A_CALDERA_INSERTION === '1';
  scheduled = false;
  private issued = false;
  private completed = false;
  private arrived = false;
  begin(activity: string, occupied: number | undefined) {
    if (!this.enabled || this.issued || activity !== 'venus_chapter_2' || occupied !== 16) return false;
    this.issued = true;
    return true;
  }
  observeOccupied(slice: number | undefined) { if (this.issued && slice === 9) this.arrived = true; }
  requestedBubble(t: {kind?:number;requested?:{destination:number;secondaryDestination:number;state:number}} | undefined) {
    const r = t?.requested;
    return this.issued && r?.destination===72 && r.secondaryDestination===72 && r.state===0 &&
      Number.isInteger(t?.kind) && t!.kind!>0 && t!.kind!<=255 ? 9 : undefined;
  }
  observeTeleport(t: {state:number;request:{a:number;b:number;c:number;d:number}} | undefined) {
    if (!this.issued || this.completed || t?.state!==3 || t.request.a!==8 ||
        t.request.b!==72 || t.request.c!==0x2ea8fb98 || t.request.d!==0) return false;
    this.completed = true;
    return true;
  }
  get assignedBubble() { return this.issued && !this.arrived ? 9 : undefined; }
  membershipRequest() {
    return this.issued ? {completed:this.completed,cookie:8,destination:72,
      insertionHash:0x2ea8fb98,deinstantiateMask:0} : undefined;
  }
}
