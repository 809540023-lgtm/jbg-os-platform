import type { ActorKind, AgentCode } from "@jbg/db";
import type { ActorId } from "../shared/id";

/** 動作發起者 —— docs/00 §0.5 Actor：human user / agent / system。 */
export interface Actor {
  id: ActorId;
  kind: ActorKind;
  /** kind==='agent' 時的 canonical 代號（§0.6）。 */
  code?: AgentCode;
  displayName: string;
}

export const systemActor = (id: ActorId): Actor => ({
  id,
  kind: "system",
  displayName: "system",
});

export const agentActor = (id: ActorId, code: AgentCode): Actor => ({
  id,
  kind: "agent",
  code,
  displayName: `agent:${code}`,
});
