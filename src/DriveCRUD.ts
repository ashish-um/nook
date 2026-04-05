import { DriveError } from "./DriveError.js";
import type { DriveCRUDOptions, DriveFile } from "./types.js";
import { buildMultipartBody } from "./utils.js";

export class DriveCRUD {
  private token: string;
  private options: DriveCRUDOptions;
  public cache = new Map<string, string>();

  constructor(token: string, options: DriveCRUDOptions = {}) {
    this.token = token;
    this.options = { appSpace: "appDataFolder", ...options };
  }

  public setToken(token: string): void {
    this.token = token;
  }

  public async create(name: string, data: unknown): Promise<DriveFile> {
    try {
      await this._findByName(name);
      throw new DriveError(`File already exists: ${name}`, "ALREADY_EXISTS");
    } catch (e: any) {
      if (e.code === "ALREADY_EXISTS") throw e;
      if (e.code !== "NOT_FOUND") throw e;
    }

    const space = this.options.appSpace === "drive" ? "drive" : "appDataFolder";
    const metadata = { name, parents: [space] };
    const { body, contentType } = buildMultipartBody(metadata, data);

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size";
    const file = await this._fetch<DriveFile>(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });

    if (!file) throw new DriveError("Failed to create file", "API_ERROR");

    this.cache.set(file.name, file.id);
    return file;
  }

  public async read<T = unknown>(name: string): Promise<T> {
    const id = await this._findByName(name);
    const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
    const data = await this._fetch<T>(url);
    return data as T;
  }

  public async update(name: string, data: unknown): Promise<DriveFile> {
    const id = await this._findByName(name);
    const metadata = { name };
    const { body, contentType } = buildMultipartBody(metadata, data);

    const url = `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&fields=id,name,modifiedTime,size`;
    const file = await this._fetch<DriveFile>(url, {
      method: "PATCH",
      headers: { "Content-Type": contentType },
      body,
    });

    if (!file) throw new DriveError("Failed to update file", "API_ERROR");
    return file;
  }

  public async delete(name: string): Promise<void> {
    const id = await this._findByName(name);
    const url = `https://www.googleapis.com/drive/v3/files/${id}`;
    await this._fetch(url, { method: "DELETE" });
    this.cache.delete(name);
  }

  public async list(prefix?: string): Promise<DriveFile[]> {
    return this._listAll(prefix);
  }

  protected async _fetch<T = unknown>(
    url: string,
    options: RequestInit = {},
    _isRetry = false
  ): Promise<T | null> {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${this.token}`);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      // On 401/403: attempt refresh once if callback exists
      if ((res.status === 401 || res.status === 403) && !_isRetry && this.options.onTokenExpired) {
        const newToken = await this.options.onTokenExpired();
        this.setToken(newToken);
        return this._fetch<T>(url, options, true);
      }

      let message = res.statusText;
      try {
        const errorData = await res.json();
        if (errorData.error && errorData.error.message) {
          message = errorData.error.message;
        }
      } catch (e) {
        // Use generic status text if no JSON error matches
      }
      
      switch (res.status) {
        case 401:
        case 403:
          throw new DriveError(message, "AUTH_ERROR", res.status);
        case 404:
          throw new DriveError(message, "NOT_FOUND", res.status);
        default:
          throw new DriveError(message, "API_ERROR", res.status);
      }
    }

    try {
      return await res.json() as T;
    } catch (e) {
      throw new DriveError("Invalid JSON response", "API_ERROR", res.status);
    }
  }

  protected async _listAll(prefix?: string): Promise<DriveFile[]> {
    const space = this.options.appSpace === "drive" ? "drive" : "appDataFolder";
    const params = new URLSearchParams({
      spaces: space,
      fields: "files(id,name,modifiedTime,size)",
      pageSize: "1000",
    });

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const data = await this._fetch<{ files: DriveFile[] }>(url);
    const files = data?.files || [];

    this.cache.clear();
    for (const file of files) {
      if (file.name && file.id) {
        this.cache.set(file.name, file.id);
      }
    }

    if (prefix) {
      return files.filter((f) => f.name && f.name.startsWith(prefix));
    }
    return files;
  }

  protected async _findByName(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    await this._listAll();

    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    throw new DriveError(`File not found: ${name}`, "NOT_FOUND", 404);
  }
}
