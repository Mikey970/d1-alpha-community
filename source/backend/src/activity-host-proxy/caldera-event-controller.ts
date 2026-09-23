/** Port of Caldera script10.ss_event_thread and script37.start_2_weighted.
 * Caller supplies elapsed active-encounter time and the actual event completion.
 * Event runners and native sensor transport are integrated separately.
 */
export type CalderaEvent = 'vex-block' | 'fallen-dropship';
export type EventTicket = Readonly<{ generation: number; event: CalderaEvent }>;

export class CalderaEventController {
  private nextAt: number | undefined;
  private active: EventTicket | undefined;
  private generation = 0;
  private lastTime = 0;

  constructor(private readonly random: () => number = Math.random) {}

  private inclusive(low: number, high: number): number {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('Random source must return a value in [0,1)');
    }
    return low + Math.floor(value * (high - low + 1));
  }

  private time(now: number): void {
    if (!Number.isFinite(now) || now < this.lastTime) {
      throw new Error('Encounter time must be finite and monotonic');
    }
    this.lastTime = now;
  }

  start(now: number): void {
    this.time(now);
    if (this.nextAt !== undefined || this.active) return;
    this.nextAt = now + this.inclusive(40, 90) * 1000;
  }

  poll(now: number): EventTicket | undefined {
    this.time(now);
    if (this.active || this.nextAt === undefined || now < this.nextAt) return;
    // Script37 draws [0,100): values0..49 select Vex,50..99 select Fallen.
    const event = this.inclusive(0, 99) < 50 ? 'vex-block' : 'fallen-dropship';
    this.active = Object.freeze({ generation: ++this.generation, event });
    this.nextAt = undefined;
    return this.active;
  }

  finished(ticket: EventTicket, now: number): boolean {
    this.time(now);
    if (ticket !== this.active) return false;
    // is_finished is required; timeout alone never awards or finishes an event.
    const delay = this.inclusive(45, 75) * 1000;
    this.active = undefined;
    this.nextAt = now + delay;
    return true;
  }

  stop(): void {
    this.active = undefined;
    this.nextAt = undefined;
  }
}
