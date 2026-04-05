# Using nook in React & Next.js

---

## Is nook compatible?

Yes. `nook` is a plain TypeScript class with no framework dependencies — it works in React, Next.js, Vue, or plain JavaScript without any changes to the package itself.

The only thing to be aware of in **Next.js** is that `nook` must run on the client side. Google OAuth tokens only exist in the browser, so you can't use `nook` inside server components or API routes. Any component that uses `nook` needs the `"use client"` directive at the top.

---

## Before you start

You'll need a Google Cloud project set up with:
- The **Google Drive API** enabled
- An **OAuth 2.0 Client ID**
- Your app's URL added to **Authorised JavaScript origins** (exact match, no trailing slash)
- The `https://www.googleapis.com/auth/drive.appdata` scope added to your consent screen

If you haven't done this yet, follow Step 1 of the [vanilla notes app guide](./notes-app-implementation.md) — the Google Cloud setup is identical for all frameworks.

Once you have a Client ID, add it to your environment:

```bash
# .env.local (Next.js) or .env (Vite)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

---

## A note on auth

You might reach for `@react-oauth/google` since it's the popular choice for Google sign-in in React. Don't use it here — it only gives you an ID token (proof of who the user is), not a Drive access token (permission to read/write files). `nook` needs the latter.

Instead, use **Google Identity Services (GIS)** directly. Add this script tag to your app:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

In **Next.js**, put this in your `layout.tsx` or `_app.tsx` using the `next/script` component:

```tsx
import Script from "next/script";

<Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
```

GIS handles the sign-in popup, the consent screen, and gives you back an access token you can pass directly to `nook`.

---

## The recommended pattern

The cleanest way to use `nook` in React is:

1. Create a **`DriveProvider`** component that manages the `DriveCRUD` instance and exposes it via React context
2. Create a **`useDrive()`** hook that any component uses to access the instance

This way, the `DriveCRUD` instance is created once after sign-in and is available everywhere in your app without prop drilling.

The provider holds four things: the `drive` instance, an `isReady` flag, a `signIn` function, and a `signOut` function. Components only care about `isReady` (to know if the user is signed in) and `drive` (to make CRUD calls).

A typical component looks like this:

```tsx
"use client"; // Next.js App Router only

import { useEffect, useState } from "react";
import { useDrive } from "@/context/DriveContext";

export function NoteList() {
  const { drive, isReady } = useDrive();
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!isReady) return;
    drive.list("notes/").then(setNotes);
  }, [isReady]);

  if (!isReady) return <p>Sign in to see your notes.</p>;
  return <ul>{notes.map(n => <li key={n.id}>{n.name}</li>)}</ul>;
}
```

Always guard with `isReady` before calling Drive methods — `drive` is `null` until the user signs in.

---

## Setting up the provider

Create `src/context/DriveContext.tsx`. This file does three things:

- Loads the GIS token client when the page starts
- Creates a `DriveCRUD` instance when the user signs in
- Exposes `drive`, `isReady`, `signIn`, and `signOut` to the rest of the app

```tsx
"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { DriveCRUD } from "@ashish-um/nook";

const DriveContext = createContext(null);

export function DriveProvider({ clientId, children }) {
  const [drive, setDrive] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const tokenClientRef = useRef(null);

  useEffect(() => {
    const init = () => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (response) => {
          if (response.error) return;
          setDrive(new DriveCRUD(response.access_token, {
            onTokenExpired: () => new Promise((resolve, reject) => {
              window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: "https://www.googleapis.com/auth/drive.appdata",
                callback: (r) => r.error ? reject(r.error) : resolve(r.access_token),
              }).requestAccessToken({ prompt: "" });
            }),
          }));
          setIsReady(true);
        },
      });
    };

    // Wait for the GIS script to finish loading
    if (window.google?.accounts?.oauth2) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(interval); init(); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [clientId]);

  const signIn = useCallback(() => {
    tokenClientRef.current?.requestAccessToken({ prompt: "select_account" });
  }, []);

  const signOut = useCallback(() => {
    if (drive) window.google.accounts.oauth2.revoke(drive._token);
    setDrive(null);
    setIsReady(false);
  }, [drive]);

  return (
    <DriveContext.Provider value={{ drive, isReady, signIn, signOut }}>
      {children}
    </DriveContext.Provider>
  );
}

export function useDrive() {
  const ctx = useContext(DriveContext);
  if (!ctx) throw new Error("useDrive() must be used inside <DriveProvider>");
  return ctx;
}
```

---

## Wrapping your app

### React (Vite)

Wrap your app in `main.tsx`:

```tsx
import { DriveProvider } from "./context/DriveContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <DriveProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <App />
  </DriveProvider>
);
```

### Next.js App Router

Since `layout.tsx` is a server component, create a thin client wrapper first:

```tsx
// app/providers.tsx
"use client";
import { DriveProvider } from "@/context/DriveContext";

export function Providers({ children }) {
  return (
    <DriveProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      {children}
    </DriveProvider>
  );
}
```

Then use it in your layout:

```tsx
// app/layout.tsx
import Script from "next/script";
import { Providers } from "./providers";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Next.js Pages Router

Add both to `_app.tsx`:

```tsx
import Script from "next/script";
import { DriveProvider } from "@/context/DriveContext";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
      <DriveProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
        <Component {...pageProps} />
      </DriveProvider>
    </>
  );
}
```

---

## Quick reference

Once the provider is set up, using `nook` in any component is straightforward:

```tsx
const { drive, isReady, signIn, signOut } = useDrive();

// Trigger sign-in
<button onClick={signIn}>Sign in with Google</button>

// List files
const notes = await drive.list("notes/");

// Create
await drive.create("notes/hello.json", { title: "Hello", body: "" });

// Read
const note = await drive.read("notes/hello.json");

// Update
await drive.update("notes/hello.json", { title: "Updated", body: "..." });

// Delete
await drive.delete("notes/hello.json");
```

For full details on each method — parameters, return values, and error codes — see the [main nook documentation](./nook-documentation.md).

---

## Things to keep in mind

- Always check `isReady` before calling Drive methods. `drive` is `null` when the user is signed out.
- In Next.js App Router, add `"use client"` to any component that calls `useDrive()`.
- Don't use `@react-oauth/google` — it can't give you a Drive access token.
- Your Client ID must be prefixed with `NEXT_PUBLIC_` in Next.js to be accessible in the browser.
