// causal.js：依赖判定与登记
function normalize(msg) {
  if (Array.isArray(msg)) {
    return { id: msg[0], sender: msg[1], deps: Array.isArray(msg[2]) ? msg[2] : [] };
  }
  if (msg && typeof msg === "object") {
    const id = msg.msg !== undefined ? msg.msg : msg.id;
    return { id: id, sender: msg.sender, deps: Array.isArray(msg.deps) ? msg.deps : [] };
  }
  return { id: undefined, sender: undefined, deps: [] };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function depsMet(msg, delivered) {
  const entry = normalize(msg);
  const done = Array.isArray(delivered) ? delivered : [];
  return entry.deps.every(function (dep) { return done.indexOf(dep) !== -1; });
}

export function register(seen, msg, nodes) {
  const entry = normalize(msg);
  const known = Array.isArray(seen) ? seen : [];
  if (Array.isArray(nodes) && nodes.indexOf(entry.sender) === -1) {
    fail("E_UNKNOWN_SENDER", "unknown sender " + entry.sender);
  }
  if (known.indexOf(entry.id) !== -1) {
    fail("E_DUPLICATE_MESSAGE", "duplicate message " + entry.id);
  }
  entry.deps.forEach(function (dep) {
    if (known.indexOf(dep) === -1) {
      fail("E_UNKNOWN_DEP", "unknown dep " + dep);
    }
  });
  return known.concat([entry.id]);
}
