import { DriveCRUD } from "../../src/DriveCRUD.js";
import { config } from "dotenv";

config();

const token = process.env.TEST_GOOGLE_TOKEN;
if (!token) process.exit(1);

async function run() {
  const drive = new DriveCRUD(token!);
  const name = `ud-test-${Date.now()}.json`;

  console.log(`--- create ${name} ---`);
  const created = await drive.create(name, { v: 1 });
  console.log("Created:", created);

  console.log(`\n--- read ${name} ---`);
  const data1 = await drive.read(name);
  console.log("Read:", data1);

  console.log(`\n--- update ${name} ---`);
  const updated = await drive.update(name, { v: 2, extra: true });
  console.log("Updated:", updated);

  console.log(`\n--- read after update ---`);
  const data2 = await drive.read(name);
  console.log("Read:", data2);

  console.log(`\n--- delete ${name} ---`);
  await drive.delete(name);
  console.log("Deleted successfully.");

  console.log(`\n--- read after delete (should fail) ---`);
  try {
    await drive.read(name);
    console.error("ERROR: read should have thrown NOT_FOUND!");
  } catch (err: any) {
    console.log(`Expected error: code=${err.code}, message=${err.message}`);
  }
}

run();
