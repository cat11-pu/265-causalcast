// deliver.js：按交付预算交付并留账（基线：一律给空表）
import { depsMet, register } from "./causal.js";

export function step(spec) {
  return { state: spec.state, delivered: 0, buffered_before: 0, buffered: [],
           judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
