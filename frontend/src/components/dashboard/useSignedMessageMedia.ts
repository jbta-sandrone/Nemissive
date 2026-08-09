import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const signedUrlLifetimeSeconds = 120;
const signedUrlRefreshMs = 90 * 1000;

export async function createSignedMessageAttachmentUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("message-media").createSignedUrl(storagePath, signedUrlLifetimeSeconds);
  if (error || !data?.signedUrl) throw error ?? new Error("Unable to create a signed attachment URL.");
  return data.signedUrl;
}

type SignedMediaState = {
  urls: Map<string, string>;
  failedPaths: Set<string>;
  isLoading: boolean;
};

function useSignedMessageMedia(storagePaths: string[]) {
  const pathKey = [...new Set(storagePaths)].sort().join("\u0000");
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<SignedMediaState>(() => ({ urls: new Map(), failedPaths: new Set(), isLoading: false }));

  useEffect(() => {
    const paths = pathKey ? pathKey.split("\u0000") : [];
    if (paths.length === 0) {
      const clearTimer = window.setTimeout(() => setState({ urls: new Map(), failedPaths: new Set(), isLoading: false }), 0);
      return () => window.clearTimeout(clearTimer);
    }

    let isCancelled = false;
    let refreshTimer: ReturnType<typeof window.setTimeout> | null = null;

    async function loadSignedUrls() {
      setState((current) => ({ ...current, isLoading: true }));
      const urls = new Map<string, string>();
      const failedPaths = new Set<string>();
      for (let index = 0; index < paths.length; index += 100) {
        const pathBatch = paths.slice(index, index + 100);
        const { data, error } = await supabase.storage.from("message-media").createSignedUrls(pathBatch, signedUrlLifetimeSeconds);
        if (isCancelled) return;
        if (error) {
          pathBatch.forEach((path) => failedPaths.add(path));
          if (import.meta.env.DEV) console.warn("Creating signed message-media URLs failed", { count: pathBatch.length, code: error.message });
          continue;
        }
        (data ?? []).forEach((result) => {
          if (!result.path) return;
          if (result.signedUrl) urls.set(result.path, result.signedUrl);
          else failedPaths.add(result.path);
        });
      }
      setState({ urls, failedPaths, isLoading: false });

      refreshTimer = window.setTimeout(() => {
        if (!isCancelled) void loadSignedUrls();
      }, signedUrlRefreshMs);
    }

    void loadSignedUrls();

    return () => {
      isCancelled = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [pathKey, refreshKey]);

  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);
  return { ...state, retry };
}

export default useSignedMessageMedia;
