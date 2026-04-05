import { DriveCRUD } from "./nook/index.js";

// ─── App State ────────────────────────────────────────────────────────────────
const CLIENT_ID = "440586625032-kfifni9affih1uh0plbrm3s5e2r83gin.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";

let drive = null;       // DriveCRUD instance, created after sign-in
let notes = [];         // Current list of note metadata from Drive
let activeNoteId = null; // Drive filename of the note being edited
let saveTimer = null;   // Debounce timer for auto-save
let tokenClient = null; // GIS token client, initialized once

// ─── DOM References ───────────────────────────────────────────────────────────
const $authScreen = document.getElementById("auth-screen");
const $app = document.getElementById("app");
const $noteList = document.getElementById("note-list");
const $emptyState = document.getElementById("empty-state");
const $editor = document.getElementById("editor");
const $editorLoading = document.getElementById("editor-loading");
const $titleInput = document.getElementById("note-title-input");
const $bodyInput = document.getElementById("note-body-input");
const $saveStatus = document.getElementById("save-status");
const $signinBtn = document.getElementById("signin-btn");
const $newNoteBtn = document.getElementById("new-note-btn");
const $deleteNoteBtn = document.getElementById("delete-note-btn");

// ─── Auth Flow (Token Client Only) ───────────────────────────────────────────

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: onAccessTokenReceived,
  });
}

function waitForGIS() {
  if (typeof google !== "undefined" && google.accounts) {
    initTokenClient();
  } else {
    setTimeout(waitForGIS, 100);
  }
}
waitForGIS();

$signinBtn.addEventListener("click", () => {
  if (!tokenClient) {
    console.error("GIS not loaded yet");
    return;
  }
  tokenClient.requestAccessToken();
});

function onAccessTokenReceived(tokenResponse) {
  if (tokenResponse.error) {
    console.error("Token error:", tokenResponse);
    return;
  }

  drive = new DriveCRUD(tokenResponse.access_token, {
    onTokenExpired: () => {
      return new Promise((resolve, reject) => {
        const refreshClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) return reject(resp.error);
            resolve(resp.access_token);
          },
        });
        refreshClient.requestAccessToken({ prompt: "" });
      });
    },
  });

  showApp();
  loadNoteList();
}

// ─── Show / Hide ──────────────────────────────────────────────────────────────

function showApp() {
  $authScreen.style.display = "none";
  $app.classList.add("visible");
}

function showSignIn() {
  $authScreen.style.display = "block";
  $app.classList.remove("visible");
  drive = null;
  notes = [];
  activeNoteId = null;
  showEmptyState();
}

function showEmptyState() {
  $editor.style.display = "none";
  $editorLoading.style.display = "none";
  $emptyState.style.display = "block";
}

function showEditor() {
  $emptyState.style.display = "none";
  $editorLoading.style.display = "none";
  $editor.style.display = "flex";
}

function showEditorLoading() {
  $emptyState.style.display = "none";
  $editor.style.display = "none";
  $editorLoading.style.display = "flex";
}

// ─── Button Loading Helpers ───────────────────────────────────────────────────

function setBtnLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${originalText || ""}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || originalText;
  }
}

// ─── Sidebar Skeleton ─────────────────────────────────────────────────────────

function showListSkeleton() {
  $noteList.innerHTML = `
    <div class="skeleton-list">
      ${Array(3).fill(`
        <div class="skeleton-item">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Note List ────────────────────────────────────────────────────────────────

async function loadNoteList() {
  showListSkeleton();

  try {
    notes = await drive.list("notes/");
    notes.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
    renderNoteList();
  } catch (err) {
    console.error("Failed to load notes:", err);
    $noteList.innerHTML = `<p class="empty-list">Failed to load notes.</p>`;
  }
}

function renderNoteList() {
  if (notes.length === 0) {
    $noteList.innerHTML = `<p class="empty-list">No notes yet.<br/>Create one to get started.</p>`;
    return;
  }

  $noteList.innerHTML = notes
    .map((note) => {
      const date = new Date(note.modifiedTime).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const isActive = note.name === activeNoteId;
      return `
        <div class="note-item ${isActive ? "active" : ""}" data-name="${note.name}">
          <div class="note-title">Loading…</div>
          <div class="note-date">${date}</div>
        </div>
      `;
    })
    .join("");

  // Attach click handlers
  $noteList.querySelectorAll(".note-item").forEach((el) => {
    el.addEventListener("click", () => openNote(el.dataset.name));
  });

  // Load titles asynchronously
  notes.forEach(async (note) => {
    try {
      const content = await drive.read(note.name);
      const el = $noteList.querySelector(`[data-name="${note.name}"] .note-title`);
      if (el) el.textContent = content.title || "Untitled";
    } catch (_) {}
  });
}

// ─── Create Note ──────────────────────────────────────────────────────────────

$newNoteBtn.addEventListener("click", async () => {
  const filename = `notes/${Date.now()}.json`;
  const data = { title: "", body: "", createdAt: new Date().toISOString() };

  setBtnLoading($newNoteBtn, true, "Creating…");

  try {
    await drive.create(filename, data);
    await loadNoteList();
    openNote(filename);
  } catch (err) {
    console.error("Failed to create note:", err);
  } finally {
    setBtnLoading($newNoteBtn, false, `<span style="margin-right:4px;">+</span> New Note`);
  }
});

// ─── Open Note ────────────────────────────────────────────────────────────────

async function openNote(name) {
  activeNoteId = name;

  // Mark active in sidebar
  $noteList.querySelectorAll(".note-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.name === name);
  });

  // Show loading indicator in editor pane
  showEditorLoading();

  try {
    const content = await drive.read(name);
    $titleInput.value = content.title ?? "";
    $bodyInput.value = content.body ?? "";
    showEditor();
    setSaveStatus("Saved");
  } catch (err) {
    console.error("Failed to open note:", err);
    showEditor();
    setSaveStatus("Error loading");
  }
}

// ─── Auto-Save ────────────────────────────────────────────────────────────────

function onNoteChanged() {
  setSaveStatus("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActiveNote, 800);
}

async function saveActiveNote() {
  if (!activeNoteId) return;

  const title = $titleInput.value;
  const body = $bodyInput.value;

  try {
    await drive.update(activeNoteId, {
      title,
      body,
      updatedAt: new Date().toISOString(),
    });
    setSaveStatus("Saved");

    // Refresh sidebar title
    const el = $noteList.querySelector(`[data-name="${activeNoteId}"] .note-title`);
    if (el) el.textContent = title || "Untitled";
  } catch (err) {
    console.error("Failed to save:", err);
    setSaveStatus("Save failed");
  }
}

function setSaveStatus(text) {
  $saveStatus.textContent = text;
  $saveStatus.classList.toggle("saving", text === "Saving…");
}

$titleInput.addEventListener("input", onNoteChanged);
$bodyInput.addEventListener("input", onNoteChanged);

// ─── Delete Note ──────────────────────────────────────────────────────────────

$deleteNoteBtn.addEventListener("click", async () => {
  if (!activeNoteId) return;
  if (!confirm("Delete this note?")) return;

  setBtnLoading($deleteNoteBtn, true, "Deleting…");

  try {
    await drive.delete(activeNoteId);
    activeNoteId = null;
    showEmptyState();
    await loadNoteList();
  } catch (err) {
    console.error("Failed to delete:", err);
  } finally {
    setBtnLoading($deleteNoteBtn, false, "Delete");
  }
});

// ─── Sign Out ─────────────────────────────────────────────────────────────────

document.getElementById("sign-out-btn").addEventListener("click", () => {
  google.accounts.id.disableAutoSelect();
  showSignIn();
});
