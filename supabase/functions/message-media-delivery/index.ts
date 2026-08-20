import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";
import {
  buildDeliveryRecords,
  messageMediaBucket,
  notesBucket,
  prepareImmediateObjects,
  processScheduledMedia,
  readDefaultNamedKey,
  removeObjects,
  scheduledMediaBucket,
  transferObject,
  type SourceAttachment,
} from "../_shared/mediaDelivery.ts";

type RequestBody = {
  action?: unknown;
  sourceMessageId?: unknown;
  noteId?: unknown;
  conversationId?: unknown;
  body?: unknown;
  attachmentIds?: unknown;
  imageDimensions?: unknown;
  scheduledFor?: unknown;
  scheduledMessageId?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function dimensionsValue(value: unknown) {
  const result: Record<string, { width: number; height: number }> = {};
  const record = objectValue(value);
  if (!record) return result;
  for (const [id, item] of Object.entries(record)) {
    const dimension = objectValue(item);
    if (dimension && Number.isInteger(dimension.width) && Number.isInteger(dimension.height)) {
      result[id] = { width: Number(dimension.width), height: Number(dimension.height) };
    }
  }
  return result;
}

function normalizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";
  if (message.includes("limit")) return { status: 400, error: "This selection exceeds Nemissive's messaging attachment limits." };
  if (message.includes("dimensions")) return { status: 400, error: "One selected image is still preparing. Wait a moment and try again." };
  if (message.includes("42501") || message.includes("P0002")) return { status: 403, error: "This source or destination is no longer available." };
  return { status: 500, error: "Nemissive couldn't prepare this multimedia delivery. Please try again." };
}

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readDefaultNamedKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const secretKey = readDefaultNamedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!projectUrl || !publishableKey || !secretKey) return jsonResponse(500, { error: "Multimedia delivery is not configured." });
  if (!token) return jsonResponse(401, { error: "Authentication required." });

  const userClient = createClient(projectUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authorization } } });
  const admin = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) return jsonResponse(401, { error: "Your session has expired. Sign in and try again." });
  const actorId = userResult.user.id;

  let body: RequestBody;
  try { body = await request.json() as RequestBody; } catch { return jsonResponse(400, { error: "A valid delivery request is required." }); }
  const action = typeof body.action === "string" ? body.action : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

  try {
    if (action === "forward") {
      const sourceMessageId = typeof body.sourceMessageId === "string" ? body.sourceMessageId : "";
      if (!sourceMessageId || !conversationId) return jsonResponse(400, { error: "Choose a message and destination." });
      const authorizationResult = await admin.rpc("authorize_message_media_forward", { target_actor_id: actorId, target_source_message_id: sourceMessageId, target_conversation_id: conversationId });
      if (authorizationResult.error || !authorizationResult.data) throw new Error(`authorize:${authorizationResult.error?.code ?? "missing"}`);
      const payload = authorizationResult.data as { message: Record<string, unknown>; attachments: SourceAttachment[] };
      const messageType = String(payload.message.message_type ?? "");
      if (messageType === "text") {
        const result = await userClient.rpc("forward_text_message", { source_message_id: sourceMessageId, target_conversation_id: conversationId });
        if (result.error || !result.data) throw new Error(`forward:${result.error?.code ?? "missing"}`);
        return jsonResponse(200, { sent: true, messageIds: [Array.isArray(result.data) ? result.data[0]?.id : (result.data as Record<string, unknown>).id] });
      }
      const source = payload.attachments ?? [];
      const dimensions = Object.fromEntries(source.filter((item) => item.width && item.height).map((item) => [item.id, { width: item.width as number, height: item.height as number }]));
      const records = buildDeliveryRecords(actorId, conversationId, "", source, dimensions);
      // Forwarding preserves an image/file caption inside the same ordinary message.
      if (records.length === 1 && (messageType === "image" || messageType === "file")) records[0].body = String(payload.message.body ?? "").trim();
      const copied = await prepareImmediateObjects(admin, messageMediaBucket, source, records);
      const finalized = await admin.rpc("finalize_multimedia_delivery", { target_actor_id: actorId, target_conversation_id: conversationId, source_kind: "forward", source_id: sourceMessageId, source_attachment_ids: source.map((item) => item.id), delivery_records: records });
      if (finalized.error || !finalized.data) { await removeObjects(admin, messageMediaBucket, copied); throw new Error(`finalize:${finalized.error?.code ?? "missing"}`); }
      return jsonResponse(200, { sent: true, ...(finalized.data as Record<string, unknown>) });
    }

    if (action === "note_send" || action === "note_schedule") {
      const noteId = typeof body.noteId === "string" ? body.noteId : "";
      const content = typeof body.body === "string" ? body.body.trim() : "";
      const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter((value): value is string => typeof value === "string") : [];
      if (!noteId || !conversationId || content.length > 2000 || (!content && !attachmentIds.length)) return jsonResponse(400, { error: "Choose valid Note content and a destination." });
      const authorizationResult = await admin.rpc("authorize_note_media_delivery", { target_actor_id: actorId, target_note_id: noteId, target_conversation_id: conversationId, target_attachment_ids: attachmentIds });
      if (authorizationResult.error || !authorizationResult.data) throw new Error(`authorize:${authorizationResult.error?.code ?? "missing"}`);
      const source = ((authorizationResult.data as Record<string, unknown>).attachments ?? []) as SourceAttachment[];
      const records = buildDeliveryRecords(actorId, conversationId, content, source, dimensionsValue(body.imageDimensions));

      if (action === "note_send") {
        const copied = await prepareImmediateObjects(admin, notesBucket, source, records);
        const finalized = await admin.rpc("finalize_multimedia_delivery", { target_actor_id: actorId, target_conversation_id: conversationId, source_kind: "note", source_id: noteId, source_attachment_ids: attachmentIds, delivery_records: records });
        if (finalized.error || !finalized.data) { await removeObjects(admin, messageMediaBucket, copied); throw new Error(`finalize:${finalized.error?.code ?? "missing"}`); }
        return jsonResponse(200, { sent: true, ...(finalized.data as Record<string, unknown>) });
      }

      const scheduledFor = typeof body.scheduledFor === "string" ? body.scheduledFor : "";
      if (!scheduledFor) return jsonResponse(400, { error: "Choose a valid delivery time." });
      const scheduleId = crypto.randomUUID();
      const textRecord = records.find((record) => record.message_type === "text");
      const sourceById = new Map(source.map((item) => [item.id, item]));
      const sourceByKind = new Map<string, SourceAttachment[]>();
      const sourceCursor = new Map<string, number>();
      for (const item of source) {
        const kind = item.attachment_type ?? item.attachment_kind ?? "";
        sourceByKind.set(kind, [...(sourceByKind.get(kind) ?? []), item]);
      }
      const scheduleRecords: Array<Record<string, unknown>> = [];
      const copied: string[] = [];
      let sourceOrdinal = 0;
      for (const record of records.filter((item) => item.message_type !== "text")) {
        const sources = sourceByKind.get(record.message_type) ?? [];
        for (let index = 0; index < record.attachments.length; index += 1) {
          const cursor = sourceCursor.get(record.message_type) ?? 0;
          const sourceItem = sources[cursor];
          const destination = record.attachments[index];
          if (!sourceItem || !sourceById.has(sourceItem.id)) throw new Error("attachment-map");
          const snapshotId = destination.id;
          const scheduledPath = `${actorId}/${scheduleId}/${snapshotId}.${sourceItem.storage_path.split(".").at(-1)}`;
          try {
            await transferObject(admin, notesBucket, sourceItem.storage_path, scheduledMediaBucket, scheduledPath, destination.mime_type);
          } catch (error) {
            await removeObjects(admin, scheduledMediaBucket, copied);
            throw error;
          }
          copied.push(scheduledPath);
          scheduleRecords.push({
            id: snapshotId,
            source_note_attachment_id: sourceItem.id,
            attachment_type: record.message_type,
            storage_path: scheduledPath,
            destination_storage_path: destination.storage_path,
            mime_type: destination.mime_type,
            file_name: destination.original_name,
            file_size: destination.size_bytes,
            width: destination.width,
            height: destination.height,
            duration_ms: destination.duration_ms,
            ordinal: sourceOrdinal++,
            delivery_message_id: record.message_id,
            message_ordinal: record.ordinal,
            delivery_position: destination.position,
          });
          sourceCursor.set(record.message_type, cursor + 1);
        }
      }
      const created = await admin.rpc("create_multimedia_schedule", { target_actor_id: actorId, target_scheduled_message_id: scheduleId, target_note_id: noteId, target_conversation_id: conversationId, content_snapshot: content, scheduled_for: scheduledFor, target_text_message_id: textRecord?.message_id ?? null, attachment_records: scheduleRecords });
      if (created.error || !created.data) { await removeObjects(admin, scheduledMediaBucket, copied); throw new Error(`schedule:${created.error?.code ?? "missing"}`); }
      return jsonResponse(200, { scheduled: true, schedule: Array.isArray(created.data) ? created.data[0] : created.data });
    }

    if (action === "cancel_schedule" || action === "send_schedule_now") {
      const scheduleId = typeof body.scheduledMessageId === "string" ? body.scheduledMessageId : "";
      if (!scheduleId) return jsonResponse(400, { error: "A scheduled message is required." });
      const owned = await userClient.from("scheduled_messages").select("id, status, has_attachments").eq("id", scheduleId).eq("sender_id", actorId).maybeSingle();
      if (owned.error || !owned.data) return jsonResponse(404, { error: "This scheduled message is no longer available." });
      if (!owned.data.has_attachments) return jsonResponse(409, { error: "This action belongs to the standard text scheduler." });

      if (action === "send_schedule_now") {
        const results = await processScheduledMedia(admin, scheduleId, true);
        const latest = results[0] ?? (await userClient.from("scheduled_messages").select("*").eq("id", scheduleId).single()).data;
        return jsonResponse(200, { schedule: latest });
      }

      const cancelled = await userClient.rpc("cancel_scheduled_message", { target_scheduled_message_id: scheduleId });
      if (cancelled.error || !cancelled.data) throw new Error(`cancel:${cancelled.error?.code ?? "missing"}`);
      const snapshotRows = await admin.from("scheduled_message_attachments").select("storage_path").eq("scheduled_message_id", scheduleId);
      if (snapshotRows.error) throw new Error(`cleanup-query:${snapshotRows.error.code ?? "unknown"}`);
      const removal = await removeObjects(admin, scheduledMediaBucket, (snapshotRows.data ?? []).map((item) => item.storage_path));
      if (removal) return jsonResponse(500, { error: "The message was cancelled, but secure media cleanup needs another attempt.", retryable: true });
      await admin.rpc("purge_scheduled_message_attachments", { target_scheduled_message_id: scheduleId });
      return jsonResponse(200, { schedule: Array.isArray(cancelled.data) ? cancelled.data[0] : cancelled.data });
    }
    return jsonResponse(400, { error: "Unsupported delivery action." });
  } catch (error) {
    const normalized = normalizeError(error);
    console.error("message-media-delivery failed", { actorId, action, phase: error instanceof Error ? error.message.split(":", 1)[0] : "unknown" });
    return jsonResponse(normalized.status, { error: normalized.error });
  }
}

Deno.serve((request) => handleRequest(request).catch((error: unknown) => {
  console.error("message-media-delivery request failed unexpectedly", { error: error instanceof Error ? error.name : "unknown" });
  return jsonResponse(500, { error: "Nemissive couldn't process this multimedia delivery. Please try again." });
}));
