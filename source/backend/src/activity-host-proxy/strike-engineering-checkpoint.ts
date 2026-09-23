// Diagnostic only. Native occupied refresh and Trigger74 remain independent gates.
export class StrikeEngineeringCheckpoint {
  private armed = false;
  private issued = false;
  private completed = false;
  private resetIdle = false;
  private arrived = false;
  constructor(private readonly enabled = false) {}
  observeRequest(activity: string, occupied: number | undefined,
    destination: number | undefined, insertionHash: number | undefined): void {
    if (this.enabled && activity === 'venus_portal_1' && occupied === 16 &&
        destination === 7 && insertionHash !== undefined &&
        (insertionHash >>> 0) === 0xf9934702 && !this.issued) this.armed = true;
  }
  observeCancellation(): void { if (!this.issued) this.armed = false; }
  observeTransitionState(activity: string, occupied: number | undefined, state: number | undefined): boolean {
    if (this.armed && !this.issued && activity === 'venus_portal_1' && occupied === 16 && state === 2) {
      this.issued = true;
      return true;
    }
    return false;
  }
  observeTeleport(teleport: {state: number; request: {a: number; b: number; c: number; d: number}} | undefined): boolean {
    if (!this.issued || !teleport) return false;
    const r = teleport.request;
    if (r.a !== 1 || r.b !== 56 || (r.c >>> 0) !== 0xf9934702 || r.d !== 0) return false;
    if (teleport.state === 3 && !this.completed) { this.completed = true; return true; }
    if (teleport.state === 0 && this.completed) this.resetIdle = true;
    return false;
  }
  observeOccupiedRefresh(physical: number): void { if (this.issued && physical === 7) this.arrived = true; }
  membershipRequest() {
    return this.issued ? {completed: this.completed, cookie: 1, destination: 56,
      insertionHash: 0xf9934702, deinstantiateMask: 0} : undefined;
  }
  get assignedBubble(): number | undefined { return this.issued && !this.arrived ? 7 : undefined; }
  get settled(): boolean { return this.completed && this.resetIdle && this.arrived; }
}
