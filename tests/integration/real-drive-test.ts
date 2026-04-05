import { DriveCRUD } from "../../src/DriveCRUD.js";
import { config } from "dotenv";

config();

const token = process.env.TEST_GOOGLE_TOKEN;

if (!token) {
  console.error("No TEST_GOOGLE_TOKEN found in .env");
  process.exit(1);
}

// We extend DriveCRUD to bypass "protected" modifier and call methods directly
// @ts-ignore
class TestableDriveCRUD extends DriveCRUD {
  public async testListAll(prefix?: string) {
    return this._listAll(prefix);
  }
  public async testFindByName(name: string) {
    return this._findByName(name);
  }
}

async function run() {
  const drive = new TestableDriveCRUD(token!);
  
  console.log("--- Testing _listAll without prefix ---");
  try {
    const files = await drive.testListAll();
    console.log(`Success! Found ${files.length} files.`);
    console.log(files);
  } catch (err: any) {
    console.error("Failed _listAll:", err.message);
  }

  console.log("\n--- Testing _listAll with prefix 'nonexistent/' ---");
  try {
    const files = await drive.testListAll("nonexistent/");
    console.log(`Success! Found ${files.length} files.`);
  } catch (err: any) {
    console.error("Failed _listAll (prefix):", err.message);
  }

  console.log("\n--- Testing _findByName for 'does_not_exist.json' ---");
  try {
    const id = await drive.testFindByName("does_not_exist.json");
    console.log(`Unexpectedly found file ID: ${id}`);
  } catch (err: any) {
    if (err.code === "NOT_FOUND" && err.status === 404) {
      console.log(`Expected Error successfully caught!`);
      console.log(`Code: ${err.code}, Status: ${err.status}, Message: ${err.message}`);
    } else {
      console.error(`Unexpected Error:`, err);
    }
  }
}

run();
