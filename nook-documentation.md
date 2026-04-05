# nook

> Use Google Drive as per-user cloud storage. No database, no backend, no cost.

`nook` is a lightweight TypeScript module that wraps the Google Drive REST API into a clean, simple CRUD interface. Every user's data is stored in their own Google Drive — your app never touches a database.

---

## Table of Contents

- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Constructor](#constructor)
- [Methods](#methods)
  - [create](#createname-data)
  - [read](#readname)
  - [update](#updatename-data)
  - [delete](#deletename)
  - [list](#listprefix)
  - [setToken](#settokenaccesstoken)
- [Error handling](#error-handling)
- [Token refresh](#token-refresh)
- [TypeScript types](#typescript-types)
- [Limitations](#limitations)
- [Examples](#examples)

---

## How it works

When a user signs into your app with Google, you receive an OAuth2 access token. `nook` uses that token to read and write JSON files directly to the user's Google Drive — specifically to a hidden, app-specific folder called `appDataFolder`.

```
Your App  →  nook  →  Google Drive API  →  User's Drive (appDataFolder)
```

Each user's data is completely isolated. User A's token can only access User A's files. `nook` never sees data from multiple users at once — each instance is scoped to a single token.

### Why `appDataFolder`?

`appDataFolder` is a special space in Google Drive that is:
- **Hidden** — users can't see or accidentally delete your app's files in their Drive UI
- **App-scoped** — only your specific app can access it
- **Auto-cleaned** — deleted automatically when a user revokes your app's permissions
- **Requires a narrow scope** — `drive.appdata` only, not access to the user's full Drive

---

## Installation

```bash
npm install nook
```

Or with a local build:

```bash
npm install ../path/to/nook
```

---

## Quick Start

```typescript
import { DriveCRUD } from "@ashish-um/nook";

// Create an instance with a Google OAuth2 access token
const drive = new DriveCRUD(accessToken);

// Create a file
await drive.create("notes/hello.json", { title: "Hello", body: "World" });

// Read it back
const note = await drive.read("notes/hello.json");
console.log(note); // { title: "Hello", body: "World" }

// Update it
await drive.update("notes/hello.json", { title: "Hello", body: "Updated" });

// List all notes
const notes = await drive.list("notes/");

// Delete it
await drive.delete("notes/hello.json");
```

---

## Authentication

`nook` is **auth-agnostic** — it only needs a valid Google OAuth2 access token. It does not handle sign-in flows, token storage, or token refresh by itself. That is your app's responsibility.

### Required OAuth2 scope

```
https://www.googleapis.com/auth/drive.appdata
```

This is the minimum scope required. It only grants access to the hidden `appDataFolder`, not the user's full Drive.

### Getting a token (browser)

Using **Google Identity Services (GIS)**:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```javascript
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  scope: "https://www.googleapis.com/auth/drive.appdata",
  callback: (response) => {
    const drive = new DriveCRUD(response.access_token);
  },
});

tokenClient.requestAccessToken();
```

### Getting a token (Node.js)

Using the `googleapis` package:

```typescript
import { google } from "googleapis";

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
auth.setCredentials({ refresh_token: STORED_REFRESH_TOKEN });
const { token } = await auth.getAccessToken();

const drive = new DriveCRUD(token);
```

---

## Constructor

```typescript
new DriveCRUD(accessToken: string, options?: DriveCRUDOptions)
```

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `accessToken` | `string` | ✅ | A valid Google OAuth2 access token |
| `options` | `DriveCRUDOptions` | ❌ | Optional configuration |

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `appSpace` | `"appDataFolder" \| "drive"` | `"appDataFolder"` | Where to store files. `appDataFolder` is hidden and app-scoped (recommended). `drive` stores files visibly in the user's Drive. |
| `rootFolderName` | `string` | `"AppData"` | Only used when `appSpace` is `"drive"`. The name of the root folder created in My Drive. |
| `onTokenExpired` | `() => Promise<string>` | `undefined` | Callback invoked when the access token expires. Should return a new valid token. See [Token refresh](#token-refresh). |

### Examples

```typescript
// Minimal — just a token
const drive = new DriveCRUD(accessToken);

// With token refresh callback
const drive = new DriveCRUD(accessToken, {
  onTokenExpired: async () => {
    const newToken = await myApp.refreshToken();
    return newToken;
  },
});

// Store files visibly in user's Drive instead of hidden appDataFolder
const drive = new DriveCRUD(accessToken, {
  appSpace: "drive",
  rootFolderName: "My Notes App",
});
```

---

## Methods

### `create(name, data)`

Creates a new file. Throws if a file with the same name already exists.

```typescript
create(name: string, data: unknown): Promise<DriveFile>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Logical filename, e.g. `"notes/hello.json"`. Used as the identifier for all future operations on this file. |
| `data` | `unknown` | Any JSON-serializable value — object, array, string, number, boolean. |

**Returns:** `DriveFile` metadata for the newly created file.

**Throws:** `DriveError` with code `ALREADY_EXISTS` if a file with that name already exists.

```typescript
// Create a note
await drive.create("notes/2024-01-01.json", {
  title: "New Year",
  body: "Starting fresh.",
  createdAt: new Date().toISOString(),
});

// Create a user config file
await drive.create("config.json", {
  theme: "dark",
  fontSize: 14,
});

// Create with an array
await drive.create("tags.json", ["work", "personal", "ideas"]);
```

---

### `read(name)`

Reads and parses the content of a file.

```typescript
read(name: string): Promise<unknown>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename used when the file was created. |

**Returns:** The parsed JSON content of the file.

**Throws:** `DriveError` with code `NOT_FOUND` if the file doesn't exist.

```typescript
const note = await drive.read("notes/2024-01-01.json");
console.log(note.title); // "New Year"

// Type-cast the result if using TypeScript
interface Note {
  title: string;
  body: string;
  createdAt: string;
}
const note = await drive.read("notes/2024-01-01.json") as Note;
```

---

### `update(name, data)`

Overwrites the content of an existing file. Throws if the file doesn't exist.

```typescript
update(name: string, data: unknown): Promise<DriveFile>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename of the file to update. |
| `data` | `unknown` | New content. Completely replaces the existing content. |

**Returns:** Updated `DriveFile` metadata.

**Throws:** `DriveError` with code `NOT_FOUND` if the file doesn't exist.

```typescript
// Full overwrite
await drive.update("notes/2024-01-01.json", {
  title: "New Year",
  body: "Updated body text.",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: new Date().toISOString(),
});

// Partial update — read first, merge manually, then write
const existing = await drive.read("notes/2024-01-01.json") as Note;
await drive.update("notes/2024-01-01.json", {
  ...existing,
  body: "Only the body changed.",
  updatedAt: new Date().toISOString(),
});
```

> **Note:** `update` does a full overwrite. If you want to update only some fields, read the file first and spread the existing content.

---

### `delete(name)`

Deletes a file permanently.

```typescript
delete(name: string): Promise<void>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename of the file to delete. |

**Throws:** `DriveError` with code `NOT_FOUND` if the file doesn't exist.

```typescript
await drive.delete("notes/2024-01-01.json");

// Safe delete — check first to avoid throwing
try {
  await drive.delete("notes/maybe-exists.json");
} catch (err) {
  if (err instanceof DriveError && err.code === "NOT_FOUND") {
    // Already gone, that's fine
  } else {
    throw err;
  }
}
```

---

### `list(prefix?)`

Lists metadata for all files stored by your app. Optionally filter by a name prefix.

```typescript
list(prefix?: string): Promise<DriveFile[]>
```

| Parameter | Type | Description |
|---|---|---|
| `prefix` | `string` *(optional)* | If provided, only files whose name starts with this string are returned. |

**Returns:** Array of `DriveFile` metadata objects. Does **not** include file content — call `read()` separately for that.

```typescript
// List everything
const all = await drive.list();

// List only notes
const notes = await drive.list("notes/");

// List only journal entries
const entries = await drive.list("journal/2024/");

// Sort by most recently modified
const sorted = notes.sort(
  (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
);
```

**Use prefixes to namespace your files** across different features of the same app:

```
notes/           → note-taking feature
journal/         → journaling feature
config.json      → app config
```

---

### `setToken(accessToken)`

Replaces the stored access token. Use this after refreshing a token externally.

```typescript
setToken(accessToken: string): void
```

```typescript
// Refresh externally and update the instance
const newToken = await myAuth.refresh();
drive.setToken(newToken);
```

> If you use `onTokenExpired`, you typically won't need to call `setToken` manually — the refresh is handled automatically.

---

## Error Handling

All errors thrown by `nook` are instances of `DriveError`, which extends the native `Error` class.

```typescript
import { DriveCRUD, DriveError } from "@ashish-um/nook";
```

### `DriveError` properties

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable error description |
| `code` | `DriveErrorCode` | Machine-readable error type (see below) |
| `status` | `number \| undefined` | HTTP status code from the Drive API, if applicable |

### Error codes

| Code | When it's thrown |
|---|---|
| `NOT_FOUND` | `read()`, `update()`, or `delete()` called on a file that doesn't exist |
| `ALREADY_EXISTS` | `create()` called with a name that already exists |
| `INVALID_TYPE` | Operation received a data type it can't handle |
| `AUTH_ERROR` | Token is invalid, expired with no refresh callback, or lacks required permissions |
| `API_ERROR` | Any other unexpected error from the Drive API |

### Handling errors

```typescript
import { DriveCRUD, DriveError } from "@ashish-um/nook";

try {
  const note = await drive.read("notes/missing.json");
} catch (err) {
  if (err instanceof DriveError) {
    switch (err.code) {
      case "NOT_FOUND":
        console.log("Note doesn't exist yet");
        break;
      case "AUTH_ERROR":
        console.log("Please sign in again");
        break;
      default:
        console.error("Drive error:", err.message);
    }
  } else {
    throw err; // Re-throw non-Drive errors
  }
}
```

---

## Token Refresh

Google OAuth2 access tokens expire after **1 hour**. Without handling this, your app will silently fail with auth errors for long-running sessions.

Pass an `onTokenExpired` callback to the constructor. When `nook` receives a 401 or 403 from the Drive API, it calls your callback, gets a new token, updates itself, and **retries the original request once** — completely transparent to the caller.

```typescript
const drive = new DriveCRUD(initialToken, {
  onTokenExpired: async () => {
    // Return a fresh access token
    const newToken = await myApp.refreshToken();
    return newToken;
  },
});
```

If the retry also fails (e.g. the refresh token itself is invalid), `nook` throws a `DriveError` with code `AUTH_ERROR`.

### With Google Identity Services (browser)

```javascript
const drive = new DriveCRUD(initialToken, {
  onTokenExpired: () => {
    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: "YOUR_CLIENT_ID.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (response) => {
          if (response.error) return reject(new Error(response.error));
          resolve(response.access_token);
        },
      });
      // prompt: "" means silent refresh — no popup if consent already granted
      tokenClient.requestAccessToken({ prompt: "" });
    });
  },
});
```

### With googleapis (Node.js)

```typescript
const drive = new DriveCRUD(initialToken, {
  onTokenExpired: async () => {
    const { token } = await auth.getAccessToken(); // googleapis handles refresh internally
    return token!;
  },
});
```

---

## TypeScript Types

All types are exported from the package root.

```typescript
import { DriveCRUD, DriveError, DriveFile, DriveCRUDOptions, DriveErrorCode } from "@ashish-um/nook";
```

### `DriveFile`

Metadata returned by `create()`, `update()`, and `list()`.

```typescript
interface DriveFile {
  id: string;           // Drive's internal file ID
  name: string;         // Logical name you gave the file
  modifiedTime: string; // ISO 8601 timestamp of last modification
  size: string;         // File size in bytes (string, per Drive API convention)
}
```

### `DriveCRUDOptions`

```typescript
interface DriveCRUDOptions {
  appSpace?: "appDataFolder" | "drive";
  rootFolderName?: string;
  onTokenExpired?: () => Promise<string>;
}
```

### `DriveErrorCode`

```typescript
type DriveErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "INVALID_TYPE"
  | "AUTH_ERROR"
  | "API_ERROR";
```

---

## Limitations

**No querying.** You can't filter files by content. To find notes matching a search term, you'd `list()` all files, `read()` each one, and filter in memory.

**No real-time sync.** There are no change listeners. To see new data, call `read()` or `list()` again.

**JSON only.** `nook` is designed for structured JSON data. It does not support binary files, images, or raw text.

**Single-user per instance.** Each `DriveCRUD` instance is scoped to one user's token. For multi-user server-side use, create a separate instance per user.

**Single-tab concurrency.** If the same user has your app open in two tabs simultaneously, the last write wins. For conflict detection, store an `updatedAt` timestamp in your data and compare it before writing.

**Drive API quotas.** Google allows 10,000 requests per 100 seconds per user. This is generous for typical app usage but worth knowing.

**Token expiry.** Access tokens expire after 1 hour. Use `onTokenExpired` to handle this gracefully.

---

## Examples

### Notes app

```typescript
const drive = new DriveCRUD(token);

// Create a note
await drive.create(`notes/${Date.now()}.json`, {
  title: "My first note",
  body: "",
  createdAt: new Date().toISOString(),
});

// Load all notes for the sidebar
const files = await drive.list("notes/");
const notes = await Promise.all(files.map((f) => drive.read(f.name)));

// Auto-save on edit
async function save(filename: string, title: string, body: string) {
  await drive.update(filename, { title, body, updatedAt: new Date().toISOString() });
}
```

---

### Config storage

```typescript
const drive = new DriveCRUD(token);

interface AppConfig {
  theme: "light" | "dark";
  fontSize: number;
}

// Load config on startup, fall back to defaults if not set yet
async function loadConfig(): Promise<AppConfig> {
  try {
    return await drive.read("config.json") as AppConfig;
  } catch (err) {
    if (err instanceof DriveError && err.code === "NOT_FOUND") {
      const defaults: AppConfig = { theme: "light", fontSize: 14 };
      await drive.create("config.json", defaults);
      return defaults;
    }
    throw err;
  }
}

// Save config
async function saveConfig(config: AppConfig) {
  await drive.update("config.json", config);
}
```

---

### Journal with date-based filenames

```typescript
const drive = new DriveCRUD(token);

function todayKey() {
  return `journal/${new Date().toISOString().slice(0, 10)}.json`; // "journal/2024-01-01.json"
}

// Get or create today's entry
async function getTodayEntry() {
  try {
    return await drive.read(todayKey());
  } catch (err) {
    if (err instanceof DriveError && err.code === "NOT_FOUND") {
      const entry = { date: todayKey(), body: "", createdAt: new Date().toISOString() };
      await drive.create(todayKey(), entry);
      return entry;
    }
    throw err;
  }
}

// List all past entries
const allEntries = await drive.list("journal/");
```
