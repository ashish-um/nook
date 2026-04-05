import { DriveCRUD } from "../../src/DriveCRUD.js";
import { config } from "dotenv";

config();

const token = process.env.TEST_GOOGLE_TOKEN;
if (!token) process.exit(1);

async function run() {
  const drive = new DriveCRUD(token!);

  // Create two test files with different prefixes
  const ts = Date.now();
  await drive.create(`notes/list-${ts}.json`, { type: "note" });
  await drive.create(`journal/list-${ts}.json`, { type: "journal" });
  console.log("Created 2 test files.");

  console.log("\n--- list() (all) ---");
  const all = await drive.list();
  console.log(`Total files: ${all.length}`);

  console.log("\n--- list('notes/') ---");
  const notes = await drive.list("notes/");
  console.log(`Notes: ${notes.length}`, notes.map(f => f.name));

  console.log("\n--- list('journal/') ---");
  const journals = await drive.list("journal/");
  console.log(`Journals: ${journals.length}`, journals.map(f => f.name));

  // Cleanup
  await drive.delete(`notes/list-${ts}.json`);
  await drive.delete(`journal/list-${ts}.json`);
  console.log("\nCleaned up test files.");
}

run();
