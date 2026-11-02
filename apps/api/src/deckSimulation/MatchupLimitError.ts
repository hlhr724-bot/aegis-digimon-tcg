export class MatchupLimitError extends Error {
  readonly code: "job_in_progress" | "queue_full";

  constructor(code: "job_in_progress" | "queue_full") {
    super(code);
    this.code = code;
  }
}
