import { describe, it, expect } from "vitest";
import { buildMultipartBody } from "../src/utils.js";

describe("utils - buildMultipartBody", () => {
  it("should generate a valid multipart representation of metadata and data", () => {
    const metadata = { name: "test.json", parents: ["appDataFolder"] };
    const data = { title: "Hello", body: "World" };
    
    // Pass a fixed boundary for predictable testing
    const boundary = "TEST_BOUNDARY_123";
    const result = buildMultipartBody(metadata, data, boundary);

    expect(result.contentType).toBe("multipart/related; boundary=TEST_BOUNDARY_123");

    const expectedBody = 
      `\r\n--TEST_BOUNDARY_123\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `{"name":"test.json","parents":["appDataFolder"]}` +
      `\r\n--TEST_BOUNDARY_123\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `{"title":"Hello","body":"World"}` +
      `\r\n--TEST_BOUNDARY_123--`;

    expect(result.body).toBe(expectedBody);
  });

  it("should output a unique boundary by default", () => {
    const r1 = buildMultipartBody({}, {});
    const r2 = buildMultipartBody({}, {});
    
    expect(r1.contentType).not.toBe(r2.contentType);
    expect(r1.contentType.includes("multipart/related; boundary=drive_crud_boundary_")).toBe(true);
  });
});
