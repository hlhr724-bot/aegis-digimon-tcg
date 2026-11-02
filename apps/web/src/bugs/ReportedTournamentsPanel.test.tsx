import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TournamentReport } from "@aegis/shared/tournaments/TournamentReport";
import { AccountApiError } from "@/account/client";
import { ReportedTournamentsPanel } from "@/bugs/ReportedTournamentsPanel";
import { I18nProvider } from "@/i18n/I18nProvider";
import { tournamentReportApi } from "@/tournaments/tournamentReportApi";

function buildReport(overrides: Partial<TournamentReport>): TournamentReport {
  return {
    id: 1,
    tournamentId: "event-1",
    tournamentName: "Rude event",
    organizerName: "Organizer",
    canDeleteTournament: true,
    reason: "offensive_content",
    details: null,
    reporterName: "Player",
    createdAt: Date.UTC(2026, 9, 1),
    openReportsForTournament: 2,
    ...overrides,
  };
}

function renderPanel() {
  render(
    <I18nProvider>
      <ReportedTournamentsPanel />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the reported tournaments panel", () => {
  it("groups open reports by tournament and dismisses them together", async () => {
    vi.spyOn(tournamentReportApi, "listOpen").mockResolvedValue([
      buildReport({ id: 2, details: "Slur in the title" }),
      buildReport({ id: 1, reason: "organizer_abuse", reporterName: null }),
    ]);
    const resolve = vi.spyOn(tournamentReportApi, "resolve").mockResolvedValue({ resolved: 2 });
    renderPanel();

    expect(await screen.findByText("Reported tournaments (1)")).toBeTruthy();
    expect(screen.getByText("Slur in the title")).toBeTruthy();
    expect(screen.getByText("Organizer abuse")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reports" }));

    await waitFor(() => expect(screen.queryByText("Rude event")).toBeNull());
    expect(resolve).toHaveBeenCalledWith(2, "dismiss");
  });

  it("asks for confirmation before deleting the event", async () => {
    vi.spyOn(tournamentReportApi, "listOpen").mockResolvedValue([buildReport({})]);
    const resolve = vi.spyOn(tournamentReportApi, "resolve").mockResolvedValue({ resolved: 1 });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Delete event" }));
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith(1, "delete_tournament"));
  });

  it("offers only dismissal for a started event and explains a refused deletion", async () => {
    vi.spyOn(tournamentReportApi, "listOpen").mockResolvedValue([
      buildReport({ id: 1 }),
      buildReport({ id: 5, tournamentId: "event-2", tournamentName: "Running event", canDeleteTournament: false }),
    ]);
    vi.spyOn(tournamentReportApi, "resolve").mockRejectedValue(new AccountApiError(409, "tournament_already_started"));
    renderPanel();

    expect(await screen.findByText("Reported tournaments (2)")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Delete event" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "This event has started, so it cannot be deleted. Dismiss the reports or manage the event from its page.",
    );
  });
});
