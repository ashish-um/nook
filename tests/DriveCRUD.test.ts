import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DriveCRUD } from "../src/DriveCRUD.js";
import { DriveError } from "../src/DriveError.js";

describe("DriveCRUD - _fetch helper", () => {
  let drive: any; // Type as any to easily test protected _fetch
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive = new DriveCRUD("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should inject the Authorization header", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await drive._fetch("https://api.example.com");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer mock-token");
  });

  it("should return null on exactly 204 No Content", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    const res = await drive._fetch("https://api.example.com");
    expect(res).toBeNull();
  });

  it("should parse and return JSON on 200 OK", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "foo" }), { status: 200 })
    );

    const res = await drive._fetch("https://api.example.com");
    expect(res).toEqual({ data: "foo" });
  });

  it("should throw AUTH_ERROR on 401 or 403", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 401 })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Invalid token", "AUTH_ERROR", 401)
    );
  });

  it("should throw NOT_FOUND on 404", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response("Not found", { status: 404, statusText: "Not Found" })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Not Found", "NOT_FOUND", 404)
    );
  });

  it("should throw API_ERROR on 500", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Error" })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Internal Error", "API_ERROR", 500)
    );
  });
  
  it("should throw API_ERROR if JSON parsing fails on a 200 OK response", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response("this is not json", { status: 200 })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Invalid JSON response", "API_ERROR", 200)
    );
  });
});

describe("DriveCRUD - onTokenExpired retry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should retry once on 401 if onTokenExpired is provided and succeed", async () => {
    const callback = vi.fn().mockResolvedValue("new-token");
    const drive: any = new DriveCRUD("old-token", { onTokenExpired: callback });
    global.fetch = vi.fn();

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Expired" } }), { status: 401 })
    );
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await drive._fetch("https://api.example.com");
    expect(res).toEqual({ ok: true });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should throw AUTH_ERROR if retry also returns 401", async () => {
    const callback = vi.fn().mockResolvedValue("still-bad");
    const drive: any = new DriveCRUD("old-token", { onTokenExpired: callback });
    global.fetch = vi.fn();

    (global.fetch as any).mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Unauthorized", "AUTH_ERROR", 401)
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should throw AUTH_ERROR immediately on 401 if no callback", async () => {
    const drive: any = new DriveCRUD("old-token");
    global.fetch = vi.fn();

    (global.fetch as any).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
    );

    await expect(drive._fetch("https://api.example.com")).rejects.toThrowError(
      new DriveError("Unauthorized", "AUTH_ERROR", 401)
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("callback should only be called once per request", async () => {
    const callback = vi.fn().mockResolvedValue("new-token");
    const drive: any = new DriveCRUD("old-token", { onTokenExpired: callback });
    global.fetch = vi.fn();

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Expired" } }), { status: 401 })
    );
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 1 }), { status: 200 })
    );

    await drive._fetch("https://api.example.com");
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("DriveCRUD - Name-to-ID Resolution", () => {
  let drive: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive = new DriveCRUD("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("_listAll should fetch, populate cache, and return files", async () => {
    const mockFiles = [
      { id: "1", name: "a.json", modifiedTime: "date1", size: "10" },
      { id: "2", name: "b.json", modifiedTime: "date2", size: "20" }
    ];

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );

    const files = await drive._listAll();
    
    expect(files).toEqual(mockFiles);
    expect(drive.cache.get("a.json")).toBe("1");
    expect(drive.cache.get("b.json")).toBe("2");
    
    // Check fetch query params
    const callArgs = (global.fetch as any).mock.calls[0];
    const url = new URL(callArgs[0]);
    expect(url.searchParams.get("spaces")).toBe("appDataFolder");
  });

  it("_listAll should filter by prefix if provided", async () => {
    const mockFiles = [
      { id: "1", name: "notes/a.json" },
      { id: "2", name: "journal/b.json" }
    ];

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );

    const files = await drive._listAll("notes/");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("notes/a.json");
  });

  it("_findByName should use cache if available", async () => {
    drive.cache.set("cached.json", "abc");
    const id = await drive._findByName("cached.json");
    expect(id).toBe("abc");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("_findByName should fetch if not in cache, then return ID", async () => {
    const mockFiles = [{ id: "xyz", name: "new.json" }];
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );

    const id = await drive._findByName("new.json");
    expect(id).toBe("xyz");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("_findByName should throw NOT_FOUND if file doesn't exist after fetch", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );

    await expect(drive._findByName("missing.json")).rejects.toThrowError(
      new DriveError("File not found: missing.json", "NOT_FOUND", 404)
    );
  });
});

describe("DriveCRUD - create and read", () => {
  let drive: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive = new DriveCRUD("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("create should throw ALREADY_EXISTS if file exists", async () => {
    drive.cache.set("existing.json", "123");
    await expect(drive.create("existing.json", {})).rejects.toThrowError(
      new DriveError("File already exists: existing.json", "ALREADY_EXISTS")
    );
  });

  it("create should create file, update cache, and return metadata if missing", async () => {
    // 1st fetch: _listAll from _findByName
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );

    // 2nd fetch: POST create
    const mockCreated = { id: "new-id", name: "new.json" };
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify(mockCreated), { status: 200 })
    );

    const result = await drive.create("new.json", { foo: "bar" });
    expect(result).toEqual(mockCreated);
    expect(drive.cache.get("new.json")).toBe("new-id");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const postCallArgs = (global.fetch as any).mock.calls[1];
    expect(postCallArgs[0]).toContain("uploadType=multipart");
    expect(postCallArgs[1].method).toBe("POST");
  });

  it("read should throw NOT_FOUND if file is missing", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );

    await expect(drive.read("missing.json")).rejects.toThrowError(
      new DriveError("File not found: missing.json", "NOT_FOUND", 404)
    );
  });

  it("read should fetch content with alt=media if file exists", async () => {
    drive.cache.set("doc.json", "file-id");

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ hello: "world" }), { status: 200 })
    );

    const data = await drive.read("doc.json");
    expect(data).toEqual({ hello: "world" });
    
    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toBe("https://www.googleapis.com/drive/v3/files/file-id?alt=media");
  });
});

describe("DriveCRUD - update and delete", () => {
  let drive: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive = new DriveCRUD("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("update should throw NOT_FOUND if file is missing", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );
    await expect(drive.update("missing.json", {})).rejects.toThrowError(
      new DriveError("File not found: missing.json", "NOT_FOUND", 404)
    );
  });

  it("update should PATCH existing file and return metadata", async () => {
    drive.cache.set("doc.json", "file-id");

    const mockUpdated = { id: "file-id", name: "doc.json", modifiedTime: "t2", size: "20" };
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify(mockUpdated), { status: 200 })
    );

    const result = await drive.update("doc.json", { updated: true });
    expect(result).toEqual(mockUpdated);

    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain("/files/file-id");
    expect(callArgs[1].method).toBe("PATCH");
  });

  it("delete should throw NOT_FOUND if file is missing", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );
    await expect(drive.delete("missing.json")).rejects.toThrowError(
      new DriveError("File not found: missing.json", "NOT_FOUND", 404)
    );
  });

  it("delete should DELETE existing file and remove from cache", async () => {
    drive.cache.set("doc.json", "file-id");

    (global.fetch as any).mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    await drive.delete("doc.json");
    expect(drive.cache.has("doc.json")).toBe(false);

    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain("/files/file-id");
    expect(callArgs[1].method).toBe("DELETE");
  });
});

describe("DriveCRUD - list", () => {
  let drive: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive = new DriveCRUD("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("list should return all files when no prefix given", async () => {
    const mockFiles = [
      { id: "1", name: "a.json" },
      { id: "2", name: "b.json" }
    ];
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );
    const files = await drive.list();
    expect(files).toHaveLength(2);
  });

  it("list should filter by prefix", async () => {
    const mockFiles = [
      { id: "1", name: "notes/a.json" },
      { id: "2", name: "journal/b.json" }
    ];
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );
    const files = await drive.list("notes/");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("notes/a.json");
  });
});
