# Nook (DriveCRUD)

A reusable TypeScript module for using Google Drive as per-user cloud storage.

## Install

```bash
npm install drive-crud
```

## Quick Start

```typescript
import { DriveCRUD } from "drive-crud";

const drive = new DriveCRUD(googleAccessToken);

// Create
await drive.create("notes/hello.json", { title: "Hello", body: "World" });

// Read
const note = await drive.read("notes/hello.json");

// Update
await drive.update("notes/hello.json", { title: "Hello", body: "Updated" });

// List
const allNotes = await drive.list("notes/");

// Delete
await drive.delete("notes/hello.json");
```

## API

### `new DriveCRUD(token, options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `appSpace` | `"appDataFolder" \| "drive"` | `"appDataFolder"` | Where to store files |
| `rootFolderName` | `string` | — | Root folder name (only for `appSpace: "drive"`) |

### Methods

| Method | Returns | Description |
|---|---|---|
| `create(name, data)` | `Promise<DriveFile>` | Create a new file. Throws `ALREADY_EXISTS` if it exists. |
| `read(name)` | `Promise<unknown>` | Read and parse file content. Throws `NOT_FOUND`. |
| `update(name, data)` | `Promise<DriveFile>` | Overwrite existing file. Throws `NOT_FOUND`. |
| `delete(name)` | `Promise<void>` | Delete a file. Throws `NOT_FOUND`. |
| `list(prefix?)` | `Promise<DriveFile[]>` | List files, optionally filtered by prefix. |
| `setToken(token)` | `void` | Replace the stored access token. |

### Error Handling

All errors are instances of `DriveError` with a typed `code`:

```typescript
import { DriveError } from "drive-crud";

try {
  await drive.read("missing.json");
} catch (err) {
  if (err instanceof DriveError && err.code === "NOT_FOUND") {
    // handle gracefully
  }
}
```

Error codes: `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_TYPE`, `AUTH_ERROR`, `API_ERROR`.

## OAuth2 Scope

Your app must request this scope:

```
https://www.googleapis.com/auth/drive.appdata
```

## License

ISC
