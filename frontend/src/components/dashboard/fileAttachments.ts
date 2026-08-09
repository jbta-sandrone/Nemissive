export const fileAttachmentMaxSize = 25 * 1024 * 1024;
export const fileAttachmentMaxCount = 10;

const fileTypes = {
  pdf: { mime: "application/pdf", label: "PDF" },
  doc: { mime: "application/msword", label: "Word" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  xls: { mime: "application/vnd.ms-excel", label: "Excel" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  ppt: { mime: "application/vnd.ms-powerpoint", label: "PowerPoint" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint" },
  txt: { mime: "text/plain", label: "Text" },
  csv: { mime: "text/csv", label: "CSV" },
  zip: { mime: "application/zip", label: "ZIP" },
} as const;

export type AllowedFileExtension = keyof typeof fileTypes;

export const acceptedFileInputTypes = Object.entries(fileTypes)
  .flatMap(([extension, value]) => [`.${extension}`, value.mime])
  .join(",");

const browserMimeAliases: Partial<Record<AllowedFileExtension, ReadonlySet<string>>> = {
  csv: new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]),
  zip: new Set(["application/zip", "application/x-zip-compressed"]),
};

export function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > -1 ? filename.slice(dotIndex + 1).toLowerCase() : "";
}

export function normalizeAllowedFile(file: Pick<File, "name" | "type">) {
  const extension = getFileExtension(file.name) as AllowedFileExtension;
  const type = fileTypes[extension];
  if (!type) return null;
  const reportedMime = file.type.trim().toLowerCase();
  if (reportedMime && reportedMime !== type.mime && !browserMimeAliases[extension]?.has(reportedMime)) return null;
  return { extension, mimeType: type.mime, label: type.label };
}

export function getFriendlyFileType(filename: string, mimeType: string) {
  const extension = getFileExtension(filename) as AllowedFileExtension;
  return fileTypes[extension]?.label ?? (mimeType === "application/pdf" ? "PDF" : "File");
}

export function sanitizeAttachmentFilename(filename: string) {
  const sanitized = [...filename].map((character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\" || code <= 31 || code === 127 ? "_" : character;
  }).join("").trim();
  if (sanitized.length <= 255) return sanitized;
  const extension = getFileExtension(sanitized);
  const suffix = extension ? `.${extension}` : "";
  return `${sanitized.slice(0, Math.max(1, 255 - suffix.length)).replace(/\.+$/u, "")}${suffix}`;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function validateHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

const visibleUrlPattern = /https?:\/\/[^\s<>{}[\]"']+/giu;

export function extractHttpUrls(value: string) {
  return [...value.matchAll(visibleUrlPattern)].map((match) => {
    let candidate = match[0];
    while (/[),.!?:;]$/.test(candidate)) candidate = candidate.slice(0, -1);
    return validateHttpUrl(candidate) ? candidate : null;
  }).filter((url): url is string => Boolean(url));
}
