export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

export interface DriveCRUDOptions {
  appSpace?: "appDataFolder" | "drive";
  rootFolderName?: string;
  onTokenExpired?: () => Promise<string>;
}

export type DriveErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "INVALID_TYPE"
  | "AUTH_ERROR"
  | "API_ERROR";
