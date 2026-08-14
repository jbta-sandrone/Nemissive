import { supabase } from "./supabase";

export const profileAvatarBucket = "profile-avatars";
export const maxProfileAvatarBytes = 5 * 1024 * 1024;
export const profileIdentityChangeEvent = "nemissive:profile-identity-changed";

export function announceProfileIdentityChanged() {
  window.dispatchEvent(new Event(profileIdentityChangeEvent));
}

export const reservedUsernames = new Set([
  "admin",
  "administrator",
  "moderator",
  "nemissive",
  "support",
  "system",
]);

const usernamePattern = /^[a-z0-9_]{3,30}$/u;
const avatarMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function validateUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (!usernamePattern.test(normalized)) return { valid: false, normalized, message: "Use 3–30 lowercase letters, numbers, or underscores." };
  if (reservedUsernames.has(normalized)) return { valid: false, normalized, message: "That username is reserved. Choose another one." };
  return { valid: true, normalized, message: "" };
}

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function validateDisplayName(value: string) {
  if (Array.from(value).some((character) => { const code = character.codePointAt(0); return code !== undefined && (code <= 31 || code === 127); })) return { valid: false, normalized: value, message: "Display name cannot contain control characters." };
  const normalized = normalizeDisplayName(value);
  const length = Array.from(normalized).length;
  if (length < 1 || length > 50) return { valid: false, normalized, message: "Display name must contain 1–50 characters." };
  return { valid: true, normalized, message: "" };
}

export function getProfileAvatarUrl(reference: string | null | undefined) {
  if (!reference) return null;
  if (/^(?:https?:|blob:|data:)/iu.test(reference)) return reference;
  return supabase.storage.from(profileAvatarBucket).getPublicUrl(reference).data.publicUrl;
}

export function isOwnedAvatarPath(reference: string | null | undefined, userId: string) {
  return Boolean(reference && !/^[a-z][a-z0-9+.-]*:/iu.test(reference) && reference.startsWith(`${userId}/`));
}

function hasExpectedImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function validateAvatarFile(file: File) {
  if (!avatarMimeTypes.has(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size <= 0 || file.size > maxProfileAvatarBytes) return "Profile photos must be 5 MB or smaller.";
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasExpectedImageSignature(signature, file.type)) return "This file does not appear to be a valid supported image.";
  return null;
}

export function avatarFileExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}
