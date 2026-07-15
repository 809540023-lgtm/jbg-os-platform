/**
 * Google Drive Connector（§0.8）—— 監看資料夾、抓新照片（唯讀為主）。
 * 正式版走 Google Drive API；此處介面 + in-memory fake。
 */
export interface DriveFile {
  fileId: string;
  folderId: string;
  name: string;
  contentHash: string; // sha256，去重/冪等用
  width?: number;
  height?: number;
}

export interface DriveConnector {
  listNewFiles(folderId: string, seenFileIds?: ReadonlySet<string>): Promise<DriveFile[]>;
}

export class InMemoryDriveConnector implements DriveConnector {
  constructor(private readonly files: DriveFile[] = []) {}

  add(file: DriveFile): void {
    this.files.push(file);
  }

  async listNewFiles(
    folderId: string,
    seenFileIds: ReadonlySet<string> = new Set(),
  ): Promise<DriveFile[]> {
    return this.files.filter((f) => f.folderId === folderId && !seenFileIds.has(f.fileId));
  }
}

// ── 公開資料夾唯讀讀取（無金鑰）──────────────────────────────
// 適用「知道連結的任何人可檢視」的資料夾。用 embeddedfolderview 列檔、
// thumbnail 端點抓圖（免病毒掃描頁）。正式大量/私有資料夾仍應改用 Google Drive API。

export interface DriveEntry {
  id: string;
  name: string;
  isImage: boolean;
}

export interface DriveImage {
  bytes: ArrayBuffer;
  ext: "jpg" | "png";
  contentType: string;
}

const UA = { "User-Agent": "Mozilla/5.0 (compatible; JBG-OS/1.0)" };
const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;

/** 從各種 Drive 連結／裸 ID 取出 folderId。 */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s; // 裸 ID
  return null;
}

export class PublicDriveConnector {
  /** 列出資料夾內的項目（子資料夾 + 檔案）。 */
  async listFolder(folderId: string): Promise<DriveEntry[]> {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`, { headers: UA });
    if (!res.ok) throw new Error(`Drive listFolder ${res.status}`);
    const html = await res.text();
    const re = /entry-([A-Za-z0-9_-]{20,60})"[\s\S]*?flip-entry-title">([^<]+)</g;
    const out: DriveEntry[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const name = m[2]!;
      out.push({ id: m[1]!, name, isImage: IMAGE_EXT.test(name) });
    }
    return out;
  }

  /** 下載一張圖（高解析縮圖）。回傳 null 表非影像/失敗。 */
  async fetchImage(fileId: string, size = 1600): Promise<DriveImage | null> {
    const res = await fetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`, { headers: UA });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const b = new Uint8Array(bytes);
    if (b[0] === 0x89 && b[1] === 0x50) return { bytes, ext: "png", contentType: "image/png" };
    if (b[0] === 0xff && b[1] === 0xd8) return { bytes, ext: "jpg", contentType: "image/jpeg" };
    return null;
  }
}
