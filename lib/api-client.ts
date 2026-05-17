"use client";

import { supabase } from "./supabase";

const pendingRequests = new Set<number>();
let requestSequence = 0;

function requestLabel(input: RequestInfo | URL, init: RequestInit) {
  const method = String(init.method || "GET").toUpperCase();
  if (method === "GET") return "Loading data from server";
  if (method === "POST") return "Writing data to server";
  if (method === "PATCH" || method === "PUT") return "Saving changes";
  if (method === "DELETE") return "Deleting data";
  return "Contacting server";
}

function emitNetworkState(label: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("sunbase:network", {
      detail: {
        pending: pendingRequests.size,
        label,
      },
    }),
  );
}

export async function getAuthHeaders(existingHeaders?: HeadersInit) {
  const headers = new Headers(existingHeaders);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const requestId = requestSequence += 1;
  const label = requestLabel(input, init);
  pendingRequests.add(requestId);
  emitNetworkState(label);

  const headers = await getAuthHeaders(init.headers);

  try {
    return await fetch(input, {
      ...init,
      headers,
    });
  } finally {
    pendingRequests.delete(requestId);
    emitNetworkState(pendingRequests.size ? "Still working with server" : "");
  }
}
