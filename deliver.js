// deliver.js：按交付预算交付并留账
import { depsMet, register } from "./causal.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validEvent(event) {
  return !!event && typeof event === "object" && event.kind === "send"
    && typeof event.msg === "string" && typeof event.sender === "string"
    && Array.isArray(event.deps);
}

function copyState(state) {
  const src = state || {};
  return {
    delivered: Array.isArray(src.delivered) ? src.delivered.slice() : [],
    buffer: Array.isArray(src.buffer) ? src.buffer.map(function (row) { return row.slice(); }) : [],
    seen: Array.isArray(src.seen) ? src.seen.slice() : [],
    applied: Array.isArray(src.applied) ? src.applied.slice() : []
  };
}

export function step(spec) {
  const events = Array.isArray(spec.events) ? spec.events : [];
  const state = copyState(spec.state);
  let budget = spec.budget == null ? events.length : spec.budget;
  let judged = 0;
  const span = events.length + state.buffer.length + 1;
  const judgedBound = span * span;
  let deliveredNow = 0;

  events.forEach(function (event) {
    if (!validEvent(event)) {
      fail("E_BAD_EVENT", "bad event " + JSON.stringify(event));
    }
    if (event.id !== undefined && state.applied.indexOf(event.id) !== -1) {
      return;
    }
    state.seen = register(state.seen, [event.msg, event.sender, event.deps], spec.nodes || []);
    state.buffer.push([event.msg, event.sender, event.deps.slice()]);
    if (event.id !== undefined) {
      state.applied.push(event.id);
    }
    for (;;) {
      if (budget <= 0) {
        break;
      }
      let hit = -1;
      for (let i = 0; i < state.buffer.length; i += 1) {
        judged += 1;
        if (depsMet(state.buffer[i], state.delivered)) { hit = i; break; }
      }
      if (hit === -1) {
        break;
      }
      state.delivered.push(state.buffer[hit][0]);
      state.buffer.splice(hit, 1);
      budget -= 1;
      deliveredNow += 1;
    }
  });

  return {
    state: state,
    delivered: deliveredNow,
    buffered_before: state.buffer.length,
    buffered: state.buffer.map(function (row) { return row.slice(); }),
    judged: judged,
    judged_bound: judgedBound
  };
}

export function close(spec) {
  const state = copyState(spec.state);
  let catchup = 0;
  for (;;) {
    let hit = -1;
    for (let i = 0; i < state.buffer.length; i += 1) {
      if (depsMet(state.buffer[i], state.delivered)) { hit = i; break; }
    }
    if (hit === -1) {
      break;
    }
    state.delivered.push(state.buffer[hit][0]);
    state.buffer.splice(hit, 1);
    catchup += 1;
  }
  if (state.buffer.length > 0) {
    fail("E_STUCK", "stuck with " + state.buffer.length + " buffered");
  }
  return { state: state, catchup: catchup };
}
