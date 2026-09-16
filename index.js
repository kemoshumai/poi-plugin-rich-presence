"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.tsx
var index_exports = {};
__export(index_exports, {
  pluginDidLoad: () => pluginDidLoad,
  pluginWillUnload: () => pluginWillUnload,
  settingsClass: () => settingsClass
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_create_store = require("views/create-store");
var import_env = require("views/env");

// src/rpc.ts
var import_node_net = __toESM(require("node:net"));
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var HANDSHAKE = 0;
var FRAME = 1;
var CLOSE = 2;
var PING = 3;
var PONG = 4;
var MAX_FRAME_SIZE = 1024 * 1024;
var MAX_RECEIVE_BUFFER_SIZE = MAX_FRAME_SIZE + 8;
var retryDelay = (attempt) => Math.min(3e4, 1e3 * 2 ** Math.min(Math.max(attempt, 0), 5));
var closePermanentCodes = /* @__PURE__ */ new Set([4e3, 4001, 4003, 4004, 4005]);
var closeRateLimitCode = 4002;
var rpcErrorInfo = (payload) => {
  const data = isRecord(payload.data) ? payload.data : {};
  const code = typeof data.code === "number" ? data.code : null;
  const message = typeof data.message === "string" && data.message.trim() ? data.message : "Discord RPC \u304C\u30A8\u30E9\u30FC\u3092\u8FD4\u3057\u307E\u3057\u305F";
  return { code, message };
};
var closeErrorInfo = (payload) => {
  const code = typeof payload.code === "number" ? payload.code : null;
  const message = typeof payload.message === "string" && payload.message.trim() ? payload.message : "Discord RPC \u63A5\u7D9A\u304C\u9589\u3058\u3089\u308C\u307E\u3057\u305F";
  return { code, message };
};
var rpcErrorDisposition = (frame) => {
  if (frame.opcode === CLOSE) {
    const info = closeErrorInfo(frame.payload);
    return {
      kind: "close",
      info,
      permanent: info.code !== null && closePermanentCodes.has(info.code),
      rateLimited: info.code === closeRateLimitCode,
      destroySocket: true
    };
  }
  if (frame.opcode === FRAME && frame.payload.evt === "ERROR") {
    return {
      kind: "frame-error",
      info: rpcErrorInfo(frame.payload),
      permanent: false,
      rateLimited: false,
      destroySocket: false
    };
  }
  return null;
};
var formatRpcError = ({ code, message }) => `${message}${code === null ? "" : ` (${code})`}`;
var isValidClientId = (clientId) => /^\d{17,20}$/.test(clientId);
var pipeNames = (pipeNumber) => {
  if (!Number.isInteger(pipeNumber) || pipeNumber < 0 || pipeNumber > 9) return [];
  const suffix = `discord-ipc-${pipeNumber}`;
  if (process.platform === "win32") return [`\\\\?\\pipe\\${suffix}`];
  const directories = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    import_node_os.default.tmpdir(),
    "/tmp"
  ].filter((directory) => Boolean(directory));
  return [...new Set(directories.map((directory) => import_node_path.default.join(directory, suffix)))];
};
var pipeCandidates = () => Array.from({ length: 10 }, (_, pipeNumber) => pipeNames(pipeNumber)).flat();
var encodeFrame = (opcode, payload) => {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length > MAX_FRAME_SIZE) throw new Error("Discord RPC frame is too large");
  const frame = Buffer.allocUnsafe(8 + body.length);
  frame.writeInt32LE(opcode, 0);
  frame.writeInt32LE(body.length, 4);
  body.copy(frame, 8);
  return frame;
};
var decodeFrames = (buffer) => {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const opcode = buffer.readInt32LE(offset);
    const length = buffer.readInt32LE(offset + 4);
    if (length < 0 || length > MAX_FRAME_SIZE) return { frames, remaining: Buffer.alloc(0), error: "Invalid Discord RPC frame length" };
    if (buffer.length - offset < 8 + length) break;
    const body = buffer.subarray(offset + 8, offset + 8 + length).toString("utf8");
    try {
      const payload = JSON.parse(body);
      if (!isRecord(payload)) return { frames, remaining: Buffer.alloc(0), error: "Discord RPC payload must be an object" };
      frames.push({ opcode, payload });
    } catch {
      return { frames, remaining: Buffer.alloc(0), error: "Invalid Discord RPC JSON payload" };
    }
    offset += 8 + length;
  }
  return { frames, remaining: buffer.subarray(offset) };
};
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var responseAction = (frame) => {
  if (frame.opcode === PING) return "pong";
  if (frame.opcode === CLOSE) return "close";
  if (frame.opcode !== FRAME) return "ignore";
  if (frame.payload.evt === "READY") return "ready";
  if (frame.payload.evt === "ERROR") return "error";
  return "ignore";
};
var DiscordRpc = class {
  clientId;
  onStatus;
  socket = null;
  receiveBuffer = Buffer.alloc(0);
  connecting = false;
  ready = false;
  closed = false;
  permanentFailure = false;
  retryTimer = null;
  retryAttempt = 0;
  pipeCandidateIndex = 0;
  pendingActivity = null;
  handshakeTimer = null;
  retryAfter = 0;
  status = { state: "idle", lastError: null };
  constructor(clientId, options = {}) {
    this.clientId = clientId;
    this.onStatus = options.onStatus;
    if (!isValidClientId(clientId)) this.setError("Client ID \u306F17\u301C20\u6841\u306E\u6570\u5B57\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044", true);
  }
  getStatus() {
    return { ...this.status };
  }
  setActivity(activity) {
    this.pendingActivity = activity;
    if (!activity) {
      if (this.ready) this.sendActivity(null);
      return;
    }
    if (this.closed || this.permanentFailure || !isValidClientId(this.clientId)) return;
    if (this.ready) {
      this.sendActivity(activity);
      return;
    }
    this.connect();
  }
  disconnect() {
    this.closed = true;
    this.pendingActivity = null;
    this.clearTimers();
    this.ready = false;
    this.connecting = false;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    this.setStatus("closed", null);
  }
  connect() {
    if (this.closed || this.permanentFailure || this.ready || this.connecting || this.retryTimer) return;
    this.connecting = true;
    this.pipeCandidateIndex = 0;
    this.setStatus("connecting", this.status.lastError);
    this.tryPipe();
  }
  tryPipe() {
    if (this.closed || this.permanentFailure) return;
    const candidates = pipeCandidates();
    if (this.pipeCandidateIndex >= candidates.length) {
      this.connecting = false;
      this.scheduleRetry();
      return;
    }
    const candidate = candidates[this.pipeCandidateIndex];
    this.pipeCandidateIndex += 1;
    const socket = import_node_net.default.createConnection(candidate);
    let connected = false;
    let advanced = false;
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("connect", () => {
      connected = true;
      this.ready = false;
      this.receiveBuffer = Buffer.alloc(0);
      this.write(HANDSHAKE, { v: 1, client_id: this.clientId });
      this.handshakeTimer = setTimeout(() => {
        if (this.socket === socket && !this.ready) socket.destroy();
      }, 5e3);
    });
    socket.on("data", (chunk) => {
      if (this.socket === socket) this.handleData(socket, chunk);
    });
    socket.on("error", (error) => {
      if (!connected && !advanced) {
        advanced = true;
        this.setError(`Discord IPC \u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093: ${error.message || "\u5019\u88DC\u30D1\u30B9\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093"}`);
        if (this.socket === socket) this.socket = null;
        socket.destroy();
        this.tryPipe();
      } else if (connected) {
        this.setError(error.message || "Discord IPC socket error");
        socket.destroy();
      }
    });
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearHandshakeTimer();
      this.ready = false;
      this.connecting = false;
      if (!this.closed && !this.permanentFailure && this.pendingActivity) this.scheduleRetry();
    });
  }
  scheduleRetry() {
    if (this.retryTimer || this.closed || this.permanentFailure || !this.pendingActivity) return;
    const delay = Math.max(retryDelay(this.retryAttempt), Math.max(0, this.retryAfter - Date.now()));
    this.retryAttempt += 1;
    this.setStatus("retrying", this.status.lastError);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
  handleData(socket, chunk) {
    if (this.socket !== socket) return;
    if (this.receiveBuffer.length + chunk.length > MAX_RECEIVE_BUFFER_SIZE) {
      this.setError("Discord RPC \u53D7\u4FE1\u30D0\u30C3\u30D5\u30A1\u304C\u4E0A\u9650\u3092\u8D85\u3048\u307E\u3057\u305F", true);
      socket.destroy();
      return;
    }
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    const decoded = decodeFrames(this.receiveBuffer);
    this.receiveBuffer = decoded.remaining;
    if (decoded.error) {
      this.setError(decoded.error, true);
      socket.destroy();
      return;
    }
    for (const frame of decoded.frames) {
      const action = responseAction(frame);
      if (action === "pong") this.write(PONG, frame.payload);
      else if (action === "close" || action === "error") {
        const disposition = rpcErrorDisposition(frame);
        if (!disposition) continue;
        this.setError(formatRpcError(disposition.info), disposition.permanent);
        this.retryAfter = disposition.rateLimited ? Date.now() + 6e4 : 0;
        if (disposition.destroySocket) {
          socket.destroy();
          break;
        }
      } else if (action === "ready") {
        this.clearHandshakeTimer();
        this.ready = true;
        this.connecting = false;
        this.retryAttempt = 0;
        this.retryAfter = 0;
        this.setStatus("ready", null);
        if (this.pendingActivity) this.sendActivity(this.pendingActivity);
      }
    }
  }
  sendActivity(activity) {
    this.write(FRAME, {
      cmd: "SET_ACTIVITY",
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      args: { pid: process.pid, activity }
    });
  }
  write(opcode, payload) {
    try {
      if (this.socket) this.socket.write(encodeFrame(opcode, payload));
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Discord RPC \u9001\u4FE1\u30A8\u30E9\u30FC");
      this.socket?.destroy();
    }
  }
  clearHandshakeTimer() {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }
  clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearHandshakeTimer();
  }
  setError(message, permanent = false) {
    this.permanentFailure ||= permanent;
    this.setStatus("error", message);
  }
  setStatus(state, lastError) {
    this.status = { state, lastError };
    this.onStatus?.(this.getStatus());
  }
};

// src/ui.ts
var isRichPresenceConfigPath = (path2) => path2 === "plugin.rich-presence" || path2.startsWith("plugin.rich-presence.");
var coerceBoolean = (value, defaultValue) => typeof value === "boolean" ? value : defaultValue;
var statusLabel = (state, lastError) => {
  if (lastError === "\u7121\u52B9") return "\u7121\u52B9";
  if (lastError === "Client ID\u672A\u8A2D\u5B9A") return "Client ID\u672A\u8A2D\u5B9A";
  if (state === "connecting") return "\u63A5\u7D9A\u4E2D";
  if (state === "ready") return "\u63A5\u7D9A\u6E08\u307F";
  if (state === "retrying") return "\u518D\u63A5\u7D9A\u5F85\u3061";
  if (state === "error") return "\u30A8\u30E9\u30FC";
  return "\u672A\u63A5\u7D9A";
};

// src/paths.ts
var battlePaths = /* @__PURE__ */ new Set([
  "/kcsapi/api_req_sortie/battle",
  "/kcsapi/api_req_sortie/airbattle",
  "/kcsapi/api_req_sortie/ld_airbattle",
  "/kcsapi/api_req_sortie/ld_shooting",
  "/kcsapi/api_req_sortie/night_to_day",
  "/kcsapi/api_req_battle_midnight/battle",
  "/kcsapi/api_req_battle_midnight/sp_midnight",
  "/kcsapi/api_req_combined_battle/battle",
  "/kcsapi/api_req_combined_battle/battle_water",
  "/kcsapi/api_req_combined_battle/airbattle",
  "/kcsapi/api_req_combined_battle/midnight_battle",
  "/kcsapi/api_req_combined_battle/ec_battle",
  "/kcsapi/api_req_combined_battle/ec_midnight_battle",
  "/kcsapi/api_req_combined_battle/ec_night_to_day",
  "/kcsapi/api_req_combined_battle/each_battle",
  "/kcsapi/api_req_combined_battle/each_battle_water",
  "/kcsapi/api_req_combined_battle/ld_airbattle",
  "/kcsapi/api_req_combined_battle/ld_shooting",
  "/kcsapi/api_req_combined_battle/sp_midnight"
]);
var practicePrefix = "/kcsapi/api_req_practice/";
var isPracticePath = (path2) => path2.includes(practicePrefix);
var isBattlePath = (path2) => battlePaths.has(path2);
var isBattleResultPath = (path2) => path2 === "/kcsapi/api_req_sortie/battleresult" || path2 === "/kcsapi/api_req_combined_battle/battleresult";

// src/presence.ts
var initialPresenceState = { sortie: false, battle: false, map: null, practice: false };
var mapFromBody = (body, postBody = {}) => {
  const area = postBody.api_maparea_id ?? postBody.api_mapareaid ?? body.api_maparea_id ?? body.api_mapareaid;
  const info = postBody.api_mapinfo_no ?? postBody.api_mapinfo_id ?? body.api_mapinfo_no ?? body.api_mapinfo_id;
  const valid = (value) => typeof value === "string" || typeof value === "number";
  if (!valid(area) && !valid(info)) return null;
  if (valid(area) && valid(info)) return `\u6D77\u57DF ${area}-${info}`;
  return `\u6D77\u57DF ${valid(area) ? area : info}`;
};
var reduceResponse = (state, path2, body, postBody = {}) => {
  if (path2 === "/kcsapi/api_port/port" || path2 === "/kcsapi/api_start2/getData") return { ...initialPresenceState };
  if (isPracticePath(path2)) return { ...state, practice: true, sortie: false, battle: false, map: null };
  if (path2 === "/kcsapi/api_req_map/start") {
    return { ...state, sortie: true, practice: false, battle: false, map: mapFromBody(body, postBody) };
  }
  if (path2 === "/kcsapi/api_req_map/next" || path2.includes("/api_req_sortie/port") || path2 === "/kcsapi/api_req_sortie/goback_port" || path2 === "/kcsapi/api_req_combined_battle/goback_port" || isBattleResultPath(path2)) {
    return { ...state, battle: false };
  }
  if (isBattlePath(path2)) return { ...state, battle: true, map: mapFromBody(body, postBody) ?? state.map };
  return state;
};
var buildActivity = (state, sessionStartedAt2, options) => {
  const activity = {
    type: 0,
    name: options.name,
    details: state.battle ? "\u6226\u95D8\u4E2D" : state.sortie ? "\u51FA\u6483\u4E2D" : "\u6BCD\u6E2F",
    state: state.sortie ? options.showMap && state.map ? state.map : "\u8266\u968A\u904B\u7528\u4E2D" : void 0,
    timestamps: { start: Math.floor(sessionStartedAt2 / 1e3) },
    instance: false
  };
  if (options.largeImage || options.smallImage) {
    activity.assets = {};
    if (options.largeImage) {
      activity.assets.large_image = options.largeImage;
      activity.assets.large_text = options.name;
    }
    if (options.smallImage) {
      activity.assets.small_image = options.smallImage;
      activity.assets.small_text = state.battle ? "\u6226\u95D8\u4E2D" : "\u30AA\u30F3\u30E9\u30A4\u30F3";
    }
  }
  return activity;
};

// src/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var configPath = {
  enabled: "plugin.rich-presence.discord.enabled",
  clientId: "plugin.rich-presence.discord.clientId",
  displayName: "plugin.rich-presence.discord.displayName",
  largeImage: "plugin.rich-presence.discord.largeImage",
  smallImage: "plugin.rich-presence.discord.smallImage",
  showMap: "plugin.rich-presence.discord.showMap"
};
var legacyConfigPath = {
  [configPath.enabled]: "plugin.rich-presence.enabled",
  [configPath.clientId]: "plugin.rich-presence.clientId",
  [configPath.displayName]: "plugin.rich-presence.displayName",
  [configPath.largeImage]: "plugin.rich-presence.largeImage",
  [configPath.smallImage]: "plugin.rich-presence.smallImage",
  [configPath.showMap]: "plugin.rich-presence.showMap"
};
var getConfig = (path2, defaultValue) => {
  const value = import_env.config.get(path2, void 0);
  if (value !== void 0) return value;
  const legacyPath = legacyConfigPath[path2];
  return legacyPath ? import_env.config.get(legacyPath, defaultValue) : defaultValue;
};
var current = { ...initialPresenceState };
var sessionStartedAt = 0;
var lastRpcStatus = { state: "idle", lastError: null };
var rpc = null;
var rpcClientId = "";
var unsubscribeStore = null;
var responseListener = null;
var configListener = null;
var updateTimer = null;
var lastActivity = "";
var migrationDone = false;
var isAssetKey = (value) => value === "" || /^[A-Za-z0-9_-]{1,128}$/.test(value);
var statusWithError = (state, lastError) => {
  lastRpcStatus = { state, lastError };
  window.dispatchEvent(new CustomEvent("plugin.rich-presence.rpc-status", { detail: lastRpcStatus }));
};
var getConfigError = () => {
  const clientId = getText(configPath.clientId);
  if (!clientId) return "Client ID\u672A\u8A2D\u5B9A";
  if (!isValidClientId(clientId)) return "Client ID\u306F17\u301C20\u6841\u306E\u6570\u5B57\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044";
  for (const [path2, label] of [[configPath.largeImage, "\u5927\u304D\u3044\u753B\u50CF"], [configPath.smallImage, "\u5C0F\u3055\u3044\u753B\u50CF"]]) {
    const value = getText(path2);
    if (!isAssetKey(value)) return `${label}\u306Easset key\u306F\u82F1\u6570\u5B57\u3001_\u3001-\u3092128\u6587\u5B57\u4EE5\u5185\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`;
  }
  return null;
};
var getText = (path2, defaultValue = "") => {
  const value = getConfig(path2, defaultValue);
  return typeof value === "string" ? value.trim() : defaultValue;
};
var scheduleUpdate = () => {
  if (updateTimer) return;
  updateTimer = setTimeout(updatePresence, 500);
};
var readState = () => {
  const state = (0, import_create_store.getStore)();
  const sortieStatus = isRecord(state) && isRecord(state.sortie) && Array.isArray(state.sortie.sortieStatus) ? state.sortie.sortieStatus : [];
  const sortie = sortieStatus.some(Boolean);
  const normalSortie = sortie && !current.practice;
  current = { ...current, sortie: normalSortie, battle: normalSortie ? current.battle : false, map: normalSortie ? current.map : null };
  scheduleUpdate();
};
var activityForCurrentState = () => {
  if (!getConfig(configPath.enabled, true)) return null;
  if (getConfigError()) return null;
  return buildActivity(current, sessionStartedAt, {
    name: getText(configPath.displayName, "poi") || "poi",
    showMap: getConfig(configPath.showMap, true),
    largeImage: getText(configPath.largeImage),
    smallImage: getText(configPath.smallImage)
  });
};
var updatePresence = () => {
  updateTimer = null;
  const clientId = getText(configPath.clientId);
  const configError = getConfigError();
  const activity = activityForCurrentState();
  if (!getConfig(configPath.enabled, true)) {
    rpc?.disconnect();
    rpc = null;
    rpcClientId = "";
    lastActivity = "";
    statusWithError("closed", "\u7121\u52B9");
    return;
  }
  if (configError || !clientId || !activity) {
    rpc?.disconnect();
    rpc = null;
    rpcClientId = "";
    lastActivity = "";
    statusWithError("error", configError);
    return;
  }
  if (!rpc || rpcClientId !== clientId) {
    rpc?.disconnect();
    rpc = new DiscordRpc(clientId, {
      onStatus: (status) => {
        lastRpcStatus = status;
        window.dispatchEvent(new CustomEvent("plugin.rich-presence.rpc-status", { detail: status }));
      }
    });
    rpcClientId = clientId;
    lastRpcStatus = rpc.getStatus();
    lastActivity = "";
  }
  const serialized = JSON.stringify(activity);
  if (serialized === lastActivity) return;
  lastActivity = serialized;
  rpc.setActivity(activity);
};
var handleResponse = (event) => {
  const detail = event.detail;
  if (!isRecord(detail) || typeof detail.path !== "string") return;
  const path2 = detail.path;
  const body = isRecord(detail.body) ? detail.body : {};
  const postBody = isRecord(detail.postBody) ? detail.postBody : {};
  const wasReset = path2 === "/kcsapi/api_port/port" || path2 === "/kcsapi/api_start2/getData";
  current = reduceResponse(current, path2, body, postBody);
  if (wasReset) {
    scheduleUpdate();
    return;
  }
  readState();
};
var pluginDidLoad = () => {
  if (responseListener) return;
  if (!migrationDone) {
    for (const path2 of Object.keys(configPath)) {
      const currentPath = configPath[path2];
      const legacyPath = legacyConfigPath[currentPath];
      if (import_env.config.get(currentPath, void 0) === void 0 && legacyPath) {
        const legacyValue = import_env.config.get(legacyPath, void 0);
        if (legacyValue !== void 0) import_env.config.set(currentPath, legacyValue);
      }
    }
    migrationDone = true;
  }
  sessionStartedAt = Date.now();
  responseListener = handleResponse;
  window.addEventListener("game.response", responseListener);
  unsubscribeStore = import_create_store.store.subscribe(readState);
  configListener = (changedPath) => {
    if (typeof changedPath !== "string" || !isRichPresenceConfigPath(changedPath)) return;
    rpc?.disconnect();
    rpc = null;
    rpcClientId = "";
    lastActivity = "";
    scheduleUpdate();
    window.dispatchEvent(new CustomEvent("plugin.rich-presence.config-changed", { detail: changedPath }));
  };
  import_env.config.addListener("config.set", configListener);
  readState();
};
var pluginWillUnload = () => {
  if (responseListener) window.removeEventListener("game.response", responseListener);
  if (unsubscribeStore) unsubscribeStore();
  if (configListener) import_env.config.removeListener("config.set", configListener);
  if (updateTimer) clearTimeout(updateTimer);
  rpc?.disconnect();
  responseListener = null;
  unsubscribeStore = null;
  configListener = null;
  updateTimer = null;
  rpc = null;
  rpcClientId = "";
  lastActivity = "";
  lastRpcStatus = { state: "closed", lastError: null };
  sessionStartedAt = 0;
  current = { ...initialPresenceState };
};
var TextSetting = ({ path: path2, label, defaultValue = "" }) => {
  const [value, setValue] = (0, import_react.useState)(getConfig(path2, defaultValue));
  (0, import_react.useEffect)(() => {
    const listener = () => setValue(getConfig(path2, defaultValue));
    window.addEventListener("plugin.rich-presence.config-changed", listener);
    return () => window.removeEventListener("plugin.rich-presence.config-changed", listener);
  }, [defaultValue, path2]);
  const invalidClientId = path2 === configPath.clientId && value.trim() !== "" && !isValidClientId(value.trim());
  const invalidAsset = (path2 === configPath.largeImage || path2 === configPath.smallImage) && value.trim() !== "" && !isAssetKey(value.trim());
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", marginBottom: 8 }, children: [
    label,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "text", value, onChange: (event) => setValue(event.target.value), onBlur: () => import_env.config.set(path2, value.trim()), style: { width: "100%" } }),
    invalidClientId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "crimson" }, children: "Client ID \u306F17\u301C20\u6841\u306E\u6570\u5B57\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }),
    invalidAsset && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "crimson" }, children: "asset key \u306F\u82F1\u6570\u5B57\u3001_\u3001-\u3092128\u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })
  ] });
};
var Checkbox = ({ path: path2, label, defaultValue }) => {
  const [value, setValue] = (0, import_react.useState)(coerceBoolean(getConfig(path2, defaultValue), defaultValue));
  (0, import_react.useEffect)(() => {
    const listener = () => setValue(coerceBoolean(getConfig(path2, defaultValue), defaultValue));
    window.addEventListener("plugin.rich-presence.config-changed", listener);
    return () => window.removeEventListener("plugin.rich-presence.config-changed", listener);
  }, [defaultValue, path2]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "block", marginBottom: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: value, onChange: () => {
      const next = !value;
      setValue(next);
      import_env.config.set(path2, next);
    } }),
    " ",
    label
  ] });
};
var RpcDiagnostic = () => {
  const [status, setStatus] = (0, import_react.useState)(lastRpcStatus);
  (0, import_react.useEffect)(() => {
    const listener = (event) => {
      const detail = event.detail;
      if (isRecord(detail) && typeof detail.state === "string") setStatus(detail);
    };
    window.addEventListener("plugin.rich-presence.rpc-status", listener);
    return () => window.removeEventListener("plugin.rich-presence.rpc-status", listener);
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { "aria-live": "polite", style: { marginTop: 12 }, children: [
    `\u72B6\u614B: ${statusLabel(status.state, status.lastError)}`,
    status.lastError && !["\u7121\u52B9", "Client ID\u672A\u8A2D\u5B9A"].includes(status.lastError) ? `\uFF08${status.lastError}\uFF09` : ""
  ] });
};
var settingsClass = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, { path: configPath.enabled, label: "Discord Rich Presence \u3092\u6709\u52B9\u5316", defaultValue: true }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextSetting, { path: configPath.clientId, label: "Application ID / Client ID\uFF0817\u301C20\u6841\u306E\u6570\u5B57\uFF09" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextSetting, { path: configPath.displayName, label: "\u30A2\u30D7\u30EA\u540D\uFF08\u30C7\u30D5\u30A9\u30EB\u30C8: poi\uFF09", defaultValue: "poi" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextSetting, { path: configPath.largeImage, label: "\u5927\u304D\u3044\u753B\u50CF\u306E asset key\uFF08\u4EFB\u610F\uFF09" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextSetting, { path: configPath.smallImage, label: "\u5C0F\u3055\u3044\u753B\u50CF\u306E asset key\uFF08\u4EFB\u610F\uFF09" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, { path: configPath.showMap, label: "\u6D77\u57DF\u540D\u3092\u8868\u793A\u3059\u308B", defaultValue: true }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 12 }, children: "\u30A2\u30D7\u30EA\u540D\u306F\u4FDD\u5B58\u6642\uFF08\u5165\u529B\u6B04\u304B\u3089\u30D5\u30A9\u30FC\u30AB\u30B9\u3092\u5916\u3057\u305F\u6642\uFF09\u306B\u5B9F\u884C\u4E2D\u306E Presence \u3078\u53CD\u6620\u3057\u307E\u3059\u3002\u305F\u3060\u3057 Discord RPC \u306E\u4ED5\u69D8\u30FB\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306B\u3088\u3063\u3066\u306F Developer Portal \u306E Application \u540D\u304C\u512A\u5148\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u3053\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u306F details/state \u306B\u6BCD\u6E2F\u30FB\u51FA\u6483\u30FB\u6226\u95D8\u30FB\u6D77\u57DF\u3092\u8A2D\u5B9A\u3057\u307E\u3059\u3002Discord \u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u7248\u304C\u5FC5\u8981\u3067\u3059\u3002Client Secret \u306F\u5165\u529B\u3057\u307E\u305B\u3093\u3002" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RpcDiagnostic, {})
] });
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  settingsClass
});
