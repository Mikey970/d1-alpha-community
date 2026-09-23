import {currentCharacterContext, withCharacter, type CharacterContext} from './character-context';
import {configuredCharacterStore} from './character-store';
import {mutateWeaponTalent} from "./rsat/mocks/weapon-talents";
import {mutateArmorTalent} from "./rsat/mocks/armor-talents";
import { VendorBuyRequest, VendorBuyResponse, VendorRequestCapture } from './vendor-request-capture';
import { vendorEconomy, type PurchaseResult } from './vendor-economy';
import {rewardEvents} from "./rsat/mocks/strike-rewards";
import * as crypto from "node:crypto";
import { appendFileSync } from "node:fs";
import type * as net from "node:net";
import {
  ACTIVITY_HOST_PROXY_IP,
  ACTIVITY_HOST_PROXY_PORT,
  buildGetActivityHostProxyResponse,
  parseGetActivityHostProxyRequest,
} from "../activity-host-proxy";
import {
  ACTIVITY_HOST_NOTIFICATION_VARIANT,
  parseActivityHostToClientNotification,
} from "../activity-host-proxy/notification";
import type ILogger from "../ILogger";
import {
  buildAccountIdTranslateResponse,
  parseAccountIdTranslateRequest,
} from "./account-id-translate";
import { buildClientConfigResponseBody } from "./client-config";
import { BungieCodec, type RawBapMessage } from "./codec";
import { BAP_SESSION_KEY_AES, BAP_SESSION_KEY_HMAC } from "./config";
import { BapMessageType, bapMessageTypeName } from "./constants";
import { e_queuez_family_type } from "./queuez";
import {
  buildDirectorEnterOrbitResponseBody,
  buildFetchFamilyResponseBody,
  buildInspectionBaselineBody,
  buildLoginAccountResponseBody,
  buildPeerBaselineBody,
  buildProfileSetAccountProfileResponseBody,
  buildProfileSetCharacterProfileResponseBody,
  buildRosterBaselineBody,
  buildSelectCharacterBaselineBody,
  buildSelfBaselineBody,
  buildUniverseBaselineBody,
  e_server_message_network_id,
  INSPECTION_CHECKSUM_PRIMARY,
  LOCAL_INVESTMENT_ACCOUNT_SOID,
  PEER_CHECKSUM_PRIMARY,
  parseFetchFamilyRequest,
  SIGNED_IN_CHARACTER_SOID,
  UNIVERSE_ROOT_SOID,
} from "./rsat";
import { parseSubscribeRequest } from "./subscribe";
import { stubSelectCharacter } from "./rsat/mocks/values";
import { CreateCharacterResponse, CustomizeCharacterResponse, LoginCharacterResponse, SignoutCharacterResponse, parseCharacterSessionRequest, unsupportedCharacterMutationResponse } from "./rsat/schemas/character-session";
import { decodeServerMessage, encodeServerMessage } from "@blamnetwork/rsat";
import { InventoryEquipRequest, InventoryEquipResponse } from "./rsat/schemas/messages";
import {InventoryActionRequest,InventoryActionResponse,InventoryDestroyRequest,InventoryDestroyResponse,unsupportedInventoryActionResponse} from './rsat/schemas/inventory-actions';
import { currentEquipmentVersion, dismantleInventoryItem, equipInventoryProbe, inventoryBucketOccupancy, inventoryProbeItem, inventoryWeapons, ownedInventoryItem } from "./rsat/mocks/loadout";
import { activateTalentStep, swapTalentNode, talentProbeEnabled } from "./rsat/mocks/talent-state";
import { TalentActivateRequest, TalentActivateResponse, TalentSwapRequest, TalentSwapResponse } from "./rsat/schemas/talent-requests";

const inventorySessions = new Set<BungieAccessProtocolSession>();
function characterCards() {
  const store = configuredCharacterStore();
  return store ? store.ids().map(id => withCharacter(store.context(id), () => stubSelectCharacter(id))) :
    [stubSelectCharacter(SIGNED_IN_CHARACTER_SOID)];
}
rewardEvents.on("awarded", () => {
  const owner = currentCharacterContext();
  for (const session of inventorySessions) {
    if (session.characterContext === owner) session.publishInventoryEquipment();
  }
});

export class BungieAccessProtocolSession {
  private readonly codec = new BungieCodec();
  private buffer = Buffer.alloc(0);
  private closed = false;
  /** Sequence for server-pushed type-123 queuez updates. */
  private pushSeq = 1;
  private inventoryCaptureCount = 0;
  private readonly vendorCapture = new VendorRequestCapture();
  private readonly vendorReplies = new Map<number, { request: string; body: Buffer }>();
  private readonly inventorySubscriptions = new Map<number, bigint>();
  // Preserve the existing automatic login until the native login flow is accepted.
  private selectedCharacterSoid = SIGNED_IN_CHARACTER_SOID;
  private characterRevision = 0;
  private readonly characters = configuredCharacterStore();
  private readonly characterReplies = new Map<number, {request: string; body: Buffer}>();
  private readonly appearanceChanged = () => {
    this.characterRevision++;
    this.publishInventoryEquipment(true);
  };
  private readonly characterSelected = () => {
    this.characterContext = this.characters!.activeContext;
    this.selectedCharacterSoid = this.characters!.selectedSoid;
    this.characterRevision++;
    this.vendorReplies.clear();
    this.publishInventoryEquipment(true);
  };
  constructor(
    private readonly socket: net.Socket,
    private readonly logger: ILogger,
    public characterContext: CharacterContext = currentCharacterContext()
  ) {
    if (this.characters) {
      this.characterContext = this.characters.activeContext;
      this.selectedCharacterSoid = this.characters.selectedSoid;
      this.characters.on('selected', this.characterSelected);
      this.characters.on('appearanceChanged', this.appearanceChanged);
    }
    inventorySessions.add(this);
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`BAP client connected ${remote}`);

    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (err) => {
      this.logger.warn(`BAP socket error ${remote}: ${err.message}`);
    });
    socket.on("close", () => {
      this.closed = true;
      inventorySessions.delete(this);
      this.characters?.off('selected', this.characterSelected);
      this.characters?.off('appearanceChanged', this.appearanceChanged);
      this.logger.log(`BAP client disconnected ${remote}`);
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
        `BAP frame error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.socket.destroy();
    }
  }

  private handleMessage(message: RawBapMessage): void {
    withCharacter(this.characterContext, () => this.dispatchMessage(message));
  }

  private dispatchMessage(message: RawBapMessage): void {
    this.logger.log(
      `BAP ← ${bapMessageTypeName(message.msgType)} seq=${message.sequence} ` +
        `body=${message.body.length}b`
    );

    switch (message.msgType) {
      case BapMessageType.ClientToBapChannelStartupRequest:
        this.handleChannelStartup(message);
        break;
      case BapMessageType.ClientToBapSecureHelloRequest:
        this.handleSecureHello(message);
        break;
      case BapMessageType.ClientToBapQueuezRegisterRequest:
        this.handleStatusOnlyReply(
          message,
          BapMessageType.ClientToBapQueuezRegisterResponse,
          "qz_reg"
        );
        break;
      case BapMessageType.ClientToBapRegisterRelayClientRequest:
        this.handleStatusOnlyReply(
          message,
          BapMessageType.ClientToBapRegisterRelayClientResponse,
          "rrc"
        );
        break;
      case BapMessageType.ClientToBapEchoRequest:
        this.handleStatusOnlyReply(
          message,
          BapMessageType.ClientToBapEchoResponse,
          "echo"
        );
        break;
      case BapMessageType.ClientToWorldServerRequest:
        this.handleWorldServerRequest(message);
        break;
      case BapMessageType.ClientToBapSubscriptionRequest:
        this.handleSubscriptionRequest(message);
        break;
      case BapMessageType.ClientToBapUnsubscribeRequest:
        this.handleUnsubscribeRequest(message);
        break;
      case BapMessageType.ClientToBapClientConfigRequest:
        this.handleClientConfig(message);
        break;
      case BapMessageType.ClientToBapAccountIdTranslationPlatformToInvestmentRequest:
        this.handleAccountIdTranslation(message);
        break;
      case BapMessageType.ClientToBapGetActivityHostProxyRequest:
        this.handleGetActivityHostProxy(message);
        break;
      case BapMessageType.ClientToXetrovNotification:
        this.logger.log(
          `BAP xetrov not absorbed (seq ${message.sequence.toString(16)}, ` +
            `${message.body.length}B, no rsp)`
        );
        break;
      case BapMessageType.BapToClientActivityNotification:
        this.handleRelayedActivityNotification(message);
        break;
      default:
        this.logger.warn(
          `BAP unhandled message type 0x${message.msgType.toString(16)}`
        );
        break;
    }
  }

  private handleWorldServerRequest(message: RawBapMessage): void {
    this.vendorCapture.observe(message, this.logger);
    const networkId =
      message.body.length >= 2 ? message.body.readUInt16BE(0) : -1;
    if (networkId === 504 || networkId === 505) {
      const requested = parseCharacterSessionRequest(message.body);
      const accepted = networkId === 505 ? requested === 0n : requested !== null &&
        (this.characters ? this.characters.has(requested) : requested === SIGNED_IN_CHARACTER_SOID);
      const changed = accepted && requested !== this.selectedCharacterSoid;
      if (changed) {
        if (this.characters) this.characters.select(requested!);
        else {
          this.selectedCharacterSoid = requested!;
          this.characterRevision++;
          this.vendorReplies.clear();
          this.publishInventoryEquipment(true);
        }
      }
      this.send({ msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence,
        body: encodeServerMessage(networkId, networkId === 504 ? LoginCharacterResponse : SignoutCharacterResponse,
          { status: { unknown0: accepted ? 0 : -1, unknown1: 0 } }) });
      this.logger.log(`D1A_CHARACTER_SESSION network=${networkId} accepted=${accepted} changed=${changed} selected=${this.selectedCharacterSoid.toString(16)}`);
      return;
    }
    if (this.selectedCharacterSoid === 0n) {
      const response = networkId === 401 ? InventoryDestroyResponse : networkId === 402 ? InventoryActionResponse :
        networkId === 403 ? InventoryEquipResponse : networkId === 801 ? TalentActivateResponse :
        networkId === 802 ? TalentSwapResponse : networkId === 901 ? VendorBuyResponse : null;
      if (response) {
        this.send({ msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence,
          body: encodeServerMessage(networkId, response, { status: { unknown0: -1, unknown1: 0 } }) });
        return;
      }
    }
    // Opt-in, bounded observation of native character, inventory, and reward transactions.
    // Preserve the existing response until the native payload is established.
    if (
      process.env.D1A_INVENTORY_CAPTURE_PATH &&
      [401,402,403,404,501,502,506,601,801,802,803,1302].includes(networkId) &&
      this.inventoryCaptureCount < 32 &&
      message.body.length <= 4096
    ) {
      this.inventoryCaptureCount++;
      try {
        appendFileSync(
          process.env.D1A_INVENTORY_CAPTURE_PATH,
          `${JSON.stringify({
            timestamp: new Date().toISOString(),
            sequence: message.sequence >>> 0,
            networkId,
            bodyBytes: message.body.length,
            bodyHex: message.body.toString("hex"),
          })}\n`,
          "utf8"
        );
        this.logger.log(
          `D1A_INVENTORY_REQUEST_CAPTURE network-id=${networkId} seq=${message.sequence} bytes=${message.body.length}`
        );
      } catch (err) {
        this.logger.warn(
          `D1A_INVENTORY_REQUEST_CAPTURE_FAILED: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (networkId === 501 && this.characters) {
      const request = message.body.toString('hex');
      const cached = this.characterReplies.get(message.sequence);
      if (cached?.request === request) {
        this.send({msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence, body: cached.body});
        return;
      }
      let created: bigint | null = null;
      if (!cached && this.selectedCharacterSoid === 0n) {
        try { created = this.characters.create(message.body); }
        catch (error) { this.logger.error(`D1A_CHARACTER_SAVE_FAILED ${String(error)}`); }
      }
      const body = encodeServerMessage(501, CreateCharacterResponse, {
        status: {unknown0: created === null ? -1 : 0, unknown1: 0}, characterSoid: created ?? 0n,
      });
      if (!cached) {
        if (this.characterReplies.size >= 32) this.characterReplies.delete(this.characterReplies.keys().next().value!);
        this.characterReplies.set(message.sequence, {request, body});
      }
      if (created !== null) this.characters.select(created);
      this.send({msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence, body});
      this.logger.log(`D1A_CHARACTER_CREATE accepted=${created !== null} soid=${created?.toString(16) ?? '0'}`);
      return;
    }
    if (networkId === 506 && this.characters) {
      const request = message.body.toString('hex');
      const cached = this.characterReplies.get(message.sequence);
      if (cached?.request === request) {
        this.send({msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence, body: cached.body});
        return;
      }
      let accepted = false;
      try { if (!cached) accepted = this.characters.customize(this.selectedCharacterSoid, message.body); }
      catch (error) { this.logger.error(`D1A_CHARACTER_SAVE_FAILED ${String(error)}`); }
      const body = encodeServerMessage(506, CustomizeCharacterResponse,
        {status: {unknown0: accepted ? 0 : -1, unknown1: 0}});
      if (!cached) {
        if (this.characterReplies.size >= 32) this.characterReplies.delete(this.characterReplies.keys().next().value!);
        this.characterReplies.set(message.sequence, {request, body});
      }
      this.send({msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence, body});
      this.logger.log(`D1A_CHARACTER_CUSTOMIZE accepted=${accepted} soid=${this.selectedCharacterSoid.toString(16)}`);
      return;
    }
    // The native creator crashed after an empty transport-level success.
    // Unsupported mutations must carry a typed native failure instead.
    const characterFailure = unsupportedCharacterMutationResponse(networkId);
    if (characterFailure) {
      this.send({ msgType: BapMessageType.ClientToWorldServerResponse,
        sequence: message.sequence, body: characterFailure });
      this.logger.warn(`D1A_CHARACTER_MUTATION network=${networkId} accepted=false reason=not-implemented`);
      return;
    }
    const reqPlain = Buffer.alloc(6 + message.body.length);
    reqPlain.writeUInt16BE(message.msgType, 0);
    reqPlain.writeUInt32BE(message.sequence >>> 0, 2);
    message.body.copy(reqPlain, 6);

    if (networkId === 901 && process.env.D1A_VENDOR_ECONOMY === "1") {
      const requestHex = message.body.toString("hex");
      const previous = this.vendorReplies.get(message.sequence >>> 0);
      if (previous?.request === requestHex) {
        this.send({
          msgType: BapMessageType.ClientToWorldServerResponse,
          sequence: message.sequence,
          body: previous.body,
        });
        this.logger.log(`D1A_VENDOR_PURCHASE replay seq=${message.sequence}`);
        return;
      }
      let result: PurchaseResult = {
        accepted: false,
        changed: false,
        reason: "unsupported-offer",
        version: vendorEconomy().version,
      };
      let detail = "malformed";
      try {
        const { value } = decodeServerMessage(message.body, VendorBuyRequest);
        detail = `vendor=${value.vendorIndex} purchase=${value.purchaseIndex}`;
        result = vendorEconomy().purchase(
          value.vendorIndex,
          value.purchaseIndex,
          inventoryBucketOccupancy()
        );
      } catch (error) {
        this.logger.warn(`D1A_VENDOR_PURCHASE_DECODE_FAILED ${String(error)}`);
      }
      const body = encodeServerMessage(901, VendorBuyResponse, {
        status: { unknown0: result.accepted ? 0 : -1, unknown1: 0 },
      });
      this.vendorReplies.set(message.sequence >>> 0, { request: requestHex, body });
      if (this.vendorReplies.size > 64) {
        const oldest = this.vendorReplies.keys().next().value;
        if (oldest !== undefined) this.vendorReplies.delete(oldest);
      }
      this.send({ msgType: BapMessageType.ClientToWorldServerResponse, sequence: message.sequence, body });
      if (result.changed) for (const session of inventorySessions) session.publishInventoryEquipment();
      this.logger.log(
        `D1A_VENDOR_PURCHASE ${detail} accepted=${result.accepted} changed=${result.changed} ` +
          `reason=${result.reason} version=${result.version}`
      );
      return;
    }

    if(networkId===401||networkId===402){
      let detail='malformed';
      let accepted=false;
      let changed=false;
      let reason='malformed-native-action';
      try {
        if(networkId===402){
          const {value}=decodeServerMessage(message.body,InventoryActionRequest);
          detail=`soid=${value.action.itemSoid.toString(16)} action=${value.action.actionIndex} flag=${value.action.flag}`;
          const result=dismantleInventoryItem(value.action.itemSoid,value.action.actionIndex,value.action.flag);
          accepted=result.accepted;changed=result.changed;reason=result.reason;
        }else{
          const {value}=decodeServerMessage(message.body,InventoryDestroyRequest);
          detail=`soid=${value.itemSoid.toString(16)}`;
          reason='unsupported-native-destroy';
        }
      }catch(error){this.logger.warn(`D1A_INVENTORY_ACTION_DECODE_FAILED ${String(error)}`);}
      this.send({msgType:BapMessageType.ClientToWorldServerResponse,sequence:message.sequence,
        body:networkId===402 ? encodeServerMessage(402,InventoryActionResponse,
          {status:{unknown0:accepted ? 0 : -1,unknown1:0}}) : unsupportedInventoryActionResponse(401)});
      if(changed)for(const session of inventorySessions)session.publishInventoryEquipment();
      this.logger.log(`D1A_INVENTORY_ACTION network=${networkId} ${detail} accepted=${accepted} changed=${changed} reason=${reason} version=${currentEquipmentVersion()}`);
      return;
    }

    if ((networkId === 801 || networkId === 802) && talentProbeEnabled()) {
      let result = { accepted:false, changed:false, reason:'malformed-native-talent-request' };
      let identity = 'unparsed';
      let node = -1;
      if (message.body.length === 12) {
        try {
          const { value } = decodeServerMessage(message.body,
            networkId === 801 ? TalentActivateRequest : TalentSwapRequest);
          identity = value.itemSoid.toString(16).padStart(16,'0');
          node = value.nodeIndex;
          const item=ownedInventoryItem(value.itemSoid);
          if (!item) {
            result = {accepted:false, changed:false, reason:'talent-item-not-owned'};
          } else {
            const gearResult=mutateArmorTalent(item,node,networkId===802)??mutateWeaponTalent(item,node,networkId===802);
            result = gearResult ?? (networkId === 801 ? activateTalentStep(value.itemSoid,node)
              : swapTalentNode(value.itemSoid,node));
          }
        } catch (error) {
          this.logger.warn(`D1A_TALENT_REQUEST_FAILED ${String(error)}`);
        }
      }
      if (result.changed) for (const session of inventorySessions) session.publishInventoryEquipment();
      this.send({msgType:BapMessageType.ClientToWorldServerResponse,sequence:message.sequence,
        body:encodeServerMessage(networkId,networkId === 801 ? TalentActivateResponse : TalentSwapResponse,
          {status:{unknown0:result.accepted ? 0 : -1,unknown1:0}})});
      this.logger.log(`D1A_TALENT_SELECTION network=${networkId} soid=${identity} node=${node} accepted=${result.accepted} changed=${result.changed} reason=${result.reason} version=${currentEquipmentVersion()}`);
      return;
    }

    if (networkId === 403 && inventoryProbeItem()) {
      const { value } = decodeServerMessage(message.body, InventoryEquipRequest);
      const accepted = equipInventoryProbe(value.itemSoid);
      if (accepted) {
        for (const session of inventorySessions) session.publishInventoryEquipment();
      }
      this.send({
        msgType: BapMessageType.ClientToWorldServerResponse,
        sequence: message.sequence,
        body: encodeServerMessage(403, InventoryEquipResponse, {
          status: { unknown0: accepted ? 0 : -1, unknown1: 0 },
        }),
      });
      this.logger.log(`D1A_INVENTORY_EQUIP soid=${value.itemSoid.toString(16).padStart(16, "0")} accepted=${accepted} version=${currentEquipmentVersion()}`);
      return;
    }

    if (
      networkId ===
      e_server_message_network_id._server_message_network_id_login_account
    ) {
      const body = buildLoginAccountResponseBody(reqPlain);
      this.send({
        msgType: BapMessageType.ClientToWorldServerResponse,
        sequence: message.sequence,
        body,
      });
      this.logger.log(
        `BAP login_account rsp (seq ${message.sequence.toString(16)}, ` +
          `body ${body.length}B)`
      );
      return;
    }

    if (
      networkId ===
      e_server_message_network_id._server_message_network_id_fetch_family
    ) {
      try {
        const req = parseFetchFamilyRequest(reqPlain);
        const baseline = req
          ? this.buildBaseline(req.familyType, req.rootSoid)
          : null;
        const body = buildFetchFamilyResponseBody(0, baseline?.body ?? null);
        this.send({
          msgType: BapMessageType.ClientToWorldServerResponse,
          sequence: message.sequence,
          body,
        });
        this.logger.log(
          `BAP fetch_family rsp (seq ${message.sequence.toString(16)}, ` +
            "status=0, " +
            `req=${req ? `family ${req.familyType} root 0x${req.rootSoid.toString(16)}` : "unparsed"}, ` +
            `${baseline ? `${baseline.label} baseline ${baseline.body.length}B` : "no baseline"}, ` +
            `body ${body.length}B)`
        );
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `BAP fetch_family rsp FAILED, absorbed to keep connection alive: ${m}`
        );
      }
      return;
    }

    if (
      networkId ===
      e_server_message_network_id._server_message_network_id_director_enter_orbit
    ) {
      try {
        const body = buildDirectorEnterOrbitResponseBody();
        this.send({
          msgType: BapMessageType.ClientToWorldServerResponse,
          sequence: message.sequence,
          body,
        });
        this.logger.log(
          `BAP director_enter_orbit ack (seq ${message.sequence.toString(16)}, ` +
            `body ${body.length}B)`
        );
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `BAP director_enter_orbit ack FAILED, absorbed to keep connection alive: ${m}`
        );
      }
      return;
    }

    if (
      networkId ===
      e_server_message_network_id._server_message_network_id_profile_set_account_profile
    ) {
      try {
        const body = buildProfileSetAccountProfileResponseBody();
        this.send({
          msgType: BapMessageType.ClientToWorldServerResponse,
          sequence: message.sequence,
          body,
        });
        this.logger.log(
          `BAP profile_set_account_profile ack (seq ${message.sequence.toString(16)}, ` +
            `body ${body.length}B)`
        );
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `BAP profile_set_account_profile ack FAILED, absorbed to keep connection alive: ${m}`
        );
      }
      return;
    }

    if (
      networkId ===
      e_server_message_network_id._server_message_network_id_profile_set_character_profile
    ) {
      try {
        const body = buildProfileSetCharacterProfileResponseBody();
        this.send({
          msgType: BapMessageType.ClientToWorldServerResponse,
          sequence: message.sequence,
          body,
        });
        this.logger.log(
          `BAP profile_set_character_profile ack (seq ${message.sequence.toString(16)}, ` +
            `body ${body.length}B)`
        );
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `BAP profile_set_character_profile ack FAILED, absorbed to keep connection alive: ${m}`
        );
      }
      this.captureProfileSetCharacter(message);
      return;
    }

    this.logger.warn(
      `BAP world-server req network-id=${networkId} (${message.body.length}B) — ` +
        "no handler yet; sending status-only type-11"
    );
    this.handleStatusOnlyReply(
      message,
      BapMessageType.ClientToWorldServerResponse,
      `world-server network-id ${networkId}`
    );
  }

  private captureProfileSetCharacter(message: RawBapMessage): void {
    const capturePath = process.env.D1A_NID702_CAPTURE_PATH;
    if (!capturePath) {
      return;
    }
    try {
      const record = {
        timestamp: new Date().toISOString(),
        remoteAddress: this.socket.remoteAddress ?? null,
        remotePort: this.socket.remotePort ?? null,
        localAddress: this.socket.localAddress ?? null,
        localPort: this.socket.localPort ?? null,
        sequence: message.sequence >>> 0,
        sequenceHex: message.sequence.toString(16),
        networkId: 702,
        schema: "0x80801ABB",
        bodyBytes: message.body.length,
        rsatPayloadOffset: 2,
        sha256: crypto
          .createHash("sha256")
          .update(message.body)
          .digest("hex"),
        bodyHex: message.body.toString("hex"),
      };
      appendFileSync(capturePath, `${JSON.stringify(record)}\n`, "utf8");
      this.logger.log(
        `D1A_NID702_CAPTURE seq=${record.sequenceHex} bytes=${record.bodyBytes} ` +
          `sha256=${record.sha256} path='${capturePath}'`
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`D1A_NID702_CAPTURE_FAILED: ${m}`);
    }
  }

  private handleGetActivityHostProxy(message: RawBapMessage): void {
    try {
      const activityHostId = parseGetActivityHostProxyRequest(message.body);
      if (activityHostId === null) {
        this.logger.warn(
          `BAP get_activity_host_proxy absorbed (short body ${message.body.length}B)`
        );
        return;
      }

      const body = buildGetActivityHostProxyResponse(
        activityHostId,
        ACTIVITY_HOST_PROXY_IP,
        ACTIVITY_HOST_PROXY_PORT
      );
      this.send({
        msgType: BapMessageType.ClientToBapGetActivityHostProxyResponse,
        sequence: message.sequence,
        body,
      });
      this.logger.log(
        `BAP get_activity_host_proxy rsp (seq ${message.sequence.toString(16)}, ` +
          `ah=0x${activityHostId.toString(16)} → ` +
          `${ACTIVITY_HOST_PROXY_IP}:${ACTIVITY_HOST_PROXY_PORT}, body ${body.length}B)`
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `BAP get_activity_host_proxy rsp FAILED, absorbed: ${m}`
      );
    }
  }

  private handleClientConfig(message: RawBapMessage): void {
    try {
      const body = buildClientConfigResponseBody(1n, 0);
      this.send({
        msgType: BapMessageType.ClientToBapClientConfigResponse,
        sequence: message.sequence,
        body,
      });
      this.logger.log(
        `BAP client_config rsp (seq ${message.sequence.toString(16)}, ` +
          `cookie=1 social_mm=0, body ${body.length}B)`
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BAP client_config rsp FAILED, absorbed: ${m}`);
    }
  }

  private handleAccountIdTranslation(message: RawBapMessage): void {
    try {
      const body = message.body;
      if (body.length < 4) {
        this.logger.warn(
          `BAP acct-id xlate absorbed (short body ${body.length}B)`
        );
        return;
      }
      const platformIds = parseAccountIdTranslateRequest(body);
      const n = platformIds.length;
      const rsp = buildAccountIdTranslateResponse(
        platformIds,
        LOCAL_INVESTMENT_ACCOUNT_SOID
      );

      this.send({
        msgType:
          BapMessageType.ClientToBapAccountIdTranslationPlatformToInvestmentResponse,
        sequence: message.sequence,
        body: rsp,
      });
      this.logger.log(
        `BAP acct-id xlate rsp (seq ${message.sequence.toString(16)}, ` +
          `${n} id(s) → 0x${LOCAL_INVESTMENT_ACCOUNT_SOID.toString(16)}, body ${rsp.length}B)`
      );
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BAP acct-id xlate rsp FAILED, absorbed: ${m}`);
    }
  }

  private handleUnsubscribeRequest(message: RawBapMessage): void {
    // Native wire 14 uses the same nine-byte family/root layout as subscribe
    // (82B7DCB8 encoder; 82B7DF50 decoder). Wire 15 has an empty body.
    const sub = parseSubscribeRequest(message.body);
    if (!sub) {
      this.logger.warn(`BAP unsubscribe rejected: expected 9 bytes, received ${message.body.length}`);
      return;
    }
    const root = sub.rootSoid || LOCAL_INVESTMENT_ACCOUNT_SOID;
    const removed = this.inventorySubscriptions.get(sub.familyType) === root;
    if (removed) this.inventorySubscriptions.delete(sub.familyType);
    this.send({
      msgType: BapMessageType.ClientToBapUnsubscribeResponse,
      sequence: message.sequence,
      body: Buffer.alloc(0),
    });
    this.logger.log(`BAP unsubscribe family_type=${sub.familyType} root=0x${sub.rootSoid.toString(16)} removed=${removed}`);
  }

  private handleSubscriptionRequest(message: RawBapMessage): void {
    const sub = parseSubscribeRequest(message.body);
    if (sub && [0, 1, 3, 4].includes(sub.familyType)) {
      this.inventorySubscriptions.set(sub.familyType, sub.rootSoid || LOCAL_INVESTMENT_ACCOUNT_SOID);
    }
    const subAckRoot =
      message.body.length >= 9
        ? Buffer.from(message.body.subarray(1, 9))
        : Buffer.alloc(8);

    const pushes: { body: Buffer; label: string }[] = [];
    if (sub?.familyType === e_queuez_family_type._queuez_family_type_self) {
      const accountSoid = LOCAL_INVESTMENT_ACCOUNT_SOID;
      pushes.push({
        body: buildSelfBaselineBody(
          accountSoid,
          accountSoid,
          currentEquipmentVersion() + this.characterRevision,
          undefined,
          this.selectedCharacterSoid
        ),
        label: "self",
      });
      pushes.push({
        body: buildSelectCharacterBaselineBody(
          accountSoid,
          accountSoid,
          currentEquipmentVersion() + this.characterRevision,
          undefined,
          characterCards()
        ),
        label: "select_character",
      });
    } else if (
      sub?.familyType ===
      e_queuez_family_type._queuez_family_type_select_character
    ) {
      const accountSoid = LOCAL_INVESTMENT_ACCOUNT_SOID;
      pushes.push({
        body: buildSelectCharacterBaselineBody(
          accountSoid,
          accountSoid,
          currentEquipmentVersion() + this.characterRevision,
          undefined,
          characterCards()
        ),
        label: "select_character",
      });
    } else if (sub) {
      const root =
        sub.familyType === e_queuez_family_type._queuez_family_type_universe
          ? sub.rootSoid || UNIVERSE_ROOT_SOID
          : sub.rootSoid || LOCAL_INVESTMENT_ACCOUNT_SOID;
      const baseline = this.buildBaseline(sub.familyType, root);
      if (baseline) {
        pushes.push(baseline);
      }
    }

    // Encrypt/send baselines first, then wire-13 ACK (GCM IV order).
    const pushParts: string[] = [];
    for (const p of pushes) {
      const seq = this.pushSeq++ >>> 0;
      this.send({
        msgType: BapMessageType.QueuezToClientUpdateNotification,
        sequence: seq,
        body: p.body,
      });
      pushParts.push(`${p.label} type-123 seq ${seq} ${p.body.length}B`);
    }

    this.send({
      msgType: BapMessageType.ClientToBapSubscriptionResponse,
      sequence: message.sequence,
      body: subAckRoot,
    });

    const familyInfo = sub
      ? `family_type=${sub.familyType} root=0x${sub.rootSoid.toString(16)}`
      : `req ${message.body.length}B unparsed`;
    this.logger.log(
      `BAP sub rsp (seq ${message.sequence.toString(16)}, ${familyInfo}` +
        `${pushParts.length ? `; pushed ${pushParts.join("; ")}` : "; FIFO ack only"})`
    );
  }

  /**
   * FAH type 100 is dest PRIMARY. The client relays that inner body
   * here as wire 9; we push the same bytes back so investment delivers
   * the join result.
   */
  private handleRelayedActivityNotification(message: RawBapMessage): void {
    const parsed = parseActivityHostToClientNotification(message.body);
    if (!parsed || parsed.variant !== ACTIVITY_HOST_NOTIFICATION_VARIANT) {
      this.logger.warn(
        `BAP b->c not ignored (variant ${message.body[0] ?? -1}, ` +
          `${message.body.length}B)`
      );
      return;
    }

    const seq = this.pushSeq++ >>> 0;
    this.send({
      msgType: BapMessageType.BapToClientActivityNotification,
      sequence: seq,
      body: message.body,
    });
    this.logger.log(
      `BAP b->c not echo (seq ${seq.toString(16)}, ` +
        `ah=0x${parsed.sessionId.toString(16)} class=${parsed.kind} ` +
        `payload ${parsed.payload.length}B)`
    );
  }

  /** Empty-body response (qz_reg / rrc / echo). */
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
      `BAP ${label} rsp (seq ${message.sequence.toString(16)}, req ${message.body.length}B)`
    );
  }

  private handleChannelStartup(message: RawBapMessage): void {
    // I think this is arbitrary, v4g uses this magic.
    const CHANNEL_MAGIC = Buffer.from("DESTINY\x01", "ascii");

    if (
      message.body.length < 8 ||
      !message.body.subarray(0, 8).equals(CHANNEL_MAGIC)
    ) {
      this.logger.warn(
        `BAP channel startup magic mismatch (${message.body.length} bytes)`
      );
    }

    const seed = crypto.randomBytes(120);
    const body = Buffer.concat([CHANNEL_MAGIC, seed]);
    this.send({
      msgType: BapMessageType.ClientToBapChannelStartupResponse,
      sequence: message.sequence,
      body,
    });
    this.logger.log("BAP channel startup complete");
  }

  /** Secure hello: wrap GCM key/IV in signon AES-CBC+HMAC, then enable codec GCM. */
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
    this.logger.log("BAP secure hello complete — GCM enabled");
  }

  private send(message: RawBapMessage): void {
    const frame = this.codec.encode(message);
    this.logger.log(
      `BAP → ${bapMessageTypeName(message.msgType)} seq=${message.sequence} ` +
        `frame=${frame.length}b`
    );
    this.socket.write(frame);
  }

  private buildBaseline(family: number, root: bigint) {
    return buildBaselineForFamily(family, root, this.selectedCharacterSoid, currentEquipmentVersion() + this.characterRevision);
  }

  publishInventoryEquipment(fullBaseline = false): void {
    withCharacter(this.characterContext, () => this.publishCharacterEquipment(fullBaseline));
  }

  private publishCharacterEquipment(fullBaseline: boolean): void {
    if (this.closed) return;
    for (const [family, root] of this.inventorySubscriptions) {
      const baseline = this.buildBaseline(family, root);
      if (!baseline) continue;
      // Live equipment is an update to retained objects, not initial bootstrap.
      // Framing: transaction count, family, root u64, version, full-baseline u8.
      baseline.body[20] = fullBaseline ? 1 : 0;
      this.send({
        msgType: BapMessageType.QueuezToClientUpdateNotification,
        sequence: this.pushSeq++ >>> 0,
        body: baseline.body,
      });
      this.logger.log(`D1A_INVENTORY_PUBLISH family=${baseline.label} version=${currentEquipmentVersion()} bytes=${baseline.body.length}`);
    }
  }
}

function aes128CbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function buildBaselineForFamily(
  familyType: number,
  rootSoid: bigint,
  characterSoid = SIGNED_IN_CHARACTER_SOID,
  version = currentEquipmentVersion()
): { body: Buffer; label: string } | null {
  switch (familyType) {
    case e_queuez_family_type._queuez_family_type_self:
      return {
        body: buildSelfBaselineBody(
          rootSoid,
          rootSoid,
          version,
          undefined,
          characterSoid
        ),
        label: "self",
      };
    case e_queuez_family_type._queuez_family_type_select_character:
      return {
        body: buildSelectCharacterBaselineBody(
          rootSoid,
          rootSoid,
          version,
          undefined,
          characterCards()
        ),
        label: "select_character",
      };
    case e_queuez_family_type._queuez_family_type_inspection:
      return {
        body: buildInspectionBaselineBody(
          rootSoid,
          rootSoid,
          version,
          INSPECTION_CHECKSUM_PRIMARY,
          characterSoid
        ),
        label: "inspection",
      };
    case e_queuez_family_type._queuez_family_type_peer:
      return {
        body: buildPeerBaselineBody(
          rootSoid,
          rootSoid,
          version,
          PEER_CHECKSUM_PRIMARY,
          characterSoid
        ),
        label: "peer",
      };
    case e_queuez_family_type._queuez_family_type_roster:
      return {
        body: buildRosterBaselineBody(rootSoid, rootSoid),
        label: "roster",
      };
    case e_queuez_family_type._queuez_family_type_universe:
      return {
        body: buildUniverseBaselineBody(rootSoid, rootSoid),
        label: "universe",
      };
    default:
      return null;
  }
}
