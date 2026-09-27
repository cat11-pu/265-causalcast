// deliver.js：按交付预算交付并留账，收尾不限预算补齐
import { depsMet, register } from "./causal.js";

function code(spec, key, fallback) {
  return spec && spec[key] ? spec[key] : fallback;
}

function fail(spec, key, fallback, message) {
  const error = new Error(message);
  error.code = code(spec, key, fallback);
  return error;
}

function cloneState(state) {
  const source = state || {};
  return {
    delivered: (source.delivered || []).slice(),
    buffer: (source.buffer || []).map(function (row) { return row.slice(); }),
    seen: (source.seen || []).slice(),
    applied: (source.applied || []).slice()
  };
}

function isSend(event) {
  return event && typeof event === "object" && event.kind === "send"
    && typeof event.msg === "string" && typeof event.sender === "string"
    && Array.isArray(event.deps)
    && event.deps.every(function (dep) { return typeof dep === "string"; });
}

function appliedToken(event, index) {
  if (event && event.id !== undefined && event.id !== null) return "id:" + String(event.id);
  return "row:" + index + ":" + JSON.stringify(event);
}

// 反复扫描缓冲，把依赖已满足的消息交付出去；预算（整批共用）用尽立即停。
function drain(state, wallet, counters) {
  let progressed = true;
  while (progressed && wallet.remaining > 0) {
    progressed = false;
    for (let i = 0; i < state.buffer.length && wallet.remaining > 0; ) {
      counters.judged += 1;
      const row = state.buffer[i];
      if (depsMet(row, state.delivered)) {
        state.delivered.push(row[0]);
        state.buffer.splice(i, 1);
        wallet.remaining -= 1;
        progressed = true;
      } else {
        i += 1;
      }
    }
  }
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  const budget = Number.isFinite(spec.budget) ? Math.max(0, Math.floor(spec.budget)) : 0;
  const wallet = { remaining: budget };
  const counters = { judged: 0 };
  const deliveredAtStart = state.delivered.length;

  events.forEach(function (event, index) {
    if (!isSend(event)) {
      throw fail(spec, "event_error_code", "E_BAD_EVENT", "illegal event at index " + index);
    }
    const token = appliedToken(event, index);
    // 重放：该事件以前轮次已经处理过，原状态推出，不重复登记、不重复交付。
    if (state.applied.indexOf(token) !== -1) return;
    const row = [event.msg, event.sender, event.deps.slice()];
    try {
      state.seen = register(state.seen, row, spec.nodes);
    } catch (error) {
      const override = {
        E_UNKNOWN_SENDER: "sender_error_code",
        E_DUPLICATE_MESSAGE: "msg_error_code",
        E_UNKNOWN_DEP: "dep_error_code"
      }[error.code];
      if (override && spec[override]) error.code = spec[override];
      throw error;
    }
    state.applied.push(token);
    state.buffer.push(row);
    drain(state, wallet, counters);
  });

  return {
    state: state,
    delivered: state.delivered.length - deliveredAtStart,
    buffered_before: state.buffer.length,
    buffered: state.buffer.map(function (row) { return row.slice(); }),
    judged: counters.judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < state.buffer.length; ) {
      const row = state.buffer[i];
      if (depsMet(row, state.delivered)) {
        state.delivered.push(row[0]);
        state.buffer.splice(i, 1);
        catchup += 1;
        progressed = true;
      } else {
        i += 1;
      }
    }
  }
  if (state.buffer.length > 0) {
    throw fail(spec, "stuck_error_code", "E_STUCK",
      state.buffer.length + " message(s) left with unmet dependencies");
  }
  return { state: state, catchup: catchup };
}
