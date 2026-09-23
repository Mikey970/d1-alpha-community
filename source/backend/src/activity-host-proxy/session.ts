import { ActionMission } from './action-mission';
import {Chapter2Finale} from './chapter2-finale';
import {parsePeerLeaveRequest} from './peer-leave';
import {RaidPreview} from './raid-preview';
import {buildRaidEntranceEntries,buildRaidEntranceObject} from './rsat/mocks/sensor-auth';
import {createHash} from 'node:crypto';
import {grantChapter2BossReward} from '../bungie-access-protocol/rsat/mocks/repeat-strike-rewards';
import {rewardEvents} from '../bungie-access-protocol/rsat/mocks/strike-rewards';
import {Chapter2AreaReady} from './chapter2-area-ready';
import {buildVenusEngineeringAmbientEntries,buildVenusTransitAmbientEntries} from './rsat/mocks/sensor-auth';
import {currentCharacterContext, withCharacter, type CharacterContext} from '../bungie-access-protocol/character-context';
import {configuredCharacterStore} from '../bungie-access-protocol/character-store';
import {awardNexusVictory} from "../bungie-access-protocol/rsat/mocks/strike-rewards";
import {awardOrdinaryKill} from './ordinary-kill-loot';
import {eadPlayerIdentity} from './ead-kill-decoder';
import type {BossKillProof} from "./ruins-boss-kill-gate";
import { StrikeEarnedBacktrack } from './strike-earned-backtrack';
import { ruinsHud } from './venus-strike-ruins-auth';
import { StrikeDigSiteCheckpoint } from './strike-dig-site-checkpoint';
import { VenusStrikeEngineeringTrash } from './venus-strike-engineering-trash';
import { buildVenusStrikeEngineeringTrashSquadEntry } from './rsat/mocks/sensor-auth';
import { VenusStrikeRuinsRuntime } from './venus-strike-ruins-runtime';
import { VenusStrikeDigSiteRuntime } from './venus-strike-dig-site-runtime';
import { buildVenusStrikeDigSiteObjective, buildVenusStrikeDigSiteTrigger, buildVenusStrikeDigSiteSquadEntry } from './rsat/mocks/sensor-auth';
import { StrikeEngineeringCheckpoint } from './strike-engineering-checkpoint';
import { VenusNorthernProgress, readVenusNorthernSense } from './venus-northern-progress';
import { decodeStrikeSense as decodeCalderaPilotPacket } from './ruins-sense';
import { ActorScriptProgress } from './actor-script-progress';
import { CALDERA_PILOT } from './caldera-pilot';
import { CalderaInsertion } from './caldera-insertion';
import { buildCalderaInitialBindingEntries } from './rsat/mocks/sensor-auth';
import { requestedStrikeBubble, requestedChapter2Bubble } from './venus-strike-transition';
import { isVenusStrikeEngineeringEntryIncident } from './venus-strike-incidents';
import { VenusStrikeEngineeringRuntime } from './venus-strike-engineering-runtime';
import {StrikeDialoguePlayback,strikeDialogueEntry,strikeDialogueTrigger,strikeDialogueTriggerEntry} from './strike-dialogue-playback';
import {Chapter2Dialogue,readChapter2DialogueTrigger} from './chapter2-dialogue';
import {Chapter2Portals} from './chapter2-portals';
import {engineeringDialogueCue,type StrikeDialogueCue} from './strike-dialogue-catalog';
import { buildVenusStrikeEngineeringTask, buildVenusStrikeCombatObjective, buildVenusStrikeEngineeringSquadEntry, buildVenusStrikeInitialObjectiveAssignment, buildVenusStrikeObjectiveAssignedSquadEntry, buildVenusStrikeExitDoorEntry } from './rsat/mocks/sensor-auth';
import * as crypto from "node:crypto";
import type * as net from "node:net";
import {
  BungieCodec,
  type RawBapMessage,
} from "../bungie-access-protocol/codec";
import {
  BAP_SESSION_KEY_AES,
  BAP_SESSION_KEY_HMAC,
} from "../bungie-access-protocol/config";
import {
  BapMessageType,
  bapMessageTypeName,
} from "../bungie-access-protocol/constants";
import type ILogger from "../ILogger";
import type { ActivityHostKind, ActivityHostService } from "./activity-host";
import { ActivityHostManager, type ResolvedActivityRoute } from "./activity-host-manager";
import type { AhClientIdentity } from "./join";
import {
  ActivityHostMessageType,
  activityHostMessageTypeName,
  isActivityHostMessageType,
} from "./messages";
import {
  buildActivityHostToClientNotification,
  buildJoinResultNotification,
  parseClientToActivityHostNotification,
  peekJoinRequest,
} from "./notification";
import {
  buildGlobalActivityStateRsat,
  buildReplicateMembershipRsat,
  buildSensorAuthUpdateRsat,
  buildSensorAuthTickRsat,
  buildTowerSensorAuthRsat,
  buildTowerVendorActivationSenseEntries,
  buildVenusVexObjectiveActivationSenseEntries,
  buildVenusVexPlayerMonitorReceivedSenseEntries,
  buildVenusVexSquadActivationSenseEntries,
  buildWorldGlobalsStateRsat,
  parseStateRefreshSlice,
  playerKeyFromCharacter,
} from "./rsat";
import { buildVenusCaptainFollowupEntries, buildVenusCaptainActivationEntries, buildVenusHeadlandsArrivalEntries, buildVenusCollectFluidsEntries, buildVenusFluidsEncounterEntries } from "./rsat/mocks/sensor-auth";
import { VenusFluidProgress, VENUS_FLUID_REQUIREMENT } from './venus-fluid-progress';
import { buildVenusFluidProgressEntry } from './rsat/mocks/sensor-auth';
import { isVenusGatekeeperEntryIncident, isVenusHeadlandsEntryIncident, isVenusSouthernEntryIncident } from './venus-entry-incident';
import { VenusHeadlandsRespawn } from './venus-headlands-respawn';
import { buildVenusHeadlandsReplenishmentEntry } from './rsat/mocks/sensor-auth';
import { buildVenusPortalOpeningDrop, buildVenusPlayerObjectiveEntry, buildVenusNorthernGateEntries, buildVenusGatekeeperActivationEntries, buildVenusGatekeeperHealthBinding, buildVenusNorthernArrivalEntries, buildVenusFluidCompletionEntries, buildVenusSouthernArrivalEntries, buildVenusSouthernInteractionEntries, buildVenusSouthernWarpgateWaveEntries, buildVenusSouthernWarpgateWave, venusSouthernWarpgateWaveSquads, VENUS_SOUTHERN_WARPGATE_WAVE_COUNT, buildVenusSouthernSniperEntries } from './rsat/mocks/sensor-auth';
import { parseClientAuth } from "./client-auth";
import { VenusCaptainProgress } from './venus-captain-progress';
import {buildVenusOpeningMinionEntries, buildVenusOpeningReinforcementTrigger} from './rsat/mocks/sensor-auth';
import {isVenusOpeningReinforcementIncident} from './venus-entry-incident';
import { isVenusDeviceInteractionIncident } from './venus-device-incident';
import { buildVenusDeviceCompletionEntries, buildVenusGateProgressEntries } from './rsat/mocks/sensor-auth';
import { VenusGateProgress, readVenusGateSense } from './venus-gate-progress';

/**
 * TCP session for the activity host proxy.
 */
export class ActivityHostProxySession {
  private readonly codec = new BungieCodec();
  private buffer = Buffer.alloc(0);
  private closed = false;
  private readonly raidPreview = new RaidPreview();
  private strikeDialogue: StrikeDialoguePlayback | undefined;
  private chapter2AreaReady: Chapter2AreaReady | undefined;
  private chapter2EngineeringAmbientStarted = false;
  private chapter2TransitAmbientStarted = false;
  private chapter2OpeningStarted = false;
  private chapter2Dialogue: Chapter2Dialogue | undefined;
  private chapter2Finale:Chapter2Finale|undefined;
  private chapter2OccupiedSlice: number | undefined;
  private strikeDialogueAuth=new Map<number,ReturnType<typeof strikeDialogueEntry>>();
  private notifySeq = 0;
  // TOWERSPAWN TODO: Clean these up, move the ones we need into AH
  private activityStateSent = false;
  private sensorAuthGranted = false;
  private membershipPushes = 0;
  private membershipGeneration = 0;
  private joinIdentity: AhClientIdentity | undefined;
  private keepalive: ReturnType<typeof setInterval> | undefined;
  private initialSliceRecovery: ReturnType<typeof setTimeout> | undefined;
  private initialSliceRecoverySent = false;
  private venusVexActivation: ReturnType<typeof setTimeout> | undefined;
  private venusVexSquadActivation: ReturnType<typeof setTimeout> | undefined;
  private venusVexActivationArmed = false;
  private venusVexActivationSent = false;
  private venusEntranceTeleportRequested = false;
  private venusEntranceTeleportCompleted = false;
  private venusHeadlandsTeleportRequested = false;
  private venusHeadlandsTeleportCompleted = false;
  private venusHeadlandsArrivalInitialized = false;
  private venusCollectFluidsActive = false;
  private readonly venusFluidProgress = new VenusFluidProgress();
  private readonly venusHeadlandsRespawn = new VenusHeadlandsRespawn();
  private venusNorthernTeleportRequested = false;
  private venusNorthernTeleportCompleted = false;
  private venusNorthernArrivalInitialized = false;
  private venusGatekeeperActivated = false;
  private venusNorthernEncounterStarted = false;
  private venusPortalDropTimer: ReturnType<typeof setTimeout> | undefined;
  private strikeEngineeringRuntime: VenusStrikeEngineeringRuntime | undefined;
  private strikeEngineeringTrash: VenusStrikeEngineeringTrash | undefined;
  private strikeRuinsRuntime: VenusStrikeRuinsRuntime | undefined;
  private strikeDigSiteRuntime: VenusStrikeDigSiteRuntime | undefined;
  private strikeEngineeringArrivalObserved = false;
  private strikeBacktrack: StrikeEarnedBacktrack | undefined;
  private strikeRuinsGuidanceShown = false;
  private readonly venusNorthernProgress = new VenusNorthernProgress();
  private calderaPilotProgress?: ActorScriptProgress;
  private calderaBindingsSent = false;
  private readonly calderaInsertion = new CalderaInsertion();
  private venusSouthernTeleportRequested = false;
  private venusSouthernTeleportCompleted = false;
  private venusSouthernArrivalInitialized = false;
  private venusSouthernInteractionActive = false;
  private venusDeviceInteractionCompleted = false;
  private readonly venusGateProgress = new VenusGateProgress();

  private chapter2Portals:Chapter2Portals|undefined;
  private chapter2NorthernPortals:Chapter2Portals|undefined;
  private readonly venusWarpgateSquads = new Set<number>();

  private venusCaptainActivationSent = false;
  private venusOpeningReinforcementsSent = false;
  private readonly venusCaptainProgress = new VenusCaptainProgress();
  private venusVexObjectiveReadinessLatched = false;
  private venusVexObjectiveActivationSent = false;
  private venusVexPlayerMonitorActivationSent = false;
  private towerVendorActivation: ReturnType<typeof setTimeout> | undefined;
  private towerVendorActivationArmedSlice: number | undefined;
  private towerVendorActivationScheduledSlice: number | undefined;
  private readonly towerVendorActivationSentSlices = new Set<number>();
  private actionMission: ActionMission | undefined;
  private actionMissionPoll: ReturnType<typeof setInterval> | undefined;
  // in-world time
  private activityClockStarted = 0;
  private currentSlice: number | undefined;
  private strikeRequestedSlice: number | undefined;
  private strikeRegionTokens: Record<number, number> = {};
  private strikeResumeScheduled=false;
  private strikeDigSiteArrivalApplied=false;
  private readonly strikeResume = new StrikeDigSiteCheckpoint();
  private readonly strikeCheckpoint = new StrikeEngineeringCheckpoint(process.env.D1A_STRIKE_ENGINEERING_CHECKPOINT === '1');
  /** Frozen after this proxy accepts its startup request; later Director starts cannot retarget it. */
  private resolvedRoute: ResolvedActivityRoute | undefined;

  // TOWERSPAWN TODO: WHY DOES THE PROXY HAVE A KIND?
  readonly kind: ActivityHostKind;
  private readonly host: ActivityHostService;

  constructor(
    private readonly socket: net.Socket,
    private readonly logger: ILogger,
    private readonly manager: ActivityHostManager,
    private readonly characterContext: CharacterContext = configuredCharacterStore()?.activeContext ?? currentCharacterContext()
  ) {
    this.kind = this.manager.bindSession();
    this.host = this.manager.host(this.kind);
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`AH proxy client connected ${remote} (${this.kind})`);

    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (err) => {
      this.logger.warn(`AH proxy socket error ${remote}: ${err.message}`);
    });
    socket.on("close", () => {
      if (this.closed) return;
      this.closed = true;
      this.strikeDialogue?.stop();
      this.chapter2Dialogue?.stop();this.chapter2Finale?.stop();
      this.chapter2AreaReady?.stop();
      this.stopVenusWarpgateWaves();
      if (this.venusPortalDropTimer) clearTimeout(this.venusPortalDropTimer);
      this.strikeEngineeringRuntime?.stop();
      this.strikeEngineeringTrash?.stop();
      this.strikeDigSiteRuntime?.stop();
      this.strikeRuinsRuntime?.stop();
      this.manager.unbindSession(this.kind, this.host);
      this.stopKeepalive();
      this.stopInitialSliceRecovery();
      this.stopVenusVexActivation();
      this.stopTowerVendorActivation();
      this.stopActionMockActivation();
      this.logger.log(`AH proxy client disconnected ${remote}`);
    });
  }

  private onData(chunk: Buffer): void {
    if (this.closed) {
      return;
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      while (true) {
        const { message, consumed } = this.codec.tryDecode(this.buffer);
        if (!consumed) {
          break;
        }
        this.buffer = this.buffer.subarray(consumed);
        if (message) {
          this.handleMessage(message);
        }
      }
    } catch (error) {
      this.logger.error(
        `AH proxy frame error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.socket.destroy();
    }
  }

  private handleMessage(message: RawBapMessage): void {
    withCharacter(this.characterContext, () => this.dispatchMessage(message));
  }

  private dispatchMessage(message: RawBapMessage): void {
    this.logger.log(
      `AH proxy ← ${bapMessageTypeName(message.msgType)} seq=${message.sequence} ` +
        `body=${message.body.length}b`
    );

    switch (message.msgType) {
      case BapMessageType.ClientToBapChannelStartupRequest:
        this.handleChannelStartup(message);
        break;
      case BapMessageType.ClientToBapSecureHelloRequest:
        this.handleSecureHello(message);
        break;
      case BapMessageType.ClientToBapEchoRequest:
        this.handleStatusOnlyReply(
          message,
          BapMessageType.ClientToBapEchoResponse,
          "echo"
        );
        break;
      case BapMessageType.ClientToActivityHostManagerRequest:
        this.handleActivityHostManager(message);
        break;
      case BapMessageType.ClientToActivityHostNotification:
        this.handleActivityHostNotification(message);
        break;
      default:
        this.logger.warn(
          `AH proxy unhandled ${bapMessageTypeName(message.msgType)} ` +
            `seq=${message.sequence} body=${hexPreview(message.body)}`
        );
        break;
    }
  }

  private handleChannelStartup(message: RawBapMessage): void {
    const CHANNEL_MAGIC = Buffer.from("DESTINY\x01", "ascii");

    if (
      message.body.length < 8 ||
      !message.body.subarray(0, 8).equals(CHANNEL_MAGIC)
    ) {
      this.logger.warn(
        `AH proxy channel startup magic mismatch (${message.body.length} bytes)`
      );
    }

    const seed = crypto.randomBytes(120);
    const body = Buffer.concat([CHANNEL_MAGIC, seed]);
    this.send({
      msgType: BapMessageType.ClientToBapChannelStartupResponse,
      sequence: message.sequence,
      body,
    });
    this.logger.log("AH proxy channel startup complete");
  }

  private handleSecureHello(message: RawBapMessage): void {
    const gcmKey = crypto.randomBytes(16);
    const gcmIv = crypto.randomBytes(12);
    const cbcNonce = Buffer.alloc(16, 0);

    const dataRaw = Buffer.concat([gcmIv, gcmKey]);
    const dataEncrypted = aes128CbcEncrypt(
      BAP_SESSION_KEY_AES,
      cbcNonce,
      dataRaw
    );

    const payloadCore = Buffer.alloc(
      4 + cbcNonce.length + dataEncrypted.length
    );
    payloadCore.writeUInt32BE(0x50, 0);
    cbcNonce.copy(payloadCore, 4);
    dataEncrypted.copy(payloadCore, 4 + cbcNonce.length);

    const tag = crypto
      .createHmac("sha256", BAP_SESSION_KEY_HMAC)
      .update(payloadCore)
      .digest();

    const payload = Buffer.concat([payloadCore, tag]);
    this.send({
      msgType: BapMessageType.ClientToBapSecureHelloResponse,
      sequence: message.sequence,
      body: payload,
    });

    this.codec.enableEncryption(gcmKey, gcmIv);
    this.logger.log("AH proxy secure hello complete — GCM enabled");
  }

  private handleActivityHostManager(message: RawBapMessage): void {
    const body = this.manager.handle(message, this.kind, this.host);
    if (!body) {
      if (!this.activityStateSent) this.resolvedRoute = undefined;
      return;
    }
    const current = this.manager.getResolvedRoute(this.kind, this.host);
    if (!this.activityStateSent && current) {
      this.resolvedRoute = current;
    } else if (
      this.activityStateSent &&
      current &&
      this.resolvedRoute &&
      current.generation !== this.resolvedRoute.generation
    ) {
      this.logger.warn(
        `AH proxy retained immutable route generation=${this.resolvedRoute.generation} ` +
          `activity=${this.resolvedRoute.activityId}; ignored later generation=${current.generation}`
      );
    }
    this.send({
      msgType: BapMessageType.ClientToActivityHostManagerResponse,
      sequence: message.sequence,
      body,
    });
  }

  private handleActivityHostNotification(message: RawBapMessage): void {
    const parsed = parseClientToActivityHostNotification(message.body);
    if (!parsed) {
      this.logger.warn(
        `AH proxy notification too short (${message.body.length}B) ` +
          `body=${hexPreview(message.body)}`
      );
      return;
    }

    // The manager assigns one host to this socket. A stale or misrouted
    // notification must not mutate this host's world or allocation state.
    if (parsed.sessionId !== this.host.id) {
      this.logger.warn(
        `AH proxy ignored notification for host=0x${parsed.sessionId.toString(16)} ` +
          `boundHost=0x${this.host.id.toString(16)} kind=${parsed.kind}`
      );
      return;
    }

    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        !this.closed && this.currentSlice === 0) this.actionMission?.incident(parsed.payload);
    if(parsed.kind===ActivityHostMessageType.Incident && this.kind==='FAH' && !this.closed &&
       this.towerAuthOpts().scenario?.activityName==='venus_chapter_2') {
      // venus_portal_1 logs every incident; chapter 2 logged none, so a dialogue
      // trigger that never arrives was indistinguishable from one that arrives
      // and is rejected. Record what the native actually emits.
      const trigger=readChapter2DialogueTrigger(parsed.payload);
      this.logger.log(`D1A_CHAPTER2_INCIDENT bytes=${parsed.payload.length} ` +
        `trigger=${trigger ?? 'none'} ` +
        `armed=${trigger!==undefined && (this.chapter2Dialogue?.retained.has(`29/${trigger}`) ?? false)} ` +
        `payload=${parsed.payload.subarray(0,256).toString('hex')}`);
      this.chapter2Dialogue?.incident(parsed.payload);
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' && !this.closed &&
        this.towerAuthOpts().scenario?.activityName === 'venus_chapter_2' && this.currentSlice === 8 &&
        this.venusCaptainActivationSent && !this.venusOpeningReinforcementsSent &&
        isVenusOpeningReinforcementIncident(parsed.payload)) {
      this.venusOpeningReinforcementsSent = true;
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime: this.activityTicks(), hasAuthorityTable: false,
          senseEntries: buildVenusOpeningMinionEntries(true)}),
        'Chapter2 native pt_reinf35: allocate Squads4/5 populations3/3; no kill or objective credit');
    }
    if(parsed.kind===ActivityHostMessageType.Incident&&this.kind==='FAH'&&!this.closed){
      try {if(awardOrdinaryKill(parsed.payload,{activity:this.towerAuthOpts().scenario?.activityName??'',
        slice:this.currentSlice,connectionKind:0,
        player:eadPlayerIdentity(this.joinIdentity?.character,parsed.sessionId)}))this.logger.log('D1A_ORDINARY_LOOT granted durable native catalog item; local alpha drop policy');}
      catch(error){this.logger.warn(`D1A_ORDINARY_LOOT_FAILED ${String(error)}`);}
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.towerAuthOpts().scenario?.activityName === 'venus_portal_1') {
      this.logger.log(`D1A_STRIKE_INCIDENT bytes=${parsed.payload.length} complete=${parsed.payload.length <= 4096} payload=${parsed.payload.subarray(0,4096).toString('hex')}`);
      const dialogueCue=strikeDialogueTrigger(parsed.payload,this.currentSlice);
      if(dialogueCue)this.playStrikeDialogue(parsed.sessionId,dialogueCue);
      if (this.currentSlice === 7) this.strikeEngineeringRuntime?.observeIncident(parsed.payload);
      if (this.currentSlice === 28) this.strikeRuinsRuntime?.incident(parsed.payload,
        this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice);
      if (this.currentSlice === 5) this.strikeDigSiteRuntime?.incident(parsed.payload,
        this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice);
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        isVenusStrikeEngineeringEntryIncident(parsed.payload,
          this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice ?? -1)) {
      if (this.strikeBacktrack) {
        this.strikeBacktrack.nativeArrival();
        this.restoreEarnedStrikeExit(parsed.sessionId);
        return;
      }
      if (this.strikeEngineeringArrivalObserved) return;
      const player = eadPlayerIdentity(this.joinIdentity?.character, parsed.sessionId);
      if (!player) return;
      this.strikeEngineeringArrivalObserved = true;
      this.logger.log(`D1A_STRIKE_ENGINEERING_NATIVE_ARRIVAL bundle=0A302429 trigger=74 slice=7 payload=${parsed.payload.toString('hex')}`);
      // r420 bounded hypothesis: first wildcard task (host5/client4).
      // Preserve native group165 and placement. Runtime acceptance pending.
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
          senseEntries:[buildVenusStrikeEngineeringTask(4),
            buildVenusStrikeCombatObjective(24,0),buildVenusStrikeCombatObjective(27,1)]}),
        'D1A_STRIKE_TASK_EXPERIMENT Objective1 client4 host5 FA86/123; objective27 0/4; no kill credit');
      this.strikeEngineeringRuntime = new VenusStrikeEngineeringRuntime(
        `engineering/${parsed.sessionId.toString(16)}/${Date.now()}`,
        effect => {
          if (this.closed || this.currentSlice !== 7) return;
          if(effect.kind==='dialogue') {
            const cue=engineeringDialogueCue(effect.sequence);
            if(cue)this.playStrikeDialogue(parsed.sessionId,cue);
            return;
          }
          if (effect.kind === 'startEngineeringTrash') {
            this.strikeEngineeringTrash?.arm(this.towerAuthOpts().scenario?.activityName ?? '',
              this.currentSlice,this.strikeEngineeringRuntime?.servitorKills ?? 0);
            return;
          }
          if (effect.kind === 'phaseComplete') {
            this.armVenusStrikeDigSite(parsed.sessionId);
            return;
          }
          if (effect.kind==='respawn' && [7,8,9,17,18].includes(effect.squad)) {
            this.logger.log(`D1A_STRIKE_CORNER_WILDCARD_HYPOTHESIS squad=${effect.squad} Objective1 task4; authored task mapping unverified`);
          }
          const entries = effect.kind === 'createDoor' || effect.kind === 'doorOpen' || effect.kind === 'deleteDoor'
            ? [buildVenusStrikeExitDoorEntry(effect.kind==='createDoor'?'create':effect.kind==='doorOpen'?'open':'delete')]
            : effect.kind === 'respawn'
            ? [buildVenusStrikeObjectiveAssignedSquadEntry(effect.squad,effect.cumulativePopulation)]
            : effect.kind === 'progress'
              ? [buildVenusStrikeCombatObjective(27,1,effect.current)]
              : (effect.kind === 'objectiveBegin' || effect.kind === 'objectiveEnd') &&
                  (effect.sensor === 24 || effect.sensor === 27)
                ? [buildVenusStrikeCombatObjective(effect.sensor,effect.kind === 'objectiveBegin' ? 1 : 0,
                    this.strikeEngineeringRuntime?.servitorKills ?? 0)]
                : [];
          if (entries.length) this.pushAh(parsed.sessionId,ActivityHostMessageType.SensorAuthUpdate,
            buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:entries}),
            `D1A_STRIKE_ENGINEERING_EFFECT ${JSON.stringify(effect)}`);
          else this.logger.log(`D1A_STRIKE_ENGINEERING_DEFERRED_EFFECT ${JSON.stringify(effect)}; no gameplay credit`);
        }, message => this.logger.log(message), player);
      this.strikeEngineeringRuntime.start();
      return;
    }
    const kindName = isActivityHostMessageType(parsed.kind)
      ? activityHostMessageTypeName(parsed.kind)
      : `ah_${parsed.kind}`;
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 14 && this.venusNorthernArrivalInitialized &&
        !this.venusNorthernEncounterStarted && isVenusGatekeeperEntryIncident(parsed.payload)) {
      this.venusNorthernEncounterStarted = true;
      this.logger.log('Actual Northern trigger153: start native utility gate power-up and drop workers');
      this.chapter2NorthernPortals?.start();
      return;
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 23 && this.venusSouthernArrivalInitialized &&
        !this.venusSouthernInteractionActive && isVenusSouthernEntryIncident(parsed.payload)) {
      this.venusSouthernInteractionActive = true;
      const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
        hasAuthorityTable: false, senseEntries: buildVenusSouthernInteractionEntries() });
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        'Actual Southern entry DD6D986F trigger147; retire64; activate57 and packaged Object0A6D9003/4/8 variant0');
      return;
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 23 && this.venusSouthernInteractionActive &&
        isVenusDeviceInteractionIncident(parsed.payload)) {
      if (this.venusDeviceInteractionCompleted) return;
      this.venusDeviceInteractionCompleted = true;
      // Opening the gates delivered all fourteen squads in this one packet, so
      // every gate's reinforcements arrived together as one mass rather than
      // as waves fed by the gates. Send the gates plus the first wave here and
      // release the rest a wave at a time, skipping gates already destroyed.
      const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
        hasAuthorityTable: false, senseEntries: [
          ...buildVenusDeviceCompletionEntries(),
        ] });
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        'Actual device interaction E882D22F encounter4D675047; retire57; activate kill_warpgates; ' +
        `native gate workers await live actors; ` +
        'sniper placements wait for two actual gate deaths');
      this.chapter2Portals=new Chapter2Portals((entries,label)=>{
        for(const e of entries)if(e.clientRef.typeId===1)this.venusWarpgateSquads.add(e.clientRef.typeIndex);
        this.pushAh(parsed.sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:entries}),
          `D1A_CHAPTER2_PORTAL ${label}`);
      });
      this.chapter2Dialogue?.device();
      return;
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 23 && parsed.payload.length <= 4096) {
      this.logger.log(`Southern native incident ${parsed.payload.length}B payload=${parsed.payload.toString('hex')}`);
      // Native8381BD38 emits E882D22F via83851C48 when the packaged
      // 80802DAA interaction component activates. Only identify its header
      // here; object identity and the remaining layout need a real capture.
      const bytes = parsed.payload;
      if (bytes.length >= 5 && bytes[0] >>> 4 === 1 &&
          (((bytes.readUInt32BE(0) << 4) | (bytes[4] >>> 4)) >>> 0) === 0xe882d22f) {
        this.logger.log(`Southern interaction header E882D22F; identity unverified; no mission credit; payload=${bytes.toString('hex')}`);
      }
    }
    if ((process.env.D1A_VENUS_CAPTAIN_PROBE === '1' ||
         process.env.D1A_VENUS_HEADLANDS_PROBE === '1') &&
        parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 10 && parsed.payload.length <= 4096) {
      this.logger.log(`Venus Headlands native incident ${parsed.payload.length}B payload=${parsed.payload.toString('hex')}`);
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.venusHeadlandsArrivalInitialized && this.currentSlice === 10 &&
        !this.venusCollectFluidsActive && isVenusHeadlandsEntryIncident(parsed.payload)) {
      this.venusCollectFluidsActive = true;
      const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
        hasAuthorityTable: false, senseEntries: [
          ...buildVenusCollectFluidsEntries(), ...buildVenusFluidsEncounterEntries(),
        ] });
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        'Venus native entry incident DD6D986F trigger517641F1/29/137; ' +
        'retire objective18; activate Collect Vex Fluids objective14; ' +
        'enable native Loot17 and Headlands ground Squads24/26/28/30 populations4/4/2/1');
      return;
    }
    if (parsed.kind === ActivityHostMessageType.Incident && this.kind === 'FAH' &&
        this.currentSlice === 10 && this.venusCollectFluidsActive &&
        this.venusFluidProgress.accept(parsed.payload)) {
      const count = this.venusFluidProgress.count;
      this.chapter2Dialogue?.fluids(count);
      const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
        hasAuthorityTable: false, senseEntries: [buildVenusFluidProgressEntry(count)] });
      this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        `Venus native fluid pickup7A0FD954 identifier8C52C41D; ${count}/${VENUS_FLUID_REQUIREMENT}; objective14 HUD progress`);
      if (this.venusFluidProgress.complete) {
        const next = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
          hasAuthorityTable: false, senseEntries: buildVenusFluidCompletionEntries() });
        this.pushAh(parsed.sessionId, ActivityHostMessageType.SensorAuthUpdate, next,
          'Ten real Vex fluid pickups; retire14 and Loot17; activate authored phase02 objective64');
        this.logger.log('Chapter2 fluid objective complete; continue on foot; awaiting native area boundary');
      }
      return;
    }
    if (
      parsed.kind === ActivityHostMessageType.SendClientHeartbeat ||
      parsed.kind === ActivityHostMessageType.ActivityClientKeepaliveRequest ||
      parsed.kind === ActivityHostMessageType.ActivityClientKeepaliveResponse ||
      parsed.kind === ActivityHostMessageType.MembershipAcknowledgement
    ) {
      return;
    }
    if (
      parsed.kind === ActivityHostMessageType.ActivityClientRequestStateRefresh
    ) {
      this.handleStateRefresh(parsed.sessionId, parsed.payload);
      return;
    }
    if (parsed.kind === ActivityHostMessageType.ClientAuthoritativeDataUpdate) {
      this.handleClientAuth(parsed.sessionId, parsed.payload);
      return;
    }
    if (parsed.kind === ActivityHostMessageType.SensorSenseUpdate) {
      this.handleSensorSenseUpdate(parsed.sessionId, parsed.payload);
      return;
    }
    if (
      parsed.kind === ActivityHostMessageType.AbandonEntitySlots ||
      parsed.kind === ActivityHostMessageType.AbdicateAuthority ||
      parsed.kind === ActivityHostMessageType.RequestPurgeEntitySlots
    ) {
      this.logger.log(
        `AH proxy ${kindName} absorbed session=0x${parsed.sessionId.toString(16)} ` +
          `payload=${hexPreview(parsed.payload)}`
      );
      return;
    }
    if (parsed.kind === ActivityHostMessageType.PeerLeaveRequest) {
      const leave = parsePeerLeaveRequest(parsed.payload);
      this.logger.log(
        `AH proxy peer_leave absorbed session=0x${parsed.sessionId.toString(16)} ` +
          `routeGeneration=${this.resolvedRoute?.generation ?? 'none'} ` +
          `descriptor=${leave ? '808044F2' : 'unparsed'} ` +
          (leave ? `field0=${leave.unknown0} field1=${leave.unknown1} peer=${Buffer.from(leave.peer).toString('hex')} ` : '') +
          `payload=${hexPreview(parsed.payload)}`
      );
      return;
    }
    if (parsed.kind === ActivityHostMessageType.FreeEntityIndices) {
      this.handleFreeEntityIndices(parsed.sessionId, parsed.payload);
      return;
    }
    if (parsed.kind === ActivityHostMessageType.AllocateEntityIndices) {
      this.handleAllocateEntityIndices(parsed.sessionId, parsed.payload);
      return;
    }
    if (parsed.kind !== ActivityHostMessageType.JoinRequest) {
      this.logger.warn(
        `AH proxy unhandled ${kindName} ` +
          `session=0x${parsed.sessionId.toString(16)} ` +
          `variant=${parsed.variant} payload=${hexPreview(parsed.payload)}`
      );
      return;
    }

    try {
      const peek = peekJoinRequest(parsed.payload);
      const characters = configuredCharacterStore();
      // The socket's save context is fixed for all asynchronous rewards. A
      // delayed join after character selection must not write into that save
      // using a different character's combat identity.
      if (characters && (!peek || !characters.has(peek.character) ||
          characters.context(peek.character) !== this.characterContext)) {
        throw new Error('Character join does not match this activity save context');
      }
      if (peek) {
        this.joinIdentity = {
          machine: peek.machine,
          player: peek.player,
          account: peek.account,
          character: peek.character,
        };
      }
      const body = buildJoinResultNotification(
        parsed.sessionId,
        parsed.payload
      );
      const seq = this.notifySeq++ >>> 0;
      this.send({
        msgType: BapMessageType.BapToClientActivityNotification,
        sequence: seq,
        body,
        activityHostId: parsed.sessionId,
      });
      this.logger.log(
        `AH proxy join result (seq ${seq.toString(16)}, ` +
          `session=0x${parsed.sessionId.toString(16)}` +
          ` ${this.kind} ` +
          (peek
            ? `nonce=${peek.nonce} ah=0x${peek.activityHostId.toString(16)} ` +
              `account=${peek.account} character=${peek.character} `
            : "") +
          `req ${parsed.payload.length}B rsp ${body.length}B)`
      );
      this.pushJoinState(parsed.sessionId);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AH proxy join result FAILED, absorbed: ${m}`);
    }
  }

  /**
   * Retail: first refresh is GAS + WGS + SensorAuth for the live slice.
   * Join already sent the identity grant. Later refreshes carry the
   * destination bubble; we re-bind PAH to that slice.
   */
  private handleStateRefresh(sessionId: bigint, payload: Buffer): void {
    const opts = this.towerAuthOpts();
    const bubbleCount = opts.scenario?.bubbleCount ?? 5;
    if (this.currentSlice === undefined) {
      this.currentSlice = opts.scenario?.initialBubble ?? 0;
    }
    const hinted = parseStateRefreshSlice(payload, bubbleCount);
    if (this.kind === 'FAH') {
      this.ensureVenusStrikeEngineeringTrash(sessionId,hinted);
      this.strikeEngineeringTrash?.occupiedRefresh(opts.scenario?.activityName ?? '',hinted);
    }
    if (this.kind === 'FAH') this.strikeRuinsRuntime?.occupiedRefresh(
      opts.scenario?.activityName ?? '', this.currentSlice, hinted);
    if (this.kind === 'FAH') this.strikeDigSiteRuntime?.occupiedRefresh(
      opts.scenario?.activityName ?? '', this.currentSlice, hinted);
    const previousSlice =
      hinted !== undefined && hinted !== this.currentSlice
        ? this.currentSlice
        : undefined;
    if (previousSlice !== undefined) {
      this.strikeDialogue?.stop();this.strikeDialogue=undefined;this.strikeDialogueAuth.clear();
      this.strikeRuinsGuidanceShown = false;
      this.strikeBacktrack = this.kind === 'FAH' && hinted === 7 &&
        (this.strikeResume.enabled || this.strikeEngineeringRuntime?.completed)
        ? new StrikeEarnedBacktrack() : undefined;
      if (this.strikeBacktrack) this.strikeEngineeringArrivalObserved = false;
    }
    if (hinted !== undefined) {
      this.currentSlice = hinted;
      this.strikeCheckpoint.observeOccupiedRefresh(hinted);
    }
    // Native sends transition.current only as an optional client-auth delta: it
    // arrives once on the landing receipt and then stays silent while the player
    // walks the mission. Occupied therefore stayed pinned to the landing slice
    // while the registry advanced, the two could never agree again, and every
    // gate behind that agreement (dialogue, arrivals, encounter init) stayed
    // shut for the rest of the run. This refresh is itself the native occupied
    // -area report, so adopt it as the occupied region; the settle handshake in
    // Chapter2AreaReady still decides when the area may actually initialize.
    if (this.kind === 'FAH' && opts.scenario?.activityName === 'venus_chapter_2' &&
        hinted !== undefined) {
      const occupied = opts.scenario?.emptyBubbles?.includes(hinted) ? undefined : hinted;
      if (occupied !== this.chapter2OccupiedSlice) {
        this.chapter2OccupiedSlice = occupied;
        this.logger.log(
          `D1A_CHAPTER2_OCCUPIED_REFRESH slice=${occupied ?? 'none'}; ` +
          `native registry refresh adopted as occupied region`);
      }
      // initializeChapter2OccupiedArea already runs at the end of this refresh,
      // after the registry rebind and apply. Do not start the area here: initial
      // zero rosters must never follow the activation packet.
    }
    this.strikeResume.observeOccupied(hinted);
    this.raidPreview.observeOccupied(hinted);
    this.calderaInsertion.observeOccupied(hinted);
    if (this.currentSlice === this.strikeRequestedSlice) {
      this.logger.log(`D1A_STRIKE_BUBBLE_ARRIVED slice=${this.currentSlice} native_refresh=${payload.toString('hex')}`);
      this.strikeRequestedSlice = undefined;
    }
    if (previousSlice === 8 && this.currentSlice !== 8) {
      this.venusCaptainProgress.resetEncounter();
    }
    if (previousSlice === 23 && this.currentSlice !== 23) {
      this.venusGateProgress.resetObservations();
    }
    if (previousSlice === 14 && this.currentSlice !== 14) {
      this.venusNorthernProgress.resetObservations();
    }
    if (this.currentSlice !== 16) {
      this.stopVenusVexActivation();
    }
    if (this.currentSlice !== 14 && this.venusPortalDropTimer) {
      clearTimeout(this.venusPortalDropTimer);
      this.venusPortalDropTimer = undefined;
    }
    if (this.currentSlice !== 7) {
      this.strikeEngineeringRuntime?.stop();
    }
    if (this.currentSlice !== 9) {
      this.calderaPilotProgress = undefined;
      this.calderaBindingsSent = false;
    }
    if (this.currentSlice !== 23) {
      this.chapter2Portals?.stop();
    }
    if(this.currentSlice!==14)this.chapter2NorthernPortals?.stop();
    this.logger.log(
      `AH proxy state-refresh slice=${this.currentSlice}` +
        (previousSlice === undefined ? "" : ` from=${previousSlice}`) +
        ` hint=${hinted ?? "none"} payload=${hexPreview(payload)}`
    );
    if (this.activityStateSent) {
      this.pushEntityIndexGrant(sessionId);
      const forceMembership = previousSlice !== undefined ||
        (this.venusNorthernTeleportRequested && !this.venusNorthernTeleportCompleted) ||
        (this.venusSouthernTeleportRequested && !this.venusSouthernTeleportCompleted) ||
        (this.venusHeadlandsTeleportRequested && !this.venusHeadlandsTeleportCompleted) ||
        (this.venusEntranceTeleportRequested && !this.venusEntranceTeleportCompleted);
      this.pushMembership(sessionId, forceMembership);
    } else {
      this.pushJoinState(sessionId);
    }
    this.pushActivityGlobals(sessionId);
    // Mission worlds transition into a GAH. It needs the same scenario-driven
    // apply payload as the FAH; ticks alone leave it with no world authority.
    this.pushSensorAuthApply(sessionId, previousSlice);
    this.initializeChapter2OccupiedArea(sessionId);
    this.strikeBacktrack?.registrySent();
    if (this.kind === 'FAH') this.strikeEngineeringTrash?.registrySent(
      opts.scenario?.activityName ?? '',this.currentSlice);
    if (this.kind === 'FAH') this.strikeRuinsRuntime?.registrySent(opts.scenario?.activityName ?? '', this.currentSlice);
    if (this.kind === 'FAH') this.strikeDigSiteRuntime?.registrySent(
      opts.scenario?.activityName ?? '', this.currentSlice);
    if (this.kind === "FAH") {
      this.scheduleInitialSliceRecovery(sessionId);
    }
  }

  /**
   * Tower asks for its declared initial bubble about 16 seconds after the
   * bootstrap slice. Venus Chapter 2 never sends that request, so run the
   * same apply sequence once to test whether bubble 16 can materialize.
   */
  private scheduleInitialSliceRecovery(sessionId: bigint): void {
    const opts = this.towerAuthOpts();
    const initialSlice = opts.scenario?.initialBubble;
    if (
      opts.scenario?.activityName !== "venus_chapter_2" ||
      this.currentSlice !== 2 ||
      initialSlice === undefined ||
      initialSlice === this.currentSlice ||
      this.initialSliceRecovery ||
      this.initialSliceRecoverySent
    ) {
      if (this.currentSlice !== 2) {
        this.stopInitialSliceRecovery();
      }
      return;
    }

    this.logger.log(
      `AH proxy Venus initial-slice recovery scheduled 2→${initialSlice} in 16s`
    );
    this.initialSliceRecovery = setTimeout(() => {
      this.initialSliceRecovery = undefined;
      if (this.closed || this.currentSlice !== 2) {
        return;
      }

      const previousSlice = this.currentSlice;
      this.currentSlice = initialSlice;
      this.initialSliceRecoverySent = true;
      this.logger.log(
        `AH proxy Venus initial-slice recovery slice=${initialSlice} from=${previousSlice}`
      );
      this.pushEntityIndexGrant(sessionId);
      this.pushMembership(sessionId, true);
      this.pushActivityGlobals(sessionId);
      this.pushSensorAuthApply(sessionId, previousSlice);
    this.strikeBacktrack?.registrySent();
    }, 16_000);
  }

  /** Join-result: identity grant, entity-index, GAS/WGS, membership. */
  private pushJoinState(sessionId: bigint): void {
    if (this.activityStateSent) {
      return;
    }
    const start = this.resolvedRoute;
    if (!start) {
      this.logger.warn("AH proxy join rejected: this session has no accepted startup route");
      return;
    }
    this.activityStateSent = true;
    const scenario = start?.scenario;
    this.currentSlice ??= scenario?.initialBubble ?? 0;
    this.pushJoinSensorAuth(sessionId);
    this.pushEntityIndexGrant(sessionId);
    this.pushActivityGlobals(sessionId);
    this.pushMembership(sessionId);
    this.startKeepalive(sessionId);
  }

  private pushActivityGlobals(sessionId: bigint): void {
    const start = this.resolvedRoute;
    if (!start) {
      this.logger.warn("AH proxy globals suppressed: session route is unresolved");
      return;
    }
    const scenario = start?.scenario;
    const gas = buildGlobalActivityStateRsat({
      activityChecksum: scenario?.privateChecksum,
      activityId: start?.activityId,
      activityName: scenario?.activityName,
      bubbleCount: scenario?.bubbleCount,
      emptyBubbles: scenario?.emptyBubbles,
      familyChecksum: scenario?.familyChecksum,
      initialBubble: scenario?.initialBubble,
      instanceId: sessionId,
    });
    const wgs = buildWorldGlobalsStateRsat();
    this.pushAh(
      sessionId,
      ActivityHostMessageType.GlobalActivityState,
      gas,
      `gas ${gas.length}B` +
        (start ? ` start activity=${start.activityId}` : " start=none") +
        (scenario
          ? ` name=${scenario.activityName} bubbles=${scenario.bubbleCount}` +
            (scenario.initialBubble === undefined
              ? ""
              : ` slice=${scenario.initialBubble}`)
          : "")
    );
    this.pushAh(
      sessionId,
      ActivityHostMessageType.WorldGlobalsState,
      wgs,
      `wgs ${wgs.length}B`
    );
  }

  private pushEntityIndexGrant(sessionId: bigint): void {
    const mask = this.host.takeFirstEntityIndexGrant();
    if (!mask) {
      return;
    }
    this.pushAh(
      sessionId,
      ActivityHostMessageType.EntitySlotsAllocated,
      mask,
      `entity-index mask ${mask.length}B`
    );
  }

  private handleClientAuth(sessionId: bigint, payload: Buffer): void {
    this.logger.log(
      `AH proxy client-auth ${payload.length}B session=0x${sessionId.toString(16)} ` +
        `payload=${payload.toString("hex")}`
    );
    try {
      const auth = parseClientAuth(payload);
      if (this.kind === 'FAH' && this.towerAuthOpts().scenario?.activityName === 'venus_chapter_2' && auth?.transition) {
        const t = auth.transition;
        this.logger.log(`D1A_CHAPTER2_TRANSITION occupied=${t.current?.destination ?? 'unchanged'} requested=${t.requested?.destination ?? 'unchanged'} token=${t.kind ?? 'unchanged'} state=${t.state ?? 'unchanged'} registry=${this.currentSlice} pending=${this.strikeRequestedSlice ?? 'none'}`);
      }
      if (this.kind === 'FAH' && this.towerAuthOpts().scenario?.activityName === 'venus_chapter_2') {
        const region = auth?.transition?.current;
        if (region) {
          const scenario = this.towerAuthOpts().scenario!;
          this.chapter2OccupiedSlice = region.destination >= 0 &&
            region.secondaryDestination === region.destination && region.state === 0 &&
            (region.destination & 7) === 0 && (region.destination >>> 3) < scenario.bubbleCount &&
            !scenario.emptyBubbles?.includes(region.destination >>> 3)
            ? region.destination >>> 3 : undefined;
          this.initializeChapter2OccupiedArea(sessionId);

        }
      }
      if(this.kind==='FAH' && this.towerAuthOpts().scenario?.activityName==='venus_chapter_2' &&
         auth?.transition?.state!==undefined && this.currentSlice!==undefined &&
         this.chapter2OccupiedSlice===this.currentSlice) {
        this.chapter2AreaReady?.observe(this.currentSlice,auth.transition.state===0);
      }
      if(this.kind==='FAH'&&this.currentSlice===5&&!this.strikeDigSiteArrivalApplied&&auth){
        this.strikeDigSiteArrivalApplied=true;
        this.pushSensorAuthApply(sessionId);
        this.strikeDigSiteRuntime?.registrySent(this.towerAuthOpts().scenario?.activityName??'',5);
        this.logger.log('D1A_STRIKE_DIG_SITE_POST_LOAD_APPLY native owner5 client-auth');
      }

      // Native optional-field deltas retain the pending region. In particular,
      // the existing Engineering insertion advances its token without sending
      // requested again (r437: current=-1, kind=3, cookie=1).
      const token = auth?.transition?.kind;
      if (!auth?.transition?.requested && this.strikeRequestedSlice !== undefined &&
          token !== undefined && token > 0 && this.strikeRegionTokens[this.strikeRequestedSlice] !== token) {
        this.strikeRegionTokens[this.strikeRequestedSlice] = token;
        this.logger.log(`D1A_STRIKE_TRANSITION_TOKEN destination=${this.strikeRequestedSlice} token=${token}`);
        this.pushMembership(sessionId, true);
      }
      if (auth?.transition?.requested?.destination === -1 && this.strikeRequestedSlice !== undefined) {
        this.logger.log(`D1A_STRIKE_BUBBLE_REQUEST_CANCELLED requested=${this.strikeRequestedSlice}`);
        if (this.strikeRequestedSlice === 28) this.strikeRuinsRuntime?.cancel();
        if (this.strikeRequestedSlice === 5) this.strikeDigSiteRuntime?.cancel();
        this.strikeRequestedSlice = undefined;
        this.strikeCheckpoint.observeCancellation();
        this.pushMembership(sessionId, true);
      }
      const activityName = this.towerAuthOpts().scenario?.activityName ?? '';
      const destination = this.calderaInsertion.requestedBubble(auth?.transition) ?? this.raidPreview.requestedBubble(auth?.transition) ?? requestedStrikeBubble(auth, activityName, this.currentSlice) ??
        requestedChapter2Bubble(auth, activityName, this.currentSlice);
      this.strikeCheckpoint.observeRequest(this.towerAuthOpts().scenario?.activityName ?? '',
        this.currentSlice, destination, auth?.transition?.insertionHash);
      if (this.kind === 'FAH') this.strikeRuinsRuntime?.request(
        this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice, destination);
      if (this.kind === 'FAH') this.strikeDigSiteRuntime?.request(
        this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice, destination);
      if (destination !== undefined && (destination !== this.strikeRequestedSlice ||
          this.strikeRegionTokens[destination] !== auth!.transition!.kind)) {
        this.strikeRegionTokens[destination] = auth!.transition!.kind!;
        this.strikeRequestedSlice = destination;
        this.logger.log(`D1A_NATIVE_BUBBLE_REQUEST activity=${activityName} from=${this.currentSlice} requested=${destination} packed=${auth!.transition!.requested!.destination}; client boundary, no teleport`);
        // Reserve the real requested destination while retaining the occupied
        // area's bindings. Only the later native refresh changes currentSlice.
        this.pushMembership(sessionId, true);
      }
      if (this.strikeCheckpoint.observeTransitionState(this.towerAuthOpts().scenario?.activityName ?? '',
          this.currentSlice, auth?.transition?.state)) {
        this.logger.log('D1A_STRIKE_DIAGNOSTIC_INSERTION requested=7 hash=F9934702 cookie=1; normal route acceptance pending');
        this.pushMembership(sessionId, true);
      }
      const teleport = auth?.teleport;
      if (this.calderaInsertion.observeTeleport(teleport)) {
        this.logger.log('D1A_CALDERA_INSERTION native cookie8 acknowledged; no mission credit');
        this.pushMembership(sessionId,true);
      }
      if (this.raidPreview.observeTeleport(teleport)) {
        this.logger.log('D1A_OUTRO_PREVIEW matching native insertion receipt; no mission credit');
        this.pushMembership(sessionId,true);
      }
      if (this.strikeResume.observeTeleport(teleport)) {
        this.logger.log('D1A_STRIKE_EARNED_RESUME native state3 cookie2 acknowledged');
        this.pushMembership(sessionId,true);
      }
      if (this.strikeCheckpoint.observeTeleport(teleport)) {
        this.logger.log('D1A_STRIKE_DIAGNOSTIC_INSERTION matching state3; acknowledging inactive cookie1');
        this.pushMembership(sessionId, true);
      }
      if (teleport) {
        this.logger.log(`AH proxy native teleport state=${teleport.state} ` +
          `cookie=${teleport.request.a} destination=${teleport.request.b}`);
      }
      if (this.venusNorthernTeleportRequested && !this.venusNorthernTeleportCompleted &&
          teleport?.state === 3 && teleport.request.a === 4 && teleport.request.b === (14 << 3) &&
          teleport.request.c === 0xea2a5ead && teleport.request.d === 0) {
        this.venusNorthernTeleportCompleted = true;
        this.logger.log('Venus Northern native arrival confirmed; cookie4 inactive');
        this.pushMembership(sessionId, true);
      }
      if (this.kind === 'FAH' && this.currentSlice === 14 && this.venusNorthernTeleportCompleted &&
          !this.venusNorthernArrivalInitialized && teleport?.state === 0 &&
          teleport.request.a === 4 && teleport.request.b === (14 << 3) &&
          teleport.request.c === 0xea2a5ead && teleport.request.d === 0) {
        this.initializeChapter2Area(sessionId, 14);
      }
      if (this.venusSouthernTeleportRequested && !this.venusSouthernTeleportCompleted &&
          teleport?.state === 3 && teleport.request.a === 3 && teleport.request.b === (23 << 3) &&
          teleport.request.c === 0xf1c376c0 && teleport.request.d === 0) {
        this.venusSouthernTeleportCompleted = true;
        this.logger.log('Venus Southern native arrival confirmed; cookie3 inactive');
        this.pushMembership(sessionId, true);
      }
      if (this.kind === 'FAH' && this.currentSlice === 23 && this.venusSouthernTeleportCompleted &&
          !this.venusSouthernArrivalInitialized && teleport?.state === 0 &&
          teleport.request.a === 3 && teleport.request.b === (23 << 3) &&
          teleport.request.c === 0xf1c376c0 && teleport.request.d === 0) {
        this.initializeChapter2Area(sessionId, 23);
      }
      if (this.venusHeadlandsTeleportRequested && !this.venusHeadlandsTeleportCompleted &&
          teleport?.state === 3 && teleport.request.a === 2 &&
          teleport.request.b === 80 && teleport.request.c === 0xa5a862c9 &&
          teleport.request.d === 0) {
        this.venusHeadlandsTeleportCompleted = true;
        this.logger.log('AH proxy Headlands native arrival confirmed; acknowledging cookie2 inactive');
        this.pushMembership(sessionId, true);
      }
      if (this.kind === 'FAH' && this.currentSlice === 10 &&
          this.venusHeadlandsTeleportCompleted && !this.venusHeadlandsArrivalInitialized &&
          teleport?.state === 0 && teleport.request.a === 2 &&
          teleport.request.b === 80 && teleport.request.c === 0xa5a862c9 &&
          teleport.request.d === 0) {
        this.initializeChapter2Area(sessionId, 10);
      }
      if (this.venusEntranceTeleportRequested && !this.venusEntranceTeleportCompleted &&
          teleport?.state === 3 && teleport.request.a === 1 &&
          teleport.request.b === 64 && teleport.request.c === 0x5e9604e6 &&
          teleport.request.d === 0) {
        // 829EBF60 releases the native transition only after matching state3
        // and inactive host state. Preserve cookie to prevent a new request.
        this.venusEntranceTeleportCompleted = true;
        this.logger.log("AH proxy native teleport completed by client; acknowledging cookie1 host inactive");
        this.pushMembership(sessionId, true);
      }
      if (this.kind === 'FAH' && this.currentSlice === 8 &&
          this.venusEntranceTeleportCompleted && !this.venusCaptainActivationSent &&
          teleport?.state === 0 && teleport.request.a === 1 &&
          teleport.request.b === 64 && teleport.request.c === 0x5e9604e6 &&
          teleport.request.d === 0) {
        this.initializeChapter2Area(sessionId, 8);
      }
    } catch (error) {
      this.logger.warn(`AH proxy client-auth decode rejected: ${String(error)}`);
    }
    this.scheduleVenusVexActivation(sessionId);
    this.scheduleTowerVendorActivation(sessionId);

  }

  private handleSensorSenseUpdate(sessionId: bigint, payload: Buffer): void {
    if (this.kind === 'FAH' && this.currentSlice === 0) this.actionMission?.sense(payload);
    if (this.kind==='FAH' && this.currentSlice===16 && this.calderaInsertion.enabled && !this.calderaInsertion.scheduled) {
      this.calderaInsertion.scheduled = true;
      setTimeout(() => {
        if (this.closed || !this.calderaInsertion.begin(this.towerAuthOpts().scenario?.activityName??'',this.currentSlice)) return;
        this.strikeRequestedSlice = 9;
        this.strikeRegionTokens[9] = this.strikeRegionTokens[16] ?? 1;
        this.pushMembership(sessionId,true);
        this.logger.log('D1A_CALDERA_INSERTION requested9 default2EA8FB98; awaiting native arrival');
      // Allow the initial player handoff before this opt-in transfer.
      // Both 10s and 60s failed without all40 pending registry bindings;
      // the complete-init run validated60s plus the full binding repair.
      },60000);
    }
    if (this.kind === 'FAH' && this.currentSlice === 9 &&
        this.towerAuthOpts().scenario?.activityName === 'venus_chapter_2') {
      for (const row of decodeCalderaPilotPacket(payload)?.rows ?? []) {
        if (row.bundle !== CALDERA_PILOT.bundle || row.type !== CALDERA_PILOT.typeId ||
            row.index !== CALDERA_PILOT.typeIndex) continue;
        const state = {
          generation: row.generation, revision: undefined, script: row.script,
          dropSequence: row.dropSequence, dropping: row.dropPending!, dropRevision: undefined,
          terminal: row.terminal!, bound: row.bound!, sequence: row.sequence,
        };
        if (!this.calderaPilotProgress && state.generation !== undefined && state.bound && !state.terminal) {
          this.calderaPilotProgress = new ActorScriptProgress(state.generation, state);
          this.logger.log(`D1A_CALDERA_PILOT_BOUND generation=${state.generation} sequence=${state.sequence}`);
        } else {
          this.calderaPilotProgress?.observe(state);
        }
      }
    }
    if(this.kind==='FAH' && this.currentSlice===3 && this.raidPreview.enabled && !this.raidPreview.scheduled) {
      this.raidPreview.scheduled=true;
      setTimeout(()=>{
        if(this.closed || !this.raidPreview.begin(this.towerAuthOpts().scenario?.activityName??'',this.currentSlice))return;
        this.strikeRequestedSlice=1;
        this.strikeRegionTokens[1]=this.strikeRegionTokens[3]??1;
        this.pushMembership(sessionId,true);
        this.logger.log('D1A_OUTRO_PREVIEW target=1 insertion=2EA8FB98 default; awaiting native arrival');
      },10000);
    }
    if (this.kind === 'FAH' && this.currentSlice === 7 && this.strikeBacktrack) {
      this.strikeBacktrack.observe(payload);this.restoreEarnedStrikeExit(sessionId);
    }
    if (this.kind === 'FAH' && [5,7].includes(this.currentSlice ?? -1) && this.strikeRuinsRuntime && !this.strikeRuinsGuidanceShown) {
      this.showStrikeRuinsGuidance(sessionId);
    }
    // A native Sense follows initial apply; settle Guardian startup before insertion.
    if(this.kind==='FAH'&&this.currentSlice===16&&this.strikeResume.enabled&&!this.strikeResumeScheduled){
      this.strikeResumeScheduled=true;
      this.logger.log('D1A_STRIKE_EARNED_RESUME native initial Sense received; startup settling');
      setTimeout(()=>{
        if(this.closed||this.currentSlice!==16)return;
        const opts=this.towerAuthOpts();
    if (this.kind === 'FAH' && this.strikeResume.begin(opts.scenario?.activityName ?? '',this.currentSlice)) {
      this.strikeRequestedSlice=5;
      this.strikeRegionTokens[5]=this.strikeRegionTokens[16] ?? 1;
      this.armVenusStrikeDigSite(sessionId,true);
      this.pushMembership(sessionId,true);
      this.logger.log('D1A_STRIKE_EARNED_RESUME target=5; recorded r437 4/4 and arrival; awaiting native refresh and bindings');
    }

      },10000);
    }

    if (this.kind === 'FAH') this.strikeEngineeringTrash?.observe(payload,
      this.towerAuthOpts().scenario?.activityName ?? '',this.currentSlice);
    if (this.kind === 'FAH') this.strikeRuinsRuntime?.observe(payload,
      this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice);
    if (this.kind === 'FAH') this.strikeDigSiteRuntime?.observe(payload,
      this.towerAuthOpts().scenario?.activityName ?? '', this.currentSlice);
    if (this.kind === 'FAH' && this.currentSlice === 7 &&
        this.towerAuthOpts().scenario?.activityName === 'venus_portal_1') {
      this.strikeEngineeringRuntime?.observe(payload);
    }
    if(this.kind==='FAH'&&this.currentSlice===14&&this.venusGatekeeperActivated&&
       this.towerAuthOpts().scenario?.activityName==='venus_chapter_2'){
      for(const h of readVenusNorthernSense(payload)?.health??[])
        this.logger.log(`D1A_BOSS_HEALTH_SENSE value0=${h.value0} value1=${h.value1} command=${h.revision} sequence=${h.sequence}; field semantics awaiting combat capture`);
    }
    if (this.kind === 'FAH' && this.currentSlice === 14 && this.venusNorthernArrivalInitialized &&
        this.venusNorthernProgress.observe(payload)) {
      const complete = this.venusNorthernProgress.complete;
      if(complete&&this.chapter2Dialogue){
        this.chapter2Finale??=new Chapter2Finale(this.chapter2Dialogue,(entry,label)=>{
          if(this.closed||this.currentSlice!==14)return;
          this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
            buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:[entry]}),label);
        });
        this.chapter2Finale.bossDefeated();
        const packetId=createHash('sha256').update(payload).digest('hex');
        try {
          if(grantChapter2BossReward({activity:'venus_chapter_2',boss:81,gates:[...this.venusNorthernProgress.defeatedGates],
            packetId,actorKey:`chapter2/${sessionId.toString(16)}/81`}))rewardEvents.emit('awarded');
        }catch(error){this.logger.error(`D1A_CHAPTER2_REWARD_FAILED ${String(error)}`);}
      }
      let entries = complete ? []
        : buildVenusNorthernGateEntries(this.venusNorthernProgress.defeatedGates);
      if (this.venusNorthernProgress.defeatedGates.length === 2 && !this.venusGatekeeperActivated) {
        this.venusGatekeeperActivated = true;
        this.chapter2Dialogue?.bossGates();
        // phase03: gatekeeper_spawn begins the boss objective and wakes the
        // d030/d040 worker. 114 (kill_gates complete) is queued first above,
        // so the queue plays 114 -> 115 -> 116 in authored order.
        this.chapter2Dialogue?.gatekeeperSpawned();
        entries.push(...buildVenusGatekeeperActivationEntries(true));
        // Coalesced Health152 now has a bounded decoder. Keep observation
        // opt-in until a combat capture verifies the two float semantics.
        if (process.env.D1A_BOSS_HEALTH_BIND === '1') {
          entries.push(buildVenusGatekeeperHealthBinding());
          this.logger.log('D1A_BOSS_HEALTH_BIND producer-only Health152 -> Actor81; ' +
            'floats -1.0 retained, command sequence 0, no health write requested');
        }
      }
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:entries}),
        complete ? 'Actual post-gates Gatekeeper defeat: boss reward checked; authored shutdown sequence started'
          : `Authored Northern gate-before-boss progress ${this.venusNorthernProgress.defeatedGates.length}/2`);
    }
    if(this.kind==='FAH'&&this.currentSlice===14)this.chapter2Finale?.observe(readVenusNorthernSense(payload));
    if (this.kind === 'FAH' && this.currentSlice === 23 && this.venusDeviceInteractionCompleted) {
      // Credit needs a terminal gate Actor AND its paired squad reporting zero
      // live. When a gate visibly breaks without counting, nothing was logged
      // at all, so record what the native reported and why it fell short.
      const sense = readVenusGateSense(payload);
      if (sense?.actors.length) {
        const before = this.venusGateProgress.count;
        this.logger.log(
          `D1A_GATE_SENSE actors=[${sense.actors.map(a =>
            `${a.index}:terminal=${a.terminal} bound=${a.bound} seq=${a.sequence}` +
            `${a.generation === undefined ? '' : ` gen=${a.generation}`}`).join(' | ')}] ` +
          `squads=[${sense.squads.map(s =>
            `${s.index}:live=${s.live ?? '?'} valid=${s.valid} seq=${s.sequence}`).join(' | ')}] ` +
          `credited=${before}/4`);
      }
      if (this.venusGateProgress.observe(payload)) {
        this.chapter2Dialogue?.gates(this.venusGateProgress.count);
        if(this.venusGateProgress.count===2)this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
            senseEntries:buildVenusSouthernSniperEntries(true)}),
          'Chapter2 two actual gate deaths: authored sniper placements; no kill credit');
        this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(), hasAuthorityTable: false,
            senseEntries: buildVenusGateProgressEntries(this.venusGateProgress.count, this.venusGateProgress.defeatedActors) }),
          `Venus actual gate terminal + zero-live squad ${this.venusGateProgress.count}/4; ` +
          (this.venusGateProgress.complete ? 'retire60; authored phase03 objective112; no travel or reward credited' : 'update objective60'));
        if (this.venusGateProgress.complete) {
          this.logger.log('Four actual gate deaths: objective112; continue on foot to Northern; no teleport or reward');
        }
      }
    } else this.venusGateProgress.resetObservations();
    if (this.kind === 'FAH' && this.currentSlice === 23 &&
        this.towerAuthOpts().scenario?.activityName === 'venus_chapter_2') {
      this.chapter2Dialogue?.southernSense(readVenusGateSense(payload));
      this.chapter2Portals?.observe(readVenusGateSense(payload),this.venusGateProgress.count);
    }
    if(this.kind==='FAH'&&this.currentSlice===14)this.chapter2NorthernPortals?.observe(readVenusNorthernSense(payload),0);
    if (this.kind === 'FAH' && this.currentSlice === 10 && this.venusCollectFluidsActive &&
        !this.venusFluidProgress.complete) {
      this.venusHeadlandsRespawn.observe(payload, Date.now());
    } else {
      this.venusHeadlandsRespawn.resetObservations();
    }
    const payloadHex = payload.toString("hex");
    this.logger.log(
      `AH proxy sensor_sense_update session=0x${sessionId.toString(16)} ` +
        `payload=${payloadHex}`
    );
    if (this.kind === 'FAH' && this.venusCaptainActivationSent && this.currentSlice === 8) {
      if (this.venusCaptainProgress.observe(payload)) {
        const update = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
          hasAuthorityTable: false, senseEntries: buildVenusCaptainFollowupEntries() });
        this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate, update,
          'Venus Captain terminal member transition 44FB7AA2/1/1; ' +
          'retire Captain objective 517641F1/32/7; activate Enter Vex Territory 517641F1/32/18');
        this.chapter2Dialogue?.phaseOne();
        this.chapter2Dialogue?.captainDefeated();
        this.logger.log('Chapter2 Captain defeated; continue on foot toward Vex territory; no checkpoint teleport');
      }
    } else {
      this.venusCaptainProgress.resetEncounter();
    }
    // Native Chapter 2 reports first-encounter Vex squad 3 up through sequence
    // 3 before placement. Latch that exact same-encounter signal; do not echo
    // the client-to-host sense packet.
    if (payloadHex.startsWith("31986286c14001c2")) {
      // r344: the runtime sends squad acknowledgement after Phase B, not
      // another class21 packet. Request once from this observed callback.
      // A squad readiness acknowledgement is not mission completion. Keep the
      // preserved captain diagnostic opt-in so ordinary Venus stays playable.
      // Isolated test checkpoint: this requests real travel, never a Captain
      // death or loot credit. The ordinary Captain path is unchanged when off.
      if (process.env.D1A_VENUS_NORTHERN_PROBE === '1' &&
          this.venusVexActivationSent && !this.venusNorthernTeleportRequested) {
        this.venusNorthernTeleportRequested = true;
        this.logger.log('Diagnostic Northern arrival only, recovery from preserved r407 four-gate proof; no synthetic kills, loot or completion');
        this.pushMembership(sessionId, true);
      }
      if (process.env.D1A_VENUS_SOUTHERN_PROBE === "1" &&
          this.kind === "FAH" && this.currentSlice === 16 &&
          this.venusVexActivationSent && !this.venusSouthernTeleportRequested) {
        this.venusSouthernTeleportRequested = true;
        this.logger.log('Diagnostic Southern arrival only; no kill, fluid pickup or mission completion credited');
        this.pushMembership(sessionId, true);
      } else if (process.env.D1A_VENUS_HEADLANDS_PROBE === "1" &&
          this.kind === "FAH" && this.currentSlice === 16 &&
          this.venusVexActivationSent && !this.venusHeadlandsTeleportRequested) {
        this.venusHeadlandsTeleportRequested = true;
        this.logger.log("AH proxy diagnostic Headlands checkpoint; native travel cookie2; no Captain completion credited");
        this.pushMembership(sessionId, true);
      } else if (process.env.D1A_VENUS_CAPTAIN_PROBE === "1" &&
          this.kind === "FAH" && this.currentSlice === 16 &&
          this.venusVexActivationSent && !this.venusEntranceTeleportRequested) {
        this.venusEntranceTeleportRequested = true;
        this.logger.log("AH proxy Venus entrance native teleport request cookie=1 handle=64 insertion=5E9604E6 phase00.entrance mask=0 after squad3 acknowledgement");
        this.pushMembership(sessionId, true);
      }
      const firstReadiness = !this.venusVexObjectiveReadinessLatched;
      this.venusVexObjectiveReadinessLatched = true;
      if (firstReadiness) {
        this.logger.log(
          "AH proxy Venus objective readiness latched from 8CC31436/1/3"
        );
      }
      this.scheduleVenusVexObjectiveActivation(
        sessionId,
        "after native squad-3 readiness acknowledgement"
      );
    }

  }

  private scheduleVenusVexObjectiveActivation(
    sessionId: bigint,
    reason: string
  ): void {
    if (
      !this.venusVexActivationSent ||
      !this.venusVexObjectiveReadinessLatched ||
      this.venusVexObjectiveActivationSent ||
      this.venusVexActivation !== undefined
    ) {
      return;
    }

    this.logger.log(
      `AH proxy Venus Vex objective activation scheduled in 500ms ${reason}`
    );
    this.venusVexActivation = setTimeout(() => {
      this.venusVexActivation = undefined;
      this.pushVenusVexObjectiveActivation(sessionId);
    }, 500);
  }

  private pushVenusVexObjectiveActivation(
    sessionId: bigint,
    schedulePlayerMonitor = true
  ): void {
    const opts = this.towerAuthOpts();
    if (
      this.closed ||
      this.kind !== "FAH" ||
      opts.scenario?.activityName !== "venus_chapter_2" ||
      this.currentSlice !== 16 ||
      this.venusVexObjectiveActivationSent
    ) {
      return;
    }

    const entries = buildVenusVexObjectiveActivationSenseEntries(0);
    if (entries.length !== 1) {
      this.logger.warn("AH proxy Venus Vex objective activation row unavailable");
      return;
    }

    this.venusVexObjectiveActivationSent = true;
    const rsat = buildSensorAuthUpdateRsat({
      activityTime: this.activityTicks(),
      hasAuthorityTable: false,
      senseEntries: entries,
    });
    this.pushAh(
      sessionId,
      ActivityHostMessageType.SensorAuthUpdate,
      rsat,
      `sensor-auth ${rsat.length}B FAH Venus Vex objective=1 count=1 ` +
        `Phase-C after-squad-commit absolute seq=0`
    );
    if (!schedulePlayerMonitor) {
      return;
    }
    this.logger.log(
      "AH proxy Venus Vex PlayerMonitor received-state scheduled in 500ms"
    );
    this.venusVexActivation = setTimeout(() => {
      this.venusVexActivation = undefined;
      this.pushVenusVexPlayerMonitorReceivedState(sessionId);
    }, 500);
  }

  private pushVenusVexPlayerMonitorReceivedState(sessionId: bigint): void {
    const opts = this.towerAuthOpts();
    if (
      this.closed ||
      this.kind !== "FAH" ||
      opts.scenario?.activityName !== "venus_chapter_2" ||
      this.currentSlice !== 16 ||
      this.venusVexPlayerMonitorActivationSent
    ) {
      return;
    }

    const entries = buildVenusVexPlayerMonitorReceivedSenseEntries(0);
    if (entries.length !== 1) {
      this.logger.warn("AH proxy Venus Vex PlayerMonitor row unavailable");
      return;
    }

    this.venusVexPlayerMonitorActivationSent = true;
    const rsat = buildSensorAuthUpdateRsat({
      activityTime: this.activityTicks(),
      hasAuthorityTable: false,
      senseEntries: entries,
    });
    this.pushAh(
      sessionId,
      ActivityHostMessageType.SensorAuthUpdate,
      rsat,
      `sensor-auth ${rsat.length}B FAH Venus Vex PlayerMonitor=33 count=1 ` +
        `Phase-D received=1 flags=0 absolute seq=0`
    );
  }

  // TODO: Entity Indices
  /**
   * FreeEntityIndices (class 20). Retail Tower capture never sent this.
   */
  private handleFreeEntityIndices(sessionId: bigint, payload: Buffer): void {
    this.host.noteEntityIndicesFreed(payload);
    this.logger.log(
      `AH proxy free_entity_indices absorbed session=0x${sessionId.toString(16)} ` +
        `mask=${payload.length}B`
    );
  }

  /**
   * AllocateEntityIndices (class 19), not sure what these are for yet.
   */
  private handleAllocateEntityIndices(
    sessionId: bigint,
    payload: Buffer
  ): void {
    const count = payload.length >= 4 ? payload.readUInt32BE(0) >>> 0 : 0;
    const { grant, granted, source } = this.host.takeAllocateEntityIndexGrant(count);
    this.pushAh(
      sessionId,
      ActivityHostMessageType.EntitySlotsAllocated,
      grant,
      `allocate-entity-indices count=${count} granted ${granted} via ${source} ` +
        `mask ${grant.length}B`
    );
  }

  /**
   * SensorAuth activity ticks @ 30 Hz. 0 stalls combatant place.
   * Visual TOD is GAS worldServerTime, not this.
   */

  /** Require both the native occupied-region receipt and its registry refresh.
   * A preload/request alone cannot start an encounter or credit a checkpoint. */
  /** Pacing between warpgate waves. Authored wave timing is not recorded
   * anywhere in the captures, so this is a chosen interval, not an observed
   * one: long enough to read as successive reinforcements rather than a drop. */
  private stopVenusWarpgateWaves(): void { this.chapter2Portals?.stop(); this.chapter2NorthernPortals?.stop(); }

  private initializeChapter2OccupiedArea(sessionId: bigint): void {
    if(this.kind!=="FAH" || this.towerAuthOpts().scenario?.activityName!=="venus_chapter_2")return;
    if(this.chapter2OccupiedSlice===undefined || this.chapter2OccupiedSlice!==this.currentSlice) {
      this.chapter2AreaReady?.leave();return;
    }
    this.chapter2AreaReady??=new Chapter2AreaReady(slice=>{
      if(this.closed||slice!==this.currentSlice||slice!==this.chapter2OccupiedSlice)return;
      // Rebind after loading has settled, then send initial encounter deltas.
      // Initial zero rosters must never follow the activation packet.
      this.pushSensorAuthApply(sessionId);
      this.applyChapter2OccupiedArea(sessionId);
      this.logger.log(`D1A_CHAPTER2_SETTLED_APPLY slice=${slice}; occupied registry plus native completion or bounded fallback; runtime acceptance pending`);
    });
    this.chapter2AreaReady.observe(this.chapter2OccupiedSlice);
  }

  private applyChapter2OccupiedArea(sessionId:bigint):void {
    const slice = this.chapter2OccupiedSlice;
    if (slice === undefined) return;
    if (slice === 9 && !this.calderaBindingsSent) {
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
          senseEntries:buildCalderaInitialBindingEntries()}),
        'D1A_CALDERA_INITIAL_BINDINGS 40 native pending records; no event activation');
      this.calderaBindingsSent = true;
    }
    if(this.raidPreview.enabled) {
      if(slice===29 && !this.raidPreview.started) {
        this.raidPreview.started=true;
        this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
            senseEntries:[buildRaidEntranceObject(0),buildRaidEntranceObject(1),...buildRaidEntranceEntries()]}),
          'D1A_RAID_PREVIEW entrance: native 14-enemy population, gate and pillar; visible acceptance pending');
        setTimeout(()=>{
          if(this.closed||this.currentSlice!==29)return;
          this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
            buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
              senseEntries:[buildRaidEntranceObject(0,true)]}),
            'D1A_RAID_PREVIEW open exploration gate; no pillar success, kill or completion fabricated');
        },3000);
      }
      return;
    }
    if (!this.chapter2OpeningStarted) {
      this.chapter2OpeningStarted = true;
      this.enterChapter2Dialogue(sessionId, slice);
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime: this.activityTicks(), hasAuthorityTable:false,
          senseEntries:[buildVenusPlayerObjectiveEntry(7,1)]}),
        'Chapter2 phase00 opening objective at native occupied landing; no remote encounter activation');
    }
    this.enterChapter2Dialogue(sessionId, slice);
    if(slice===21 && !this.chapter2TransitAmbientStarted) {
      this.chapter2TransitAmbientStarted=true;
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
          senseEntries:buildVenusTransitAmbientEntries()}),
        'Chapter2 Shattered Coast authored ground encounters13/15/17; runtime acceptance pending');
    }
    if(slice===7 && !this.chapter2EngineeringAmbientStarted) {
      this.chapter2EngineeringAmbientStarted=true;
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
          senseEntries:buildVenusEngineeringAmbientEntries()}),
        'Chapter2 native Engineering arrival: five authored ambient encounters, eight two-slot squads');
    }
    if (slice === 8 || (slice === 10 && this.venusCaptainProgress.complete) ||
        (slice === 23 && this.venusFluidProgress.complete) ||
        (slice === 14 && this.venusGateProgress.complete)) this.initializeChapter2Area(sessionId, slice);
  }

  private initializeChapter2Area(sessionId: bigint, slice: number): void {
    if (slice === 14 && !this.venusNorthernArrivalInitialized) {
      this.venusNorthernArrivalInitialized = true;
      this.chapter2NorthernPortals=new Chapter2Portals((entries,label)=>{
        this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:entries}),
          `D1A_CHAPTER2_NORTHERN_PORTAL ${label}`);
      },Math.random,true);
      this.enterChapter2Dialogue(sessionId,14);
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime: this.activityTicks(), hasAuthorityTable: false,
          senseEntries: buildVenusNorthernArrivalEntries()}),
        'Northern arrival: authored pre-boss two-gate objective123; boss remains inactive');
    }
    if (slice === 23 && !this.venusSouthernArrivalInitialized) {
      this.venusSouthernArrivalInitialized = true;
      this.enterChapter2Dialogue(sessionId,23);
      const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
        hasAuthorityTable: false, senseEntries: buildVenusSouthernArrivalEntries() });
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        'Southern Tides post-arrival objective64 and native Location329 trigger147');
    }
    if (slice === 10 && !this.venusHeadlandsArrivalInitialized) {
      this.venusHeadlandsArrivalInitialized = true;
      this.enterChapter2Dialogue(sessionId,10);
      const rsat = buildSensorAuthUpdateRsat({ hasAuthorityTable: false,
        activityTime: this.activityTicks(), senseEntries: buildVenusHeadlandsArrivalEntries() });
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
        'Headlands post-arrival initialization: five triggers, local sequences and objective18');
    }
    if (slice === 8 && !this.venusCaptainActivationSent) {
      this.venusCaptainActivationSent = true;
      // Called only after the native occupied region and registry agree, or
      // after the explicit diagnostic teleport has completed its handshake.
      this.enterChapter2Dialogue(sessionId,8);
      // Reinforcements still require their separate native pt_reinf event.
      for (const entry of [...buildVenusCaptainActivationEntries(),
        ...buildVenusOpeningMinionEntries(), buildVenusOpeningReinforcementTrigger()]) {
        const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
          hasAuthorityTable: false, senseEntries: [entry] });
        this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
          `Venus captain authored activation bundle=44FB7AA2 type=${entry.clientRef.typeId} ` +
          `index=${entry.clientRef.typeIndex} after native arrival; Captain and authored opening minions`);
      }
    }
  }

  private enterChapter2Dialogue(sessionId:bigint,slice:number):void {
    if(this.raidPreview.enabled)return;
    if(this.closed||this.kind!=='FAH'||this.towerAuthOpts().scenario?.activityName!=='venus_chapter_2')return;
    this.chapter2Dialogue??=new Chapter2Dialogue(()=>this.activityTicks(),(entry,label)=>{
      if(this.closed)return;
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:[entry]}),
        `D1A_CHAPTER2_DIALOGUE ${label}`);
    });
    if(slice===14)this.chapter2Finale??=new Chapter2Finale(this.chapter2Dialogue,(entry,label)=>{
      if(this.closed||this.currentSlice!==14)return;
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:[entry]}),label);
    });
    this.chapter2Dialogue.enter(slice);
  }
  private playStrikeDialogue(sessionId:bigint,cue:StrikeDialogueCue):void {
    if(this.closed||this.kind!=='FAH'||this.towerAuthOpts().scenario?.activityName!=='venus_portal_1')return;
    const slice=this.currentSlice;
    this.strikeDialogue??=new StrikeDialoguePlayback(next=>{
      if(this.closed||this.currentSlice!==slice)return;
      const tick=this.activityTicks();
      const entry=strikeDialogueEntry(next,tick);
      this.strikeDialogueAuth.set(entry.clientRef.typeIndex,entry);
      this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:tick,hasAuthorityTable:false,senseEntries:[entry]}),
        `D1A_STRIKE_DIALOGUE_PLAYBACK_REQUEST cue=${next}; native playback1; audible completion unverified`);
    });
    this.strikeDialogue.enqueue(cue);
  }

  private activityTicks(): number {
    if (!this.activityClockStarted) {
      this.activityClockStarted = Date.now();
    }
    return (
      1 + Math.floor((Date.now() - this.activityClockStarted) / (1000 / 30))
    );
  }

  private towerAuthOpts() {
    return {
      activityTime: this.activityTicks(),
      authorityMachine: this.joinIdentity?.machine,
      playerKey: playerKeyFromCharacter(this.joinIdentity?.character),
      scenario: this.resolvedRoute?.scenario,
    };
  }

  /**
   * State-refresh apply: identity + current-slice squads + leftover Some.
   * hasAuth=0. Do not None the previous slice's type-1.
   */
  private pushSensorAuthApply(
    sessionId: bigint,
    previousSlice?: number
  ): void {
    const opts = this.towerAuthOpts();
    const slice = this.currentSlice ?? opts.scenario?.initialBubble ?? 0;
    if (
      opts.scenario?.activityName === "city_tower_default1" &&
      previousSlice !== undefined
    ) {
      this.towerVendorActivationSentSlices.delete(slice);
    }
    const rsat = buildTowerSensorAuthRsat({
      ...opts,
      grantTable: false,
      slice,
      stageTowerVendors: !this.towerVendorActivationSentSlices.has(slice),
      includeTowerAmbientNpcs: process.env.D1A_TOWER_AMBIENT_NPCS === '1',
      stageActionMockCombat: !this.actionMission?.started,
      actionMissionAuth: this.actionMission?.started ? [...this.actionMission.retained.values()] : undefined,
      raidPreviewStarted: this.raidPreview.started,
      strikeEngineeringStarted: this.strikeEngineeringArrivalObserved,
      strikeEngineeringAllocatedSquads: this.strikeBacktrack ? [] : this.strikeEngineeringRuntime?.allocatedSquads,
      strikeEngineeringServitorKills: this.strikeBacktrack ? 0 : this.strikeEngineeringRuntime?.servitorKills,
      strikeEngineeringExitDoorStage: this.strikeBacktrack ? (this.strikeBacktrack.restored ? 'open' as const : undefined) : this.strikeEngineeringRuntime?.exitDoorStage,
      strikeEngineeringCompleted: this.strikeBacktrack?.restored || this.strikeEngineeringRuntime?.completed,
      strikeRuinsGuidance: this.strikeRuinsGuidanceShown && (slice === 5 || slice === 7),
      strikeEngineeringTrashAllocatedSquads: this.strikeEngineeringTrash?.allocatedSquads,
      strikeDigSiteState: this.strikeDigSiteRuntime?.refreshState(slice),
      strikeRuinsState: this.strikeRuinsRuntime?.refreshState(slice),
      strikeDialogueAuth: [...this.strikeDialogueAuth.values()],
      chapter2DialogueAuth: [...(this.chapter2Finale?.retained.values()??[]),...(this.chapter2Dialogue?.retained.values()??[]),...(this.chapter2Portals?.retained.values()??[]),...(this.chapter2NorthernPortals?.retained.values()??[])],
      venusFluidCount: this.venusFluidProgress.count,
      venusNorthernDefeatedGates: this.venusNorthernProgress.defeatedGates,
      venusGatekeeperActivated: this.venusGatekeeperActivated,
      venusGateCount: this.venusGateProgress.count,
      venusWarpgateSquads: [...this.venusWarpgateSquads],
      venusDefeatedGates: this.venusGateProgress.defeatedActors,
      venusHeadlandsAllocations: this.venusCollectFluidsActive ? this.venusHeadlandsRespawn.allocations : undefined,
      venusEngineeringAmbientStarted: this.chapter2EngineeringAmbientStarted,
      venusTransitAmbientStarted: this.chapter2TransitAmbientStarted,
      venusOpeningMinions: this.venusCaptainActivationSent ? {reinforcements: this.venusOpeningReinforcementsSent} : undefined,
      venusMissionObjective: this.chapter2Finale?.complete ? 127 : this.venusGatekeeperActivated ? 120 : this.venusNorthernArrivalInitialized ? 123 : this.venusGateProgress.complete ? 112 : this.venusDeviceInteractionCompleted ? 60 : this.venusSouthernInteractionActive ? 57 : this.venusFluidProgress.complete || this.venusSouthernTeleportRequested ? 64 : this.venusCollectFluidsActive ? 14 : this.venusCaptainProgress.complete || this.venusHeadlandsTeleportRequested ? 18
        : this.chapter2OpeningStarted ? 7 : undefined,
    });
    this.pushAh(
      sessionId,
      ActivityHostMessageType.SensorAuthUpdate,
      rsat,
      `sensor-auth ${rsat.length}B ${this.kind} spawn=tower apply hasAuth=0 ` +
        `slice=${slice}`
    );
    this.armVenusVexActivation(slice, previousSlice);
    this.armTowerVendorActivation(slice, previousSlice);
    this.armActionMission(sessionId, slice);
  }

  private ensureVenusStrikeEngineeringTrash(sessionId:bigint,hinted:number|undefined):void {
    if (this.closed||this.kind!=='FAH'||hinted!==7||this.strikeEngineeringTrash||
        this.towerAuthOpts().scenario?.activityName!=='venus_portal_1')return;
    this.strikeEngineeringTrash=new VenusStrikeEngineeringTrash(
      `engineering-trash/${sessionId.toString(16)}/${Date.now()}`,squad=>{
        if(this.closed||this.kind!=='FAH'||this.currentSlice!==7||
            this.towerAuthOpts().scenario?.activityName!=='venus_portal_1')return;
        this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
            senseEntries:[buildVenusStrikeEngineeringTrashSquadEntry(squad)]}),
          `D1A_STRIKE_ENGINEERING_TRASH_PLACED squad=${squad}; no objective or kill credit`);
      },message=>this.logger.log(message));
  }

  /** Called only by actual Dig Site arrivalComplete (native global Trigger75). */
  private restoreEarnedStrikeExit(sessionId:bigint):void {
    if (!this.strikeBacktrack?.consume()) return;
    this.strikeEngineeringArrivalObserved = true;
    for (const stage of ['create','open'] as const) this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
      buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,
        senseEntries:[buildVenusStrikeExitDoorEntry(stage),buildVenusStrikeCombatObjective(24,0),buildVenusStrikeCombatObjective(27,0)]}),
      `D1A_STRIKE_EARNED_EXIT ${stage}; native arrival/bindings; no new kill credit`);
  }
  private showStrikeRuinsGuidance(sessionId:bigint):void {
    this.strikeRuinsGuidanceShown = true;
    this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
      buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:[ruinsHud(66,true)]}),
      'D1A_STRIKE_RUINS_ROUTE native Nav151; actual Dig Site Trigger75; zero boss credit');
  }
  private armVenusStrikeRuins(sessionId:bigint):void {
    const activity=this.towerAuthOpts().scenario?.activityName ?? '';
    if(this.closed||this.kind!=='FAH'||activity!=='venus_portal_1'||this.currentSlice!==5||this.strikeRuinsRuntime)return;
    const player=eadPlayerIdentity(this.joinIdentity?.character,sessionId);
    if(!player)return;
    this.strikeRuinsRuntime=new VenusStrikeRuinsRuntime(`ruins/${sessionId.toString(16)}/${Date.now()}`,output=>{
      if(this.closed||this.currentSlice!==28)return;
      if(output.kind==='dialogue') {
        if(output.cue==='d040')this.playStrikeDialogue(sessionId,'ruinsComplete');
        else this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:[strikeDialogueTriggerEntry(83)]}),
          'D1A_STRIKE_DIALOGUE_TRIGGER83_ARMED; native volume still required');
        return;
      }
      if(output.kind==='auth')this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:output.entries}),
        'Ruins authored phase Auth; no synthetic kill/completion');
      else {
        this.logger.log(`D1A_STRIKE_RUINS_${output.kind.toUpperCase()} ${JSON.stringify(output)}`);
        if(output.kind==='bossKillEvidence') {
          try {this.logger.log(`D1A_STRIKE_REWARD awarded=${awardNexusVictory(output.evidence as BossKillProof)}; durable local Nexus victory award; item identity recorded in reward journal`);}
          catch(error){this.logger.warn(`D1A_STRIKE_REWARD_FAILED ${String(error)}`);}
        }
      }
    },message=>this.logger.log(message),player);
    this.strikeRuinsRuntime.arm(activity,true);
    this.showStrikeRuinsGuidance(sessionId);
  }

  private armVenusStrikeDigSite(sessionId: bigint, checkpoint=false): void {
    const activity = this.towerAuthOpts().scenario?.activityName ?? '';
    if (this.closed || this.kind !== 'FAH' || activity !== 'venus_portal_1' ||
        this.strikeDigSiteRuntime || (checkpoint ? !this.strikeResume.enabled || this.currentSlice!==16
          : this.currentSlice !== 7 || !this.strikeEngineeringRuntime?.completed)) return;
    this.strikeDigSiteRuntime = new VenusStrikeDigSiteRuntime(
      `dig-site/${sessionId.toString(16)}/${Date.now()}`, effect => {
        if (this.closed || this.kind !== 'FAH' || this.towerAuthOpts().scenario?.activityName !== 'venus_portal_1' ||
            (this.currentSlice !== 7 && this.currentSlice !== 5)) return;
        if (effect.kind !== 'objective' && this.currentSlice !== 5) return;
        if (effect.kind === 'arrivalComplete') {
          this.logger.log('D1A_STRIKE_DIG_SITE_NATIVE_ARRIVAL trigger=75 objective30 ended; arming actual next-owner Ruins route');
          this.armVenusStrikeRuins(sessionId);
          return;
        }
        const entries = effect.kind === 'objective' ? [buildVenusStrikeDigSiteObjective(effect.active)]
          : effect.kind === 'trigger' ? [buildVenusStrikeDigSiteTrigger(effect.bundle,effect.index)]
          : [buildVenusStrikeDigSiteSquadEntry(effect.squad)];
        if(effect.kind==='trigger'&&effect.bundle===0x0a302429&&effect.index===75)
          entries.push(strikeDialogueTriggerEntry(76),strikeDialogueTriggerEntry(77));
        this.pushAh(sessionId,ActivityHostMessageType.SensorAuthUpdate,
          buildSensorAuthUpdateRsat({activityTime:this.activityTicks(),hasAuthorityTable:false,senseEntries:entries}),
          `D1A_STRIKE_DIG_SITE_EFFECT ${JSON.stringify(effect)}`);
      }, message => this.logger.log(message));
    this.strikeDigSiteRuntime.arm(activity,checkpoint || this.strikeEngineeringRuntime!.completed,checkpoint);
  }

  private armActionMission(sessionId: bigint, slice: number): void {
    if (this.closed || this.kind !== 'FAH' || slice !== 0 || this.actionMission ||
        this.towerAuthOpts().scenario?.activityName !== 'action_mock' ||
        this.manager.getStartRequest()?.activityId !== 1) return;
    this.actionMission = new ActionMission(() => Date.now(), () => this.activityTicks(), (entries, label) => {
      if (this.closed || this.currentSlice !== 0) return;
      this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate,
        buildSensorAuthUpdateRsat({activityTime: this.activityTicks(), hasAuthorityTable: false, senseEntries: entries}),
        `D1A_ACTION_MISSION ${label}`);
    });
    this.actionMissionPoll = setInterval(() => {
      if (!this.closed && this.currentSlice === 0) this.actionMission?.update();
      if (this.actionMission?.completed && this.actionMissionPoll) {
        clearInterval(this.actionMissionPoll);
        this.actionMissionPoll = undefined;
      }
    }, 250);
    this.logger.log('D1A_ACTION_MISSION bound Activity1 options808E3911; waiting for native root receipt');
  }

  private armTowerVendorActivation(
    slice: number,
    previousSlice?: number
  ): void {
    const activityName = this.towerAuthOpts().scenario?.activityName;
    if (
      this.kind !== "FAH" ||
      activityName !== "city_tower_default1" ||
      (previousSlice === undefined &&
        (this.towerVendorActivationArmedSlice === slice ||
         this.towerVendorActivationScheduledSlice === slice)) ||
      slice === previousSlice
    ) {
      return;
    }
    if (this.towerVendorActivation) {
      clearTimeout(this.towerVendorActivation);
      this.towerVendorActivation = undefined;
    }
    this.towerVendorActivationScheduledSlice = undefined;
    this.towerVendorActivationArmedSlice = undefined;
    const vendorCount = buildTowerVendorActivationSenseEntries(slice, 0, process.env.D1A_TOWER_AMBIENT_NPCS === '1').length;
    if (
      vendorCount === 0 ||
      this.towerVendorActivationSentSlices.has(slice)
    ) {
      return;
    }
    this.towerVendorActivationArmedSlice = slice;
    this.logger.log(
      `AH proxy Tower vendor activation armed slice=${slice} from=${previousSlice ?? "join"} ` +
        `vendors=${vendorCount}; awaiting client-auth`
    );
  }

  private scheduleTowerVendorActivation(sessionId: bigint): void {
    const slice = this.towerVendorActivationArmedSlice;
    if (slice === undefined || this.towerVendorActivation) {
      return;
    }
    this.towerVendorActivationArmedSlice = undefined;
    this.towerVendorActivationScheduledSlice = slice;
    this.logger.log(
      `AH proxy Tower vendor activation scheduled slice=${slice} in 20s`
    );
    this.towerVendorActivation = setTimeout(() => {
      this.towerVendorActivation = undefined;
      const scheduledSlice = this.towerVendorActivationScheduledSlice;
      this.towerVendorActivationScheduledSlice = undefined;
      const opts = this.towerAuthOpts();
      if (
        this.closed ||
        this.kind !== "FAH" ||
        opts.scenario?.activityName !== "city_tower_default1" ||
        scheduledSlice === undefined ||
        this.currentSlice !== scheduledSlice ||
        this.towerVendorActivationSentSlices.has(scheduledSlice)
      ) {
        return;
      }

      const entries = buildTowerVendorActivationSenseEntries(scheduledSlice, 0, process.env.D1A_TOWER_AMBIENT_NPCS === '1');
      if (entries.length === 0) {
        this.logger.warn(
          `AH proxy Tower vendor activation rows unavailable slice=${scheduledSlice}`
        );
        return;
      }
      this.towerVendorActivationSentSlices.add(scheduledSlice);
      const rsat = buildSensorAuthUpdateRsat({
        activityTime: this.activityTicks(),
        hasAuthorityTable: false,
        senseEntries: entries,
      });
      this.pushAh(
        sessionId,
        ActivityHostMessageType.SensorAuthUpdate,
        rsat,
        `sensor-auth ${rsat.length}B FAH Tower vendors slice=${scheduledSlice} ` +
          `count=${entries.length} Phase-B valid=1 absolute seq=0`
      );
    }, 20_000);
  }

  /**
   * A genuine FAH 2→16 apply creates the Phase A valid=0 roster. Wait for its
   * next client-auth before scheduling the one-shot absolute placement.
   */
  private armVenusVexActivation(
    slice: number,
    previousSlice?: number
  ): void {
    const activityName = this.towerAuthOpts().scenario?.activityName;
    if (
      this.kind !== "FAH" ||
      activityName !== "venus_chapter_2" ||
      slice !== 16 ||
      previousSlice !== 2 ||
      this.venusVexActivationArmed ||
      this.venusVexActivation !== undefined ||
      this.venusVexActivationSent
    ) {
      return;
    }
    this.venusVexActivationArmed = true;
    this.logger.log(
      "AH proxy Venus Vex encounter activation armed on FAH transition 2→16; awaiting client-auth"
    );
  }

  private scheduleVenusVexActivation(sessionId: bigint): void {
    if(this.raidPreview.enabled)return;
    if (
      !this.venusVexActivationArmed ||
      this.venusVexActivation ||
      this.venusVexActivationSent
    ) {
      return;
    }
    this.venusVexActivationArmed = false;
    this.logger.log(
      "AH proxy Venus objective scheduled in 9.5s; squads follow 500ms later"
    );
    this.venusVexActivation = setTimeout(() => {
      this.venusVexActivation = undefined;
      const opts = this.towerAuthOpts();
      if (
        this.closed ||
        this.kind !== "FAH" ||
        opts.scenario?.activityName !== "venus_chapter_2" ||
        this.currentSlice !== 16 ||
        this.venusVexActivationSent
      ) {
        return;
      }

      // The authored objective owns this encounter. Activate it in its own
      // update just before the squad rows so the native objective callback is
      // established when actor placement begins.
      this.pushVenusVexObjectiveActivation(sessionId, false);
      this.venusVexSquadActivation = setTimeout(() => {
        this.venusVexSquadActivation = undefined;
        const squadOpts = this.towerAuthOpts();
        if (
          this.closed ||
          this.kind !== "FAH" ||
          squadOpts.scenario?.activityName !== "venus_chapter_2" ||
          this.currentSlice !== 16 ||
          this.venusVexActivationSent
        ) {
          return;
        }

        // The native client advances these first two squads to sequences 1 and
        // 3 after Phase A. A lower complete-state sequence is rejected before
        // squad apply, so use their observed common safe sequence.
        const entries = buildVenusVexSquadActivationSenseEntries(3);
        if (entries.length !== 2) {
          this.logger.warn("AH proxy Venus Vex encounter activation rows unavailable");
          return;
        }
        this.venusVexActivationSent = true;
        const rsat = buildSensorAuthUpdateRsat({
          activityTime: this.activityTicks(),
          hasAuthorityTable: false,
          senseEntries: entries,
        });
        this.pushAh(
          sessionId,
          ActivityHostMessageType.SensorAuthUpdate,
          rsat,
          `sensor-auth ${rsat.length}B FAH Venus Vex squads=2,3 ` +
            `count=${entries.length} Phase-B valid=1 absolute seq=3 objective-first`
        );
        // Collect-loot now follows the Captain's observed terminal transition.
      }, 500);
    }, 9_500);
  }

  /**
   * Join grant (retail 261): Lifetime + Player on 4786, hasAuth=1.
   */
  private pushJoinSensorAuth(sessionId: bigint): void {
    if (this.kind !== "FAH" || this.sensorAuthGranted) {
      return;
    }
    const opts = this.towerAuthOpts();
    const grant = buildTowerSensorAuthRsat({
      ...opts,
      grantTable: true,
    });
    const bubbles = opts.scenario?.bubbleCount ?? 5;
    this.pushAh(
      sessionId,
      ActivityHostMessageType.SensorAuthUpdate,
      grant,
      `sensor-auth ${grant.length}B ${this.kind} spawn=tower identity grant 0..${bubbles - 1}+64`
    );
    this.sensorAuthGranted = true;
  }

  /** Idle tick: activity time only, no bundle items. */
  private pushSensorAuthTick(sessionId: bigint): void {
    const rsat = buildSensorAuthTickRsat(this.activityTicks());
    this.pushAh(
      sessionId,
      ActivityHostMessageType.SensorAuthUpdate,
      rsat,
      `sensor-auth ${rsat.length}B ${this.kind} tick`
    );
  }

  private pushMembership(sessionId: bigint, force = false): void {
    if (!this.joinIdentity || (!force && this.membershipPushes >= 1)) {
      return;
    }
    this.membershipPushes += 1;
    const generation = ++this.membershipGeneration;
    const scenario = this.resolvedRoute?.scenario;
    const activityName = scenario?.activityName;
    const bubbleCount = scenario?.bubbleCount ?? 1;
    const mem = buildReplicateMembershipRsat(this.joinIdentity, {
      preserveRegionTokenRows: activityName === 'venus_chapter_2',
      regionTokens: this.strikeRegionTokens,
      anchorBubble: this.strikeRequestedSlice !== undefined ? this.currentSlice : scenario?.initialBubble,
      bubbleCount,
      emptyBubbles: scenario?.emptyBubbles,
      generation,
      // Reserve/assign the native request's destination before its final
      // refresh. currentSlice remains the last reported occupied slice.
      initialBubble: this.calderaInsertion.assignedBubble ?? this.raidPreview.assignedBubble ?? this.strikeResume.assignedBubble ?? this.strikeCheckpoint.assignedBubble ?? (this.strikeRequestedSlice !== undefined ? this.strikeRequestedSlice
        : this.venusNorthernTeleportRequested && !this.venusNorthernTeleportCompleted ? 14
        : this.venusSouthernTeleportRequested && !this.venusSouthernTeleportCompleted ? 23
        : this.venusHeadlandsTeleportRequested && !this.venusHeadlandsTeleportCompleted ? 10
        : this.venusEntranceTeleportRequested && !this.venusEntranceTeleportCompleted ? 8
        : this.currentSlice ?? scenario?.initialBubble),
      teleportRequest: this.calderaInsertion.membershipRequest() ?? this.raidPreview.membershipRequest() ?? this.strikeResume.membershipRequest() ?? this.strikeCheckpoint.membershipRequest() ?? (this.venusNorthernTeleportRequested ? {
        completed: this.venusNorthernTeleportCompleted,
        cookie: 4, destination: 14 << 3, insertionHash: 0xea2a5ead, deinstantiateMask: 0,
      } : this.venusSouthernTeleportRequested ? {
        completed: this.venusSouthernTeleportCompleted,
        cookie: 3, destination: 23 << 3, insertionHash: 0xf1c376c0, deinstantiateMask: 0,
      } : this.venusHeadlandsTeleportRequested ? {
        completed: this.venusHeadlandsTeleportCompleted,
        cookie: 2, destination: 10 << 3, insertionHash: 0xa5a862c9, deinstantiateMask: 0,
      } : this.venusEntranceTeleportRequested ? {
        completed: this.venusEntranceTeleportCompleted,
        cookie: 1,
        destination: 8 << 3,
        // Packaged hub Location317, phase00.entrance. r346 used absent hash.
        insertionHash: 0x5e9604e6,
        deinstantiateMask: 0,
      } : undefined),
    });
    const machine = this.joinIdentity.machine.toString("hex");
    this.pushAh(
      sessionId,
      ActivityHostMessageType.ReplicateMembership,
      mem,
        `membership ${mem.length}B gen=${generation} slot0 machine=${machine} ` +
        `pah bubbles=${bubbleCount} slice=${this.currentSlice ?? scenario?.initialBubble} ` +
        (this.venusNorthernTeleportRequested ? "requested=14 " : this.venusSouthernTeleportRequested ? "requested=23 " : this.venusHeadlandsTeleportRequested ? "requested=10 " : this.venusEntranceTeleportRequested ? "requested=8 " : "") +
        `regionTokens=${JSON.stringify(this.strikeRegionTokens)} compatibility=${activityName === 'venus_chapter_2'} local-only`
    );
  }

  private pushAh(
    sessionId: bigint,
    kind: ActivityHostMessageType,
    payload: Buffer,
    label: string
  ): void {
    const body = buildActivityHostToClientNotification(
      sessionId,
      kind,
      payload
    );
    const seq = this.notifySeq++ >>> 0;
    this.send({
      msgType: BapMessageType.BapToClientActivityNotification,
      sequence: seq,
      body,
      activityHostId: sessionId,
    });
    this.logger.log(
      `AH proxy ${label} (seq ${seq.toString(16)}, ah=0x${sessionId.toString(16)})`
    );
  }

  private startKeepalive(sessionId: bigint): void {
    this.stopKeepalive();
    const beat = (): void => {
      if (this.closed) {
        this.stopKeepalive();
        return;
      }
      if (this.kind === 'FAH' && this.currentSlice === 10 && this.venusCollectFluidsActive &&
          !this.venusFluidProgress.complete) {
        for (const { squad, allocation } of this.venusHeadlandsRespawn.takeReady(Date.now())) {
          const rsat = buildSensorAuthUpdateRsat({ activityTime: this.activityTicks(),
            hasAuthorityTable: false,
            senseEntries: [buildVenusHeadlandsReplenishmentEntry(squad, allocation)] });
          this.pushAh(sessionId, ActivityHostMessageType.SensorAuthUpdate, rsat,
            `Venus Headlands cleared Squad${squad} replenishment allocation=${allocation}; ` +
            '60s recovery delay; native death roster retained; actual fluid pickups still required');
        }
      } else {
        this.venusHeadlandsRespawn.resetObservations();
      }
      this.pushSensorAuthTick(sessionId);
    };
    this.keepalive = setInterval(beat, 3000);
  }

  private stopKeepalive(): void {
    this.venusHeadlandsRespawn.resetObservations();
    if (this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = undefined;
    }
  }

  private stopInitialSliceRecovery(): void {
    if (this.initialSliceRecovery) {
      clearTimeout(this.initialSliceRecovery);
      this.initialSliceRecovery = undefined;
    }
  }

  private stopVenusVexActivation(): void {
    if (this.venusVexActivation) {
      clearTimeout(this.venusVexActivation);
      this.venusVexActivation = undefined;
    }
    if (this.venusVexSquadActivation) {
      clearTimeout(this.venusVexSquadActivation);
      this.venusVexSquadActivation = undefined;
    }
    this.venusVexActivationArmed = false;
    this.venusVexObjectiveReadinessLatched = false;
  }

  private stopTowerVendorActivation(): void {
    if (this.towerVendorActivation) {
      clearTimeout(this.towerVendorActivation);
      this.towerVendorActivation = undefined;
    }
    this.towerVendorActivationArmedSlice = undefined;
    this.towerVendorActivationScheduledSlice = undefined;
    this.towerVendorActivationSentSlices.clear();
  }

  private stopActionMockActivation(): void {
    if (this.actionMissionPoll) clearInterval(this.actionMissionPoll);
    this.actionMissionPoll = undefined;
    this.actionMission?.stop();
  }

  private handleStatusOnlyReply(
    message: RawBapMessage,
    responseType: BapMessageType,
    label: string
  ): void {
    this.send({
      msgType: responseType,
      sequence: message.sequence,
      body: Buffer.alloc(0),
    });
    this.logger.log(
      `AH proxy ${label} rsp (seq ${message.sequence.toString(16)}, req ${message.body.length}B)`
    );
  }

  private send(message: RawBapMessage): void {
    const frame = this.codec.encode(message);
    this.logger.log(
      `AH proxy → ${bapMessageTypeName(message.msgType)} seq=${message.sequence} ` +
        `frame=${frame.length}b`
    );
    this.socket.write(frame);
  }
}

function aes128CbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function hexPreview(buf: Buffer, max = 64): string {
  const slice = buf.subarray(0, max);
  const hex = slice.toString("hex");
  return buf.length > max ? `${hex}…(${buf.length}B)` : hex;
}
