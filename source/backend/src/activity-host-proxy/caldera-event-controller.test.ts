import { describe, expect, it } from 'vitest';
import { CalderaEventController } from './caldera-event-controller';

describe('Caldera authored event sequencing', () => {
  it('honors initial delay, waits for actual finish, then waits the cooldown', () => {
    const controller = new CalderaEventController(() => 0);
    controller.start(0);
    controller.start(1000); // repeated area notification must not restart delay
    expect(controller.poll(39999)).toBeUndefined();
    const ticket = controller.poll(40000)!;
    expect(ticket.event).toBe('vex-block');
    expect(controller.poll(900000)).toBeUndefined();
    expect(controller.finished(ticket, 900000)).toBe(true);
    expect(controller.finished(ticket, 900001)).toBe(false);
    expect(controller.poll(944999)).toBeUndefined();
    expect(controller.poll(945000)?.generation).toBe(2);
  });

  it('preserves inclusive delay endpoints and the50/50 boundary', () => {
    const values = [0.999999, 0.5, 0.999999, 0.499999];
    const controller = new CalderaEventController(() => values.shift()!);
    controller.start(0);
    expect(controller.poll(89999)).toBeUndefined();
    const ticket = controller.poll(90000)!;
    expect(ticket.event).toBe('fallen-dropship');
    controller.finished(ticket, 100000);
    expect(controller.poll(174999)).toBeUndefined();
    expect(controller.poll(175000)?.event).toBe('vex-block');
  });

  it('rejects old completion after unload and re-entry', () => {
    const controller = new CalderaEventController(() => 0);
    controller.start(0);
    const old = controller.poll(40000)!;
    controller.stop();
    expect(controller.poll(50000)).toBeUndefined();
    controller.start(50000);
    const current = controller.poll(90000)!;
    expect(controller.finished(old, 90001)).toBe(false);
    expect(controller.poll(200000)).toBeUndefined();
    expect(controller.finished(current, 200000)).toBe(true);
  });
});
