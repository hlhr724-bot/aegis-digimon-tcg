import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ hasTouch: true });

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`deck list keeps names and quantity controls separate at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const builder = new MobileDeckbuilderPage(page);
    await builder.open();
    await builder.edit();
    if (viewport.width < 960) {
      await page.getByRole("button", { name: /^Ver deck/ }).tap();
      await builder.sheet().getByRole("button", { name: "Ampliar painel do deck" }).tap();
    }
    const sheet = builder.sheet();
    await sheet.getByRole("button", { name: "Lista", exact: true }).tap();
    const row = sheet.locator(".deck-list-row").first();
    await row.scrollIntoViewIfNeeded();
    const open = row.getByRole("button").first();
    const name = row.locator(".deck-list-row__name");
    const remove = row.getByRole("button", { name: "Remover Bebydomon", exact: true });
    const add = row.getByRole("button", { name: "Adicionar Bebydomon", exact: true });
    const nameBounds = await name.boundingBox();
    expect(nameBounds!.width).toBeGreaterThan(60);
    const openBounds = await open.boundingBox();
    const removeBounds = await remove.boundingBox();
    expect(removeBounds!.x).toBeGreaterThanOrEqual(openBounds!.x + openBounds!.width);
    await builder.checkBounds(remove);
    await builder.checkBounds(add);
    await remove.tap();
    await expect(row.getByLabel("3 no deck", { exact: true })).toBeVisible();
    await add.tap();
    await expect(row.getByLabel("4 no deck", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`deck-list-${viewport.width}.png`) });
  });
}

class MobileDeckbuilderPage {
  constructor(readonly page: Page) {}
  async open() {
    await this.page.addInitScript(() => localStorage.setItem("aegis:locale", "pt-BR"));
    await this.page.goto("/e2e/mobile-deckbuilder.html");
  }
  async edit() {
    await this.page.getByRole("button", { name: "Editar", exact: true }).click();
  }
  sheet() {
    return this.page.getByRole("complementary", { name: "Informações do deck" });
  }
  async checkBounds(locator: Locator) {
    await expect(locator).toBeVisible();
    const bounds = await locator.boundingBox();
    const viewport = this.page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  }
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
]) {
  test(`mobile decks fit, expand and preserve edits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const builder = new MobileDeckbuilderPage(page);
    await builder.open();
    const signIn = page.getByRole("button", { name: "Entrar", exact: true });
    await builder.checkBounds(signIn);
    await builder.checkBounds(page.getByRole("button", { name: "Abrir o menu do jogador" }));
    if (viewport.width < 600) {
      const actions = page.getByRole("button", { name: "Novo deck", exact: true });
      const importing = page.getByRole("button", { name: "Importar", exact: true });
      expect((await actions.boundingBox())!.y).toEqual((await importing.boundingBox())!.y);
      expect((await page.locator(".deck-list-summary").boundingBox())!.height).toBeLessThan(250);
      await expect(page.getByRole("heading", { name: "Novo deck", exact: true })).toBeInViewport();
    }
    await page.screenshot({ path: test.info().outputPath(`decks-header-${viewport.width}.png`) });
    await builder.edit();
    const pool = page.getByRole("combobox", { name: "Cartas até", exact: true });
    const rules = page.getByRole("combobox", { name: "Regras", exact: true });
    if (viewport.width < 600) {
      expect((await pool.boundingBox())!.y).toEqual((await rules.boundingBox())!.y);
      expect((await page.locator(".deck-format-selector").boundingBox())!.height).toBeLessThan(200);
    }
    await pool.selectOption("BT13");
    await rules.selectOption("unlimited");
    await page.screenshot({ path: test.info().outputPath(`deck-pool-${viewport.width}.png`) });
    const trigger = page.getByRole("button", { name: /^Ver deck/ });
    await trigger.tap();
    await expect(page.getByRole("navigation")).not.toBeVisible();
    const sheet = builder.sheet();
    const before = await sheet.boundingBox();
    const expand = sheet.getByRole("button", { name: "Ampliar painel do deck" });
    await expect(expand).toBeFocused();
    await expand.tap();
    const expanded = await sheet.boundingBox();
    if (viewport.height >= 560) expect(expanded!.height).toBeGreaterThan(before!.height);
    await builder.checkBounds(sheet);
    const name = sheet.getByRole("textbox", { name: "Nome do deck" });
    await expect(name).toHaveValue("Novo deck");
    await name.fill("Meu deck mobile");
    for (const action of ["Importar", "Exportar", "Fechar", "Jogar"]) {
      const button = sheet.getByRole("button", { name: action, exact: true });
      await button.scrollIntoViewIfNeeded();
      await builder.checkBounds(button);
    }
    await expect(sheet.getByRole("button", { name: "Jogar", exact: true })).toBeDisabled();
    if (viewport.width === 390) {
      const sleeves = sheet.getByRole("button", { name: "Trocar sleeves do deck" });
      await sleeves.tap();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(sleeves).toBeFocused();
    }
    await sheet.getByRole("textbox", { name: "Nome do deck" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`deck-expanded-${viewport.width}.png`) });
    await sheet.getByRole("button", { name: "Reduzir painel do deck" }).click();
    await sheet.getByRole("button", { name: "Fechar", exact: true }).tap();
    await expect(trigger).toBeFocused();
    await expect(sheet).not.toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await trigger.click();
    await expect(sheet.getByRole("textbox", { name: "Nome do deck" })).toHaveValue("Meu deck mobile");
    await sheet.getByRole("button", { name: "Fechar", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(sheet).not.toBeVisible();
    await expect(pool).toHaveValue("BT13");
    await expect(rules).toHaveValue("unlimited");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(errors).toEqual([]);
  });
}
