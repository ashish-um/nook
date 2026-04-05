import type { DriveErrorCode } from "./types.js";

export class DriveError extends Error {
  code: DriveErrorCode;
  status?: number;

  constructor(message: string, code: DriveErrorCode, status?: number) {
    super(message);
    this.name = "DriveError";
    this.code = code;
    this.status = status;

    // Must be explicitly set to maintain prototype chain correctly 
    // when extending built-ins in target < ES6
    Object.setPrototypeOf(this, DriveError.prototype);
  }
}
