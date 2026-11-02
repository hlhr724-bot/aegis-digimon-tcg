import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { TournamentReportButton } from "@/tournaments/TournamentReportButton";

const TOURNAMENT_ID = "e9db0e41-aff5-495c-a971-45f61e84546e";

type RenderParams = { accountId: string | undefined };

function mockReport(status: number, body: unknown = { reported: true }) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderButton({ accountId }: RenderParams) {
  render(
    <I18nProvider>
      <TournamentReportButton
        tournamentId={TOURNAMENT_ID}
        tournamentName="Rude event"
        organizerId="organizer"
        accountId={accountId}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("reporting a tournament", () => {
  it("is hidden from guests and from the organizer", () => {
    renderButton({ accountId: undefined });
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    cleanup();
    renderButton({ accountId: "organizer" });
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("sends the chosen reason and details, then shows the event as reported", async () => {
    const fetchMock = mockReport(201);
    renderButton({ accountId: "player" });
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("radio", { name: "Fake or misleading event" }));
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "No prizes exist" } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Reported");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(`/tournaments/${TOURNAMENT_ID}/reports`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ reason: "fake_event", details: "No prizes exist" });
  });

  it("explains a refusal and keeps the dialog open", async () => {
    mockReport(429, { error: "too_many_requests" });
    renderButton({ accountId: "player" });
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "You sent several reports in a short time. Wait a minute and try again.",
      ),
    );
    expect(screen.getByRole("button", { name: "Send report" })).toBeTruthy();
  });
});
