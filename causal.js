// causal.js：依赖判定与登记
// 消息行格式：[msg, sender, deps]；也接受 {msg, sender, deps} 形态。

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function asParts(msg) {
  if (Array.isArray(msg)) return { id: msg[0], sender: msg[1], deps: msg[2] || [] };
  return { id: msg && msg.msg, sender: msg && msg.sender, deps: (msg && msg.deps) || [] };
}

export function depsMet(msg, delivered) {
  const parts = asParts(msg);
  const done = new Set(delivered || []);
  return parts.deps.every(function (dep) { return done.has(dep); });
}

export function register(seen, msg, nodes) {
  const parts = asParts(msg);
  const known = new Set(nodes || []);
  if (!known.has(parts.sender)) {
    throw fail("E_UNKNOWN_SENDER", "unknown sender: " + String(parts.sender));
  }
  const next = (seen || []).slice();
  if (next.indexOf(parts.id) !== -1) {
    throw fail("E_DUPLICATE_MESSAGE", "duplicate message: " + String(parts.id));
  }
  for (const dep of parts.deps) {
    if (next.indexOf(dep) === -1) {
      throw fail("E_UNKNOWN_DEP", "dependency not seen yet: " + String(dep));
    }
  }
  next.push(parts.id);
  return next;
}
