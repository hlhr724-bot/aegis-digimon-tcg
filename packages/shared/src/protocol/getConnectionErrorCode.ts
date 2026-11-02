import { ConnectionErrorCode } from "#shared/protocol/ConnectionErrorCode";

type Params = {
  code: unknown;
};

export function getConnectionErrorCode({ code }: Params): ConnectionErrorCode | undefined {
  return Object.values(ConnectionErrorCode).find(
    (entry) => entry.value === code || entry.codes.some((candidate) => candidate === code),
  )?.value;
}
