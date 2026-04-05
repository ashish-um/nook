import { describe, it, expect } from "vitest";
import { DriveError } from "../src/DriveError.js";

describe("DriveError", () => {
  it("should preserve message and properties", () => {
    const err = new DriveError("File not found", "NOT_FOUND", 404);
    
    expect(err.message).toBe("File not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.name).toBe("DriveError");
  });

  it("should allow omitting the status code", () => {
    const err = new DriveError("Unknown error occurred", "API_ERROR");
    
    expect(err.message).toBe("Unknown error occurred");
    expect(err.code).toBe("API_ERROR");
    expect(err.status).toBeUndefined();
  });

  it("should be an instance of Error and DriveError", () => {
    const err = new DriveError("Testing instance", "AUTH_ERROR", 401);
    
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DriveError);
  });
});
