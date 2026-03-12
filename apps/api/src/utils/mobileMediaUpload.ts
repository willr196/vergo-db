const MAX_MOBILE_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const importEsmModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
let fileTypeFromBufferFn: ((buffer: Buffer) => Promise<{ mime: string } | undefined>) | null = null;

function extractBoundary(contentTypeHeader: string) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader);
  return match?.[1] ?? match?.[2]?.trim() ?? null;
}

async function getFileType(buffer: Buffer) {
  if (!fileTypeFromBufferFn) {
    const mod = await importEsmModule("file-type");
    const modAny = mod as {
      fileTypeFromBuffer?: (input: Buffer) => Promise<{ mime: string } | undefined>;
      fromBuffer?: (input: Buffer) => Promise<{ mime: string } | undefined>;
    };
    fileTypeFromBufferFn = modAny.fileTypeFromBuffer ?? modAny.fromBuffer ?? null;
    if (!fileTypeFromBufferFn) {
      throw new Error("file-type: missing buffer detection function");
    }
  }

  const fn = fileTypeFromBufferFn;
  if (!fn) {
    throw new Error("file-type: buffer detection not initialized");
  }

  return fn(buffer);
}

function normalizeDetectedMimeType(mimeType: string | undefined) {
  const normalized = mimeType?.toLowerCase().trim();
  if (!normalized) return null;
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized;
}

function parseMultipartImage(
  body: Buffer,
  contentTypeHeader: string,
  fieldName: string
) {
  const boundary = extractBoundary(contentTypeHeader);
  if (!boundary) {
    throw new Error("Invalid multipart upload boundary");
  }

  const boundaryMarker = `--${boundary}`;
  const raw = body.toString("latin1");
  let cursor = 0;

  while (cursor < raw.length) {
    const markerIndex = raw.indexOf(boundaryMarker, cursor);
    if (markerIndex === -1) break;

    const afterMarker = markerIndex + boundaryMarker.length;
    if (raw.startsWith("--", afterMarker)) break;

    let headerStart = afterMarker;
    if (raw.startsWith("\r\n", headerStart)) {
      headerStart += 2;
    }

    const headerEnd = raw.indexOf("\r\n\r\n", headerStart);
    if (headerEnd === -1) break;

    const headerBlock = raw.slice(headerStart, headerEnd);
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headerBlock);
    const nextMarker = raw.indexOf(`\r\n${boundaryMarker}`, headerEnd + 4);
    if (!disposition || nextMarker === -1) {
      cursor = headerEnd + 4;
      continue;
    }

    cursor = nextMarker + 2;

    if (disposition[1] !== fieldName || !disposition[2]) {
      continue;
    }

    const fileName = disposition[2];
    const fileBuffer = Buffer.from(body.subarray(headerEnd + 4, nextMarker));

    return { fileBuffer, fileName };
  }

  throw new Error(`Missing ${fieldName} file upload`);
}

export async function parseMobileImageUpload(
  body: unknown,
  contentTypeHeader: string | undefined,
  fieldName: string
) {
  if (!Buffer.isBuffer(body)) {
    throw new Error("Missing upload body");
  }

  if (body.length === 0) {
    throw new Error("Empty upload body");
  }

  const contentType = contentTypeHeader ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data upload");
  }

  const { fileBuffer, fileName } = parseMultipartImage(body, contentType, fieldName);

  if (fileBuffer.length === 0) {
    throw new Error("Uploaded file was empty");
  }

  if (fileBuffer.length > MAX_MOBILE_IMAGE_BYTES) {
    throw new Error("Image exceeds maximum size of 2MB");
  }

  const detectedFileType = await getFileType(fileBuffer);
  const mimeType = normalizeDetectedMimeType(detectedFileType?.mime);
  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported image type");
  }

  return {
    fileName,
    mimeType,
    dataUrl: `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
  };
}
