/**
 * Storage abstraction. Uses S3-compatible object storage (AWS S3, Cloudflare R2,
 * MinIO) when S3_BUCKET is set, otherwise falls back to the local filesystem.
 *
 * Uploads: the browser PUTs the file straight to an `uploadUrl` (presigned S3
 * URL, or an internal API route for local storage), then calls /api/upload/complete.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export interface StorageProvider {
  readonly kind: "s3" | "local";
  /** URL the browser should PUT the raw bytes to. */
  getUploadUrl(key: string, mimeType: string, size: number): Promise<string>;
  /** Public-ish URL for GET (presigned for S3, internal route for local). Returns null if the provider streams instead. */
  getDownloadUrl(key: string, filename: string, mimeType: string, inline: boolean): Promise<string | null>;
  /** Stream for providers that serve bytes through our server. */
  getStream(key: string): Promise<Readable>;
  /** Actual stored size, used to verify the client-reported size on completion. */
  getSize(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

const UPLOAD_URL_TTL = 60 * 15;
const DOWNLOAD_URL_TTL = 60 * 60;

class S3Storage implements StorageProvider {
  readonly kind = "s3" as const;
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  getUploadUrl(key: string, mimeType: string, size: number) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: size }),
      { expiresIn: UPLOAD_URL_TTL },
    );
  }

  getDownloadUrl(key: string, filename: string, mimeType: string, inline: boolean) {
    const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseContentType: mimeType,
      }),
      { expiresIn: DOWNLOAD_URL_TTL },
    );
  }

  async getStream(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async getSize(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

class LocalStorage implements StorageProvider {
  readonly kind = "local" as const;
  private dir: string;

  constructor() {
    this.dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.LOCAL_UPLOAD_DIR || "./uploads");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Keys are `<ownerId>/<uuid>`; keep them inside the upload dir. */
  private resolve(key: string) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(this.dir + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async getUploadUrl(key: string) {
    return `/api/upload/local/${encodeURIComponent(key)}`;
  }

  async getDownloadUrl() {
    return null; // streamed via /api/nodes/[id]/download
  }

  async getStream(key: string) {
    return fs.createReadStream(this.resolve(key));
  }

  async getSize(key: string) {
    try {
      return (await fsp.stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await fsp.rm(this.resolve(key), { force: true });
  }

  async write(key: string, body: ReadableStream<Uint8Array>) {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    const nodeStream = Readable.fromWeb(body as import("node:stream/web").ReadableStream);
    await new Promise<void>((resolve, reject) => {
      nodeStream.pipe(fs.createWriteStream(full)).on("finish", resolve).on("error", reject);
    });
  }
}

const globalForStorage = globalThis as unknown as { storage?: StorageProvider };

export function getStorage(): StorageProvider {
  if (!globalForStorage.storage) {
    globalForStorage.storage = process.env.S3_BUCKET ? new S3Storage() : new LocalStorage();
  }
  return globalForStorage.storage;
}

export function getLocalStorage(): LocalStorage {
  const s = getStorage();
  if (!(s instanceof LocalStorage)) throw new Error("Local storage is not active");
  return s;
}
