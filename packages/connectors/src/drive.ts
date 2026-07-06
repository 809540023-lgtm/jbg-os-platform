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
