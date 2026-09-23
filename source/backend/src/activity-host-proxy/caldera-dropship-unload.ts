/** Script45 functions653C/6EC0. These operations require native transport;
 * completing this routine means the ship departed, not that combat was won.
 */
export type DropshipWait = 'command-idle' | 'drop-idle' | 'command-and-drop-idle';
export interface DropshipUnloadPort {
  attachToObjective(squad: number, objective: number): void;
  addToGroup(squad: number, group: number): void;
  execute(command: 'open-doors' | 'close-doors' | number): void;
  drop(squad: number): void;
  // Adapter must use bound native state for this actor lifetime and acknowledge
  // the preceding command; a cached idle value before dispatch is insufficient.
  waitFor(condition: DropshipWait, intervalMs: number, signal: AbortSignal): Promise<void>;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
  setPublicEventActive(): void;
  removePilotSquad(): void;
  restartEnemyNavpoints(): void;
}
export interface DropshipWave {
  objective: number;
  group: number;
  squadA: number;
  squadB: number;
  leader: number;
  exitCommand: number;
}

export async function unloadCalderaDropship(
  port: DropshipUnloadPort, wave: DropshipWave, signal: AbortSignal,
): Promise<void> {
  const check = () => { if (signal.aborted) throw new Error('Dropship encounter stopped'); };
  const wait = async (condition: DropshipWait, intervalMs = 1000) => {
    check();
    await port.waitFor(condition, intervalMs, signal);
    check();
  };
  const sleep = async () => {
    check();
    await port.sleep(1000, signal);
    check();
  };
  check();
  // Script75.get_all_data returns A/B/leader in positions7/8/10.
  const squads = [wave.squadA, wave.squadB, wave.leader];
  for (const squad of squads) port.attachToObjective(squad, wave.objective);
  for (const squad of squads) port.addToGroup(squad, wave.group);
  port.execute('open-doors');
  await wait('command-idle');
  port.drop(wave.squadA);
  await wait('drop-idle');

  // The native main thread starts the tail coroutine and marks the event active
  // during its initial one-second sleep, before B and leader are dropped.
  const delay = sleep();
  port.setPublicEventActive();
  await delay;
  await wait('command-and-drop-idle');
  port.drop(wave.squadB);
  await wait('drop-idle');
  port.drop(wave.leader);
  await wait('drop-idle');
  await sleep();
  port.execute('close-doors');
  await wait('command-idle');
  await wait('command-and-drop-idle');
  port.execute(wave.exitCommand);
  await wait('command-idle', 200);
  port.removePilotSquad();
  port.restartEnemyNavpoints();
}
