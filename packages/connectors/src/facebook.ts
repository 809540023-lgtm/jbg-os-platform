import { randomUUID } from "node:crypto";

/**
 * Facebook Connector（§0.8）—— 對外發佈的唯一出口。
 * 正式版走 Facebook Graph API；此處提供介面 + in-memory fake 供測試/本地 dry-run。
 */
export interface PublishPostInput {
  message: string;
  title?: string;
  mediaUrls: string[];
  /** 冪等鍵：同鍵不重複發文（§0.8 / docs/07 §7.3.6）。 */
  idempotencyKey: string;
}

export interface PublishPostResult {
  postId: string;
  publishedAt: string;
}

export interface FacebookConnector {
  publishPost(input: PublishPostInput): Promise<PublishPostResult>;
  readComments?(postId: string): Promise<{ id: string; text: string }[]>;
}

/** In-memory fake：冪等（同 idempotencyKey 回同一 postId），供測試。 */
export class InMemoryFacebookConnector implements FacebookConnector {
  readonly posts = new Map<string, PublishPostResult>();
  private seq = 0;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async publishPost(input: PublishPostInput): Promise<PublishPostResult> {
    const existing = this.posts.get(input.idempotencyKey);
    if (existing) return existing;
    this.seq += 1;
    const result: PublishPostResult = {
      postId: `fb_${this.seq}_${randomUUID().slice(0, 8)}`,
      publishedAt: this.now(),
    };
    this.posts.set(input.idempotencyKey, result);
    return result;
  }

  async readComments(): Promise<{ id: string; text: string }[]> {
    return [];
  }
}
