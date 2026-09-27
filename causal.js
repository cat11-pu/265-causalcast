// causal.js：依赖判定与登记（基线：一律说依赖满足、登记原样返回）
export function depsMet(msg, delivered) {
  return true;
}

export function register(seen, msg, nodes) {
  return seen;
}
