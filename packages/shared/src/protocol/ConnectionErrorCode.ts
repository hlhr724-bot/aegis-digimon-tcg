import {
  GUEST_DECLINED_CLOSE_CODE,
  HOST_LEFT_CLOSE_CODE,
  MATCH_EXPIRED_CLOSE_CODE,
  MESSAGE_FLOOD_CLOSE_CODE,
} from "#shared/protocol/closeCodes";
import { SEAT_TRANSFERRED_CLOSE_CODE } from "#shared/protocol/seatTransferredCloseCode";

export const ConnectionErrorCode = {
  MESSAGE_TOO_LARGE: { name: "MESSAGE_TOO_LARGE", value: "AEGIS_MESSAGE_TOO_LARGE", codes: [1009, 413] },
  CONNECTION_LOST: { name: "CONNECTION_LOST", value: "AEGIS_CONNECTION_LOST", codes: [1006] },
  RECONNECT_FAILED: { name: "RECONNECT_FAILED", value: "AEGIS_RECONNECT_FAILED", codes: [] },
  SEAT_TRANSFERRED: {
    name: "SEAT_TRANSFERRED",
    value: "AEGIS_SEAT_TRANSFERRED",
    codes: [SEAT_TRANSFERRED_CLOSE_CODE],
  },
  SESSION_EXPIRED: {
    name: "SESSION_EXPIRED",
    value: "AEGIS_SESSION_EXPIRED",
    codes: [MATCH_EXPIRED_CLOSE_CODE, 410, 522, 524, 4212, 4214],
  },
  TOO_MANY_MESSAGES: {
    name: "TOO_MANY_MESSAGES",
    value: "AEGIS_TOO_MANY_MESSAGES",
    codes: [MESSAGE_FLOOD_CLOSE_CODE, 429],
  },
  SERVER_UNAVAILABLE: {
    name: "SERVER_UNAVAILABLE",
    value: "AEGIS_SERVER_UNAVAILABLE",
    codes: [1011, 1013, 502, 503, 504, "AEGIS_GATEWAY_UNAVAILABLE", "AEGIS_DEPLOYMENT_DRAINING"],
  },
  GUEST_DECLINED: { name: "GUEST_DECLINED", value: "AEGIS_GUEST_DECLINED", codes: [GUEST_DECLINED_CLOSE_CODE] },
  HOST_LEFT: { name: "HOST_LEFT", value: "AEGIS_HOST_LEFT", codes: [HOST_LEFT_CLOSE_CODE] },
} as const;

export type ConnectionErrorCode = (typeof ConnectionErrorCode)[keyof typeof ConnectionErrorCode]["value"];
