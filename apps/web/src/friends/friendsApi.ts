import { request } from "@/account/client";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { FriendRequest } from "@aegis/shared/friends/FriendRequest";

export const friendsApi = {
  list: () => request<{ friends: Friend[] }>("/friends"),
  requests: () => request<{ requests: FriendRequest[] }>("/friends/requests"),
  blocks: () => request<{ blocks: Friend[] }>("/account/blocks"),
  add: (target: { displayName: string } | { matchId: string }) =>
    request<{ accepted: boolean }>("/friends/requests", { method: "POST", body: JSON.stringify(target) }),
  accept: (id: string) => request(`/friends/requests/${encodeURIComponent(id)}/accept`, { method: "POST" }),
  decline: (id: string) => request(`/friends/requests/${encodeURIComponent(id)}/decline`, { method: "POST" }),
  cancel: (id: string) => request(`/friends/requests/${encodeURIComponent(id)}`, { method: "DELETE" }),
  remove: (id: string) => request(`/friends/${encodeURIComponent(id)}`, { method: "DELETE" }),
  block: (id: string) => request(`/account/blocks/${encodeURIComponent(id)}`, { method: "PUT" }),
  unblock: (id: string) => request(`/account/blocks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  blockOpponent: (roomId: string) =>
    request("/account/blocks/opponent", { method: "POST", body: JSON.stringify({ roomId }) }),
};
