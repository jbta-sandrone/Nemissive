import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";

export const messageMediaBucket = "message-media";
export const notesBucket = "notes-private";
export const scheduledMediaBucket = "scheduled-message-media";

export type SourceAttachment = {
  id: string;
  storage_path: string;
  attachment_kind?: "image" | "voice" | "file";
  attachment_type?: "image" | "voice" | "file";
  original_name?: string;
  file_name?: string;
  mime_type: string;
  size_bytes?: number;
  file_size?: number;
  width?: number | null;
  height?: number | null;
  position?: number;
  duration_ms: number | null;
};

export type DeliveryRecord = {
  message_id: string;
  message_type: "text" | "image" | "voice" | "file";
  body: string;
  ordinal: number;
  attachments: Array<{
    id: string;
    storage_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    position: number;
    attachment_kind: "image" | "voice" | "file";
    duration_ms: number | null;
  }>;
};

type ScheduledAttachment = {
  id: string;
  storage_path: string;
  destination_storage_path: string;
  mime_type: string;
};

type ClaimedSchedule = {
  id: string;
  status: string;
  attachments: ScheduledAttachment[];
};

export function readDefaultNamedKey(variableName: string) {
  const serializedKeys = Deno.env.get(variableName);
  if (!serializedKeys) return "";
  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    return typeof keys.default === "string" ? keys.default : "";
  } catch {
    return "";
  }
}

export function readSecretKeys() {
  const values = new Set<string>();
  const serialized = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (serialized) {
    try {
      for (const value of Object.values(JSON.parse(serialized) as Record<string, unknown>)) {
        if (typeof value === "string" && value) values.add(value);
      }
    } catch {
      // The legacy single-key fallbacks below remain available.
    }
  }
  const current = Deno.env.get("SUPABASE_SECRET_KEY");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (current) values.add(current);
  if (legacy) values.add(legacy);
  return [...values];
}

function extension(path: string) {
  const filename = path.split("/").at(-1) ?? "attachment";
  const value = filename.includes(".") ? filename.split(".").at(-1)?.toLowerCase() : "";
  if (!value || !/^[a-z0-9]{1,8}$/u.test(value)) throw new Error("invalid-extension");
  return value;
}

export async function transferObject(
  admin: SupabaseClient,
  sourceBucket: string,
  sourcePath: string,
  destinationBucket: string,
  destinationPath: string,
  mimeType: string,
) {
  const existing = await admin.storage.from(destinationBucket).download(destinationPath);
  if (!existing.error && existing.data) return;

  if (sourceBucket === destinationBucket) {
    const copied = await admin.storage.from(sourceBucket).copy(sourcePath, destinationPath);
    if (!copied.error) return;
    const afterCopy = await admin.storage.from(destinationBucket).download(destinationPath);
    if (!afterCopy.error && afterCopy.data) return;
    throw new Error(`copy:${copied.error.message}`);
  }

  const downloaded = await admin.storage.from(sourceBucket).download(sourcePath);
  if (downloaded.error || !downloaded.data) throw new Error(`download:${downloaded.error?.message ?? "missing"}`);
  const uploaded = await admin.storage.from(destinationBucket).upload(destinationPath, downloaded.data, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false,
  });
  if (!uploaded.error) return;
  const afterUpload = await admin.storage.from(destinationBucket).download(destinationPath);
  if (!afterUpload.error && afterUpload.data) return;
  throw new Error(`upload:${uploaded.error.message}`);
}

export async function removeObjects(admin: SupabaseClient, bucket: string, paths: string[]) {
  if (!paths.length) return null;
  const { error } = await admin.storage.from(bucket).remove([...new Set(paths)]);
  return error;
}

export function buildDeliveryRecords(
  actorId: string,
  conversationId: string,
  body: string,
  attachments: SourceAttachment[],
  dimensions: Record<string, { width: number; height: number }> = {},
) {
  const image = attachments.filter((item) => (item.attachment_kind ?? item.attachment_type) === "image");
  const voice = attachments.filter((item) => (item.attachment_kind ?? item.attachment_type) === "voice");
  const files = attachments.filter((item) => (item.attachment_kind ?? item.attachment_type) === "file");
  if (image.length > 10) throw new Error("image-limit");
  if (files.length > 10) throw new Error("file-limit");
  if (voice.length > 10) throw new Error("voice-limit");
  if (!body && !attachments.length) throw new Error("empty-delivery");

  const records: DeliveryRecord[] = [];
  let ordinal = 0;
  if (body) records.push({ message_id: crypto.randomUUID(), message_type: "text", body, ordinal: ordinal++, attachments: [] });

  function attachmentRecord(source: SourceAttachment, messageId: string, position: number) {
    const kind = (source.attachment_kind ?? source.attachment_type) as "image" | "voice" | "file";
    const id = crypto.randomUUID();
    const imageDimensions = kind === "image" ? dimensions[source.id] ?? { width: source.width ?? 0, height: source.height ?? 0 } : null;
    if (kind === "image" && (!imageDimensions || imageDimensions.width < 1 || imageDimensions.height < 1)) throw new Error("image-dimensions");
    return {
      id,
      storage_path: `${conversationId}/${actorId}/${messageId}/${id}.${extension(source.storage_path)}`,
      original_name: source.original_name ?? source.file_name ?? "Attachment",
      mime_type: source.mime_type.split(";", 1)[0].toLowerCase(),
      size_bytes: source.size_bytes ?? source.file_size ?? 0,
      width: imageDimensions?.width ?? null,
      height: imageDimensions?.height ?? null,
      position,
      attachment_kind: kind,
      duration_ms: source.duration_ms,
    };
  }

  if (image.length) {
    const messageId = crypto.randomUUID();
    records.push({ message_id: messageId, message_type: "image", body: "", ordinal: ordinal++, attachments: image.map((item, index) => attachmentRecord(item, messageId, index)) });
  }
  for (const item of voice) {
    const messageId = crypto.randomUUID();
    records.push({ message_id: messageId, message_type: "voice", body: "", ordinal: ordinal++, attachments: [attachmentRecord(item, messageId, 0)] });
  }
  if (files.length) {
    const messageId = crypto.randomUUID();
    records.push({ message_id: messageId, message_type: "file", body: "", ordinal: ordinal++, attachments: files.map((item, index) => attachmentRecord(item, messageId, index)) });
  }
  return records;
}

export async function prepareImmediateObjects(
  admin: SupabaseClient,
  sourceBucket: string,
  sources: SourceAttachment[],
  records: DeliveryRecord[],
) {
  const sourceByKind = new Map<string, SourceAttachment[]>();
  const sourceCursor = new Map<string, number>();
  for (const source of sources) {
    const kind = source.attachment_kind ?? source.attachment_type ?? "";
    sourceByKind.set(kind, [...(sourceByKind.get(kind) ?? []), source]);
  }
  const copiedPaths: string[] = [];
  try {
    for (const record of records) {
      const sourceItems = sourceByKind.get(record.message_type) ?? [];
      for (let index = 0; index < record.attachments.length; index += 1) {
        const cursor = sourceCursor.get(record.message_type) ?? 0;
        const source = sourceItems[cursor];
        const destination = record.attachments[index];
        if (!source || !destination) throw new Error("attachment-map");
        await transferObject(admin, sourceBucket, source.storage_path, messageMediaBucket, destination.storage_path, destination.mime_type);
        copiedPaths.push(destination.storage_path);
        sourceCursor.set(record.message_type, cursor + 1);
      }
    }
  } catch (error) {
    await removeObjects(admin, messageMediaBucket, copiedPaths);
    throw error;
  }
  return copiedPaths;
}

async function cleanupSchedule(admin: SupabaseClient, scheduleId: string, attachments: ScheduledAttachment[]) {
  const removal = await removeObjects(admin, scheduledMediaBucket, attachments.map((item) => item.storage_path));
  if (removal) return false;
  const { error } = await admin.rpc("purge_scheduled_message_attachments", { target_scheduled_message_id: scheduleId });
  return !error;
}

async function cleanupFailedDestinations(admin: SupabaseClient, attachments: ScheduledAttachment[]) {
  return !await removeObjects(admin, messageMediaBucket, attachments.map((item) => item.destination_storage_path).filter(Boolean));
}

async function deliverClaim(admin: SupabaseClient, claim: ClaimedSchedule) {
  try {
    for (const attachment of claim.attachments) {
      await transferObject(admin, scheduledMediaBucket, attachment.storage_path, messageMediaBucket, attachment.destination_storage_path, attachment.mime_type);
    }
    const { data, error } = await admin.rpc("finalize_scheduled_multimedia_delivery", { target_scheduled_message_id: claim.id });
    if (error || !data) throw new Error(`finalize:${error?.code ?? "missing"}`);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    const status = typeof row.status === "string" ? row.status : "failed";
    if (status === "failed" || status === "cancelled") await cleanupFailedDestinations(admin, claim.attachments);
    if (status === "sent" || status === "failed" || status === "cancelled") await cleanupSchedule(admin, claim.id, claim.attachments);
    return row;
  } catch (error) {
    const { data } = await admin.rpc("record_scheduled_multimedia_failure", {
      target_scheduled_message_id: claim.id,
      permanent_failure: false,
      safe_failure_message: "Delivery was delayed. Nemissive will retry automatically.",
    });
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (row?.status === "failed") {
      await cleanupFailedDestinations(admin, claim.attachments);
      await cleanupSchedule(admin, claim.id, claim.attachments);
    }
    console.error("scheduled multimedia delivery attempt failed", { scheduleId: claim.id, phase: error instanceof Error ? error.message.split(":", 1)[0] : "unknown" });
    return row;
  }
}

async function cleanupTerminalSnapshots(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("scheduled_message_attachments")
    .select("scheduled_message_id, storage_path, destination_storage_path, scheduled_messages!inner(status)")
    .in("scheduled_messages.status", ["sent", "failed", "cancelled"])
    .limit(500);
  if (error || !data?.length) return;
  const grouped = new Map<string, ScheduledAttachment[]>();
  for (const row of data as unknown as Array<Record<string, unknown>>) {
    if (typeof row.scheduled_message_id !== "string" || typeof row.storage_path !== "string") continue;
    grouped.set(row.scheduled_message_id, [...(grouped.get(row.scheduled_message_id) ?? []), { id: "", storage_path: row.storage_path, destination_storage_path: typeof row.destination_storage_path === "string" ? row.destination_storage_path : "", mime_type: "" }]);
  }
  for (const [scheduleId, attachments] of grouped) {
    const nested = (data as unknown as Array<Record<string, unknown>>).find((row) => row.scheduled_message_id === scheduleId)?.scheduled_messages;
    const status = Array.isArray(nested) ? (nested[0] as Record<string, unknown> | undefined)?.status : (nested as Record<string, unknown> | null)?.status;
    if (status === "failed" || status === "cancelled") await cleanupFailedDestinations(admin, attachments);
    await cleanupSchedule(admin, scheduleId, attachments);
  }
}

async function cleanupOrphanedScheduledObjects(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("list_orphaned_scheduled_media", { batch_size: 100 });
  if (error || !Array.isArray(data)) return;
  const paths = data.filter((value): value is string => typeof value === "string" && value.length > 0);
  await removeObjects(admin, scheduledMediaBucket, paths);
}

export async function processScheduledMedia(
  admin: SupabaseClient,
  targetScheduleId: string | null = null,
  allowEarly = false,
) {
  const { data, error } = await admin.rpc("claim_scheduled_multimedia_messages", {
    // Media copies are intentionally sequential and bounded to one schedule per
    // invocation so a large valid Notes snapshot cannot starve other isolates.
    batch_size: 1,
    target_scheduled_message_id: targetScheduleId,
    allow_early_delivery: allowEarly,
  });
  if (error) throw new Error(`claim:${error.code ?? "unknown"}`);
  const claims = Array.isArray(data) ? data as ClaimedSchedule[] : [];
  const results: Array<Record<string, unknown> | null> = [];
  for (const claim of claims) results.push(await deliverClaim(admin, claim));
  await cleanupTerminalSnapshots(admin);
  await cleanupOrphanedScheduledObjects(admin);
  return results;
}
