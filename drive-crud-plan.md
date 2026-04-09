# DriveCRUD — Implementation Plan
### A reusable TypeScript module for using Google Drive as per-user cloud storage

---

## 1. Background & Problem Statement

### The Problem with Traditional Cloud Storage

When building web applications — note-taking apps, journals, task managers, habit trackers — developers almost always need a place to store user data. The traditional approach is to provision a cloud database: Firebase Firestore, Supabase, PlanetScale, MongoDB Atlas, etc.

This works, but comes with a consistent set of frustrations:

- **Cost**: You're paying for a database server even when your app has 3 users.
- **Vendor lock-in**: Your users' data lives on infrastructure you control, which means you're responsible for it — backups, uptime, compliance, and all.
- **Overkill for small apps**: Setting up Firestore for a personal journaling app is like renting a warehouse to store a shoebox.
- **Privacy optics**: Users increasingly care about where their data lives and who can access it.

### The Insight: Users Already Have Storage

Every Google account comes with 15GB of free Google Drive storage. When a user logs into your app using Google Sign-In (OAuth2), your app can — with the user's permission — read and write files directly to their own Drive.

This means:

- **Your app has zero storage cost** — you never touch a database.
- **Users own their data** — it literally lives in their Google Drive account.
- **Privacy is structurally guaranteed** — you cannot access User A's data from User B's session, because each session uses that user's own OAuth token.
- **No infra to maintain** — Google runs the storage layer.

### The Specific Storage Space: `appDataFolder`

Google Drive has a special hidden folder called the **`appDataFolder`**. It is:

- Invisible to the user in the Drive UI (they can't accidentally delete or rename files)
- Accessible only by your specific app (other apps can't read it)
- Automatically wiped if the user revokes your app's permissions
- Purpose-built for exactly this use case: storing app-specific user data

This is where DriveCRUD will store all data by default.

### Why Build a Reusable Module?

The Google Drive REST API is functional but low-level. To read a file you need to:
1. List files to find the file ID (Drive doesn't let you fetch by filename)
2. Make a second request to download the content using the ID
3. Parse the response

To write a file, you need to use a multipart upload with specific MIME type headers. Error handling, token management, and name-to-ID resolution all add more boilerplate.

If you want to use Drive as storage in multiple apps (notes app, journal, config storage), you'd repeat all of this every time.

**DriveCRUD wraps all of this into a clean, simple interface:**

```typescript
const drive = new DriveCRUD(accessToken);

await drive.create("notes/hello.json", { title: "Hello", body: "World" });
const note = await drive.read("notes/hello.json");
await drive.update("notes/hello.json", { title: "Hello", body: "Updated" });
await drive.delete("notes/hello.json");
```

---

## 2. What DriveCRUD Is (and Isn't)

### What it IS

- A TypeScript class that wraps Google Drive REST API calls
- A CRUD interface for reading and writing JSON data to a user's Drive
- Framework-agnostic — works in the browser, Node.js, or any JS runtime
- Auth-agnostic — accepts any valid Google OAuth2 access token

### What it is NOT

- An auth library — it doesn't handle OAuth2 flows, sign-in buttons, or token refresh
- A database — no querying, filtering, indexing, or relations
- A sync engine — no real-time listeners or offline support (yet)
- A multi-user system — each instance is scoped to one user's token

---

## 3. Technology Choices

| Choice | Decision | Reason |
|---|---|---|
| Language | TypeScript | Type safety and autocomplete when using the module across apps |
| Runtime target | Browser + Node (ESM) | Maximum portability across different app environments |
| API | Google Drive REST API v3 | No SDK dependency, works everywhere `fetch` is available |
| Data format | JSON | Universal, human-readable, sufficient for all target use cases |
| Storage space | `appDataFolder` | Hidden, app-specific, built for this exact use case |
| Module format | ES Module (`export`) | Modern standard, tree-shakeable, works with Vite/Next/etc |
| Build tool | `tsup` | Zero-config TypeScript bundler, outputs both ESM and CJS |

---

## 4. Repository Structure

```
drive-crud/
├── src/
│   ├── index.ts          # Main entry point — exports DriveCRUD and DriveError
│   ├── DriveCRUD.ts      # Core class with all CRUD methods
│   ├── DriveError.ts     # Custom error class with typed error codes
│   ├── types.ts          # TypeScript interfaces and types
│   └── utils.ts          # Internal helpers (multipart body builder, etc.)
├── tests/
│   ├── DriveCRUD.test.ts # Unit tests with mocked fetch
│   └── integration/      # Optional: real API tests (requires credentials)
├── examples/
│   ├── notes-app/        # Minimal example: notes app using DriveCRUD
│   └── vanilla-html/     # Plain HTML + script tag example
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 5. TypeScript Interfaces

These are the types that the module will expose. They define exactly what goes in and what comes out of every method.

```typescript
// The metadata returned for a file stored in Drive
interface DriveFile {
  id: string;           // Drive's internal file ID (used for API calls)
  name: string;         // Logical name you gave the file, e.g. "notes/hello.json"
  modifiedTime: string; // ISO 8601 timestamp of last modification
  size: string;         // File size in bytes (as a string, per Drive API)
}

// Options when creating the DriveCRUD instance
interface DriveCRUDOptions {
  appSpace?: "appDataFolder" | "drive";  // Where to store files. Default: "appDataFolder"
}

// All possible error codes DriveCRUD can throw
type DriveErrorCode =
  | "NOT_FOUND"       // File doesn't exist
  | "ALREADY_EXISTS"  // File already exists (thrown by create())
  | "INVALID_TYPE"    // Wrong data type for the operation (e.g. patch() on an array)
  | "AUTH_ERROR"      // Token invalid, expired, or missing permissions
  | "API_ERROR";      // Any other Drive API error
```

---

## 6. The DriveCRUD Class — Full API Surface

### Constructor

```typescript
const drive = new DriveCRUD(accessToken: string, options?: DriveCRUDOptions)
```

Accepts a Google OAuth2 access token. The token is stored internally and used in the `Authorization` header for all subsequent API calls. Options are optional.

---

### `setToken(accessToken: string): void`

Replaces the stored token. Call this after a token refresh so you don't need to recreate the instance.

---

### `create(name: string, data: unknown): Promise<DriveFile>`

Creates a new file. Throws `DriveError` with code `ALREADY_EXISTS` if a file with that name already exists. `name` is a logical path like `"notes/hello.json"`. `data` is any JSON-serializable value.

---

### `read(name: string): Promise<unknown>`

Fetches and parses the content of a file. Internally: resolves the name to a Drive file ID, then downloads the content. Throws `NOT_FOUND` if the file doesn't exist.

---

### `update(name: string, data: unknown): Promise<DriveFile>`

Overwrites the content of an existing file. Throws `NOT_FOUND` if the file doesn't exist. Use this when you know the file exists.

---

### `upsert(name: string, data: unknown): Promise<DriveFile>`

Creates the file if it doesn't exist, updates it if it does. This is the safest option for most use cases — you don't need to know the current state of the file.

---

### `patch(name: string, fields: Record<string, unknown>): Promise<DriveFile>`

Reads the existing file, merges new fields into it (like `Object.assign`), and writes it back. Useful for updating individual properties without overwriting the whole object. Only works on JSON objects (not arrays or primitives).

```typescript
// Existing file: { title: "Hello", body: "World", pinned: false }
await drive.patch("notes/hello.json", { pinned: true });
// Result: { title: "Hello", body: "World", pinned: true }
```

---

### `delete(name: string): Promise<void>`

Deletes the file. Throws `NOT_FOUND` if it doesn't exist.

---

### `list(prefix?: string): Promise<DriveFile[]>`

Returns metadata for all files stored by the app. If `prefix` is provided, only files whose name starts with that string are returned. Useful for namespacing:

```typescript
await drive.list("notes/");    // all notes
await drive.list("journal/");  // all journal entries
await drive.list();            // everything
```

---

### `exists(name: string): Promise<boolean>`

Returns `true` if the file exists, `false` otherwise. Never throws.

---

## 7. Internal Implementation Details

### 7.1 Name-to-ID Resolution

The Drive API doesn't support fetching files by filename. Every operation requires a Drive file ID (e.g. `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`). So before most operations, DriveCRUD must:

1. Call `GET /drive/v3/files?spaces=appDataFolder&fields=files(id,name)` to list all files
2. Find the entry where `name` matches the logical name passed in
3. Extract and use the `id` for the actual operation

This is called **name-to-ID resolution** and it adds one extra API call to every operation.

**Optimization — In-memory cache:** DriveCRUD will maintain a `Map<string, string>` (name → id) in memory. After the first list call, subsequent operations that find their file in the cache skip the list call entirely. The cache is invalidated on `create`, `delete`, and whenever a list returns new results.

```
First read("notes/a.json"):
  → list all files → cache populated → download content

Second read("notes/a.json"):
  → cache hit → download content (no list call)

After delete("notes/a.json"):
  → cache entry removed
```

---

### 7.2 Uploading Files (Create & Update)

The Drive API uses **multipart upload** for creating and updating files with content in a single request. The request body looks like this:

```
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart

--boundary
Content-Type: application/json

{ "name": "notes/hello.json", "parents": ["appDataFolder"] }

--boundary
Content-Type: application/json

{ "title": "Hello", "body": "World" }

--boundary--
```

The first part is the file metadata (name, parents). The second part is the actual content. DriveCRUD includes a `buildMultipartBody()` utility that constructs this correctly.

For **update**, the URL includes the file ID:
```
PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=multipart
```
And the metadata part omits `parents` (you can't change a file's parent on update).

---

### 7.3 The `_fetch` Internal Helper

All API calls go through a single private `_fetch()` method that:

1. Injects the `Authorization: Bearer {token}` header automatically
2. Parses the response as JSON
3. Handles non-OK HTTP responses by throwing a `DriveError` with the appropriate code
4. Returns `null` for 204 No Content responses (from DELETE)

This keeps error handling centralized and ensures every public method gets consistent error behavior.

---

### 7.4 Custom Error Class

All errors thrown by DriveCRUD are instances of `DriveError`, which extends the native `Error` class:

```typescript
class DriveError extends Error {
  code: DriveErrorCode;   // Machine-readable error type
  status?: number;        // HTTP status code from the Drive API, if applicable

  constructor(message: string, code: DriveErrorCode, status?: number)
}
```

This allows consuming apps to handle errors precisely:

```typescript
try {
  const note = await drive.read("notes/missing.json");
} catch (err) {
  if (err instanceof DriveError && err.code === "NOT_FOUND") {
    // Handle missing file gracefully
  } else {
    throw err; // Re-throw unexpected errors
  }
}
```

---

## 8. OAuth2 Scope Required

For `appDataFolder`, the app must request this exact scope during the Google OAuth2 flow:

```
https://www.googleapis.com/auth/drive.appdata
```

This is a narrow, privacy-respecting scope — it only grants access to the hidden app folder, not the user's full Drive. If you use `appSpace: "drive"` instead, you'd need the broader `drive.file` scope.

**DriveCRUD does not handle auth.** The consuming app is responsible for obtaining and refreshing the token. DriveCRUD only uses the token it's given.

---

## 9. Build & Distribution

### Build Tool: `tsup`

`tsup` compiles TypeScript and outputs multiple formats with zero config:

```typescript
// tsup.config.ts
export default {
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],   // Output both ES Module and CommonJS
  dts: true,                // Generate .d.ts type declarations
  clean: true,              // Clean output dir before each build
};
```

This produces:
```
dist/
├── index.js      # ESM build
├── index.cjs     # CommonJS build
└── index.d.ts    # TypeScript declarations
```

### package.json exports

```json
{
  "name": "drive-crud",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

---

## 10. Testing Strategy

### Unit Tests (Vitest + mocked fetch)

Every method is tested with a mocked global `fetch`. Tests do not make real API calls.

Key test cases:
- `create()` succeeds when file doesn't exist
- `create()` throws `ALREADY_EXISTS` when it does
- `read()` throws `NOT_FOUND` for missing files
- `update()` throws `NOT_FOUND` for missing files
- `upsert()` creates on first call, updates on second
- `patch()` correctly merges fields
- `patch()` throws `INVALID_TYPE` on non-object files
- `list()` returns all files unfiltered
- `list("prefix/")` returns only matching files
- `_fetch()` throws `AUTH_ERROR` on 401 responses
- Cache is populated after first list and used on subsequent calls
- Cache is invalidated after `delete()`

---

## 11. Implementation Steps (in order)

1. **Scaffold the repo** — `npm init`, install `typescript`, `tsup`, `vitest`
2. **Write types** — `types.ts` and `DriveError.ts` first, before any logic
3. **Build the `_fetch` helper** — the foundation everything else sits on
4. **Build name-to-ID resolution** — `_listAll()` and `_findByName()` with cache
5. **Build the upload utility** — `buildMultipartBody()` in `utils.ts`
6. **Implement CRUD methods** one at a time: `create` → `read` → `update` → `delete` → `upsert` → `patch` → `list` → `exists`
7. **Write unit tests** for each method as you go
8. **Write the README** with usage examples for a notes app and a journal app
9. **Build and validate** with `tsup` — check that types are exported correctly
10. **Write examples** — a minimal working notes app to validate the real-world API feel

---

## 12. Example: Using DriveCRUD in a Notes App

```typescript
import { DriveCRUD } from "drive-crud";

// After Google OAuth2 login, you have an access token
const drive = new DriveCRUD(googleAccessToken);

// Create a note
await drive.create("notes/2024-01-01.json", {
  title: "New Year",
  body: "Starting fresh.",
  createdAt: new Date().toISOString(),
});

// Read it back
const note = await drive.read("notes/2024-01-01.json");

// Update just one field
await drive.patch("notes/2024-01-01.json", { body: "Starting fresh. Edited." });

// List all notes
const allNotes = await drive.list("notes/");

// Delete it
await drive.delete("notes/2024-01-01.json");
```

---

## 13. Limitations to Be Aware Of

- **No real-time sync** — there are no listeners. To get updates, you call `read()` again.
- **No querying** — you can't filter by content. You fetch a file and filter in memory.
- **Single-user concurrency** — two tabs open simultaneously could cause conflicting writes. Mitigate with `patch()` and an `updatedAt` field to detect conflicts.
- **Drive API quotas** — 10,000 requests per 100 seconds per user. Generous for most apps.
- **No binary data** — DriveCRUD is JSON only. Not suited for storing images or files.
- **Token expiry** — Google access tokens expire after 1 hour. The consuming app must refresh and call `setToken()`.
