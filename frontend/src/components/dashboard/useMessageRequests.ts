import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult, RespondToConversationRequestResult, SelectedConversation } from "../../types/conversations";

export type ConversationRequestItem = {
  id: string;
  sender_id: string;
  introduction: string;
  created_at: string;
  senderProfile: ProfileSearchResult;
};

export type RequestUpdateItem = {
  id: string;
  recipient_id: string;
  status: "accepted" | "declined";
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  recipientProfile: ProfileSearchResult;
};

export type RequestAction = "accept" | "decline";

type ConversationRequestRow = Omit<ConversationRequestItem, "senderProfile">;
type RequestUpdateRow = Omit<RequestUpdateItem, "recipientProfile">;

type UseMessageRequestsOptions = {
  currentUserId: string | null;
  isAccountResolved: boolean;
  onConversationReady: (conversation: SelectedConversation) => void;
  onRequestsChanged: (action: RequestAction) => void;
};

function useMessageRequests({ currentUserId, isAccountResolved, onConversationReady, onRequestsChanged }: UseMessageRequestsOptions) {
  const latestLoadRef = useRef(0);
  const respondingRef = useRef<string | null>(null);
  const dismissingUpdateRef = useRef<string | null>(null);
  const [requests, setRequests] = useState<ConversationRequestItem[]>([]);
  const [updates, setUpdates] = useState<RequestUpdateItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [responseError, setResponseError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [respondingAction, setRespondingAction] = useState<RequestAction | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;

    const loadId = ++latestLoadRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadRequests() {
      const [incomingResult, updatesResult] = await Promise.all([
        supabase.from("conversation_requests").select("id, sender_id, introduction, created_at", { count: "exact" }).eq("recipient_id", currentUserId).eq("status", "pending").order("created_at", { ascending: false }).abortSignal(abortController.signal),
        supabase.rpc("list_request_updates").abortSignal(abortController.signal),
      ]);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      if (incomingResult.error || updatesResult.error) {
        setIsLoading(false);
        setLoadError("We couldn’t load conversation requests and updates. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation requests failed", { incomingError: incomingResult.error, updatesError: updatesResult.error });
        return;
      }

      const requestRows = (incomingResult.data ?? []) as ConversationRequestRow[];
      const updateRows = (updatesResult.data ?? []) as RequestUpdateRow[];
      const profileIds = [...new Set([...requestRows.map((request) => request.sender_id), ...updateRows.map((update) => update.recipient_id)])];
      let profiles: ProfileSearchResult[] = [];

      if (profileIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url, profile_banner, account_status, deleted_at").in("id", profileIds).abortSignal(abortController.signal);

        if (isCancelled || loadId !== latestLoadRef.current) return;

        if (profileError) {
          setIsLoading(false);
          setLoadError("We couldn’t load the people attached to these requests and updates. Please retry.");
          if (import.meta.env.DEV) console.error("Loading request profiles failed", profileError);
          return;
        }

        profiles = (profileData ?? []) as ProfileSearchResult[];
      }

      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
      const fallbackProfile = (id: string): ProfileSearchResult => ({ id, username: null, display_name: null, avatar_url: null });
      const nextRequests = requestRows.map((request) => ({
        ...request,
        senderProfile: profilesById.get(request.sender_id) ?? fallbackProfile(request.sender_id),
      }));
      const nextUpdates = updateRows.map((update): RequestUpdateItem => ({
        ...update,
        recipientProfile: profilesById.get(update.recipient_id) ?? fallbackProfile(update.recipient_id),
      }));

      setRequests(nextRequests);
      setUpdates(nextUpdates);
      setPendingCount(incomingResult.count ?? nextRequests.length);
      setIsLoading(false);
      setLoadError("");
    }

    void loadRequests();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [currentUserId, loadKey]);

  const refresh = useCallback(() => {
    latestLoadRef.current += 1;
    setIsLoading(true);
    setResponseError("");
    setStatusMessage("");
    setLoadKey((key) => key + 1);
  }, []);

  const refreshSilently = useCallback(() => {
    latestLoadRef.current += 1;
    setLoadKey((key) => key + 1);
  }, []);

  const respond = useCallback(async (request: ConversationRequestItem, action: RequestAction) => {
    if (respondingRef.current) return;

    respondingRef.current = request.id;
    setRespondingRequestId(request.id);
    setRespondingAction(action);
    setResponseError("");
    setStatusMessage("");

    const { data, error } = await supabase.rpc("respond_to_conversation_request", { request_id: request.id, response_action: action });

    respondingRef.current = null;
    setRespondingRequestId(null);
    setRespondingAction(null);

    if (error) {
      setResponseError(`We couldn’t ${action} this request. It may have already been handled.`);
      if (import.meta.env.DEV) console.error("respond_to_conversation_request failed", { action, requestId: request.id, error });
      return;
    }

    const result = data as unknown as RespondToConversationRequestResult | null;

    if (!result || result.request_status !== (action === "accept" ? "accepted" : "declined")) {
      setResponseError("We couldn’t confirm that response. Refresh and try again.");
      return;
    }

    if (action === "accept" && !result.conversation_id) {
      setResponseError("The request was accepted, but the conversation could not be opened. Refresh and try again.");
      return;
    }

    setRequests((currentRequests) => currentRequests.filter((item) => item.id !== request.id));
    setPendingCount((currentCount) => Math.max(0, currentCount - 1));
    onRequestsChanged(action);

    if (action === "decline") {
      setStatusMessage("Request declined.");
      return;
    }

    onConversationReady({
      id: result.conversation_id as string,
      otherProfile: request.senderProfile,
      connectionStatus: "accepted",
      interactionAllowed: true,
      messagingAvailable: true,
      ...(result.reconnected ? {} : { introductoryMessage: request.introduction, introductoryMessageCreatedAt: request.created_at }),
    });
  }, [onConversationReady, onRequestsChanged]);

  const dismissUpdate = useCallback(async (requestId: string) => {
    if (dismissingUpdateRef.current) return "Another request update is already being deleted.";

    dismissingUpdateRef.current = requestId;
    const { error } = await supabase.rpc("dismiss_request_update", { target_request_id: requestId });
    dismissingUpdateRef.current = null;

    if (error) {
      if (import.meta.env.DEV) console.error("dismiss_request_update failed", { requestId, error });
      return "We couldnâ€™t delete this request update. Please try again.";
    }

    setUpdates((currentUpdates) => currentUpdates.filter((update) => update.id !== requestId));
    return null;
  }, []);

  const dismissAllUpdates = useCallback(async () => {
    if (dismissingUpdateRef.current) return "Another request update is already being deleted.";

    dismissingUpdateRef.current = "all";
    const { error } = await supabase.rpc("dismiss_all_request_updates");
    dismissingUpdateRef.current = null;

    if (error) {
      if (import.meta.env.DEV) console.error("dismiss_all_request_updates failed", error);
      return "We couldnâ€™t clear request updates. Please try again.";
    }

    setUpdates([]);
    return null;
  }, []);

  const patchProfileIdentity = useCallback((identity: Pick<ProfileSearchResult, "id" | "username" | "display_name" | "avatar_url" | "profile_banner">) => {
    setRequests((currentRequests) => currentRequests.map((request) => request.senderProfile.id === identity.id ? { ...request, senderProfile: { ...request.senderProfile, ...identity } } : request));
    setUpdates((currentUpdates) => currentUpdates.map((update) => update.recipientProfile.id === identity.id ? { ...update, recipientProfile: { ...update.recipientProfile, ...identity } } : update));
  }, []);

  return {
    requests: currentUserId ? requests : [],
    updates: currentUserId ? updates : [],
    pendingCount: currentUserId ? pendingCount : 0,
    isLoading: currentUserId ? isLoading : !isAccountResolved,
    loadError: currentUserId ? loadError : isAccountResolved ? "Your session has expired. Please sign in again." : "",
    responseError,
    statusMessage,
    respondingRequestId,
    respondingAction,
    refresh,
    refreshSilently,
    respond,
    dismissUpdate,
    dismissAllUpdates,
    patchProfileIdentity,
  };
}

export type MessageRequestsController = ReturnType<typeof useMessageRequests>;

export default useMessageRequests;
