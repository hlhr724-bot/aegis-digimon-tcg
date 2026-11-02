import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { CardDetailDrawer } from "@/screens/CardDetailDrawer";
import { useCardFaceTranslation } from "@/screens/cardLanguage/useCardFaceTranslation";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function ChangeLanguage() {
  const { setLocale } = useTranslation();
  return <button onClick={() => setLocale("en")}>Switch to English</button>;
}

it.each([
  ["BT18-102", "Mega / Hybrid", "Vaccine, Shaman"],
  ["BT16-102", "Mega", "Vaccine, Free, Holy Warrior, X Antibody, Royal Knight"],
  ["BT23-077", "Champion", "Data, Virus, Puppet, CS"],
  ["ST23-13", "Tamer", "Glowing Dawn, BEATBREAK"],
])("shows all printed forms, attributes and types in the detail drawer for %s", async (cardId, forms, traits) => {
  localStorage.setItem("aegis:locale", "en");
  render(
    <I18nProvider>
      <CardDetailDrawer cardId={cardId} onClose={() => undefined} />
    </I18nProvider>,
  );

  expect(await screen.findByText(forms, { selector: ".card-detail-row > span:last-child" })).toBeTruthy();
  expect(screen.getByText(traits)).toBeTruthy();
});

it("translates every form and attribute in the Chinese detail drawer", async () => {
  localStorage.setItem("aegis:locale", "zh-CN");
  const { rerender } = render(
    <I18nProvider>
      <CardDetailDrawer cardId="BT18-102" onClose={() => undefined} />
    </I18nProvider>,
  );

  expect(await screen.findByText("究极体 / 混合体")).toBeTruthy();
  rerender(
    <I18nProvider>
      <CardDetailDrawer cardId="BT16-102" onClose={() => undefined} />
    </I18nProvider>,
  );
  expect(await screen.findByText("疫苗种, 自由, 圣骑士型, X抗体, 皇家骑士")).toBeTruthy();
});

it("translates the default face's headings, name and main effect in Chinese", async () => {
  localStorage.setItem("aegis:locale", "zh-CN");
  render(
    <I18nProvider>
      <CardDetailDrawer cardId="BT27-070" onClose={() => undefined} />
    </I18nProvider>,
  );
  await screen.findByText("主效果");
  await waitFor(() => {
    const drawer = screen.getByRole("dialog");
    expect(drawer.querySelector("h2")?.textContent).toContain("颅骨兽");
    const effects = drawer.querySelectorAll(".card-detail-effect p");
    expect(effects[0]?.textContent).toContain("当我方数码宝贝将要离开战斗区时");
  });
});

it.each([
  ["en", "Option effect", "Trash 1 card in your hand", "De-Digivolve 3"],
  ["zh-CN", "选项卡效果", "丢弃我方的1张手牌", "退化3"],
])("shows the DUAL Option effect in the %s detail drawer", async (locale, title, cost, effect) => {
  localStorage.setItem("aegis:locale", locale);
  render(
    <I18nProvider>
      <CardDetailDrawer cardId="BT26-056" onClose={() => undefined} />
    </I18nProvider>,
  );

  const heading = await screen.findByText(title, { selector: ".card-detail-effect__title" });
  await waitFor(() => {
    expect(heading.parentElement?.textContent).toContain(cost);
    expect(heading.parentElement?.textContent).toContain(effect);
  });
  expect(screen.getByRole("dialog").querySelectorAll(".card-detail-effect").length).toBeGreaterThan(1);
});

it.each([
  ["BT1-010-J", "ja"],
  ["BT1-010-K", "ko"],
  ["BT1-010-C", "zh-CN"],
])("preserves the explicit printing language for %s", async (artId, locale) => {
  localStorage.setItem("aegis:locale", "zh-CN");
  const { result } = renderHook(() => useCardFaceTranslation({ artId }), { wrapper: I18nProvider });
  await waitFor(() => expect(result.current.locale).toBe(locale));
  expect(localStorage.getItem("aegis:locale")).toBe("zh-CN");
});

it.each(["en", "zh-TW", "de"])("uses the %s interface locale for an unmarked face", async (locale) => {
  localStorage.setItem("aegis:locale", locale);
  const { result } = renderHook(() => useCardFaceTranslation({ artId: "BT1-010" }), { wrapper: I18nProvider });
  await waitFor(() => expect(result.current.locale).toBe(locale));
});

it("returns to the interface language when browsing from a regional face to the original", async () => {
  localStorage.setItem("aegis:locale", "zh-CN");
  render(
    <I18nProvider>
      <CardDetailDrawer cardId="BT1-010" initialArtId="BT1-010-J" onClose={() => undefined} />
    </I18nProvider>,
  );
  await screen.findByText("効果");
  fireEvent.click(await screen.findByRole("button", { name: "原始" }));
  await screen.findByText("主效果");
  await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("翻开我方卡组最上方的5张卡牌"));
  expect(localStorage.getItem("aegis:locale")).toBe("zh-CN");
});

it("updates an open default face when the interface language changes", async () => {
  localStorage.setItem("aegis:locale", "zh-CN");
  render(
    <I18nProvider>
      <ChangeLanguage />
      <CardDetailDrawer cardId="BT27-070" onClose={() => undefined} />
    </I18nProvider>,
  );
  await screen.findByText("主效果");
  fireEvent.click(screen.getByRole("button", { name: "Switch to English" }));
  await screen.findByText("Main effect");
  await waitFor(() =>
    expect(screen.getByRole("dialog").querySelector("h2")?.textContent).toBe("Craniamon (X Antibody)"),
  );
  expect(screen.getByRole("dialog").textContent).toContain("When any of your Digimon would leave the battle area");
});

it.each([
  ["BT22-035", "en", "Link effect", "give -4000 DP for the turn"],
  ["BT22-058", "en", "Link effect", "De-Digivolve 1"],
  ["BT22-035", "pt-BR", "Efeito de Link", "give -4000 DP for the turn"],
  ["BT22-058", "pt-BR", "Efeito de Link", "De-Digivolve 1"],
])("shows the printed Link effect of %s in the %s card drawer", async (cardId, locale, title, effect) => {
  localStorage.setItem("aegis:locale", locale);
  render(
    <I18nProvider>
      <CardDetailDrawer cardId={cardId} onClose={() => undefined} />
    </I18nProvider>,
  );
  const heading = await screen.findByText(title, { selector: ".card-detail-effect__title" });
  await waitFor(() => expect(heading.parentElement?.textContent).toContain(effect));
  expect(screen.getByRole("dialog").querySelectorAll(".card-detail-effect")).toHaveLength(2);
});

it("omits the Link section for a card without a printed Link effect", async () => {
  localStorage.setItem("aegis:locale", "en");
  render(
    <I18nProvider>
      <CardDetailDrawer cardId="BT1-010" onClose={() => undefined} />
    </I18nProvider>,
  );
  await screen.findByText("Main effect", { selector: ".card-detail-effect__title" });
  expect(screen.queryByText("Link effect", { selector: ".card-detail-effect__title" })).toBeNull();
});
