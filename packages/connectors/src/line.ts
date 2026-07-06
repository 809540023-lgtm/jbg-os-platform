/**
 * LINE Connector（§0.8）—— 推播通知給老闆（HR 待審 / 成交 / 異常）。只推不讀。
 */
export interface LineConnector {
  notify(message: string): Promise<{ ok: boolean }>;
}

export class InMemoryLineConnector implements LineConnector {
  readonly sent: string[] = [];
  async notify(message: string): Promise<{ ok: boolean }> {
    this.sent.push(message);
    return { ok: true };
  }
}
