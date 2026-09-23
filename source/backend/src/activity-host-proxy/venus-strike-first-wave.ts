/**
 * Authored script63 floor_spawn: Squad2, random integer3..6 seconds, Squad3.
 * Objective1 has seven native tasks, unlike the one-task Headlands encounter.
 * Keep delivery disabled until its eligible initial task state is recovered.
 * Do not enable this by substituting the generic slot1 activation: that task
 * selects group173, while these two squads belong to group165.
 */
// r420 tests first wildcard client task4; native host priority remains unproven.

export class VenusStrikeFirstWave {
  private started = false;
  private secondDueAt: number | undefined;

  begin(now: number, random: () => number): { squad: 2; delayMs: number } | undefined {
    if (this.started) return undefined;
    const roll = random();
    if (!Number.isFinite(now) || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
      throw new Error("Invalid Engineering wave clock/random input");
    }
    const delayMs = (3 + Math.floor(roll * 4)) * 1000;
    this.started = true;
    this.secondDueAt = now + delayMs;
    return { squad: 2, delayMs };
  }

  takeSecond(now: number, activityName: string, currentSlice: number): 3 | undefined {
    if (activityName !== "venus_portal_1" || currentSlice !== 7) {
      this.cancel();
      return undefined;
    }
    if (this.secondDueAt === undefined || !Number.isFinite(now) || now < this.secondDueAt) return undefined;
    this.secondDueAt = undefined;
    return 3;
  }

  cancel(): void {
    this.secondDueAt = undefined;
  }
}
