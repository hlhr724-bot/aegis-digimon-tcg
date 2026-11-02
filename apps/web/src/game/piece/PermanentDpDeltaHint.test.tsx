import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PermanentDpDeltaHint } from "@/game/piece/PermanentDpDeltaHint";

afterEach(cleanup);

it.each([
  [2000, "raised", "+2K"],
  [-2000, "lowered", "−2K"],
])("explains a DP change of %s against the printed value", (delta, direction, label) => {
  render(
    <I18nProvider>
      <PermanentDpDeltaHint delta={Number(delta)} baseDp={5000}>
        <span>{label}</span>
      </PermanentDpDeltaHint>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTitle(`DP ${label}`));
  expect(screen.getByRole("tooltip").textContent).toContain(`Printed 5,000 DP, ${direction} by 2,000 by effects.`);
});
