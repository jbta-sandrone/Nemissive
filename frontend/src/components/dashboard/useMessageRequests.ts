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

export type RequestAction = "accept" | "decline";

type ConversationRequestRow = Omit<ConversationRequestItem, "senderProfile">;

type UseMessageRequestsOptions = {
  currentUserId: string | null;
  isAccountResolved: boolean;
  onConversationReady: (conversation: SelectedConversation) => void;
};

const requestLimit = 50;

function useMessageRequests({ currentUserId, isAccountResolved, onConversationReady }: UseMessageRequestsOptions) {
  const latestLoadRef = useRef(0);
  const respondingRef = useRef<string | null>(null);
  const [requests, setRequests] = useState<ConversationRequestItem[]>([]);
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
      setIsLoading(true);
      setLoadError("");

      const { data: requestData, error: requestError, count } = await supabase.from("conversation_requests").select("id, sender_id, introduction, created_at", { count: "exact" }).eq("recipient_id", currentUserId).eq("status", "pending").order("created_at", { ascending: false }).limit(requestLimit).abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      if (requestError) {
        setIsLoading(false);
        setLoadError("We couldn’t load message requests. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation requests failed", requestError);
        return;
      }

      const requestRows = (requestData ?? []) as ConversationRequestRow[];
      const senderIds = [...new Set(requestRows.map((request) => request.sender_id))];
      let senderProfiles: ProfileSearchResult[] = [];

      if (senderIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds).abortSignal(abortController.signal);

        if (isCancelled || loadId !== latestLoadRef.current) return;

        if (profileError) {
          setIsLoading(false);
          setLoadError("We couldn’t load the people attached to these requests. Please retry.");
          if (import.meta.env.DEV) console.error("Loading request sender profiles failed", profileError);
          return;
        }

        senderProfiles = (profileData ?? []) as ProfileSearchResult[];
      }

      const profilesById = new Map(senderProfiles.map((profile) => [profile.id, profile]));
      const nextRequests = requestRows.map((request) => ({
        ...request,
        senderProfile: profilesById.get(request.sender_id) ?? { id: request.sender_id, username: null, display_name: null, avatar_url: null },
      }));

      setRequests(nextRequests);
      setPendingCount(count ?? nextRequests.length);
      setIsLoading(false);
      setLoadError("");
    }

    void loadRequests();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [currentUserId, isAccountResolved, loadKey]);

  const refresh = useCallback(() => {
    latestLoadRef.current += 1;
    setResponseError("");
    setStatusMessage("");
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

    if (action === "decline") {
      setStatusMessage("Request declined.");
      return;
    }

    onConversationReady({ id: result.conversation_id as string, otherProfile: request.senderProfile, introductoryMessage: request.introduction, introductoryMessageCreatedAt: request.created_at });
  }, [onConversationReady]);

  return {
    requests: currentUserId ? requests : [],
    pendingCount: currentUserId ? pendingCount : 0,
    isLoading: currentUserId ? isLoading : !isAccountResolved,
    loadError: currentUserId ? loadError : isAccountResolved ? "Your session has expired. Please sign in again." : "",
    responseError,
    statusMessage,
    respondingRequestId,
    respondingAction,
    refresh,
    respond,
  };
}

export type MessageRequestsController = ReturnType<typeof useMessageRequests>;

export default useMessageRequests;
