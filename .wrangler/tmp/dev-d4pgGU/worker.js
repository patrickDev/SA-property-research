var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/auth.ts
var ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
var DEV_EMAIL_HEADER = "X-User-Email";
var jwksCache = null;
var jwksCacheExpiry = 0;
var JWKS_CACHE_TTL_MS = 60 * 60 * 1e3;
async function getJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) return jwksCache;
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const resp = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 3600 } });
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
  const jwks = await resp.json();
  const keys = /* @__PURE__ */ new Map();
  for (const key of jwks.keys) {
    if (key.kty !== "RSA" || key.use !== "sig") continue;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    keys.set(key.kid, cryptoKey);
  }
  jwksCache = keys;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
  return keys;
}
__name(getJwks, "getJwks");
function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
__name(base64UrlDecode, "base64UrlDecode");
async function verifyAccessJwt(token, teamDomain, audience) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT structure");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  if (payload.exp < Math.floor(Date.now() / 1e3)) {
    throw new Error("JWT has expired");
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) {
    throw new Error("JWT audience mismatch");
  }
  const keys = await getJwks(teamDomain);
  const kid = header.kid ?? "";
  const key = keys.get(kid);
  if (!key) throw new Error(`Unknown JWT key ID: ${kid}`);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
  if (!valid) throw new Error("JWT signature verification failed");
  return payload;
}
__name(verifyAccessJwt, "verifyAccessJwt");
async function upsertUser(env2, id, email) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await env2.DB.prepare(
    "SELECT id, email, role FROM users WHERE id = ?"
  ).bind(id).first();
  if (existing) {
    await env2.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?").bind(now, id).run();
    return { id: existing.id, email: existing.email, role: existing.role };
  }
  await env2.DB.prepare(
    "INSERT INTO users (id, email, role, created_at, last_login) VALUES (?, ?, 'viewer', ?, ?)"
  ).bind(id, email, now, now).run();
  return { id, email, role: "viewer" };
}
__name(upsertUser, "upsertUser");
async function authenticate(request, env2) {
  const teamDomain = env2.CF_ACCESS_TEAM_DOMAIN;
  const audience = env2.CF_ACCESS_AUDIENCE;
  if (!teamDomain || !audience) {
    const email = request.headers.get(DEV_EMAIL_HEADER);
    if (!email) return null;
    const row = await env2.DB.prepare(
      "SELECT id, email, role FROM users WHERE email = ? LIMIT 1"
    ).bind(email).first();
    if (row) return { id: row.id, email: row.email, role: row.role };
    const id = crypto.randomUUID();
    return upsertUser(env2, id, email);
  }
  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) return null;
  const payload = await verifyAccessJwt(token, teamDomain, audience);
  return upsertUser(env2, payload.sub, payload.email);
}
__name(authenticate, "authenticate");
async function requireAuth(request, env2) {
  try {
    const user = await authenticate(request, env2);
    if (!user) {
      return {
        response: new Response(
          JSON.stringify({ error: "Unauthorized: authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      };
    }
    return { user };
  } catch (err) {
    return {
      response: new Response(
        JSON.stringify({ error: `Authentication failed: ${String(err)}` }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    };
  }
}
__name(requireAuth, "requireAuth");
function requireAdmin(user) {
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin role required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
__name(requireAdmin, "requireAdmin");
function canViewPii(user) {
  return user.role === "admin";
}
__name(canViewPii, "canViewPii");

// src/router.ts
var Router = class {
  static {
    __name(this, "Router");
  }
  routes = [];
  add(method, path, handler, isPublic = false) {
    const paramNames = [];
    const withPlaceholders = path.replace(
      /:([A-Za-z_][A-Za-z0-9_]*)/g,
      (_m, name) => {
        paramNames.push(name);
        return "\0PARAM\0";
      }
    );
    const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexStr = escaped.replace(/\x00PARAM\x00/g, "([^/]+)");
    this.routes.push({
      method,
      pattern: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
      public: isPublic
    });
    return this;
  }
  get(path, handler, isPublic = false) {
    return this.add("GET", path, handler, isPublic);
  }
  post(path, handler, isPublic = false) {
    return this.add("POST", path, handler, isPublic);
  }
  put(path, handler, isPublic = false) {
    return this.add("PUT", path, handler, isPublic);
  }
  delete(path, handler, isPublic = false) {
    return this.add("DELETE", path, handler, isPublic);
  }
  async handle(request, env2, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== "*" && route.method !== method) continue;
      const match = route.pattern.exec(pathname);
      if (!match) continue;
      const params = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        const name = route.paramNames[i];
        const value = match[i + 1];
        if (name !== void 0 && value !== void 0) {
          params[name] = decodeURIComponent(value);
        }
      }
      if (route.public) {
        return route.handler(
          request,
          env2,
          ctx,
          params,
          null
        );
      }
      const authResult = await requireAuth(request, env2);
      if ("response" in authResult) return authResult.response;
      return route.handler(request, env2, ctx, params, authResult.user);
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
};
function jsonOk(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonOk, "jsonOk");
function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonError, "jsonError");

// src/handlers/health.ts
async function handleHealth(_request, env2) {
  let dbOk = false;
  try {
    await env2.DB.prepare("SELECT 1").run();
    dbOk = true;
  } catch {
  }
  const body = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "unavailable",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  return jsonOk(body, dbOk ? 200 : 503);
}
__name(handleHealth, "handleHealth");

// src/services/dedup.ts
async function findDuplicateJob(env2, jobType, fileHash) {
  const row = await env2.DB.prepare(
    `SELECT id FROM import_jobs
     WHERE job_type = ? AND source_file_hash = ? AND status = 'completed'
     LIMIT 1`
  ).bind(jobType, fileHash).first();
  return row?.id ?? null;
}
__name(findDuplicateJob, "findDuplicateJob");
async function sha256Hex(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function generateUUID() {
  return crypto.randomUUID();
}
__name(generateUUID, "generateUUID");

// src/handlers/imports.ts
var MAX_FILE_BYTES = 50 * 1024 * 1024;
async function handleImport(request, env2, user, jobType) {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Request must be multipart/form-data", 400);
  }
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return jsonError('Form field "file" is required and must be a file', 400);
  }
  const file = fileEntry;
  const contentType = file.type.toLowerCase();
  if (!contentType.includes("csv") && !contentType.includes("text")) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      return jsonError(
        "Only CSV files are supported. Please export your Excel file as CSV before uploading.",
        415
      );
    }
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError(
      `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
      413
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = await sha256Hex(bytes);
  const existingJobId = await findDuplicateJob(env2, jobType, fileHash);
  if (existingJobId) {
    return jsonError(
      `This file has already been imported (job: ${existingJobId}). If the data has changed, export a new file with a different name/contents.`,
      409
    );
  }
  const r2Key = `imports/${jobType}/${fileHash}/${file.name}`;
  await env2.FILES_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: {
      originalName: file.name,
      uploadedBy: user.email,
      jobType
    }
  });
  const jobId = generateUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env2.DB.prepare(
    `INSERT INTO import_jobs
       (id, job_type, status, source_file_name, source_file_r2_key,
        source_file_hash, total_records, processed_records, failed_records,
        errors, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?, 0, 0, 0, '[]', ?, ?)`
  ).bind(jobId, jobType, file.name, r2Key, fileHash, now, now).run();
  const queue = jobType === "bcad_import" ? env2.IMPORT_QUEUE : env2.IMPORT_QUEUE;
  await queue.send({
    jobId,
    type: jobType,
    batchOffset: 0,
    batchSize: 500
  });
  return jsonOk({ jobId, status: "pending", message: "Import queued" }, 202);
}
__name(handleImport, "handleImport");
async function handleBcadImport(request, env2, _ctx, _params, user) {
  return handleImport(request, env2, user, "bcad_import");
}
__name(handleBcadImport, "handleBcadImport");
async function handleOprImport(request, env2, _ctx, _params, user) {
  return handleImport(request, env2, user, "opr_import");
}
__name(handleOprImport, "handleOprImport");

// src/handlers/jobs.ts
function formatJob(row) {
  return {
    jobId: row.id,
    status: row.status,
    jobType: row.job_type,
    totalRecords: row.total_records,
    processedRecords: row.processed_records,
    failedRecords: row.failed_records,
    errors: row.errors ? JSON.parse(row.errors) : [],
    downloadUrl: row.result_download_url ?? void 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(formatJob, "formatJob");
async function handleGetJob(_request, env2, _ctx, params, _user) {
  const { jobId } = params;
  if (!jobId) return jsonError("Missing jobId", 400);
  const row = await env2.DB.prepare(
    "SELECT * FROM import_jobs WHERE id = ?"
  ).bind(jobId).first();
  if (!row) return jsonError("Job not found", 404);
  return jsonOk(formatJob(row));
}
__name(handleGetJob, "handleGetJob");
async function handleDownloadJob(_request, env2, _ctx, params, _user) {
  const { jobId } = params;
  if (!jobId) return jsonError("Missing jobId", 400);
  const row = await env2.DB.prepare(
    "SELECT result_r2_key, status FROM import_jobs WHERE id = ?"
  ).bind(jobId).first();
  if (!row) return jsonError("Job not found", 404);
  if (row.status !== "completed") {
    return jsonError("Export not yet ready", 202);
  }
  if (!row.result_r2_key) return jsonError("No file available", 404);
  const object = await env2.FILES_BUCKET.get(row.result_r2_key);
  if (!object) return jsonError("File not found in storage", 404);
  const filename = `bexar-export-${jobId}.csv`;
  return new Response(object.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
__name(handleDownloadJob, "handleDownloadJob");
async function handleListJobs(request, env2, _ctx, _params, _user) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  let query = "SELECT * FROM import_jobs";
  const bindings = [];
  if (type) {
    query += " WHERE job_type = ?";
    bindings.push(type);
  }
  query += " ORDER BY created_at DESC LIMIT 50";
  const stmt = env2.DB.prepare(query);
  const result = bindings.length ? await stmt.bind(...bindings).all() : await stmt.all();
  return jsonOk({ jobs: (result.results ?? []).map(formatJob) });
}
__name(handleListJobs, "handleListJobs");

// src/handlers/properties.ts
function stripOwnerPii(owner, viewPii) {
  if (!owner) return null;
  return {
    id: owner.id,
    property_id: owner.property_id,
    owner_name: viewPii ? owner.owner_name : null,
    mailing_address: viewPii ? owner.mailing_address : null,
    mailing_city: viewPii ? owner.mailing_city : null,
    mailing_state: viewPii ? owner.mailing_state : null,
    mailing_zip: viewPii ? owner.mailing_zip : null,
    do_not_contact: owner.do_not_contact,
    do_not_contact_source: viewPii ? owner.do_not_contact_source : null,
    consent_or_basis_note: viewPii ? owner.consent_or_basis_note : null
  };
}
__name(stripOwnerPii, "stripOwnerPii");
function parseSearchParams(url) {
  const p = url.searchParams;
  const num = /* @__PURE__ */ __name((key) => {
    const v = p.get(key);
    return v !== null && v !== "" ? parseFloat(v) : void 0;
  }, "num");
  return {
    city: p.get("city") ?? void 0,
    commercial: p.has("commercial") ? p.get("commercial") === "true" || p.get("commercial") === "1" : void 0,
    propertyUse: p.get("propertyUse") ?? void 0,
    minBuildingSqFt: num("minBuildingSqFt"),
    maxBuildingSqFt: num("maxBuildingSqFt"),
    minBuildingSqM: num("minBuildingSqM"),
    maxBuildingSqM: num("maxBuildingSqM"),
    minLandAcres: num("minLandAcres"),
    maxLandAcres: num("maxLandAcres"),
    minMarketValue: num("minMarketValue"),
    maxMarketValue: num("maxMarketValue"),
    ownerName: p.get("ownerName") ?? void 0,
    documentType: p.get("documentType") ?? void 0,
    recordedAfter: p.get("recordedAfter") ?? void 0,
    recordedBefore: p.get("recordedBefore") ?? void 0,
    matchConfidence: p.get("matchConfidence") ?? void 0,
    limit: Math.min(num("limit") ?? 50, 200),
    offset: num("offset") ?? 0
  };
}
__name(parseSearchParams, "parseSearchParams");
async function handleSearchProperties(request, env2, _ctx, _params, user) {
  const url = new URL(request.url);
  const search = parseSearchParams(url);
  const viewPii = canViewPii(user);
  if (search.ownerName && !viewPii) {
    return jsonError("ownerName filter requires admin role", 403);
  }
  const minSqFt = search.minBuildingSqFt ?? (search.minBuildingSqM !== void 0 ? search.minBuildingSqM / 0.092903 : void 0);
  const maxSqFt = search.maxBuildingSqFt ?? (search.maxBuildingSqM !== void 0 ? search.maxBuildingSqM / 0.092903 : void 0);
  const conditions = [];
  const bindings = [];
  if (search.city) {
    conditions.push("UPPER(p.city) = UPPER(?)");
    bindings.push(search.city);
  }
  if (search.commercial !== void 0) {
    conditions.push("p.commercial = ?");
    bindings.push(search.commercial ? 1 : 0);
  }
  if (search.propertyUse) {
    conditions.push(
      "(UPPER(p.property_use_code) = UPPER(?) OR UPPER(p.property_use_description) LIKE UPPER(?))"
    );
    bindings.push(search.propertyUse, `%${search.propertyUse}%`);
  }
  if (minSqFt !== void 0) {
    conditions.push("p.building_area_sq_ft >= ?");
    bindings.push(minSqFt);
  }
  if (maxSqFt !== void 0) {
    conditions.push("p.building_area_sq_ft <= ?");
    bindings.push(maxSqFt);
  }
  if (search.minLandAcres !== void 0) {
    conditions.push("p.land_area_acres >= ?");
    bindings.push(search.minLandAcres);
  }
  if (search.maxLandAcres !== void 0) {
    conditions.push("p.land_area_acres <= ?");
    bindings.push(search.maxLandAcres);
  }
  if (search.minMarketValue !== void 0) {
    conditions.push("p.total_appraised_value >= ?");
    bindings.push(search.minMarketValue);
  }
  if (search.maxMarketValue !== void 0) {
    conditions.push("p.total_appraised_value <= ?");
    bindings.push(search.maxMarketValue);
  }
  let oprJoin = "";
  let oprCountJoin = "";
  if (search.documentType || search.recordedAfter || search.recordedBefore || search.matchConfidence) {
    oprJoin = "LEFT JOIN opr_property_links opl ON opl.property_id = p.id LEFT JOIN opr_documents opr ON opr.id = opl.opr_document_id";
    oprCountJoin = oprJoin;
    if (search.documentType) {
      conditions.push("UPPER(opr.document_type) LIKE UPPER(?)");
      bindings.push(`%${search.documentType}%`);
    }
    if (search.recordedAfter) {
      conditions.push("opr.recording_date >= ?");
      bindings.push(search.recordedAfter);
    }
    if (search.recordedBefore) {
      conditions.push("opr.recording_date <= ?");
      bindings.push(search.recordedBefore);
    }
    if (search.matchConfidence) {
      conditions.push("opl.match_confidence = ?");
      bindings.push(search.matchConfidence);
    }
  }
  let ownerJoin = "";
  if (search.ownerName) {
    ownerJoin = "JOIN owners o ON o.property_id = p.id";
    conditions.push("UPPER(o.owner_name) LIKE UPPER(?)");
    bindings.push(`%${search.ownerName}%`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM properties p
    ${ownerJoin}
    ${oprCountJoin}
    ${whereClause}
  `;
  const countResult = await env2.DB.prepare(countQuery).bind(...bindings).first();
  const total = countResult?.total ?? 0;
  const dataQuery = `
    SELECT DISTINCT p.*
    FROM properties p
    ${ownerJoin}
    ${oprJoin}
    ${whereClause}
    ORDER BY p.id
    LIMIT ? OFFSET ?
  `;
  const dataResult = await env2.DB.prepare(dataQuery).bind(...bindings, search.limit ?? 50, search.offset ?? 0).all();
  const properties = dataResult.results ?? [];
  const propertyIds = properties.map((p) => p.id);
  let owners = [];
  if (propertyIds.length > 0) {
    const placeholders = propertyIds.map(() => "?").join(",");
    const ownerResult = await env2.DB.prepare(
      `SELECT * FROM owners WHERE property_id IN (${placeholders})`
    ).bind(...propertyIds).all();
    owners = ownerResult.results ?? [];
  }
  const ownerByPropId = new Map(owners.map((o) => [o.property_id, o]));
  const responseItems = properties.map((p) => ({
    ...p,
    owner: stripOwnerPii(ownerByPropId.get(p.id) ?? null, viewPii)
  }));
  return jsonOk({
    total,
    limit: search.limit ?? 50,
    offset: search.offset ?? 0,
    properties: responseItems
  });
}
__name(handleSearchProperties, "handleSearchProperties");
async function handleGetProperty(_request, env2, _ctx, params, user) {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);
  const viewPii = canViewPii(user);
  const property = await env2.DB.prepare(
    "SELECT * FROM properties WHERE id = ?"
  ).bind(propertyId).first();
  if (!property) return jsonError("Property not found", 404);
  const owner = await env2.DB.prepare(
    "SELECT * FROM owners WHERE property_id = ? LIMIT 1"
  ).bind(propertyId).first();
  const improvementsResult = await env2.DB.prepare(
    "SELECT * FROM property_improvements WHERE property_id = ?"
  ).bind(propertyId).all();
  const oprResult = await env2.DB.prepare(
    `SELECT opr.*, opl.match_confidence, opl.id AS link_id
     FROM opr_property_links opl
     JOIN opr_documents opr ON opr.id = opl.opr_document_id
     WHERE opl.property_id = ?
     ORDER BY opr.recording_date DESC`
  ).bind(propertyId).all();
  const notesResult = await env2.DB.prepare(
    "SELECT * FROM property_notes WHERE property_id = ? ORDER BY created_at DESC"
  ).bind(propertyId).all();
  const statusResult = await env2.DB.prepare(
    "SELECT * FROM call_status WHERE property_id = ? ORDER BY changed_at DESC"
  ).bind(propertyId).all();
  const currentStatus = statusResult.results && statusResult.results.length > 0 ? statusResult.results[0].status : null;
  return jsonOk({
    property,
    owner: stripOwnerPii(owner ?? null, viewPii),
    improvements: improvementsResult.results ?? [],
    oprHistory: oprResult.results ?? [],
    notes: notesResult.results ?? [],
    callStatus: {
      current: currentStatus,
      history: statusResult.results ?? []
    }
  });
}
__name(handleGetProperty, "handleGetProperty");

// src/handlers/exports.ts
async function handleCreateExport(request, env2, _ctx, _params, user) {
  const adminError = requireAdmin(user);
  if (adminError) return adminError;
  let filters = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      filters = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
  } else {
    const url = new URL(request.url);
    for (const [key, value] of url.searchParams.entries()) {
      filters[key] = value;
    }
  }
  const jobId = generateUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env2.DB.prepare(
    `INSERT INTO import_jobs
       (id, job_type, status, source_file_name, source_file_r2_key,
        source_file_hash, total_records, processed_records, failed_records,
        errors, created_at, updated_at)
     VALUES (?, 'csv_export', 'pending', ?, NULL, NULL, 0, 0, 0, '[]', ?, ?)`
  ).bind(jobId, `export-${jobId}.csv`, now, now).run();
  await env2.DB.prepare(
    "UPDATE import_jobs SET source_file_name = ? WHERE id = ?"
  ).bind(JSON.stringify({ filters, requestedBy: user.email }), jobId).run();
  await env2.EXPORT_QUEUE.send({
    jobId,
    type: "csv_export",
    batchOffset: 0,
    batchSize: 0
  });
  return jsonOk({ jobId, status: "pending" }, 202);
}
__name(handleCreateExport, "handleCreateExport");

// src/types.ts
var CALL_STATUS_VALUES = [
  "New",
  "Contacted",
  "Follow Up",
  "Interested",
  "Not Interested",
  "Wrong Number",
  "Do Not Contact"
];

// src/handlers/notes.ts
async function handleAddNote(request, env2, _ctx, params, user) {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const note = body.note?.trim();
  if (!note) return jsonError('"note" field is required', 400);
  const exists = await env2.DB.prepare(
    "SELECT id FROM properties WHERE id = ?"
  ).bind(propertyId).first();
  if (!exists) return jsonError("Property not found", 404);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ensureUserExists(env2, user, now);
  await env2.DB.prepare(
    `INSERT INTO property_notes (property_id, note, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(propertyId, note, user.id, now).run();
  return jsonOk({ message: "Note added", propertyId, note, createdAt: now }, 201);
}
__name(handleAddNote, "handleAddNote");
async function handleAddCallStatus(request, env2, _ctx, params, user) {
  const { propertyId } = params;
  if (!propertyId) return jsonError("Missing propertyId", 400);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const status = body.status;
  if (!status || !CALL_STATUS_VALUES.includes(status)) {
    return jsonError(
      `"status" must be one of: ${CALL_STATUS_VALUES.join(", ")}`,
      400
    );
  }
  const exists = await env2.DB.prepare(
    "SELECT id FROM properties WHERE id = ?"
  ).bind(propertyId).first();
  if (!exists) return jsonError("Property not found", 404);
  if (env2.APP_USAGE_MODE === "outreach" && status === "Contacted") {
    const owner = await env2.DB.prepare(
      "SELECT do_not_contact FROM owners WHERE property_id = ? LIMIT 1"
    ).bind(propertyId).first();
    if (owner?.do_not_contact === 1) {
      return jsonError(
        'Cannot set status to "Contacted": owner is marked Do Not Contact',
        409
      );
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ensureUserExists(env2, user, now);
  await env2.DB.prepare(
    `INSERT INTO call_status (property_id, status, note, changed_by_user_id, changed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(propertyId, status, body.note?.trim() ?? null, user.id, now).run();
  return jsonOk(
    { message: "Call status updated", propertyId, status, changedAt: now },
    201
  );
}
__name(handleAddCallStatus, "handleAddCallStatus");
async function ensureUserExists(env2, user, now) {
  await env2.DB.prepare(
    `INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).bind(user.id, user.email, user.role, now).run();
}
__name(ensureUserExists, "ensureUserExists");

// src/services/csv-parser.ts
function parseCsv(text) {
  const errors = [];
  const rawLines = splitRespectingQuotes(text);
  if (rawLines.length === 0) {
    return { headers: [], rows: [], errors: ["CSV file is empty"] };
  }
  const headers = parseCsvRow(rawLines[0] ?? "").map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    return { headers: [], rows: [], errors: ["CSV has no header row"] };
  }
  const rows = [];
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line === void 0 || line.trim() === "") continue;
    try {
      const values = parseCsvRow(line);
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        if (key !== void 0 && key !== "") {
          row[key] = values[j] ?? "";
        }
      }
      rows.push(row);
    } catch (e) {
      errors.push(`Row ${i + 1}: ${String(e)}`);
    }
  }
  return { headers, rows, errors };
}
__name(parseCsv, "parseCsv");
function splitRespectingQuotes(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }
  return lines;
}
__name(splitRespectingQuotes, "splitRespectingQuotes");
function parseCsvRow(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
__name(parseCsvRow, "parseCsvRow");
var BCAD_COLUMN_ALIASES = {
  // Property ID
  "property id": "propertyId",
  prop_id: "propertyId",
  "account number": "propertyId",
  acct_no: "propertyId",
  // Geographic ID
  "geographic id": "geographicId",
  geo_id: "geographicId",
  "geo id": "geographicId",
  // Owner
  "owner name": "ownerName",
  owner: "ownerName",
  // Mailing address
  "mailing address": "ownerMailingAddress",
  mail_addr: "ownerMailingAddress",
  "owner mailing address": "ownerMailingAddress",
  "mailing city": "ownerMailingCity",
  "mail city": "ownerMailingCity",
  "mailing state": "ownerMailingState",
  "mail state": "ownerMailingState",
  "mailing zip": "ownerMailingZip",
  "mail zip": "ownerMailingZip",
  "mailing zip code": "ownerMailingZip",
  // Property address
  "property address": "propertyAddress",
  "site address": "propertyAddress",
  situs: "propertyAddress",
  "situs address": "propertyAddress",
  city: "city",
  "zip code": "zipCode",
  zip: "zipCode",
  // Legal
  "legal description": "legalDescription",
  legal_desc: "legalDescription",
  // Use code
  "property use code": "propertyUseCode",
  "use code": "propertyUseCode",
  "state code": "propertyUseCode",
  "property use description": "propertyUseDescription",
  "use description": "propertyUseDescription",
  // Building
  "building type": "buildingType",
  "improvement type": "buildingType",
  "building area": "buildingAreaSqFt",
  "building area (sq ft)": "buildingAreaSqFt",
  "bldg area": "buildingAreaSqFt",
  "impr sqft": "buildingAreaSqFt",
  // Land
  "land area (sq ft)": "landAreaSqFt",
  "land area sq ft": "landAreaSqFt",
  "land sqft": "landAreaSqFt",
  "land area (acres)": "landAreaAcres",
  "land acres": "landAreaAcres",
  acres: "landAreaAcres",
  // Values
  "improvement value": "improvementValue",
  "impr value": "improvementValue",
  "imprv val": "improvementValue",
  "land value": "landValue",
  "land val": "landValue",
  "total appraised value": "totalAppraisedValue",
  "market value": "totalAppraisedValue",
  "total value": "totalAppraisedValue",
  "appraised value": "totalAppraisedValue",
  // Exemption
  "exemption status": "exemptionStatus",
  exemptions: "exemptionStatus"
};
function bcadHeaderToField(header) {
  return BCAD_COLUMN_ALIASES[header.toLowerCase().trim()];
}
__name(bcadHeaderToField, "bcadHeaderToField");
var OPR_COLUMN_ALIASES = {
  "document number": "documentNumber",
  "doc number": "documentNumber",
  doc_no: "documentNumber",
  instrument: "documentNumber",
  "instrument number": "documentNumber",
  "recording date": "recordingDate",
  "recorded date": "recordingDate",
  "file date": "recordingDate",
  "document type": "documentType",
  "doc type": "documentType",
  type: "documentType",
  grantor: "grantor",
  grantors: "grantor",
  grantee: "grantee",
  grantees: "grantee",
  "legal description": "legalDescription",
  legal: "legalDescription",
  "property address": "propertyAddress",
  "situs address": "propertyAddress",
  address: "propertyAddress"
};
function oprHeaderToField(header) {
  return OPR_COLUMN_ALIASES[header.toLowerCase().trim()];
}
__name(oprHeaderToField, "oprHeaderToField");

// src/services/address-normalizer.ts
var ABBREVIATIONS = {
  // Street types
  ALY: "ALLEY",
  AVE: "AVENUE",
  AV: "AVENUE",
  BLVD: "BOULEVARD",
  BVLD: "BOULEVARD",
  CIR: "CIRCLE",
  CT: "COURT",
  CV: "COVE",
  DR: "DRIVE",
  EXPY: "EXPRESSWAY",
  FWY: "FREEWAY",
  HWY: "HIGHWAY",
  LN: "LANE",
  PKWY: "PARKWAY",
  PL: "PLACE",
  RD: "ROAD",
  SQ: "SQUARE",
  ST: "STREET",
  TER: "TERRACE",
  TRL: "TRAIL",
  // Directionals
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
  NE: "NORTHEAST",
  NW: "NORTHWEST",
  SE: "SOUTHEAST",
  SW: "SOUTHWEST"
};
var SUITE_RE = /\b(?:STE|SUITE|APT|APARTMENT|UNIT|#|BLDG|BUILDING|FLOOR|FL|RM|ROOM)\s*[#\-]?\s*[\w\d]+\b/gi;
function normalizeAddress(address) {
  if (!address) return { normalized: "" };
  let addr = address.toUpperCase();
  const suiteMatches = addr.match(SUITE_RE);
  const suite = suiteMatches ? suiteMatches[0] : void 0;
  if (suite) {
    addr = addr.replace(SUITE_RE, "");
  }
  addr = addr.replace(/[^A-Z0-9 ]/g, " ");
  const expanded = addr.split(/\s+/).filter(Boolean).map((word) => ABBREVIATIONS[word] ?? word);
  const normalized = expanded.join(" ").trim();
  return {
    normalized,
    suite: suite ? suite.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim() : void 0
  };
}
__name(normalizeAddress, "normalizeAddress");
function normalizeLegalDescription(desc) {
  if (!desc) return "";
  return desc.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeLegalDescription, "normalizeLegalDescription");

// src/services/csv-exporter.ts
function escapeCsvField(value) {
  if (value === null || value === void 0) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
__name(escapeCsvField, "escapeCsvField");
function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(",");
}
__name(toCsvRow, "toCsvRow");
function toCsvString(headers, rows) {
  const lines = [toCsvRow(headers)];
  for (const row of rows) {
    lines.push(toCsvRow(row));
  }
  return lines.join("\r\n");
}
__name(toCsvString, "toCsvString");
var EXPORT_HEADERS = [
  "Owner Name",
  "Owner Mailing Address",
  "Property Address",
  "City",
  "ZIP Code",
  "Property ID",
  "Geographic ID",
  "Legal Description",
  "Property Use Code",
  "Property Use Description",
  "Building Type",
  "Building Area Sq Ft",
  "Building Area Sq M",
  "Land Area Sq Ft",
  "Land Area Acres",
  "Improvement Value",
  "Land Value",
  "Total Market Value",
  "Latest OPR Document Number",
  "Latest OPR Document Type",
  "Latest OPR Recording Date",
  "Match Confidence",
  "Grantor",
  "Grantee",
  "Call Status",
  "Notes",
  "Data Source",
  "Last Updated"
];
var SQ_FT_TO_SQ_M = 0.092903;

// src/services/matcher.ts
var FUZZY_THRESHOLD = 0.85;
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}
__name(levenshtein, "levenshtein");
function charSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}
__name(charSimilarity, "charSimilarity");
function tokenSimilarity(a, b) {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
__name(tokenSimilarity, "tokenSimilarity");
function combinedSimilarity(a, b) {
  return (charSimilarity(a, b) + tokenSimilarity(a, b)) / 2;
}
__name(combinedSimilarity, "combinedSimilarity");
function matchOprToProperty(opr, prop) {
  if (opr.bcadPropertyId && opr.bcadPropertyId === prop.propertyId) {
    return { confidence: "exact_id" };
  }
  if (opr.bcadGeographicId && prop.geographicId && opr.bcadGeographicId === prop.geographicId) {
    return { confidence: "exact_geographic" };
  }
  const legalMatch = opr.legalDescriptionNormalized && prop.legalDescriptionNormalized && opr.legalDescriptionNormalized.length > 0 && prop.legalDescriptionNormalized.length > 0 && opr.legalDescriptionNormalized === prop.legalDescriptionNormalized;
  if (legalMatch) {
    const oprAddr2 = opr.propertyAddressNormalized;
    const propAddr2 = prop.propertyAddressNormalized;
    if (oprAddr2 && propAddr2 && oprAddr2.length > 0 && propAddr2.length > 0 && oprAddr2 !== propAddr2) {
      return { confidence: "needs_review" };
    }
    return { confidence: "exact_legal" };
  }
  const oprAddr = opr.propertyAddressNormalized;
  const propAddr = prop.propertyAddressNormalized;
  if (oprAddr && propAddr && oprAddr.length > 0 && propAddr.length > 0) {
    const similarity = combinedSimilarity(oprAddr, propAddr);
    if (similarity >= FUZZY_THRESHOLD) {
      return { confidence: "fuzzy_address", similarity };
    }
  }
  return { confidence: "unmatched" };
}
__name(matchOprToProperty, "matchOprToProperty");

// src/queue/bcad-processor.ts
function mapBcadRow(raw) {
  const mapped = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = bcadHeaderToField(header);
    if (field) mapped[field] = value.trim();
  }
  const propertyId = mapped["propertyId"]?.trim();
  if (!propertyId) return null;
  const numField = /* @__PURE__ */ __name((key) => {
    const v = mapped[key];
    if (!v) return void 0;
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? void 0 : n;
  }, "numField");
  return {
    propertyId,
    geographicId: mapped["geographicId"],
    ownerName: mapped["ownerName"],
    ownerMailingAddress: mapped["ownerMailingAddress"],
    ownerMailingCity: mapped["ownerMailingCity"],
    ownerMailingState: mapped["ownerMailingState"],
    ownerMailingZip: mapped["ownerMailingZip"],
    propertyAddress: mapped["propertyAddress"],
    city: mapped["city"],
    zipCode: mapped["zipCode"],
    legalDescription: mapped["legalDescription"],
    propertyUseCode: mapped["propertyUseCode"],
    propertyUseDescription: mapped["propertyUseDescription"],
    buildingType: mapped["buildingType"],
    buildingAreaSqFt: numField("buildingAreaSqFt"),
    landAreaSqFt: numField("landAreaSqFt"),
    landAreaAcres: numField("landAreaAcres"),
    improvementValue: numField("improvementValue"),
    landValue: numField("landValue"),
    totalAppraisedValue: numField("totalAppraisedValue"),
    exemptionStatus: mapped["exemptionStatus"]
  };
}
__name(mapBcadRow, "mapBcadRow");
var COMMERCIAL_USE_CODE_PREFIXES = [
  "A",
  // Retail
  "B",
  // Office
  "C",
  // Commercial
  "D",
  // Industrial
  "E",
  // Hotels / Motels
  "F",
  // Multi-family (4+ units)
  "G"
  // Special commercial
];
function isCommercialUseCode(code) {
  if (!code) return false;
  return COMMERCIAL_USE_CODE_PREFIXES.some(
    (prefix) => code.toUpperCase().startsWith(prefix)
  );
}
__name(isCommercialUseCode, "isCommercialUseCode");
async function processBcadImport(env2, job) {
  const r2Key = job.source_file_r2_key;
  if (!r2Key) throw new Error("Job has no source_file_r2_key");
  const object = await env2.FILES_BUCKET.get(r2Key);
  if (!object) throw new Error(`R2 object not found: ${r2Key}`);
  const text = await object.text();
  const { rows, errors: parseErrors } = parseCsv(text);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const dataSource = `BCAD import ${job.id}`;
  const fileHash = job.source_file_hash ?? "";
  const jobErrors = [...parseErrors];
  let processed = 0;
  let failed = 0;
  await env2.DB.prepare(
    "UPDATE import_jobs SET status='processing', total_records=?, updated_at=? WHERE id=?"
  ).bind(rows.length, now, job.id).run();
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const rawRow of chunk) {
      const row = mapBcadRow(rawRow);
      if (!row) {
        failed++;
        jobErrors.push(`Row ${i + 1}: missing Property ID`);
        continue;
      }
      try {
        await upsertBcadRow(env2, row, dataSource, fileHash, now);
        processed++;
      } catch (err) {
        failed++;
        jobErrors.push(`Property ${row.propertyId}: ${String(err)}`);
      }
    }
    await env2.DB.prepare(
      "UPDATE import_jobs SET processed_records=?, failed_records=?, errors=?, updated_at=? WHERE id=?"
    ).bind(
      processed,
      failed,
      JSON.stringify(jobErrors.slice(0, 100)),
      // cap stored errors
      (/* @__PURE__ */ new Date()).toISOString(),
      job.id
    ).run();
  }
  await env2.DB.prepare(
    `UPDATE import_jobs
     SET status=?, processed_records=?, failed_records=?, errors=?, updated_at=?
     WHERE id=?`
  ).bind(
    failed === rows.length && rows.length > 0 ? "failed" : "completed",
    processed,
    failed,
    JSON.stringify(jobErrors.slice(0, 100)),
    (/* @__PURE__ */ new Date()).toISOString(),
    job.id
  ).run();
}
__name(processBcadImport, "processBcadImport");
async function upsertBcadRow(env2, row, dataSource, fileHash, now) {
  const { normalized: addrNorm } = normalizeAddress(row.propertyAddress);
  const legalNorm = normalizeLegalDescription(row.legalDescription);
  const hasBuildingArea = row.buildingAreaSqFt !== void 0 && row.buildingAreaSqFt > 0;
  const commercial = hasBuildingArea && isCommercialUseCode(row.propertyUseCode) ? 1 : 0;
  const buildingSqM = row.buildingAreaSqFt !== void 0 ? Math.round(row.buildingAreaSqFt * SQ_FT_TO_SQ_M * 100) / 100 : null;
  const aggSqFt = hasBuildingArea ? row.buildingAreaSqFt : null;
  const aggSqM = buildingSqM;
  await env2.DB.prepare(
    `INSERT INTO properties
       (id, geographic_id, property_address, property_address_normalized,
        city, zip_code, legal_description, legal_description_normalized,
        property_use_code, property_use_description, commercial,
        improvement_value, land_value, total_appraised_value,
        land_area_sq_ft, land_area_acres,
        building_area_sq_ft, building_area_sq_m,
        exemption_status, data_source, source_file_hash, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       geographic_id              = excluded.geographic_id,
       property_address           = excluded.property_address,
       property_address_normalized= excluded.property_address_normalized,
       city                       = excluded.city,
       zip_code                   = excluded.zip_code,
       legal_description          = excluded.legal_description,
       legal_description_normalized=excluded.legal_description_normalized,
       property_use_code          = excluded.property_use_code,
       property_use_description   = excluded.property_use_description,
       commercial                 = excluded.commercial,
       improvement_value          = excluded.improvement_value,
       land_value                 = excluded.land_value,
       total_appraised_value      = excluded.total_appraised_value,
       land_area_sq_ft            = excluded.land_area_sq_ft,
       land_area_acres            = excluded.land_area_acres,
       building_area_sq_ft        = excluded.building_area_sq_ft,
       building_area_sq_m         = excluded.building_area_sq_m,
       exemption_status           = excluded.exemption_status,
       data_source                = excluded.data_source,
       source_file_hash           = excluded.source_file_hash,
       last_updated               = excluded.last_updated`
  ).bind(
    row.propertyId,
    row.geographicId ?? null,
    row.propertyAddress ?? null,
    addrNorm || null,
    row.city ?? null,
    row.zipCode ?? null,
    row.legalDescription ?? null,
    legalNorm || null,
    row.propertyUseCode ?? null,
    row.propertyUseDescription ?? null,
    commercial,
    row.improvementValue ?? null,
    row.landValue ?? null,
    row.totalAppraisedValue ?? null,
    row.landAreaSqFt ?? null,
    row.landAreaAcres ?? null,
    aggSqFt ?? null,
    aggSqM ?? null,
    row.exemptionStatus ?? null,
    dataSource,
    fileHash,
    now,
    now
  ).run();
  await env2.DB.prepare(
    `INSERT INTO owners
       (property_id, owner_name, mailing_address, mailing_city,
        mailing_state, mailing_zip, data_source, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(rowid) DO NOTHING`
  );
  await env2.DB.prepare(
    "DELETE FROM owners WHERE property_id = ?"
  ).bind(row.propertyId).run();
  await env2.DB.prepare(
    `INSERT INTO owners
       (property_id, owner_name, mailing_address, mailing_city,
        mailing_state, mailing_zip, data_source, import_date, last_updated)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(
    row.propertyId,
    row.ownerName ?? null,
    row.ownerMailingAddress ?? null,
    row.ownerMailingCity ?? null,
    row.ownerMailingState ?? null,
    row.ownerMailingZip ?? null,
    dataSource,
    now,
    now
  ).run();
  await env2.DB.prepare(
    "DELETE FROM property_improvements WHERE property_id = ?"
  ).bind(row.propertyId).run();
  if (hasBuildingArea) {
    await env2.DB.prepare(
      `INSERT INTO property_improvements
         (property_id, building_type, building_area_sq_ft, building_area_sq_m,
          improvement_value, data_source, import_date)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(
      row.propertyId,
      row.buildingType ?? null,
      row.buildingAreaSqFt ?? null,
      buildingSqM,
      row.improvementValue ?? null,
      dataSource,
      now
    ).run();
  }
  await env2.DB.prepare(
    `UPDATE properties SET
       building_area_sq_ft = (
         SELECT SUM(building_area_sq_ft) FROM property_improvements WHERE property_id = ?
       ),
       building_area_sq_m = (
         SELECT ROUND(SUM(building_area_sq_ft) * 0.092903, 2)
         FROM property_improvements WHERE property_id = ?
       ),
       last_updated = ?
     WHERE id = ?`
  ).bind(row.propertyId, row.propertyId, now, row.propertyId).run();
  await env2.DB.prepare(
    `UPDATE properties SET commercial = CASE
       WHEN (SELECT COUNT(*) FROM property_improvements WHERE property_id = ?) = 0 THEN 0
       ELSE commercial
     END
     WHERE id = ?`
  ).bind(row.propertyId, row.propertyId).run();
  await linkPropertyToOpr(env2, row.propertyId, {
    propertyId: row.propertyId,
    geographicId: row.geographicId ?? null,
    propertyAddressNormalized: addrNorm || null,
    legalDescriptionNormalized: legalNorm || null
  });
}
__name(upsertBcadRow, "upsertBcadRow");
async function linkPropertyToOpr(env2, propertyId, propMatch) {
  const unlinkedOpr = await env2.DB.prepare(
    `SELECT od.*
     FROM opr_documents od
     WHERE NOT EXISTS (
       SELECT 1 FROM opr_property_links opl
       WHERE opl.opr_document_id = od.id AND opl.property_id = ?
     )
     ORDER BY od.recording_date DESC
     LIMIT 200`
  ).bind(propertyId).all();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const opr of unlinkedOpr.results ?? []) {
    const oprDoc = {
      propertyAddressNormalized: opr.property_address_normalized,
      legalDescriptionNormalized: opr.legal_description_normalized
    };
    const result = matchOprToProperty(oprDoc, propMatch);
    if (result.confidence !== "unmatched") {
      await env2.DB.prepare(
        `INSERT INTO opr_property_links (opr_document_id, property_id, match_confidence, created_at)
         VALUES (?,?,?,?)`
      ).bind(opr.id, propertyId, result.confidence, now).run();
    }
  }
}
__name(linkPropertyToOpr, "linkPropertyToOpr");

// src/queue/opr-processor.ts
function mapOprRow(raw) {
  const mapped = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = oprHeaderToField(header);
    if (field) mapped[field] = value.trim();
  }
  const documentNumber = mapped["documentNumber"]?.trim();
  if (!documentNumber) return null;
  return {
    documentNumber,
    recordingDate: mapped["recordingDate"] || void 0,
    documentType: mapped["documentType"] || void 0,
    grantor: mapped["grantor"] || void 0,
    grantee: mapped["grantee"] || void 0,
    legalDescription: mapped["legalDescription"] || void 0,
    propertyAddress: mapped["propertyAddress"] || void 0
  };
}
__name(mapOprRow, "mapOprRow");
async function processOprImport(env2, job) {
  const r2Key = job.source_file_r2_key;
  if (!r2Key) throw new Error("Job has no source_file_r2_key");
  const object = await env2.FILES_BUCKET.get(r2Key);
  if (!object) throw new Error(`R2 object not found: ${r2Key}`);
  const text = await object.text();
  const { rows, errors: parseErrors } = parseCsv(text);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const dataSource = `OPR import ${job.id}`;
  const fileHash = job.source_file_hash ?? "";
  const jobErrors = [...parseErrors];
  let processed = 0;
  let failed = 0;
  await env2.DB.prepare(
    "UPDATE import_jobs SET status='processing', total_records=?, updated_at=? WHERE id=?"
  ).bind(rows.length, now, job.id).run();
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const rawRow of chunk) {
      const row = mapOprRow(rawRow);
      if (!row) {
        failed++;
        jobErrors.push(`Row ${i + 1}: missing Document Number`);
        continue;
      }
      try {
        await upsertOprRow(env2, row, dataSource, fileHash, now);
        processed++;
      } catch (err) {
        failed++;
        jobErrors.push(`Document ${row.documentNumber}: ${String(err)}`);
      }
    }
    await env2.DB.prepare(
      "UPDATE import_jobs SET processed_records=?, failed_records=?, errors=?, updated_at=? WHERE id=?"
    ).bind(
      processed,
      failed,
      JSON.stringify(jobErrors.slice(0, 100)),
      (/* @__PURE__ */ new Date()).toISOString(),
      job.id
    ).run();
  }
  await env2.DB.prepare(
    `UPDATE import_jobs
     SET status=?, processed_records=?, failed_records=?, errors=?, updated_at=?
     WHERE id=?`
  ).bind(
    failed === rows.length && rows.length > 0 ? "failed" : "completed",
    processed,
    failed,
    JSON.stringify(jobErrors.slice(0, 100)),
    (/* @__PURE__ */ new Date()).toISOString(),
    job.id
  ).run();
}
__name(processOprImport, "processOprImport");
async function upsertOprRow(env2, row, dataSource, fileHash, now) {
  const { normalized: addrNorm } = normalizeAddress(row.propertyAddress);
  const legalNorm = normalizeLegalDescription(row.legalDescription);
  const result = await env2.DB.prepare(
    `INSERT INTO opr_documents
       (document_number, recording_date, document_type, grantor, grantee,
        legal_description, legal_description_normalized,
        property_address, property_address_normalized,
        data_source, source_file_hash, import_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(document_number) DO NOTHING`
  ).bind(
    row.documentNumber,
    row.recordingDate ?? null,
    row.documentType ?? null,
    row.grantor ?? null,
    row.grantee ?? null,
    row.legalDescription ?? null,
    legalNorm || null,
    row.propertyAddress ?? null,
    addrNorm || null,
    dataSource,
    fileHash,
    now
  ).run();
  const docRow = await env2.DB.prepare(
    "SELECT id FROM opr_documents WHERE document_number = ?"
  ).bind(row.documentNumber).first();
  if (!docRow) return;
  const docId = docRow.id;
  const existingLinks = await env2.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM opr_property_links WHERE opr_document_id = ?"
  ).bind(docId).first();
  if (existingLinks && existingLinks.cnt > 0) return;
  const oprInput = {
    propertyAddressNormalized: addrNorm || null,
    legalDescriptionNormalized: legalNorm || null
  };
  const candidates = await env2.DB.prepare(
    `SELECT id, geographic_id,
            property_address_normalized,
            legal_description_normalized
     FROM properties
     WHERE (
       (legal_description_normalized IS NOT NULL AND legal_description_normalized != '' AND
        legal_description_normalized = ?)
       OR
       (property_address_normalized IS NOT NULL AND property_address_normalized != '')
     )
     LIMIT 50`
  ).bind(legalNorm || "___NO_MATCH___").all();
  let bestConfidence = "unmatched";
  let bestPropertyId = null;
  let bestSimilarity = 0;
  for (const prop of candidates.results ?? []) {
    const matchResult = matchOprToProperty(oprInput, {
      propertyId: prop.id,
      geographicId: prop.geographic_id,
      propertyAddressNormalized: prop.property_address_normalized,
      legalDescriptionNormalized: prop.legal_description_normalized
    });
    const priority = confidencePriority(matchResult.confidence);
    const bestPriority = confidencePriority(
      bestConfidence
    );
    if (priority > bestPriority || priority === bestPriority && (matchResult.similarity ?? 0) > bestSimilarity) {
      bestConfidence = matchResult.confidence;
      bestPropertyId = prop.id;
      bestSimilarity = matchResult.similarity ?? 0;
    }
  }
  const finalConfidence = bestPropertyId ? bestConfidence : "unmatched";
  const finalPropertyId = bestPropertyId ?? null;
  await env2.DB.prepare(
    `INSERT INTO opr_property_links (opr_document_id, property_id, match_confidence, created_at)
     VALUES (?,?,?,?)`
  ).bind(docId, finalPropertyId, finalConfidence, now).run();
  void result;
}
__name(upsertOprRow, "upsertOprRow");
function confidencePriority(confidence) {
  const priorities = {
    exact_id: 5,
    exact_geographic: 4,
    exact_legal: 3,
    fuzzy_address: 2,
    needs_review: 1,
    unmatched: 0
  };
  return priorities[confidence] ?? 0;
}
__name(confidencePriority, "confidencePriority");

// src/queue/export-processor.ts
async function processExport(env2, job) {
  let meta = { filters: {}, requestedBy: "unknown" };
  try {
    meta = JSON.parse(job.source_file_name ?? "{}");
  } catch {
  }
  const filters = meta.filters;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env2.DB.prepare(
    "UPDATE import_jobs SET status='processing', updated_at=? WHERE id=?"
  ).bind(now, job.id).run();
  const conditions = [];
  const bindings = [];
  if (filters["commercial"] === "true" || filters["commercial"] === "1") {
    conditions.push("p.commercial = 1");
  }
  if (filters["city"]) {
    conditions.push("UPPER(p.city) = UPPER(?)");
    bindings.push(filters["city"]);
  }
  if (filters["propertyUse"]) {
    conditions.push("(UPPER(p.property_use_code) = UPPER(?) OR UPPER(p.property_use_description) LIKE UPPER(?))");
    bindings.push(filters["propertyUse"], `%${filters["propertyUse"]}%`);
  }
  const minSqFt = filters["minBuildingSqFt"] ? parseFloat(filters["minBuildingSqFt"]) : filters["minBuildingSqM"] ? parseFloat(filters["minBuildingSqM"]) / SQ_FT_TO_SQ_M : null;
  const maxSqFt = filters["maxBuildingSqFt"] ? parseFloat(filters["maxBuildingSqFt"]) : filters["maxBuildingSqM"] ? parseFloat(filters["maxBuildingSqM"]) / SQ_FT_TO_SQ_M : null;
  if (minSqFt !== null) {
    conditions.push("p.building_area_sq_ft >= ?");
    bindings.push(minSqFt);
  }
  if (maxSqFt !== null) {
    conditions.push("p.building_area_sq_ft <= ?");
    bindings.push(maxSqFt);
  }
  if (filters["minLandAcres"]) {
    conditions.push("p.land_area_acres >= ?");
    bindings.push(parseFloat(filters["minLandAcres"]));
  }
  if (filters["maxLandAcres"]) {
    conditions.push("p.land_area_acres <= ?");
    bindings.push(parseFloat(filters["maxLandAcres"]));
  }
  if (filters["minMarketValue"]) {
    conditions.push("p.total_appraised_value >= ?");
    bindings.push(parseFloat(filters["minMarketValue"]));
  }
  if (filters["maxMarketValue"]) {
    conditions.push("p.total_appraised_value <= ?");
    bindings.push(parseFloat(filters["maxMarketValue"]));
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const PAGE = 500;
  let offset = 0;
  const allRows = [];
  while (true) {
    const dataResult = await env2.DB.prepare(
      `SELECT p.*,
              o.owner_name, o.mailing_address, o.mailing_city, o.mailing_state, o.mailing_zip,
              (SELECT pi2.building_type FROM property_improvements pi2 WHERE pi2.property_id = p.id LIMIT 1) AS bldg_type,
              (SELECT cs.status FROM call_status cs WHERE cs.property_id = p.id ORDER BY cs.changed_at DESC LIMIT 1) AS latest_call_status,
              (SELECT GROUP_CONCAT(pn.note, ' | ') FROM property_notes pn WHERE pn.property_id = p.id ORDER BY pn.created_at DESC LIMIT 3) AS notes_concat,
              opr.document_number AS opr_doc_num,
              opr.document_type AS opr_doc_type,
              opr.recording_date AS opr_recording_date,
              opl.match_confidence,
              opr.grantor AS opr_grantor,
              opr.grantee AS opr_grantee
       FROM properties p
       LEFT JOIN owners o ON o.property_id = p.id
       LEFT JOIN (
         SELECT opl2.property_id, MAX(opr2.recording_date) AS latest_date
         FROM opr_property_links opl2
         JOIN opr_documents opr2 ON opr2.id = opl2.opr_document_id
         GROUP BY opl2.property_id
       ) latest_opr ON latest_opr.property_id = p.id
       LEFT JOIN opr_property_links opl ON opl.property_id = p.id
         AND opl.opr_document_id = (
           SELECT opl3.opr_document_id
           FROM opr_property_links opl3
           JOIN opr_documents opr3 ON opr3.id = opl3.opr_document_id
           WHERE opl3.property_id = p.id
           ORDER BY opr3.recording_date DESC LIMIT 1
         )
       LEFT JOIN opr_documents opr ON opr.id = opl.opr_document_id
       ${whereClause}
       ORDER BY p.id
       LIMIT ? OFFSET ?`
    ).bind(...bindings, PAGE, offset).all();
    const pageRows = dataResult.results ?? [];
    if (pageRows.length === 0) break;
    for (const r of pageRows) {
      allRows.push([
        r["owner_name"] ?? null,
        r["mailing_address"] ?? null,
        r["property_address"] ?? null,
        r["city"] ?? null,
        r["zip_code"] ?? null,
        r["id"] ?? null,
        r["geographic_id"] ?? null,
        r["legal_description"] ?? null,
        r["property_use_code"] ?? null,
        r["property_use_description"] ?? null,
        r["bldg_type"] ?? null,
        r["building_area_sq_ft"] ?? null,
        r["building_area_sq_m"] ?? null,
        r["land_area_sq_ft"] ?? null,
        r["land_area_acres"] ?? null,
        r["improvement_value"] ?? null,
        r["land_value"] ?? null,
        r["total_appraised_value"] ?? null,
        r["opr_doc_num"] ?? null,
        r["opr_doc_type"] ?? null,
        r["opr_recording_date"] ?? null,
        r["match_confidence"] ?? null,
        r["opr_grantor"] ?? null,
        r["opr_grantee"] ?? null,
        r["latest_call_status"] ?? null,
        r["notes_concat"] ?? null,
        r["data_source"] ?? null,
        r["last_updated"] ?? null
      ]);
    }
    offset += PAGE;
    if (pageRows.length < PAGE) break;
  }
  const csv = toCsvString(Array.from(EXPORT_HEADERS), allRows);
  const csvBytes = new TextEncoder().encode(csv);
  const r2Key = `exports/${job.id}.csv`;
  await env2.FILES_BUCKET.put(r2Key, csvBytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: { jobId: job.id, exportedAt: now }
  });
  const downloadUrl = `/api/jobs/${job.id}/download`;
  await env2.DB.prepare(
    `UPDATE import_jobs
     SET status='completed', total_records=?, processed_records=?,
         result_r2_key=?, result_download_url=?, updated_at=?
     WHERE id=?`
  ).bind(allRows.length, allRows.length, r2Key, downloadUrl, (/* @__PURE__ */ new Date()).toISOString(), job.id).run();
}
__name(processExport, "processExport");

// src/queue/consumer.ts
async function handleQueue(batch, env2) {
  for (const message of batch.messages) {
    const { jobId, type } = message.body;
    try {
      const job = await env2.DB.prepare(
        "SELECT * FROM import_jobs WHERE id = ?"
      ).bind(jobId).first();
      if (!job) {
        console.error(`[queue] Job not found: ${jobId}`);
        message.ack();
        continue;
      }
      if (job.status === "completed") {
        message.ack();
        continue;
      }
      switch (type) {
        case "bcad_import":
          await processBcadImport(env2, job);
          break;
        case "opr_import":
          await processOprImport(env2, job);
          break;
        case "csv_export":
          await processExport(env2, job);
          break;
        default:
          console.error(`[queue] Unknown job type: ${String(type)}`);
          message.ack();
          continue;
      }
      message.ack();
    } catch (err) {
      console.error(`[queue] Job ${jobId} failed: ${String(err)}`);
      try {
        const errMsg = String(err);
        await env2.DB.prepare(
          `UPDATE import_jobs
           SET status='failed',
               errors=JSON_ARRAY(?),
               updated_at=?
           WHERE id=? AND status != 'completed'`
        ).bind(errMsg, (/* @__PURE__ */ new Date()).toISOString(), jobId).run();
      } catch {
      }
      message.retry();
    }
  }
}
__name(handleQueue, "handleQueue");

// src/queue/retention-processor.ts
var DEFAULT_SOURCE_DAYS = 30;
var DEFAULT_CSV_DAYS = 7;
async function handleRetention(_controller, env2, _ctx) {
  const sourceDays = parseInt(env2.RETENTION_DAYS_SOURCE_FILES ?? "") || DEFAULT_SOURCE_DAYS;
  const csvDays = parseInt(env2.RETENTION_DAYS_GENERATED_CSV ?? "") || DEFAULT_CSV_DAYS;
  await cleanupFiles(env2, "imports/", sourceDays);
  await cleanupFiles(env2, "exports/", csvDays);
}
__name(handleRetention, "handleRetention");
async function cleanupFiles(env2, prefix, retentionDays) {
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();
  let cursor;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  do {
    const listed = await env2.FILES_BUCKET.list({
      prefix,
      cursor,
      limit: 100
    });
    for (const obj of listed.objects) {
      const uploadedAt = obj.uploaded.toISOString();
      if (uploadedAt < cutoffIso) {
        await env2.FILES_BUCKET.delete(obj.key);
        await env2.DB.prepare(
          `INSERT INTO deleted_files_log (file_hash, original_name, r2_key, deleted_at)
           VALUES (?, ?, ?, ?)`
        ).bind(
          obj.checksums.md5 ?? null,
          obj.key.split("/").pop() ?? obj.key,
          obj.key,
          now
        ).run();
        if (prefix.startsWith("exports/")) {
          await env2.DB.prepare(
            "UPDATE import_jobs SET result_r2_key = NULL WHERE result_r2_key = ?"
          ).bind(obj.key).run();
        } else {
          await env2.DB.prepare(
            "UPDATE import_jobs SET source_file_r2_key = NULL WHERE source_file_r2_key = ?"
          ).bind(obj.key).run();
        }
      }
    }
    cursor = listed.truncated ? listed.cursor : void 0;
  } while (cursor !== void 0);
}
__name(cleanupFiles, "cleanupFiles");

// src/dashboard/index.ts
import dashboardHtml from "./cc3d38ce7be01554f2e793a8b2fb6cea0eb9342e-index.html";
var DASHBOARD_HTML = dashboardHtml;

// src/worker.ts
var router = new Router();
router.get("/api/health", (req, env2) => handleHealth(req, env2), true);
router.post("/api/imports/bcad", handleBcadImport);
router.post("/api/imports/opr", handleOprImport);
router.get("/api/jobs", handleListJobs);
router.get("/api/jobs/:jobId", handleGetJob);
router.get("/api/jobs/:jobId/download", handleDownloadJob);
router.get("/api/properties", handleSearchProperties);
router.get("/api/properties/:propertyId", handleGetProperty);
router.post("/api/properties/:propertyId/notes", handleAddNote);
router.post("/api/properties/:propertyId/call-status", handleAddCallStatus);
router.post("/api/exports/commercial-properties", handleCreateExport);
async function handleFetch(request, env2, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }
  if (url.pathname.startsWith("/api/")) {
    const response = await router.handle(request, env2, ctx);
    return addCorsHeaders(response);
  }
  if (request.method === "GET") {
    return new Response(DASHBOARD_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return new Response("Method Not Allowed", { status: 405 });
}
__name(handleFetch, "handleFetch");
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, CF-Access-Jwt-Assertion, X-User-Email",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function addCorsHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(addCorsHeaders, "addCorsHeaders");
var worker_default = {
  fetch: handleFetch,
  queue: handleQueue,
  scheduled: handleRetention
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    const body = JSON.stringify(error3);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-FClpfH/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-FClpfH/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
