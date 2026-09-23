/** Isolated exploration insertion, not an earned checkpoint or raid completion. */
export class RaidPreview {
  readonly enabled = process.env.D1A_OUTRO_PREVIEW === '1';
  scheduled = false;
  started = false;
  private issued = false;
  private completed = false;
  private arrived = false;
  begin(activity: string, occupied: number | undefined) {
    if (!this.enabled || this.issued || activity !== 'city_tower_default1' || occupied !== 3) return false;
    this.issued = true;
    return true;
  }
  observeOccupied(occupied: number | undefined) {
    if (this.issued && occupied === 1) this.arrived = true;
  }
  requestedBubble(transition: {kind?:number;requested?:{destination:number;secondaryDestination:number;state:number}} | undefined) {
    const r=transition?.requested;
    return this.issued && r?.destination===8 && r.secondaryDestination===8 && r.state===0 &&
      Number.isInteger(transition?.kind) && transition!.kind!>0 && transition!.kind!<=255 ? 1 : undefined;
  }
  observeTeleport(t: {state: number; request: {a:number;b:number;c:number;d:number}} | undefined) {
    if (!this.issued || this.completed || !t || t.state !== 3 || t.request.a !== 7 ||
        t.request.b !== 8 || t.request.c !== 0x2ea8fb98 || t.request.d !== 0) return false;
    this.completed = true;
    return true;
  }
  get assignedBubble() { return this.issued && !this.arrived ? 1 : undefined; }
  membershipRequest() {
    return this.issued ? {completed:this.completed,cookie:7,destination:8,
      insertionHash:0x2ea8fb98,deinstantiateMask:0} : undefined;
  }
}
