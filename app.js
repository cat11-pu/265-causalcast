// app.js：渲染结果
import { depsMet, register } from "./causal.js";
import { step, close } from "./deliver.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const fingerprint = function (state) {
    return JSON.stringify({
      delivered: state.delivered.slice().sort(),
      buffer: state.buffer.map(function (row) { return row[0]; }).sort(),
      applied: state.applied.length
    });
  };
  return { delivered: closed.state.delivered.slice(), delivered_count: closed.state.delivered.length,
           buffered: closed.state.buffer.map(function (row) { return row.slice(); }),
           buffered_after: closed.state.buffer.length,
           delivered_first: first.delivered, delivered_wide: wide.delivered,
           pair_differs: first.delivered !== wide.delivered,
           buffered_before: first.buffered_before,
           catchup: closed.catchup,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.delivered, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: depsMet({ deps: [] }, []) ? 1 : 0 };
}
