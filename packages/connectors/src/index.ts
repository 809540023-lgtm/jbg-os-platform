import type { ConnectorKind } from "@jbg/db";

export * from "./facebook";
export * from "./drive";
export * from "./line";

/**
 * @jbg/connectors —— 對外部系統的唯一出口（§0.4 layer7，§0.8，附錄 F）。
 * 鐵律：Agent/Loop/Skill 不得直接 fetch 外部 API，一律經此層。
 */
export interface Connector {
  kind: ConnectorKind;
  healthcheck(): Promise<{ ok: boolean; detail?: string }>;
}

export const connectorRegistry: Partial<Record<ConnectorKind, Connector>> = {};

export function registerConnector(connector: Connector): void {
  connectorRegistry[connector.kind] = connector;
}

export function getConnector(kind: ConnectorKind): Connector {
  const c = connectorRegistry[kind];
  if (!c) throw new Error(`未註冊的 connector: ${kind}`);
  return c;
}
