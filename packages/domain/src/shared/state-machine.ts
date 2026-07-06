/**
 * 通用狀態機 helper —— 所有 §0.11 狀態機（LoopExecution / HumanReview / Task / Listing…）
 * 都用它宣告合法轉移，並在轉移前 assert，杜絕非法跳轉（守則：狀態只走合法邊）。
 */

export class IllegalTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`[${machine}] 非法狀態轉移：${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export interface StateMachine<S extends string> {
  readonly name: string;
  readonly initial: S;
  /** from → 允許的 to 集合。終態對應空集合。 */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  canTransition(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  isTerminal(state: S): boolean;
}

export function defineStateMachine<S extends string>(config: {
  name: string;
  initial: S;
  transitions: Record<S, readonly S[]>;
}): StateMachine<S> {
  const { name, initial, transitions } = config;
  return {
    name,
    initial,
    transitions,
    canTransition(from, to) {
      return (transitions[from] ?? []).includes(to);
    },
    assertTransition(from, to) {
      if (!this.canTransition(from, to)) {
        throw new IllegalTransitionError(name, from, to);
      }
    },
    isTerminal(state) {
      return (transitions[state] ?? []).length === 0;
    },
  };
}
