import { buildMultipartBody } from "../../src/utils.js";
import { DriveCRUD } from "../../src/DriveCRUD.js";
import { config } from "dotenv";

config();

const token = process.env.TEST_GOOGLE_TOKEN;
if (!token) process.exit(1);

// @ts-ignore
class TestableDrive extends DriveCRUD {
  public async uploadTest() {
    const { body, contentType } = buildMultipartBody(
      { name: "upload-test.json", parents: ["appDataFolder"] },
      { hello: "world", timestamp: new Date().toISOString() }
    );

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body
    });
  }
}

async function run() {
  const drive = new TestableDrive(token!);
  console.log("Testing buildMultipartBody with real Drive API...");
  try {
    const res = await drive.uploadTest();
    console.log("Success! Uploaded file:", res);
  } catch (err: any) {
    console.error("Upload failed!", err);
  }
}

run();
