import type * as net from "node:net";
import type ILogger from "../ILogger";
import {
  FAKE_CONNECTION_ID,
  FAKE_DW_CANDIDATE_SESSION_ID,
  FAKE_DW_SESSION_ID,
  MM_CREATE_SESSION,
  MM_DELETE_SESSION,
  MM_FIND_SESSIONS,
  MM_GET_PERFORMANCE,
  MM_SUBMIT_PERFORMANCE,
  MM_UPDATE_SESSION,
  SVC_BD_MATCHMAKING,
} from "./constants";
import {
  buildTaskReplyFrame,
  peekTypedByte,
  readTypedBlob,
  readTypedByte,
  readTypedU32,
  readTypedU64,
  writeTypedBlob,
  writeTypedI64,
  writeTypedU32,
  writeTypedU64,
} from "./typed-buffer";
import { hexPreview } from "./util";

let nextTransactionId = 1n;
let loopbackSessionResult: Buffer | null = null;

/**
 * createSession sends the advertised session without a session id/player count;
 * findSessions returns the same object with those two server-owned fields added.
 * Preserve the Destiny-specific tail byte-for-byte.
 */
export function buildLoopbackSessionResult(params: Buffer): Buffer | null {
  const hostAddr = readTypedBlob(params);
  if (!hostAddr) {
    return null;
  }
  const gameType = readTypedU32(hostAddr.next);
  if (!gameType) {
    return null;
  }
  const maxPlayers = readTypedU32(gameType.next);
  if (!maxPlayers) {
    return null;
  }

  const sessionId = Buffer.alloc(8);
  sessionId.writeBigUInt64LE(FAKE_DW_CANDIDATE_SESSION_ID, 0);
  return Buffer.concat([
    writeTypedBlob(hostAddr.value),
    writeTypedBlob(sessionId),
    writeTypedU32(gameType.value),
    writeTypedU32(maxPlayers.value),
    writeTypedU32(1),
    maxPlayers.next,
  ]);
}

/**
 * bdMatchMaking (service 21). Wire: typed-byte taskId + typed params.
 * Activity session creation blocks on createSession until a TASK_REPLY arrives.
 */
export function handleMatchMaking(
  socket: net.Socket,
  remote: string,
  rest: Buffer,
  logger: ILogger,
  sendTaskReply: (taskId: number, results: Buffer[]) => void
): void {
  const parsed = readTypedByte(rest);
  if (!parsed) {
    logger.warn(
      `[${remote}] bdMatchMaking missing typed task id rest=${hexPreview(rest)}`
    );
    return;
  }

  const { value: taskId, next } = parsed;
  logger.log(
    `[${remote}] bdMatchMaking task=${taskId} params=${hexPreview(next, 64)}`
  );

  switch (taskId) {
    case MM_CREATE_SESSION: {
      const sessionId = FAKE_DW_SESSION_ID;
      const idBytes = Buffer.alloc(8);
      idBytes.writeBigUInt64LE(sessionId, 0);
      loopbackSessionResult = buildLoopbackSessionResult(next);
      sendTaskReply(taskId, [writeTypedBlob(idBytes)]);
      logger.log(
        `[${remote}] bdMatchMaking createSession → id=0x${sessionId.toString(16)} advert=${loopbackSessionResult?.length ?? 0}B`
      );
      break;
    }

    case MM_GET_PERFORMANCE: {
      const results: Buffer[] = [];
      let cursor = next;
      const gameType = readTypedU32(cursor);
      if (gameType) {
        cursor = gameType.next;
        while (cursor.length > 0) {
          const uid = readTypedU64(cursor);
          if (!uid) {
            break;
          }
          cursor = uid.next;
          results.push(
            Buffer.concat([writeTypedU64(uid.value), writeTypedI64(10n)])
          );
        }
        logger.log(
          `[${remote}] bdMatchMaking getPerformance gameType=0x${gameType.value.toString(16)} users=${results.length}`
        );
      }
      sendTaskReply(taskId, results);
      break;
    }

    case MM_UPDATE_SESSION:
    case MM_DELETE_SESSION:
    case MM_SUBMIT_PERFORMANCE:
      sendTaskReply(taskId, []);
      break;

    case MM_FIND_SESSIONS:
      if (loopbackSessionResult) {
        sendTaskReply(taskId, [loopbackSessionResult]);
        logger.log(
          `[${remote}] bdMatchMaking findSessions → loopback session ${loopbackSessionResult.length}B`
        );
      } else {
        sendTaskReply(taskId, []);
        logger.warn(
          `[${remote}] bdMatchMaking findSessions → 0 sessions (no cached advert)`
        );
      }
      break;

    default:
      logger.warn(
        `[${remote}] bdMatchMaking unhandled task=${taskId} — empty success`
      );
      sendTaskReply(taskId, []);
      break;
  }
}

export function sendLobbyTaskReply(
  socket: net.Socket,
  remote: string,
  taskId: number,
  resultObjects: Buffer[],
  logger: ILogger
): void {
  const txn = nextTransactionId++;
  const frame = buildTaskReplyFrame(txn, taskId, resultObjects);
  socket.write(frame);
  logger.log(
    `[${remote}] TASK_REPLY task=${taskId} txn=${txn} results=${resultObjects.length} frame=${hexPreview(frame, 48)}`
  );
}

export function dispatchLobbyService(
  socket: net.Socket,
  remote: string,
  serviceId: number,
  rest: Buffer,
  logger: ILogger
): void {
  const reply = (taskId: number, results: Buffer[]) =>
    sendLobbyTaskReply(socket, remote, taskId, results, logger);

  if (serviceId === SVC_BD_MATCHMAKING) {
    handleMatchMaking(socket, remote, rest, logger, reply);
    return;
  }

  const taskId = peekTypedByte(rest);
  logger.warn(
    `[${remote}] stub empty TASK_REPLY for service=${serviceId} task=${taskId ?? "?"}`
  );
  reply(taskId ?? 0, []);
}

export { FAKE_CONNECTION_ID };
