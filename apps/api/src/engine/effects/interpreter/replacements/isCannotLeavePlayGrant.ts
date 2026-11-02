export function isCannotLeavePlayGrant(grant: unknown): boolean {
  return (
    typeof grant === "object" && grant !== null && (grant as { cannotLeavePlay?: boolean }).cannotLeavePlay === true
  );
}
