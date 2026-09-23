import { c } from "@craftycodie/cstruct";
import { Inject, Injectable } from "@nestjs/common";
import type { RawBapMessage } from "../bungie-access-protocol/codec";
import type ILogger from "../ILogger";
import { ILoggerSymbol } from "../ILogger";
import { type ActivityHostKind, ActivityHostService } from "./activity-host";
import { FAKE_ACTIVITY_HOST_ID, formatActivityHostTag } from "./config";
import { effectiveActivityId } from "./activity-override";
import { activityRouteForId, activityRouteForStart } from "./activity-id";
import {
  formatStartRequest,
  type ParsedStartRequest,
  parseStartRequest,
} from "./start-request";

// activity host manager startup request ?
export const ACTIVITY_HOST_MANAGER_START_TYPE = 3;
// TODO: what is this
export const ACTIVITY_HOST_MANAGER_RESPONSE_TYPE = 2;

export interface ResolvedActivityRoute extends ParsedStartRequest {
  readonly originalActivityId: number;
  readonly requestedActivityId: number;
  readonly generation: number;
  readonly activityName: string;
  readonly scenario: NonNullable<ReturnType<typeof activityRouteForId>>["scenario"];
}

const ActivityHostManagerResponse = c.struct({
  type: c.u8(),
  activityHostId: c.u64(),
  _unknown: c.pad(128),
});

export function parseActivityHostManagerRequest(body: Buffer): {
  type: number;
  payload: Buffer;
} | null {
  if (body.length < 1) {
    return null;
  }
  return {
    type: body[0],
    payload: Buffer.from(body.subarray(1)),
  };
}

export function buildActivityHostManagerResponse(
  activityHostId: bigint
): Buffer {
  const body = c.write(
    ActivityHostManagerResponse,
    {
      type: ACTIVITY_HOST_MANAGER_RESPONSE_TYPE,
      activityHostId,
    },
    "big"
  );
  body.write(formatActivityHostTag(activityHostId), 9, 17, "ascii");
  return body;
}

@Injectable()
export class ActivityHostManager {
  readonly fah = new ActivityHostService(FAKE_ACTIVITY_HOST_ID);
  gah: ActivityHostService | undefined;
  private fahBound = false;
  private readonly resolvedRoutes = new Map<ActivityHostService, ResolvedActivityRoute>();
  private routeGeneration = 0;

  constructor(@Inject(ILoggerSymbol) private readonly logger: ILogger) {}

  bindSession(): ActivityHostKind {
    if (!this.fahBound) {
      this.fah.resetSessionState();
      this.fahBound = true;
      return "FAH";
    }
    // Current and target public activities may overlap while the client drains
    // the old connection. Each connection owns its host, route and entity pool.
    this.gah = new ActivityHostService();
    return "GAH";
  }

  unbindSession(kind: ActivityHostKind, host = this.host(kind)): void {
    if (kind === "FAH") {
      this.fahBound = false;
    } else if (host === this.gah) {
      this.gah = undefined;
    }
    this.resolvedRoutes.delete(host);
  }

  ensureGah(): ActivityHostService {
    this.gah ??= new ActivityHostService();
    return this.gah;
  }

  host(kind: ActivityHostKind): ActivityHostService {
    return kind === "GAH" ? this.ensureGah() : this.fah;
  }

  getStartRequest(kind: ActivityHostKind = "FAH"): ParsedStartRequest | undefined {
    return this.getResolvedRoute(kind);
  }

  getResolvedRoute(kind: ActivityHostKind = "FAH", host = kind === "GAH" ? this.gah : this.fah): ResolvedActivityRoute | undefined {
    return host ? this.resolvedRoutes.get(host) : undefined;
  }

  handle(message: RawBapMessage, kind: ActivityHostKind, host = this.host(kind)): Buffer | null {
    try {
      const req = parseActivityHostManagerRequest(message.body);
      if (!req) {
        this.logger.warn(
          `AH manager req absorbed (short body ${message.body.length}B)`
        );
        return null;
      }

      if (req.type === ACTIVITY_HOST_MANAGER_START_TYPE) {
        const parsed = parseStartRequest(req.payload);
        if (!parsed) {
          this.resolvedRoutes.delete(host);
          this.logger.warn(
            `AH manager start req unparsed (${req.payload.length}B ` +
              `head=${hexPreview(req.payload, 16)})`
          );
          return null;
        }

        const requestedActivityId = effectiveActivityId(parsed.activityId);
        const previous = this.resolvedRoutes.get(host);
        const duplicate =
          previous?.originalActivityId === parsed.activityId &&
          previous.requestedActivityId === requestedActivityId &&
          previous.ipValid === parsed.ipValid &&
          previous.unknown1 === parsed.unknown1 &&
          previous.options.equals(parsed.options) &&
          previous.stream.equals(parsed.stream);
        const route = duplicate ? previous : activityRouteForStart(requestedActivityId);
        if (!route) {
          this.resolvedRoutes.delete(host);
          this.logger.warn(
            `AH manager rejected unsupported start activity=${requestedActivityId} ` +
              `clientActivity=${parsed.activityId}`
          );
          return null;
        }

        const activityId = route.activityId;
        const generation = duplicate
          ? previous!.generation
          : ++this.routeGeneration;
        const resolvedRoute = Object.freeze({
          ...parsed,
          options: Buffer.from(parsed.options),
          stream: Buffer.from(parsed.stream),
          originalActivityId: parsed.activityId,
          requestedActivityId,
          activityId,
          activityName: route.activityName,
          scenario: route.scenario,
          generation,
        });
        this.resolvedRoutes.set(host, resolvedRoute);
        this.logger.log(
          `AH manager start req (${req.payload.length}B ` +
            `${formatStartRequest(resolvedRoute)} routeGeneration=${generation} host=${kind}` +
            (duplicate ? " duplicate=1" : " duplicate=0") +
            (activityId === parsed.activityId
              ? ")"
              : ` clientActivity=${parsed.activityId} requestedActivity=${requestedActivityId} resolvedActivity=${activityId})`)
        );
      }

      const body = buildActivityHostManagerResponse(host.id);
      this.logger.log(
        `AH manager rsp (seq ${message.sequence.toString(16)}, ` +
          `reqType=${req.type} req=${message.body.length}B ` +
          `head=${hexPreview(req.payload, 16)} ` +
          `ah=0x${host.id.toString(16)} ${kind}, body ${body.length}B)`
      );
      return body;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AH manager rsp FAILED, absorbed: ${m}`);
      return null;
    }
  }
}

function hexPreview(buf: Buffer, max = 64): string {
  const slice = buf.subarray(0, max);
  const hex = slice.toString("hex");
  return buf.length > max ? `${hex}…(${buf.length}B)` : hex;
}
