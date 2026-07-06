import type { AgentRun, ContextSnapshot } from "./types";

export interface AgentRunRepo {
  create(run: AgentRun): Promise<void>;
  update(run: AgentRun): Promise<void>;
}

export interface ContextSnapshotRepo {
  create(snapshot: ContextSnapshot): Promise<void>;
}

export interface AgentRepos {
  runs: AgentRunRepo;
  snapshots: ContextSnapshotRepo;
}

export class InMemoryAgentRunRepo implements AgentRunRepo {
  readonly runs = new Map<string, AgentRun>();
  async create(run: AgentRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }
  async update(run: AgentRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }
}

export class InMemoryContextSnapshotRepo implements ContextSnapshotRepo {
  readonly snapshots = new Map<string, ContextSnapshot>();
  async create(snapshot: ContextSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }
}

export function createInMemoryAgentRepos(): AgentRepos & {
  runs: InMemoryAgentRunRepo;
  snapshots: InMemoryContextSnapshotRepo;
} {
  return {
    runs: new InMemoryAgentRunRepo(),
    snapshots: new InMemoryContextSnapshotRepo(),
  };
}
