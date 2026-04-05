export function buildMultipartBody(
  metadata: Record<string, unknown>,
  data: unknown,
  boundary: string = "drive_crud_boundary_" + Math.random().toString(36).slice(2)
): { body: string; contentType: string } {
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = "Content-Type: application/json\r\n\r\n" + JSON.stringify(metadata);
  const dataPart = "Content-Type: application/json\r\n\r\n" + JSON.stringify(data);

  const multipartRequestBody =
    delimiter + metadataPart + delimiter + dataPart + closeDelimiter;

  return {
    body: multipartRequestBody,
    contentType: `multipart/related; boundary=${boundary}`
  };
}
