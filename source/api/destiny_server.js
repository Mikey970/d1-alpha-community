"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const HOST = process.env.D1_SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.D1_SERVER_PORT || 36000);
const TITLE_PORT = Number(process.env.D1_TITLE_PORT || 1020);
const BAP_PORT = Number(process.env.D1_BAP_PORT || 1021);
const WORKSPACE = path.resolve(__dirname, "..");
const CAPTURE_DIR = path.join(WORKSPACE, "captures", "requests");
const LOG_FILE = path.join(WORKSPACE, "captures", "requests.jsonl");
const TITLE_CAPTURE_DIR = path.join(WORKSPACE, "captures", "title");
const TITLE_LOG_FILE = path.join(WORKSPACE, "captures", "title.jsonl");
const BAP_CAPTURE_DIR = path.join(WORKSPACE, "captures", "bap");
const BAP_LOG_FILE = path.join(WORKSPACE, "captures", "bap.jsonl");
const RESPONSE_FILE = path.join(__dirname, "responses.json");
const TITLE_RESPONSE_FILE = path.join(__dirname, "title_response.json");
const BAP_RESPONSE_FILE = path.join(__dirname, "bap_response.json");
const MAX_BODY_BYTES = 64 * 1024 * 1024;

fs.mkdirSync(CAPTURE_DIR, { recursive: true });
fs.mkdirSync(TITLE_CAPTURE_DIR, { recursive: true });
fs.mkdirSync(BAP_CAPTURE_DIR, { recursive: true });

let sequence = 0;
let pendingActivityHostEvent = null;
let completedLocalSessionProperties = 0;
let activityHostGeneration = 0;
let activityHostNotificationScheduled = false;
const pendingLocalSessionPropertyIds = new Set();
const assignedLocalSessionPropertyIds = new Set();
let activityHostAssignmentSent = false;
let activityHostClientRequestSeen = false;
let activityHostManagerRequestSequence = 0;
const bapConnectionsByChannel = new Map();

function readProtoVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length && shift < 70n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  return null;
}

function parseBapHelloChannel(frame) {
  if (
    frame.length < 12 ||
    frame[0] !== 1 ||
    frame[1] !== 2 ||
    frame.readUInt16BE(6) !== 0x19
  ) {
    return null;
  }

  let offset = 12;
  while (offset < frame.length) {
    const key = readProtoVarint(frame, offset);
    if (!key) return null;
    offset = key.offset;
    const field = Number(key.value >> 3n);
    const wireType = Number(key.value & 7n);
    if (wireType === 0) {
      const scalar = readProtoVarint(frame, offset);
      if (!scalar) return null;
      offset = scalar.offset;
      if (field === 2) return Number(scalar.value);
    } else if (wireType === 2) {
      const length = readProtoVarint(frame, offset);
      if (!length) return null;
      offset = length.offset + Number(length.value);
      if (offset > frame.length) return null;
    } else {
      return null;
    }
  }
  return null;
}

function incrementBapNonce(nonce) {
  for (let index = 0; index < nonce.length; index += 1) {
    nonce[index] = (nonce[index] + 1) & 0xff;
    if (nonce[index] !== 0) break;
  }
}

function loadRules() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RESPONSE_FILE, "utf8"));
    return Array.isArray(parsed.routes) ? parsed.routes : [];
  } catch (error) {
    process.stderr.write(`Unable to read ${RESPONSE_FILE}: ${error.message}\n`);
    return [];
  }
}

function routeMatches(route, request) {
  const method = (route.method || "*").toUpperCase();
  if (method !== "*" && method !== request.method.toUpperCase()) return false;

  const host = (request.headers.host || "").toLowerCase();
  if (route.host && route.host !== "*" && route.host.toLowerCase() !== host) {
    return false;
  }

  if (route.path && route.path !== "*" && route.path !== request.url) {
    return false;
  }
  if (route.pathPrefix && !request.url.startsWith(route.pathPrefix)) {
    return false;
  }
  return true;
}

function selectResponse(request) {
  const route = loadRules().find((candidate) => routeMatches(candidate, request));
  if (!route) {
    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: "{}",
      rule: "default-empty-json",
    };
  }

  const response = route.response || {};
  const body = response.bodyBase64
    ? Buffer.from(response.bodyBase64, "base64")
    : Buffer.from(response.body || "", "utf8");
  return {
    status: Number(response.status || 200),
    headers: response.headers || {},
    body,
    rule: route.name || "unnamed-route",
  };
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function appendCapture(record) {
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(record)}\n`);
}

const server = http.createServer((request, response) => {
  if (request.url === "/_d1/status") {
    const body = Buffer.from(
      JSON.stringify({
        ok: true,
        httpPort: PORT,
        titlePort: TITLE_PORT,
        bapPort: BAP_PORT,
      }),
    );
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": body.length,
    });
    response.end(body);
    return;
  }

  const chunks = [];
  let totalBytes = 0;
  request.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      response.writeHead(413, { "content-type": "text/plain" });
      response.end("request body too large");
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });

  request.on("end", () => {
    const body = Buffer.concat(chunks);
    const id = `${safeTimestamp()}-${String(++sequence).padStart(4, "0")}`;
    const bodyFile = body.length ? path.join(CAPTURE_DIR, `${id}.bin`) : null;
    if (bodyFile) fs.writeFileSync(bodyFile, body);

    const selected = selectResponse(request);
    const responseBody = Buffer.isBuffer(selected.body)
      ? selected.body
      : Buffer.from(selected.body);
    const record = {
      id,
      receivedAt: new Date().toISOString(),
      method: request.method,
      host: request.headers.host || "",
      url: request.url,
      headers: request.headers,
      bodyBytes: body.length,
      bodySha256: crypto.createHash("sha256").update(body).digest("hex"),
      bodyFile: bodyFile ? path.relative(WORKSPACE, bodyFile) : null,
      bodyUtf8Preview: body.toString("utf8", 0, Math.min(body.length, 2048)),
      bodyHexPreview: body.subarray(0, 256).toString("hex"),
      responseRule: selected.rule,
      responseStatus: selected.status,
      responseBytes: responseBody.length,
    };
    appendCapture(record);
    process.stdout.write(
      `${record.receivedAt} ${record.method} ${record.host}${record.url} ` +
        `(${record.bodyBytes} bytes) -> ${record.responseStatus} ${selected.rule}\n`,
    );

    response.writeHead(selected.status, {
      ...selected.headers,
      "content-length": responseBody.length,
      "x-d1-response-rule": selected.rule,
    });
    response.end(responseBody);

    // The December 2013 title publishes its second local XGI property set
    // after the offline SOS/datamine state has completed and the Activity
    // Host handle is live. Assign on that second publication so the native
    // notification manager can bind the host rather than dropping it early.
    const sessionPropertyMatch =
      request.method === "POST"
        ? request.url.match(
            /^\/title\/41560907\/sessions\/([^/]+)\/properties$/,
          )
        : null;
    if (sessionPropertyMatch) {
      completedLocalSessionProperties += 1;
      const sessionId = sessionPropertyMatch[1];
      if (!assignedLocalSessionPropertyIds.has(sessionId)) {
        pendingLocalSessionPropertyIds.add(sessionId);
      }
      if (
        pendingLocalSessionPropertyIds.size >= 2 &&
        !activityHostNotificationScheduled
      ) {
        activityHostNotificationScheduled = true;
        const generationSessionIds = Array.from(
          pendingLocalSessionPropertyIds,
        ).slice(0, 2);
        const generation = activityHostGeneration + 1;
        setTimeout(() => {
          const targetConnection = bapConnectionsByChannel.get(4);
          if (
            !targetConnection ||
            targetConnection.socket.destroyed ||
            typeof targetConnection.sendActivityHostStartupNotification !==
              "function"
          ) {
            process.stdout.write(
              `${new Date().toISOString()} BAP deferred proactive ` +
                `activity-host generation ${generation} because channel 4 ` +
                `is not ready\n`,
            );
            activityHostNotificationScheduled = false;
            return;
          }
          for (const assignedSessionId of generationSessionIds) {
            assignedLocalSessionPropertyIds.add(assignedSessionId);
            pendingLocalSessionPropertyIds.delete(assignedSessionId);
          }
          activityHostGeneration = generation;
          activityHostNotificationScheduled = false;
          process.stdout.write(
            `${new Date().toISOString()} BAP assigning local Activity Host ` +
              `for session generation ${generation} ` +
              `[${generationSessionIds.join(",")}] after property update ` +
              `${completedLocalSessionProperties}\n`,
          );
          targetConnection.sendActivityHostStartupNotification(
            4,
            targetConnection,
            generationSessionIds[generationSessionIds.length - 1],
          );
        }, 0);
      }
    }
  });
});

server.on("error", (error) => {
  process.stderr.write(`Destiny local server failed: ${error.stack || error}\n`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Destiny local server listening on http://${HOST}:${PORT}\n`);
});

const titleServer = net.createServer((socket) => {
  completedLocalSessionProperties = 0;
  activityHostGeneration = 0;
  activityHostNotificationScheduled = false;
  pendingLocalSessionPropertyIds.clear();
  assignedLocalSessionPropertyIds.clear();
  activityHostAssignmentSent = false;
  activityHostClientRequestSeen = false;
  activityHostManagerRequestSequence = 0;
  pendingActivityHostEvent = null;
  const connectionId = `${safeTimestamp()}-${String(++sequence).padStart(4, "0")}`;
  let chunkIndex = 0;
  let receivedBytes = 0;
  let responseSent = false;
  process.stdout.write(
    `${new Date().toISOString()} title connection ` +
      `${socket.remoteAddress}:${socket.remotePort} -> ${HOST}:${TITLE_PORT}\n`,
  );

  socket.on("data", (chunk) => {
    receivedBytes += chunk.length;
    const captureId = `${connectionId}-${String(++chunkIndex).padStart(3, "0")}`;
    const captureFile = path.join(TITLE_CAPTURE_DIR, `${captureId}.bin`);
    fs.writeFileSync(captureFile, chunk);
    const record = {
      id: captureId,
      receivedAt: new Date().toISOString(),
      protocol: "tcp",
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      bodyBytes: chunk.length,
      bodySha256: crypto.createHash("sha256").update(chunk).digest("hex"),
      bodyFile: path.relative(WORKSPACE, captureFile),
      bodyHexPreview: chunk.subarray(0, 512).toString("hex"),
      bodyAsciiPreview: chunk
        .subarray(0, 512)
        .toString("latin1")
        .replace(/[^\x20-\x7E]/g, "."),
    };
    fs.appendFileSync(TITLE_LOG_FILE, `${JSON.stringify(record)}\n`);
    process.stdout.write(
      `${record.receivedAt} title data (${record.bodyBytes} bytes) ` +
        `${record.bodyHexPreview}\n`,
    );

    if (!responseSent) {
      try {
        const configured = JSON.parse(
          fs.readFileSync(TITLE_RESPONSE_FILE, "utf8"),
        );
        const minimumRequestBytes = Number(
          configured.minimumRequestBytes || 0,
        );
        if (configured.bodyBase64 && receivedBytes >= minimumRequestBytes) {
          const responseBody = Buffer.from(configured.bodyBase64, "base64");
          socket.write(responseBody);
          responseSent = true;
          const responseRecord = {
            id: `${connectionId}-response`,
            sentAt: new Date().toISOString(),
            protocol: "tcp",
            direction: "server-to-client",
            name: configured.name || "unnamed-title-response",
            bodyBytes: responseBody.length,
            bodySha256: crypto
              .createHash("sha256")
              .update(responseBody)
              .digest("hex"),
            bodyHex: responseBody.toString("hex"),
          };
          fs.appendFileSync(
            TITLE_LOG_FILE,
            `${JSON.stringify(responseRecord)}\n`,
          );
          process.stdout.write(
            `${responseRecord.sentAt} title response ` +
              `${responseRecord.name} (${responseRecord.bodyBytes} bytes) ` +
              `${responseRecord.bodyHex}\n`,
          );
        }
      } catch (error) {
        process.stderr.write(
          `Unable to read ${TITLE_RESPONSE_FILE}: ${error.message}\n`,
        );
      }
    }
  });

  socket.on("error", (error) => {
    process.stderr.write(
      `${new Date().toISOString()} title connection error ` +
        `${socket.remoteAddress || "unknown"}:${socket.remotePort || 0} ` +
        `${error.code || error.message}\n`,
    );
  });
});

titleServer.on("error", (error) => {
  process.stderr.write(`Destiny title server failed: ${error.stack || error}\n`);
  process.exitCode = 1;
});

titleServer.listen(TITLE_PORT, HOST, () => {
  process.stdout.write(
    `Destiny title server listening on tcp://${HOST}:${TITLE_PORT}\n`,
  );
});

const bapServer = net.createServer((socket) => {
  const connectionId = `${safeTimestamp()}-${String(++sequence).padStart(4, "0")}`;
  const bapConnection = {
    connectionId,
    socket,
    channel: null,
    sendAuthenticatedBap: null,
    sendActivityHostStartupNotification: null,
    activityHostManagerEligible: false,
    secureChannelReady: false,
    activityHostManagerRequestSent: false,
    activityHostType6AssignmentSent: false,
    activitySessionId: null,
  };
  let chunkIndex = 0;
  let receivedBytes = 0;
  let responseSent = false;
  let registrationResponseSent = false;
  let relayRegistrationResponseSent = false;
  let accountFamilyBaselineSent = false;
  const emptyFamilyBaselinesSent = new Set();
  let investmentAccountId = 0n;
  let investmentCharacterId = 0n;
  let gcmKey = null;
  let gcmNonceIn = null;
  let gcmNonceOut = null;
  // Captured from Tiger's own create_character encoder after choosing the
  // first/default class and accepting the default appearance. The request
  // schema is 0x80801AA9: endpoint, 0x808018EC identity choices,
  // 0x808018F0 appearance, and 0x80801BFF display data. Keep the full body so
  // an actual create request can replace it without translating enum values.
  let investmentCharacterCreateRequest = Buffer.from(
    "01f5c06030102d90101010853085f07a5086b0865084dec32de86c033c03ac030c03940324034c030c0003fffbfff81d14000400040004000400040000",
    "hex",
  );
  let receiveBuffer = Buffer.alloc(0);
  process.stdout.write(
    `${new Date().toISOString()} BAP connection ` +
      `${socket.remoteAddress}:${socket.remotePort} -> ${HOST}:${BAP_PORT}\n`,
  );

  function sendAuthenticatedBap(plaintext, name, idSuffix) {
    const outerHeader = Buffer.alloc(6);
    outerHeader[0] = 1;
    outerHeader[1] = 1;
    let protectedPayload;
    if (gcmKey && gcmNonceOut) {
      const cipher = crypto.createCipheriv(
        "aes-128-gcm",
        gcmKey,
        gcmNonceOut,
      );
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      protectedPayload = Buffer.concat([cipher.getAuthTag(), ciphertext]);
      incrementBapNonce(gcmNonceOut);
    } else {
      const authenticator = crypto
        .createHash("sha1")
        .update(plaintext)
        .digest()
        .subarray(0, 16);
      protectedPayload = Buffer.concat([authenticator, plaintext]);
    }
    outerHeader.writeUInt32BE(protectedPayload.length, 2);
    const responseBody = Buffer.concat([outerHeader, protectedPayload]);
    socket.write(responseBody);
    const responseRecord = {
      id: `${connectionId}-${idSuffix}`,
      sentAt: new Date().toISOString(),
      protocol: "bap-tcp",
      direction: "server-to-client",
      name,
      bodyBytes: responseBody.length,
      bodySha256: crypto
        .createHash("sha256")
        .update(responseBody)
        .digest("hex"),
      bodyHex: responseBody.toString("hex"),
    };
    fs.appendFileSync(BAP_LOG_FILE, `${JSON.stringify(responseRecord)}\n`);
    process.stdout.write(
      `${responseRecord.sentAt} BAP response ` +
        `${responseRecord.name} (${responseRecord.bodyBytes} bytes) ` +
        `${responseRecord.bodyHex}\n`,
    );
  }
  bapConnection.sendAuthenticatedBap = sendAuthenticatedBap;

  function sendModernSecureHelloResponse(frame) {
    const requestSequence = frame.readUInt32BE(8);
    gcmKey = crypto.randomBytes(16);
    const gcmIv = crypto.randomBytes(12);
    const cbcNonce = Buffer.alloc(16, 0);
    const dataRaw = Buffer.concat([gcmIv, gcmKey]);
    const cipher = crypto.createCipheriv(
      "aes-128-cbc",
      Buffer.alloc(16, 0),
      cbcNonce,
    );
    const dataEncrypted = Buffer.concat([
      cipher.update(dataRaw),
      cipher.final(),
    ]);
    const payloadCore = Buffer.alloc(
      4 + cbcNonce.length + dataEncrypted.length,
    );
    payloadCore.writeUInt32BE(0x50, 0);
    cbcNonce.copy(payloadCore, 4);
    dataEncrypted.copy(payloadCore, 4 + cbcNonce.length);
    const hmac = crypto
      .createHmac("sha256", Buffer.alloc(16, 0))
      .update(payloadCore)
      .digest();
    const body = Buffer.concat([payloadCore, hmac]);
    const plaintext = Buffer.alloc(8 + body.length);
    plaintext.writeUInt16BE(0x1a, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    plaintext.writeUInt16BE(200, 6);
    body.copy(plaintext, 8);
    const outerHeader = Buffer.alloc(6);
    outerHeader[0] = 1;
    outerHeader[1] = 2;
    outerHeader.writeUInt32BE(plaintext.length, 2);
    const responseBody = Buffer.concat([outerHeader, plaintext]);
    socket.write(responseBody);
    responseSent = true;
    gcmNonceOut = Buffer.from(gcmIv);
    gcmNonceIn = Buffer.from(gcmIv);
    gcmNonceIn[11] ^= 1;
    const responseRecord = {
      id: `${connectionId}-modern-secure-hello-response`,
      sentAt: new Date().toISOString(),
      protocol: "bap-tcp",
      direction: "server-to-client",
      name: "bap-modern-secure-hello-response-type-26",
      bodyBytes: responseBody.length,
      bodySha256: crypto
        .createHash("sha256")
        .update(responseBody)
        .digest("hex"),
      bodyHex: responseBody.toString("hex"),
    };
    fs.appendFileSync(BAP_LOG_FILE, `${JSON.stringify(responseRecord)}\n`);
    process.stdout.write(
      `${responseRecord.sentAt} BAP response ${responseRecord.name} ` +
        `(${responseRecord.bodyBytes} bytes) ${responseRecord.bodyHex}\n`,
    );
  }

  function normalizeBapFrame(frame) {
    if (!gcmKey || !gcmNonceIn || frame[1] !== 1) return frame;
    const protectedPayload = frame.subarray(6);
    if (protectedPayload.length < 16) {
      throw new Error("encrypted BAP payload is shorter than its GCM tag");
    }
    const decipher = crypto.createDecipheriv(
      "aes-128-gcm",
      gcmKey,
      gcmNonceIn,
    );
    decipher.setAuthTag(protectedPayload.subarray(0, 16));
    const plaintext = Buffer.concat([
      decipher.update(protectedPayload.subarray(16)),
      decipher.final(),
    ]);
    incrementBapNonce(gcmNonceIn);
    const normalized = Buffer.alloc(22 + plaintext.length);
    normalized[0] = 1;
    normalized[1] = 1;
    normalized.writeUInt32BE(16 + plaintext.length, 2);
    plaintext.copy(normalized, 22);
    return normalized;
  }

  function sendSimpleBapSuccess(
    responseType,
    requestSequence,
    name,
    idSuffix,
    payload = Buffer.alloc(0),
  ) {
    const plaintext = Buffer.alloc(8 + payload.length);
    plaintext.writeUInt16BE(responseType, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    plaintext.writeUInt16BE(200, 6);
    payload.copy(plaintext, 8);
    sendAuthenticatedBap(plaintext, name, idSuffix);
  }

  function buildAccountFamilyBaseline() {
    const accountId = investmentAccountId || 0x000900002aa614e0n;
    const characterId = investmentCharacterId;

    // The signin readiness lookup requests family 4, definition 0. Its live
    // descriptor is schema 808017D0/checksum A9F02EA4. 808017D0 contains the
    // required 808017C9 object: populate its optional leading SOID, leave its
    // next six optional fields absent, encode the required 808017AF boolean
    // and its required 80801BD0 object with 128 optional fields absent, then
    // leave the final 808017C9 field absent. This is 201 meaningful bits.
    const accountObjectPayload = Buffer.alloc(characterId !== 0n ? 34 : 26);
    let accountBitOffset = 0;
    function writeAccountBits(value, count) {
      const encoded = BigInt(value);
      for (let bit = count - 1; bit >= 0; bit -= 1) {
        if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
          accountObjectPayload[Math.floor(accountBitOffset / 8)] |=
            1 << (7 - (accountBitOffset % 8));
        }
        accountBitOffset += 1;
      }
    }
    writeAccountBits(1, 1); // SOID field present
    writeAccountBits(accountId, 64);
    writeAccountBits(0, 1); // optional 808017C9 field 1 absent
    if (characterId !== 0n) {
      // 808017C9 field 2 decodes at account-object +0x60. Tiger reads this
      // exact value as the selected character during character_signin.
      writeAccountBits(1, 1);
      writeAccountBits(characterId, 64);
    } else {
      writeAccountBits(0, 1);
    }
    writeAccountBits(0, 4); // optional 808017C9 fields 3..6 absent
    writeAccountBits(0, 1); // required 808017AF boolean
    writeAccountBits(0, 128); // all 80801BD0 fields absent
    writeAccountBits(0, 1); // optional 808017C9 field 8 absent
    const expectedAccountBitCount = characterId !== 0n ? 265 : 201;
    if (accountBitOffset !== expectedAccountBitCount) {
      throw new Error(`account object bit count mismatch: ${accountBitOffset}`);
    }

    let characterObjectPayload = null;
    if (characterId !== 0n) {
      // Family-4 definition 1 is schema 80801A01/checksum D78A7055. Its
      // required 808019FC base has 19 optional fields. Field 0 is the SOID;
      // fields 1 and 2 are the same 808018EC and 808018F0 objects emitted by
      // Tiger in create_character schema 80801AA9. Copy those exact bits into
      // the character rather than returning the skeletal SOID-only object that
      // Orbit correctly classifies as a new/incomplete character.
      characterObjectPayload = Buffer.alloc(35);
      let characterBitOffset = 0;
      function writeCharacterBits(value, count) {
        const encoded = BigInt(value);
        for (let bit = count - 1; bit >= 0; bit -= 1) {
          if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
            characterObjectPayload[Math.floor(characterBitOffset / 8)] |=
              1 << (7 - (characterBitOffset % 8));
          }
          characterBitOffset += 1;
        }
      }
      function copyCreateRequestBits(sourceBitOffset, count) {
        for (let bit = 0; bit < count; bit += 1) {
          const absoluteBit = sourceBitOffset + bit;
          const value =
            (investmentCharacterCreateRequest[Math.floor(absoluteBit / 8)] >>
              (7 - (absoluteBit % 8))) &
            1;
          writeCharacterBits(value, 1);
        }
      }
      writeCharacterBits(1, 1); // canonical SOID present
      writeCharacterBits(characterId, 64);
      writeCharacterBits(1, 1); // 808019FC field 1 / 808018EC present
      copyCreateRequestBits(16, 27);
      writeCharacterBits(1, 1); // 808019FC field 2 / 808018F0 present
      copyCreateRequestBits(43, 170);
      writeCharacterBits(0, 16); // remaining 808019FC fields absent
      if (characterBitOffset !== 280) {
        throw new Error(
          `character object bit count mismatch: ${characterBitOffset}`,
        );
      }
    }

    const accountEntrySize = 16 + accountObjectPayload.length;
    const characterEntrySize = characterObjectPayload
      ? 16 + characterObjectPayload.length
      : 0;
    const transaction = Buffer.alloc(
      25 + accountEntrySize + characterEntrySize,
    );
    transaction.writeUInt32BE(1, 0); // family transaction count
    transaction.writeUInt32BE(4, 4); // account family
    transaction.writeBigUInt64BE(accountId, 8); // family root SOID
    transaction.writeInt32BE(characterObjectPayload ? 1 : 0, 16);
    transaction[20] = 1; // full baseline
    transaction.writeUInt32BE(characterObjectPayload ? 2 : 1, 21);
    transaction.writeUInt32BE(0xa9f02ea4, 25); // 808017D0 checksum
    transaction.writeBigUInt64BE(accountId, 29); // object SOID
    transaction.writeUInt32BE(accountObjectPayload.length, 37);
    accountObjectPayload.copy(transaction, 41);
    if (characterObjectPayload) {
      const characterEntryOffset = 25 + accountEntrySize;
      transaction.writeUInt32BE(0xd78a7055, characterEntryOffset);
      transaction.writeBigUInt64BE(characterId, characterEntryOffset + 4);
      transaction.writeUInt32BE(
        characterObjectPayload.length,
        characterEntryOffset + 12,
      );
      characterObjectPayload.copy(transaction, characterEntryOffset + 16);
    }
    return transaction;
  }

  function sendAccountFamilyBaseline(requestSequence) {
    // Direct 0x007B queuez push. The initial low-level 0x000C subscription
    // creates the local family-4 record before this full baseline arrives.
    const transaction = buildAccountFamilyBaseline();

    const plaintext = Buffer.alloc(6 + transaction.length);
    plaintext.writeUInt16BE(0x007b, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    transaction.copy(plaintext, 6);
    sendAuthenticatedBap(
      plaintext,
      "d1-alpha-account-family-baseline",
      `account-family-baseline-${requestSequence}`,
    );
  }

  function sendEmptyFamilyBaseline(requestSequence, family, rootSoid) {
    const transaction = Buffer.alloc(25);
    transaction.writeUInt32BE(1, 0);
    transaction.writeUInt32BE(family, 4);
    transaction.writeBigUInt64BE(rootSoid, 8);
    transaction.writeInt32BE(0, 16);
    transaction[20] = 1;
    transaction.writeUInt32BE(0, 21);
    const plaintext = Buffer.alloc(6 + transaction.length);
    plaintext.writeUInt16BE(0x007b, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    transaction.copy(plaintext, 6);
    sendAuthenticatedBap(
      plaintext,
      `d1-alpha-family-${family}-empty-baseline`,
      `family-${family}-empty-baseline-${requestSequence}`,
    );
  }

  function sendWorldServiceResponse(requestSequence, requestChunk) {
    const innerMessageId =
      requestChunk.length >= 30 ? requestChunk.readUInt16BE(28) : 0;
    let returnedEntityId = 0n;
    if (requestChunk.length >= 38) {
      returnedEntityId = requestChunk.readBigUInt64BE(30);
    }

    if (innerMessageId === 0x1f7 && returnedEntityId !== 0n) {
      investmentAccountId = returnedEntityId;
      // The prototype has no durable account service to restore a previously
      // created character on a new BAP connection. Always materialize the
      // account's deterministic default character so a clean launch receives
      // the same valid family-4 account/character pair proven by 0x1F5.
      if (investmentCharacterId === 0n) {
        investmentCharacterId = returnedEntityId + 1n;
      }

      // Policy-1 login_account is a generic BAP response, not a simulation
      // update. Its response schema is 0x80801AB0:
      //   endpoint u16, status(3), detail(32), account SOID(64), two u32s,
      //   five optional identity-extension fields, and an attachment flag.
      // The first extension is required on the successful path even though it
      // is optional in the wire schema. It identifies the client's sole type-5
      // login record; the pre-alpha initializes that record with the sentinel
      // key 0x7FFFFFFFFFFFFFFF and fatals if the successful response omits it.
      //
      // The corrected response is 249 meaningful bits and therefore occupies
      // exactly 32 bytes including byte-alignment padding. Extra body bytes are
      // not part of this policy-1 message and leave unread data after the
      // callback, which the title treats as a fatal protocol error.
      const loginPayload = Buffer.alloc(32);
      let loginBitOffset = 0;
      function writeLoginBits(value, count) {
        const encoded = BigInt(value);
        for (let bit = count - 1; bit >= 0; bit -= 1) {
          if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
            loginPayload[Math.floor(loginBitOffset / 8)] |=
              1 << (7 - (loginBitOffset % 8));
          }
          loginBitOffset += 1;
        }
      }

      writeLoginBits(0x1f7, 16);
      writeLoginBits(1, 3); // decoded status 0 (wire value minus bias 1)
      writeLoginBits(0x80000000, 32); // decoded detail/result 0
      writeLoginBits(returnedEntityId, 64);
      writeLoginBits(0, 32);
      writeLoginBits(0, 32);
      writeLoginBits(1, 1); // first identity-extension field present
      writeLoginBits(0x7fffffffffffffffn, 64); // client type-5 record key
      writeLoginBits(0, 4); // remaining identity-extension fields absent
      writeLoginBits(0, 1); // optional attachment absent
      if (loginBitOffset !== 249) {
        throw new Error(`login_account bit count mismatch: ${loginBitOffset}`);
      }

      const plaintext = Buffer.alloc(8 + loginPayload.length);
      plaintext.writeUInt16BE(0x0b, 0);
      plaintext.writeUInt32BE(requestSequence, 2);
      plaintext.writeUInt16BE(200, 6);
      loginPayload.copy(plaintext, 8);
      sendAuthenticatedBap(
        plaintext,
        "d1-alpha-login-account-response",
        `login-account-${requestSequence}`,
      );
      return;
    }

    if (innerMessageId === 0x00ce) {
      // The request schema carries family value 4 and the account SOID. Its
      // attachment is therefore an account-family update, not family 1. The
      // first response may arrive before the low-level 0x000C subscription has
      // created the local record; the direct 0x007B baseline below completes
      // that initial handshake. After character creation the same 0x00CE path
      // applies version 1 to the already-active family-4 subscription.
      const accountFamilyBaseline = buildAccountFamilyBaseline();

      const responseBitCount =
        16 + 3 + 1 + 16 + accountFamilyBaseline.length * 8;
      const responsePayload = Buffer.alloc(Math.ceil(responseBitCount / 8));
      let responseBitOffset = 0;
      function writeInvestmentBits(value, count) {
        const encoded = BigInt(value);
        for (let bit = count - 1; bit >= 0; bit -= 1) {
          if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
            responsePayload[Math.floor(responseBitOffset / 8)] |=
              1 << (7 - (responseBitOffset % 8));
          }
          responseBitOffset += 1;
        }
      }
      writeInvestmentBits(0x00ce, 16);
      writeInvestmentBits(1, 3); // decoded status 0
      writeInvestmentBits(1, 1); // attachment present
      writeInvestmentBits(accountFamilyBaseline.length, 16);
      for (const byte of accountFamilyBaseline) {
        writeInvestmentBits(byte, 8);
      }
      if (responseBitOffset !== responseBitCount) {
        throw new Error(
          `investment response bit count mismatch: ${responseBitOffset}`,
        );
      }

      const plaintext = Buffer.alloc(8 + responsePayload.length);
      plaintext.writeUInt16BE(0x0b, 0);
      plaintext.writeUInt32BE(requestSequence, 2);
      plaintext.writeUInt16BE(200, 6);
      responsePayload.copy(plaintext, 8);
      sendAuthenticatedBap(
        plaintext,
        "d1-alpha-account-subscription-response",
        `account-subscription-${requestSequence}`,
      );
      return;
    }

    if (innerMessageId === 0x1f5) {
      // Policy-1 create_character returns its own response schema
      // (0x80801AAC), not a simulation update. The schema contains the common
      // status object followed by the newly allocated character SOID. There is
      // no response attachment on the minimal success path; the client refreshes
      // family 4 through 0x00CE after accepting this acknowledgement.
      const characterId =
        (investmentAccountId || 0x000900002aa614e0n) + 1n;
      investmentCharacterId = characterId;
      const createRequestBody = requestChunk.subarray(28);
      if (
        createRequestBody.length >= 61 &&
        createRequestBody.readUInt16BE(0) === 0x1f5
      ) {
        // Preserve Tiger's exact identity and appearance selections for the
        // family-4 character object sent by the immediately following 0x00CE.
        investmentCharacterCreateRequest = Buffer.from(
          createRequestBody.subarray(0, 61),
        );
      }
      const createCharacterPayload = Buffer.alloc(15);
      let createCharacterBitOffset = 0;
      function writeCreateCharacterBits(value, count) {
        const encoded = BigInt(value);
        for (let bit = count - 1; bit >= 0; bit -= 1) {
          if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
            createCharacterPayload[
              Math.floor(createCharacterBitOffset / 8)
            ] |= 1 << (7 - (createCharacterBitOffset % 8));
          }
          createCharacterBitOffset += 1;
        }
      }

      writeCreateCharacterBits(0x1f5, 16);
      writeCreateCharacterBits(1, 3); // decoded status 0
      writeCreateCharacterBits(0x80000000, 32); // decoded detail/result 0
      writeCreateCharacterBits(characterId, 64);
      writeCreateCharacterBits(0, 1); // optional attachment absent
      if (createCharacterBitOffset !== 116) {
        throw new Error(
          `create_character bit count mismatch: ${createCharacterBitOffset}`,
        );
      }

      const plaintext = Buffer.alloc(8 + createCharacterPayload.length);
      plaintext.writeUInt16BE(0x0b, 0);
      plaintext.writeUInt32BE(requestSequence, 2);
      plaintext.writeUInt16BE(200, 6);
      createCharacterPayload.copy(plaintext, 8);
      sendAuthenticatedBap(
        plaintext,
        "d1-alpha-create-character-response",
        `create-character-${requestSequence}`,
      );
      return;
    }

    if (innerMessageId === 0x02be) {
      // 0x80801ABB is the request schema. The paired response schema is
      // 0x80801ABC, whose descriptor at 0x82450C90 inherits the required
      // 0x80801A2B status object and adds no fields of its own. Encode endpoint
      // 0x02BE, status 0/detail 0, and an absent generic attachment, then pad:
      // 16 + 3 + 32 + 1 = 52 meaningful bits => seven bytes.
      const worldServicePayload = Buffer.from("02be3000000000", "hex");
      const plaintext = Buffer.alloc(8 + worldServicePayload.length);
      plaintext.writeUInt16BE(0x0b, 0);
      plaintext.writeUInt32BE(requestSequence, 2);
      plaintext.writeUInt16BE(200, 6);
      worldServicePayload.copy(plaintext, 8);
      sendAuthenticatedBap(
        plaintext,
        "d1-alpha-world-service-empty-success",
        `world-service-empty-${requestSequence}`,
      );
      return;
    }

    if (innerMessageId === 0x0068) {
      // Tiger resolves this endpoint to response schema 0x80801A52. Its
      // flattened descriptor at 0x8235B140 contains the required common
      // 0x80801A2B status plus a required 0x808018D0 object. Callback
      // 0x8385A070 passes that object to the type-5 identity lookup, so its
      // first optional key must identify the existing sentinel record just as
      // login_account does. Leave the remaining four fields and attachment
      // absent: 16 + 3 + 32 + 1 + 64 + 4 + 1 = 121 meaningful bits.
      const responsePayload = Buffer.alloc(16);
      let responseBitOffset = 0;
      function write0068Bits(value, count) {
        const encoded = BigInt(value);
        for (let bit = count - 1; bit >= 0; bit -= 1) {
          if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
            responsePayload[Math.floor(responseBitOffset / 8)] |=
              1 << (7 - (responseBitOffset % 8));
          }
          responseBitOffset += 1;
        }
      }
      write0068Bits(0x0068, 16);
      write0068Bits(1, 3); // decoded status 0
      write0068Bits(0x80000000, 32); // decoded detail/result 0
      write0068Bits(1, 1); // type-5 identity key present
      write0068Bits(0x7fffffffffffffffn, 64);
      write0068Bits(0, 4); // remaining 0x808018D0 fields absent
      write0068Bits(0, 1); // generic attachment absent
      if (responseBitOffset !== 121) {
        throw new Error(`0068 response bit count mismatch: ${responseBitOffset}`);
      }
      const plaintext = Buffer.alloc(8 + responsePayload.length);
      plaintext.writeUInt16BE(0x0b, 0);
      plaintext.writeUInt32BE(requestSequence, 2);
      plaintext.writeUInt16BE(200, 6);
      responsePayload.copy(plaintext, 8);
      sendAuthenticatedBap(
        plaintext,
        "d1-alpha-0068-success",
        `0068-response-${requestSequence}`,
      );
      return;
    }

    // A 0x000B response carries a Reach-era simulation update.  The client
    // rejects an update with no work. Keep the captured compatibility response
    // for the remaining policy-0 world-service endpoints while each endpoint's
    // real response schema is recovered.
    const eventPayloadBytes = 236;
    const eventPayload = Buffer.alloc(eventPayloadBytes);
    // Captured policy-0 compatibility event payload.
    //
    // runtime\reference-good-run-20260806-2019.log is the furthest this title
    // has ever progressed (25,895 lines, reached the destination transition).
    // Its 0x1F7 response was captured verbatim at line 8439 and decoded
    // successfully at line 8469 at the outer simulation-update layer.
    //
    // Bit-decoding that frame shows the event header is type 15 with an
    // aggregate/event size of 236 -- and the 236-byte event payload is zero.
    // It does not satisfy the policy-1 0x1F7 login contract, but it preserves
    // the last non-crashing baseline until the full inherited schema is encoded.
    void requestSequence;
    void returnedEntityId;

    const updateBitCount = 2034;
    const update = Buffer.alloc(Math.ceil(updateBitCount / 8));
    let bitOffset = 0;
    function writeBits(value, count) {
      const encoded = BigInt(value);
      for (let bit = count - 1; bit >= 0; bit -= 1) {
        if (((encoded >> BigInt(bit)) & 1n) !== 0n) {
          update[Math.floor(bitOffset / 8)] |=
            1 << (7 - (bitOffset % 8));
        }
        bitOffset += 1;
      }
    }

    const updateNumber =
      requestChunk.length >= 32 ? requestChunk.readUInt32BE(28) : 0;
    writeBits(updateNumber, 32); // update-number
    writeBits(0, 3); // flags
    writeBits(0, 20); // player-flags
    writeBits(0, 1); // valid-camera-mask
    writeBits(0, 2); // verify-game-time
    writeBits(0, 2); // verify-random

    writeBits(1, 12); // queue-one element count
    writeBits(eventPayloadBytes, 19); // queue-one aggregate payload size
    writeBits(15, 6); // process-server-push event type
    writeBits(eventPayloadBytes, 17); // event payload size
    writeBits(0, 1); // queue element flag
    for (const byte of eventPayload) {
      writeBits(byte, 8);
    }

    writeBits(0, 12); // queue-two element count
    writeBits(0, 19); // queue-two aggregate payload size
    if (bitOffset !== updateBitCount) {
      throw new Error(`simulation update bit count mismatch: ${bitOffset}`);
    }
    const plaintext = Buffer.alloc(8 + update.length);
    plaintext.writeUInt16BE(0x0b, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    plaintext.writeUInt16BE(200, 6);
    update.copy(plaintext, 8);
    sendAuthenticatedBap(
      plaintext,
      "d1-alpha-world-service-investment-response",
      `world-service-${requestSequence}`,
    );
  }

  function sendEchoResponse(requestSequence) {
    // The common response result precedes the four bytes required by the
    // 0x00FB echo decoder.
    const plaintext = Buffer.alloc(12);
    plaintext.writeUInt16BE(0xfb, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    plaintext.writeUInt16BE(200, 6);
    sendAuthenticatedBap(
      plaintext,
      "d1-alpha-echo-response",
      `echo-${requestSequence}`,
    );
  }

  function sendState20PrerequisiteResponse(requestSequence) {
    // Concrete decoder 0x82B7F1A8 uses the descriptor at 0x82037AA8. Its
    // fields 1 (u64 varint) and 2 (u32 varint) are both required; field 3 is
    // optional. Encode the two required values as zero.
    const responsePayload = Buffer.from("08001000", "hex");
    const plaintext = Buffer.alloc(8 + responsePayload.length);
    plaintext.writeUInt16BE(0x13, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    plaintext.writeUInt16BE(200, 6);
    responsePayload.copy(plaintext, 8);
    sendAuthenticatedBap(
      plaintext,
      "d1-alpha-state20-prerequisite-success",
      `state20-prerequisite-${requestSequence}`,
    );
  }

  function readProtoVarint(buffer, startOffset) {
    let value = 0n;
    let shift = 0n;
    let offset = startOffset;
    while (offset < buffer.length && shift <= 63n) {
      const byte = buffer[offset];
      offset += 1;
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return { value, offset };
      }
      shift += 7n;
    }
    throw new Error("invalid Activity Host protobuf varint");
  }

  function readProtoFields(buffer) {
    const fields = [];
    let offset = 0;
    while (offset < buffer.length) {
      const key = readProtoVarint(buffer, offset);
      offset = key.offset;
      const fieldNumber = Number(key.value >> 3n);
      const wireType = Number(key.value & 7n);
      if (fieldNumber === 0) {
        throw new Error("invalid Activity Host protobuf field number");
      }

      if (wireType === 0) {
        const fieldValue = readProtoVarint(buffer, offset);
        offset = fieldValue.offset;
        fields.push({ fieldNumber, wireType, value: fieldValue.value });
      } else if (wireType === 1) {
        if (offset + 8 > buffer.length) {
          throw new Error("truncated Activity Host fixed64 field");
        }
        fields.push({
          fieldNumber,
          wireType,
          value: buffer.subarray(offset, offset + 8),
        });
        offset += 8;
      } else if (wireType === 2) {
        const length = readProtoVarint(buffer, offset);
        offset = length.offset;
        const byteLength = Number(length.value);
        if (!Number.isSafeInteger(byteLength) || offset + byteLength > buffer.length) {
          throw new Error("truncated Activity Host length-delimited field");
        }
        fields.push({
          fieldNumber,
          wireType,
          value: buffer.subarray(offset, offset + byteLength),
        });
        offset += byteLength;
      } else if (wireType === 5) {
        if (offset + 4 > buffer.length) {
          throw new Error("truncated Activity Host fixed32 field");
        }
        fields.push({
          fieldNumber,
          wireType,
          value: buffer.subarray(offset, offset + 4),
        });
        offset += 4;
      } else {
        throw new Error(`unsupported Activity Host protobuf wire type ${wireType}`);
      }
    }
    return fields;
  }

  function extractActivityHostMessages(frame) {
    // The 0x00AB body is a protobuf envelope. Repeated field 4 entries contain
    // an embedded Activity Host message: field 1 is its native message type and
    // field 2 is the exact serialized payload that must be fanned back out to
    // Activity Host clients. Keeping the bytes intact matters because this
    // prototype's Tiger handlers use fixed layouts inside several messages.
    const envelopeFields = readProtoFields(frame.subarray(28));
    const messages = [];
    for (const envelopeField of envelopeFields) {
      if (envelopeField.fieldNumber !== 4 || envelopeField.wireType !== 2) {
        continue;
      }
      const messageFields = readProtoFields(envelopeField.value);
      const typeField = messageFields.find(
        (field) => field.fieldNumber === 1 && field.wireType === 0,
      );
      const payloadField = messageFields.find(
        (field) => field.fieldNumber === 2 && field.wireType === 2,
      );
      if (!typeField || !payloadField || typeField.value > 0xffffffffn) {
        continue;
      }
      messages.push({
        messageType: Number(typeField.value),
        payload: Buffer.from(payloadField.value),
      });
    }
    return messages;
  }

  function sendActivityHostMessageNotification(
    requestSequence,
    messageType,
    messagePayload,
    targetConnection,
  ) {
    const activityId = 0n;
    const notification = Buffer.alloc(6 + 0x11 + messagePayload.length);
    notification.writeUInt16BE(0x0009, 0);
    notification.writeUInt32BE(requestSequence, 2);
    notification[6] = 1;
    notification.writeBigUInt64BE(activityId, 7);
    notification.writeUInt32BE(messageType, 15);
    notification.writeUInt32BE(messagePayload.length, 19);
    messagePayload.copy(notification, 23);
    targetConnection.sendAuthenticatedBap(
      notification,
      `d1-alpha-activity-host-message-${messageType}`,
      `activity-host-message-${messageType}-${requestSequence}`,
    );
    process.stdout.write(
      `${new Date().toISOString()} BAP fanned out Activity Host message ` +
        `type ${messageType} (${messagePayload.length} bytes) from channel ` +
        `${bapConnection.channel ?? "unknown"} to channel ` +
        `${targetConnection.channel ?? "unknown"}\n`,
    );
  }

  const activityHostClientInboundMessageTypes = new Set([
    1, 2, 4, 5, 7, 10, 11, 15, 18, 23, 24, 27, 29, 38, 39, 42,
  ]);

  function sendActivityHostStartupNotification(
    requestSequence,
    targetConnection,
    sessionId = targetConnection.activitySessionId,
  ) {
    // 0x00AB is fire-and-forget. Tiger completes it through the registered
    // unsolicited 0x0009 BAP-to-client notification policy, subtype 1. The
    // embedded activity-host message type 10 is start_activity_host_response
    // and its concrete handler requires exactly 0x88 bytes.
    // The notification envelope routes by Tiger activity ID, not by the
    // machine/Activity Host ID contained in the 0x88 start response. The
    // single local activity is created with routing ID zero; its assigned host
    // retains the registered FA00... identifier in the embedded record.
    const activityId = 0n;
    const activityHostId = 0xfa007c1e5294b4ddn;
    const hostRecord = Buffer.alloc(0x88);
    hostRecord.writeBigUInt64BE(activityHostId, 0);
    if (sessionId) {
      const sessionIdBytes = Buffer.from(sessionId, "ascii");
      if (sessionIdBytes.length >= 0x80) {
        throw new Error(`Activity Host session id is too long: ${sessionId}`);
      }
      sessionIdBytes.copy(hostRecord, 8);
      targetConnection.activitySessionId = sessionId;
    }

    function sendActivityHostAssignment(sequence, phase) {
      const notification = Buffer.alloc(6 + 0x11 + hostRecord.length);
      notification.writeUInt16BE(0x0009, 0);
      notification.writeUInt32BE(sequence, 2);
      notification[6] = 1;
      notification.writeBigUInt64BE(activityId, 7);
      notification.writeUInt32BE(10, 15);
      notification.writeUInt32BE(hostRecord.length, 19);
      hostRecord.copy(notification, 23);
      targetConnection.sendAuthenticatedBap(
        notification,
        "d1-alpha-activity-host-startup-notification",
        `activity-host-startup-${sequence}`,
      );
      process.stdout.write(
        `${new Date().toISOString()} BAP sent ${phase} Activity Host ` +
          `assignment sequence ${sequence} on channel ` +
          `${targetConnection.channel ?? "unknown"}\n`,
      );
    }

    sendActivityHostAssignment(requestSequence, "initial");
    activityHostAssignmentSent = true;
    process.stdout.write(
      `${new Date().toISOString()} BAP routed activity-host notification ` +
        `from channel ${bapConnection.channel ?? "unknown"} to channel ` +
        `${targetConnection.channel ?? "unknown"}\n`,
    );

    // Once type 10 has installed the local Activity Host, bootstrap its native
    // type-1 private-bubble snapshot. Keep the serialized activity identifier at
    // its local routing value of zero. The retired server's three decoded local-
    // host flags are materialized at the schema boundary by the matching Xenia
    // compatibility hook, without inventing non-zero activity/session IDs.
    setTimeout(() => {
      if (!targetConnection.socket.destroyed) {
        sendActivityHostMessageNotification(
          requestSequence,
          1,
          Buffer.from([0x00]),
          targetConnection,
        );
      }
    }, 25);

    // The retired Activity Host republishes its private-bubble snapshot while
    // an activity transition replaces the local XGI sessions.  The prototype
    // clears the native private-session record during that handoff and waits
    // for the republished snapshot before scheduling the next state-20 frame.
    // Re-emit the same authoritative snapshot twice during that bounded
    // transition window; message type 1 is a full-state snapshot and is
    // therefore safe to apply idempotently.
    [12000, 20000].forEach((delay, index) => {
      setTimeout(() => {
        if (!targetConnection.socket.destroyed) {
          const refreshSequence = requestSequence + index + 1;
          sendActivityHostMessageNotification(
            refreshSequence,
            1,
            Buffer.from([0x00]),
            targetConnection,
          );
          process.stdout.write(
            `${new Date().toISOString()} BAP refreshed private Activity Host ` +
              `snapshot sequence ${refreshSequence}\n`,
          );
        }
      }, delay);
    });

    // The prototype retires its setup activity after the first state-30 pass.
    // A real Activity Host assigns a fresh private bubble for the destination;
    // replaying only the type-1 snapshot cannot recreate Tiger's cleared
    // manager slot. Reassign after that bounded teardown window, then publish
    // the snapshot to the newly allocated native activity. A second delayed
    // assignment covers slow package-loading runs and remains idempotent at the
    // unsolicited notification layer.
    [20050, 20200, 20350, 20500, 20650, 20800, 20950].forEach(
      (delay, index) => {
      setTimeout(() => {
        if (targetConnection.socket.destroyed) {
          return;
        }
        const assignmentSequence = requestSequence + 3 + index * 2;
        sendActivityHostAssignment(
          assignmentSequence,
          index === 0 ? "destination" : "destination handoff retry",
        );
        setTimeout(() => {
          if (!targetConnection.socket.destroyed) {
            sendActivityHostMessageNotification(
              assignmentSequence + 1,
              1,
              Buffer.from([0x00]),
              targetConnection,
            );
          }
        }, 25);
      }, delay);
      },
    );
  }
  bapConnection.sendActivityHostStartupNotification =
    sendActivityHostStartupNotification;

  function sendActivityHostManagerRequest(requestSequence) {
    // The title's policy table maps bap_to_activity_host_manager_request to
    // wire request 0x0096 and response 0x0097. Its fixed serializer requires
    // a 0x0C17-byte body and defines subtype 5; the remaining bytes are the
    // zero-initialized fixed request record. This request belongs on the new
    // channel-4 connection opened after the local Activity Host assignment.
    const managerRequest = Buffer.alloc(0x0c17);
    managerRequest[0] = 5;
    const plaintext = Buffer.alloc(6 + managerRequest.length);
    plaintext.writeUInt16BE(0x0096, 0);
    plaintext.writeUInt32BE(requestSequence, 2);
    managerRequest.copy(plaintext, 6);
    sendAuthenticatedBap(
      plaintext,
      "d1-alpha-bap-to-activity-host-manager-request",
      `activity-host-manager-${requestSequence}`,
    );
    process.stdout.write(
      `${new Date().toISOString()} BAP sent Activity Host Manager request ` +
        `sequence ${requestSequence} on channel ` +
        `${bapConnection.channel ?? "unknown"}\n`,
    );
  }

  function maybeSendActivityHostManagerRequest() {
    if (
      !bapConnection.activityHostManagerEligible ||
      !bapConnection.secureChannelReady ||
      bapConnection.activityHostManagerRequestSent ||
      socket.destroyed
    ) {
      return;
    }
    bapConnection.activityHostManagerRequestSent = true;
    activityHostManagerRequestSequence += 1;
    sendActivityHostManagerRequest(activityHostManagerRequestSequence);
  }

  function processBapFrame(frame) {
    // Authenticated messages have a 6-byte outer header, a 16-byte SHA-1
    // authenticator, then the message type and request sequence. TCP may
    // split one frame across reads or combine several frames in one read, so
    // this function must receive one complete frame rather than a raw chunk.
    if (
      !responseSent ||
      frame.length < 28 ||
      frame[0] !== 1 ||
      frame[1] !== 1
    ) {
      return;
    }

    const requestType = frame.readUInt16BE(22);
    const requestSequence = frame.readUInt32BE(24);

    // Type 0x0079 is the primary QZ registration request and expects 0x007A.
    if (requestType === 0x79 && !registrationResponseSent) {
      registrationResponseSent = true;
      sendSimpleBapSuccess(
        0x7a,
        requestSequence,
        "d1-alpha-qz-registration-success",
        "registration-response",
      );
    }

    // Type 0x012E is the relay-registration-controller request made in BAP
    // connection state 6. Its paired response is 0x012F.
    if (
      requestType === 0x12e &&
      registrationResponseSent &&
      !relayRegistrationResponseSent
    ) {
      relayRegistrationResponseSent = true;
      sendSimpleBapSuccess(
        0x12f,
        requestSequence,
        "d1-alpha-rrc-registration-success",
        "relay-registration-response",
      );
    }

    // State 22 opens the local Activity Host with request 0x0010. Its paired
    // 0x0011 response is still a normal ordered BAP completion even though the
    // host assignment itself arrives separately as unsolicited 0x0009
    // notifications. Leaving this sequence pending makes Tiger reject the
    // next valid response as out of order and abort with a network failure.
    if (requestType === 0x10) {
      const activityHostStartPayload = Buffer.alloc(16);
      activityHostStartPayload.writeBigUInt64BE(0xfa007c1e5294b4ddn, 0);
      activityHostStartPayload.writeBigUInt64BE(1n, 8);
      sendSimpleBapSuccess(
        0x11,
        requestSequence,
        "d1-alpha-activity-host-start-success",
        "activity-host-start-response",
        activityHostStartPayload,
      );
    // State 20 sends 0x0012 immediately before its next world-service request.
    // BAP response dispatch is ordered, so leaving sequence N pending makes the
    // otherwise valid response for sequence N+1 fail policy lookup.  The paired
    // 0x0013 response must include its two required protobuf fields.
    } else if (requestType === 0x12) {
      sendState20PrerequisiteResponse(requestSequence);
    } else if (requestType === 0x15) {
      // The ownership manager's update-purchased-offers request has no body
      // and is paired with wire response 0x0016. Its protobuf decoder uses
      // descriptor 0x82037A00: field 1 is a repeated uint32 stored as a
      // 64-entry array. Native ownership test 0x82B2A750 compares each entry
      // with its array index; for the first locally registered entitlement,
      // the owned-content index is therefore zero (not offer key E0000001).
      const purchasedOffersPayload = Buffer.from(
        "0800", // field 1, varint owned-content index 0
        "hex",
      );
      sendSimpleBapSuccess(
        0x16,
        requestSequence,
        "d1-alpha-update-purchased-offers-success",
        "update-purchased-offers-response",
        purchasedOffersPayload,
      );
    } else if (requestType === 0x17) {
      // Endpoint 0x0017 translates platform account IDs to investment account
      // identifiers. Decoder 0x82B7FED0 reads a signed 16-bit count, marker
      // bytes 0x01/0xFF, one serialized investment identifier per item, then
      // the corresponding 64-bit platform IDs. Returning the former empty
      // list left the signed-in player unresolved, so the ownership manager
      // could never associate offer E0000001 with this account.
      const translatedAccountId =
        investmentAccountId || 0x000900002aa614e0n;
      const translationPayload = Buffer.alloc(20);
      translationPayload.writeUInt16BE(1, 0);
      translationPayload[2] = 0x01;
      translationPayload[3] = 0xff;
      translationPayload.writeBigUInt64BE(translatedAccountId, 4);
      translationPayload.writeBigUInt64BE(translatedAccountId, 12);
      setTimeout(() => {
        if (!socket.destroyed) {
          sendSimpleBapSuccess(
            0x18,
            requestSequence,
            "d1-alpha-account-id-translation-success",
            "account-id-translation-response",
            translationPayload,
          );
        }
      }, 250);
    } else if (requestType === 0x0c) {
      // Tiger's fixed nine-byte subscription request is paired with wire
      // response 0x000D. The response codec has no payload of its own; the
      // common response header's 0x00C8 status completes the subscription and
      // lets the investment object manager validate the account family.
      const subscriptionFamily = frame.length >= 37 ? frame[28] : null;
      const subscriptionRoot =
        frame.length >= 37 ? frame.readBigUInt64BE(29) : 0n;
      sendSimpleBapSuccess(
        0x0d,
        requestSequence,
        "d1-alpha-subscription-success",
        "subscription-response",
      );
      if (subscriptionFamily === 4 && !accountFamilyBaselineSent) {
        accountFamilyBaselineSent = true;
        setTimeout(() => {
          if (!socket.destroyed) {
            sendAccountFamilyBaseline(requestSequence);
          }
        }, 250);
      }
      if (subscriptionFamily === 0) {
        const baselineKey = `${subscriptionFamily}:${subscriptionRoot.toString(16)}`;
        if (!emptyFamilyBaselinesSent.has(baselineKey)) {
          emptyFamilyBaselinesSent.add(baselineKey);
          setTimeout(() => {
            if (!socket.destroyed) {
              sendEmptyFamilyBaseline(
                requestSequence,
                subscriptionFamily,
                subscriptionRoot,
              );
            }
          }, 250);
        }
      }
    } else if (requestType === 0x0a) {
      sendWorldServiceResponse(requestSequence, frame);
    } else if (requestType === 0xab) {
      // The first native 0x00AB proves Tiger has created its local Activity
      // Host object and registered the manager path that was absent during the
      // initial state-22 cycle. Only connections opened after this point may
      // receive the 0x0096 manager request.
      activityHostClientRequestSeen = true;
      let messages;
      try {
        messages = extractActivityHostMessages(frame);
      } catch (error) {
        process.stdout.write(
          `${new Date().toISOString()} BAP rejected malformed 0x00AB Activity ` +
            `Host envelope: ${error.message}\n`,
        );
        return;
      }
      const routableMessages = messages.filter((message) =>
        activityHostClientInboundMessageTypes.has(message.messageType),
      );
      const ignoredMessageTypes = messages
        .filter(
          (message) =>
            !activityHostClientInboundMessageTypes.has(message.messageType),
        )
        .map((message) => message.messageType);
      for (const message of messages) {
        if (message.messageType === 6) {
          process.stdout.write(
            `${new Date().toISOString()} BAP observed outbound Activity Host ` +
              `type 6 payload (${message.payload.length} bytes) ` +
              `${message.payload.toString("hex")}\n`,
          );
        }
      }
      if (ignoredMessageTypes.length > 0) {
        process.stdout.write(
          `${new Date().toISOString()} BAP retained outbound-only Activity ` +
            `Host message type(s) ${ignoredMessageTypes.join(",")} without ` +
            `looping them back to Tiger\n`,
        );
      }
      // Type 6 is Tiger's outbound local-host/peer announcement.  It is not
      // itself an inbound message, but receiving it proves the native Activity
      // Host object and notification manager are live.  Assign immediately on
      // that same channel, before the pre-alpha retry path tears down its XGI
      // session.  The two-property HTTP trigger remains a fallback for runs
      // that create both local sessions before emitting this announcement.
      if (
        messages.some((message) => message.messageType === 6) &&
        !bapConnection.activityHostType6AssignmentSent &&
        !bapConnection.socket.destroyed &&
        typeof bapConnection.sendActivityHostStartupNotification ===
          "function"
      ) {
        bapConnection.activityHostType6AssignmentSent = true;
        process.stdout.write(
          `${new Date().toISOString()} BAP assigning local Activity Host ` +
            `after outbound type 6 announcement\n`,
        );
        bapConnection.sendActivityHostStartupNotification(4, bapConnection);
      }
      const pendingEvent = {
        requestSequence,
        queuedAt: Date.now(),
        sourceConnection: bapConnection,
        messages: routableMessages,
      };
      pendingActivityHostEvent = pendingEvent;
      process.stdout.write(
        `${new Date().toISOString()} BAP queued asynchronous activity-host ` +
          `event for request sequence ${requestSequence}\n`,
      );
      setTimeout(() => {
        // 0x00AB is fire-and-forget, but its 0x0009 completion still needs to
        // arrive while Tiger's activity object is alive. Waiting for the next
        // five-second echo races the native state-23 timeout and tears down
        // the XGI session before the notification can be routed. Even a
        // frame-sized delay is too late in this prototype, so queue it only
        // until the current socket-data callback has returned.
        if (pendingActivityHostEvent !== pendingEvent) {
          return;
        }
        pendingActivityHostEvent = null;
        const targetConnection = pendingEvent.sourceConnection;
        if (!targetConnection.socket.destroyed) {
          for (const message of pendingEvent.messages) {
            sendActivityHostMessageNotification(
              pendingEvent.requestSequence,
              message.messageType,
              message.payload,
              targetConnection,
            );
          }
          if (pendingEvent.messages.length === 0) {
            process.stdout.write(
              `${new Date().toISOString()} BAP 0x00AB contained no routable ` +
                `Activity Host messages\n`,
            );
          }
        }
      }, 0);
    } else if (requestType === 0xfa) {
      sendEchoResponse(requestSequence);
    }
  }

  socket.on("data", (chunk) => {
    receivedBytes += chunk.length;
    const captureId = `${connectionId}-${String(++chunkIndex).padStart(3, "0")}`;
    const captureFile = path.join(BAP_CAPTURE_DIR, `${captureId}.bin`);
    fs.writeFileSync(captureFile, chunk);
    const record = {
      id: captureId,
      receivedAt: new Date().toISOString(),
      protocol: "bap-tcp",
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      bodyBytes: chunk.length,
      bodySha256: crypto.createHash("sha256").update(chunk).digest("hex"),
      bodyFile: path.relative(WORKSPACE, captureFile),
      bodyHexPreview: chunk.subarray(0, 512).toString("hex"),
      bodyAsciiPreview: chunk
        .subarray(0, 512)
        .toString("latin1")
        .replace(/[^\x20-\x7E]/g, "."),
    };
    fs.appendFileSync(BAP_LOG_FILE, `${JSON.stringify(record)}\n`);
    process.stdout.write(
      `${record.receivedAt} BAP data (${record.bodyBytes} bytes) ` +
        `${record.bodyHexPreview}\n`,
    );

    if (!responseSent) {
      try {
        const configured = JSON.parse(
          fs.readFileSync(BAP_RESPONSE_FILE, "utf8"),
        );
        const minimumRequestBytes = Number(
          configured.minimumRequestBytes || 0,
        );
        if (configured.bodyBase64 && receivedBytes >= minimumRequestBytes) {
          const responseBody = Buffer.from(configured.bodyBase64, "base64");
          socket.write(responseBody);
          responseSent = true;
          const responseRecord = {
            id: `${connectionId}-response`,
            sentAt: new Date().toISOString(),
            protocol: "bap-tcp",
            direction: "server-to-client",
            name: configured.name || "unnamed-bap-response",
            bodyBytes: responseBody.length,
            bodySha256: crypto
              .createHash("sha256")
              .update(responseBody)
              .digest("hex"),
            bodyHex: responseBody.toString("hex"),
          };
          fs.appendFileSync(BAP_LOG_FILE, `${JSON.stringify(responseRecord)}\n`);
          process.stdout.write(
            `${responseRecord.sentAt} BAP response ` +
              `${responseRecord.name} (${responseRecord.bodyBytes} bytes) ` +
              `${responseRecord.bodyHex}\n`,
          );
        }
      } catch (error) {
        process.stderr.write(
          `Unable to read ${BAP_RESPONSE_FILE}: ${error.message}\n`,
        );
      }
    }

    receiveBuffer = Buffer.concat([receiveBuffer, chunk]);
    while (receiveBuffer.length >= 6) {
      const payloadLength = receiveBuffer.readUInt32BE(2);
      if (payloadLength > MAX_BODY_BYTES) {
        process.stderr.write(
          `${new Date().toISOString()} invalid BAP frame length ` +
            `${payloadLength}\n`,
        );
        receiveBuffer = Buffer.alloc(0);
        socket.destroy();
        return;
      }
      const frameLength = 6 + payloadLength;
      if (receiveBuffer.length < frameLength) break;
      const frame = Buffer.from(receiveBuffer.subarray(0, frameLength));
      receiveBuffer = receiveBuffer.subarray(frameLength);
      const helloChannel = parseBapHelloChannel(frame);
      if (helloChannel !== null) {
        bapConnection.channel = helloChannel;
        bapConnection.activityHostManagerEligible =
          helloChannel === 4 && activityHostClientRequestSeen;
        bapConnectionsByChannel.set(helloChannel, bapConnection);
        process.stdout.write(
          `${new Date().toISOString()} BAP classified connection ` +
          `${connectionId} as channel ${helloChannel}\n`,
        );
      }
      if (
        !responseSent &&
        frame[0] === 1 &&
        frame[1] === 2 &&
        frame.length >= 12 &&
        frame.readUInt16BE(6) === 0x19
      ) {
        sendModernSecureHelloResponse(frame);
        continue;
      }
      let normalizedFrame;
      try {
        normalizedFrame = normalizeBapFrame(frame);
      } catch (error) {
        process.stderr.write(
          `${new Date().toISOString()} BAP GCM decode error ${error.message}\n`,
        );
        socket.destroy();
        return;
      }
      processBapFrame(normalizedFrame);
      if (normalizedFrame[0] === 1 && normalizedFrame[1] === 1) {
        bapConnection.secureChannelReady = true;
        // A bounded post-0x00AB trial proved this prototype still rejects the
        // 0x0096 manager request as unsolicited (result 0). Keep the verified
        // timing state visible, but do not recycle BAP by sending it again.
      }
    }
  });

  socket.on("error", (error) => {
    process.stderr.write(
      `${new Date().toISOString()} BAP connection error ` +
        `${socket.remoteAddress || "unknown"}:${socket.remotePort || 0} ` +
        `${error.code || error.message}\n`,
    );
  });
  socket.on("close", () => {
    if (
      bapConnection.channel !== null &&
      bapConnectionsByChannel.get(bapConnection.channel) === bapConnection
    ) {
      bapConnectionsByChannel.delete(bapConnection.channel);
    }
  });
});

bapServer.on("error", (error) => {
  process.stderr.write(`Destiny BAP server failed: ${error.stack || error}\n`);
  process.exitCode = 1;
});

bapServer.listen(BAP_PORT, HOST, () => {
  process.stdout.write(
    `Destiny BAP server listening on tcp://${HOST}:${BAP_PORT}\n`,
  );
});
