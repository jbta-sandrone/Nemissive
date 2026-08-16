import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

type RetainedAttachment = {
  attachment_id: string;
  bucket_id: string;
  source_path: string;
  destination_path: string;
};

type RemovableObject = {
  bucket_id: string;
  path: string;
};

type StorageManifest = {
  account_status: "deleting" | "deleted";
  retained_attachments: RetainedAttachment[];
  removable_objects: RemovableObject[];
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isStorageManifest(value: unknown): value is StorageManifest {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.account_status !== "deleting" && row.account_status !== "deleted") return false;
  if (!Array.isArray(row.retained_attachments) || !Array.isArray(row.removable_objects)) return false;
  return row.retained_attachments.every((item) => {
    if (!item || typeof item !== "object") return false;
    const attachment = item as Record<string, unknown>;
    return typeof attachment.attachment_id === "string"
      && typeof attachment.bucket_id === "string"
      && typeof attachment.source_path === "string"
      && typeof attachment.destination_path === "string";
  }) && row.removable_objects.every((item) => {
    if (!item || typeof item !== "object") return false;
    const object = item as Record<string, unknown>;
    return typeof object.bucket_id === "string" && typeof object.path === "string";
  });
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function readDefaultNamedKey(variableName: string) {
  const serializedKeys = Deno.env.get(variableName);
  if (!serializedKeys) return "";
  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    return typeof keys.default === "string" ? keys.default : "";
  } catch {
    return "";
  }
}

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readDefaultNamedKey("SUPABASE_PUBLISHABLE_KEYS")
    || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    || Deno.env.get("SUPABASE_ANON_KEY")
    || "";
  const secretKey = readDefaultNamedKey("SUPABASE_SECRET_KEYS")
    || Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!projectUrl || !publishableKey || !secretKey) {
    console.error("delete-account is missing required Supabase server environment variables");
    return jsonResponse(500, { error: "Account deletion is not configured." });
  }
  if (!accessToken) return jsonResponse(401, { error: "Authentication required." });

  const userClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser(accessToken);
  const user = userResult.user;
  if (userError || !user) return jsonResponse(401, { error: "Your session has expired. Sign in and try again." });

  let requestBody: { current_password?: unknown };
  try {
    requestBody = await request.json() as { current_password?: unknown };
  } catch {
    return jsonResponse(400, { error: "Your current password is required." });
  }

  const identityProviders = (user.identities ?? []).map((identity) => identity.provider);
  const configuredProviders = Array.isArray(user.app_metadata.providers)
    ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string")
    : [];
  const providers = new Set([
    ...identityProviders,
    ...configuredProviders,
    typeof user.app_metadata.provider === "string" ? user.app_metadata.provider : "",
  ].filter(Boolean));
  if (!providers.has("email")) {
    return jsonResponse(409, { error: "Account deletion for provider-only sign-in is not available yet." });
  }
  if (!user.email || typeof requestBody.current_password !== "string" || requestBody.current_password.length === 0) {
    return jsonResponse(400, { error: "Your current password is required." });
  }

  // This server-side Auth call is the authoritative recent-password proof.
  // The credential is used only for this request and is never logged or stored.
  const reauthenticationClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reauthenticated, error: reauthenticationError } = await reauthenticationClient.auth.signInWithPassword({
    email: user.email,
    password: requestBody.current_password,
  });
  if (reauthenticationError || reauthenticated.user?.id !== user.id) {
    return jsonResponse(401, { error: "Current password is incorrect." });
  }

  try {
    const { error: beginError } = await adminClient.rpc("begin_account_deletion", { target_account_id: user.id });
    if (beginError) throw new Error(`begin:${beginError.code ?? "unknown"}`);

    const { data: manifestData, error: manifestError } = await adminClient.rpc("get_account_deletion_storage_manifest", { target_account_id: user.id });
    if (manifestError || !isStorageManifest(manifestData)) throw new Error(`manifest:${manifestError?.code ?? "invalid"}`);

    for (const attachment of manifestData.retained_attachments) {
      if (attachment.source_path === attachment.destination_path) continue;

      // A previous interrupted attempt may have copied but not retargeted this object.
      await adminClient.storage.from(attachment.bucket_id).remove([attachment.destination_path]);

      const { error: copyError } = await adminClient.storage
        .from(attachment.bucket_id)
        .copy(attachment.source_path, attachment.destination_path);
      if (copyError) throw new Error(`copy:${copyError.message}`);

      const { error: retargetError } = await adminClient.rpc("retarget_account_message_attachment", {
        target_account_id: user.id,
        target_attachment_id: attachment.attachment_id,
        expected_source_path: attachment.source_path,
        retained_storage_path: attachment.destination_path,
      });
      if (retargetError) {
        await adminClient.storage.from(attachment.bucket_id).remove([attachment.destination_path]);
        throw new Error(`retarget:${retargetError.code ?? "unknown"}`);
      }

      const { error: sourceRemovalError } = await adminClient.storage
        .from(attachment.bucket_id)
        .remove([attachment.source_path]);
      if (sourceRemovalError) throw new Error(`remove-source:${sourceRemovalError.message}`);
    }

    const removableByBucket = new Map<string, string[]>();
    for (const object of manifestData.removable_objects) {
      removableByBucket.set(object.bucket_id, [...(removableByBucket.get(object.bucket_id) ?? []), object.path]);
    }
    for (const [bucketId, paths] of removableByBucket) {
      for (const pathBatch of chunks(paths, 1000)) {
        const { error: removalError } = await adminClient.storage.from(bucketId).remove(pathBatch);
        if (removalError) throw new Error(`remove-owned:${removalError.message}`);
      }
    }

    const { error: prepareError } = await adminClient.rpc("prepare_account_deletion", { target_account_id: user.id });
    if (prepareError) throw new Error(`prepare:${prepareError.code ?? "unknown"}`);

    const { error: authDeletionError } = await adminClient.auth.admin.deleteUser(user.id, false);
    if (authDeletionError) throw new Error(`auth-delete:${authDeletionError.code ?? "unknown"}`);

    const { error: completionError } = await adminClient.rpc("complete_account_deletion", { target_account_id: user.id });
    if (completionError) {
      // The credential is already gone and the sanitized, non-active tombstone
      // is safe. Keep the user-facing result accurate while logging the marker
      // failure for administrative cleanup.
      console.error("delete-account completion marker failed", { accountId: user.id, phase: "complete" });
      return jsonResponse(200, { deleted: true, cleanup_pending: true });
    }

    return jsonResponse(200, { deleted: true });
  } catch (error) {
    const phase = error instanceof Error ? error.message.split(":", 1)[0] : "unknown";
    console.error("delete-account orchestration failed", { accountId: user.id, phase });
    return jsonResponse(500, {
      error: "We couldn't finish deleting your account. Your account is locked from new activity; please retry deletion.",
      retryable: true,
    });
  }
}

Deno.serve((request: Request) => handleRequest(request).catch((error: unknown) => {
  console.error("delete-account request failed unexpectedly", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return jsonResponse(500, {
    error: "We couldn't process your account deletion request. Please try again.",
    retryable: true,
  });
}));
