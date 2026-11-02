import { describe, expect, it } from "vitest";
import { CardInstance, Permanent } from "@aegis/shared";
import { arrangeField, carryGroupKeys } from "./fieldArrangement";

const AMI_AIBA = "BT22-093";
const ARATA_SANADA = "BT22-091";
const WATCHMAKER = "BT12-098";
const KUREMI_AGENCY = "BT22-099";
const PALMON = "BT1-067";
const GUARDROMON = "BT15-061";
const ALPHAMON = "BT22-063";

function card(cardId: string, instanceId: string): CardInstance {
  const result = new CardInstance();
  result.cardId = cardId;
  result.instanceId = instanceId;
  return result;
}

function permanent(
  permanentId: string,
  cardId: string,
  overrides: { isSuspended?: boolean; stack?: number; activatable?: boolean } = {},
): Permanent {
  const result = new Permanent();
  result.permanentId = permanentId;
  result.topCard = card(cardId, `${permanentId}-top`);
  result.isSuspended = overrides.isSuspended ?? false;
  for (let index = 0; index < (overrides.stack ?? 0); index++)
    result.stack.push(card(PALMON, `${permanentId}-${index}`));
  result.activatableEffectsJson = overrides.activatable
    ? JSON.stringify([{ instanceId: result.topCard.instanceId, effectKey: "main", description: "Activate" }])
    : "";
  return result;
}

const plainOptions = {
  isSuspended: (p: Permanent) => p.isSuspended,
  isSingledOut: () => false,
};

function ids(permanents: readonly Permanent[]) {
  return permanents.map((p) => p.permanentId);
}

describe("arrangeField", () => {
  it("keeps Digimon in the main row in play order", () => {
    const { digimon } = arrangeField(
      [permanent("alphamon", ALPHAMON), permanent("guardromon", GUARDROMON), permanent("palmon", PALMON)],
      plainOptions,
    );
    expect(ids(digimon)).toEqual(["alphamon", "guardromon", "palmon"]);
  });

  it("keeps a Digimon in place when it digivolves", () => {
    const palmon = permanent("palmon", PALMON);
    const field = [palmon, permanent("guardromon", GUARDROMON)];
    expect(ids(arrangeField(field, plainOptions).digimon)).toEqual(["palmon", "guardromon"]);
    palmon.stack.push(palmon.topCard);
    palmon.topCard = card(ALPHAMON, "palmon-digivolved");
    expect(ids(arrangeField(field, plainOptions).digimon)).toEqual(["palmon", "guardromon"]);
  });

  it("moves Tamers then Options to the support row, cheapest first", () => {
    const { support, digimon } = arrangeField(
      [
        permanent("agency", KUREMI_AGENCY),
        permanent("ami", AMI_AIBA),
        permanent("palmon", PALMON),
        permanent("watch", WATCHMAKER),
      ],
      plainOptions,
    );
    expect(ids(digimon)).toEqual(["palmon"]);
    expect(support.map((group) => ids(group.members))).toEqual([["watch"], ["ami"], ["agency"]]);
  });

  it("groups identical copies in play order, wherever they were played", () => {
    const { support } = arrangeField(
      [
        permanent("ami-1", AMI_AIBA),
        permanent("palmon", PALMON),
        permanent("ami-2", AMI_AIBA),
        permanent("ami-3", AMI_AIBA),
      ],
      plainOptions,
    );
    expect(support).toHaveLength(1);
    expect(ids(support[0]!.members)).toEqual(["ami-1", "ami-2", "ami-3"]);
  });

  it("keeps suspended copies apart from ready ones", () => {
    const { support } = arrangeField(
      [
        permanent("arata-1", ARATA_SANADA, { isSuspended: true }),
        permanent("arata-2", ARATA_SANADA),
        permanent("arata-3", ARATA_SANADA, { isSuspended: true }),
      ],
      plainOptions,
    );
    expect(support.map((group) => ids(group.members))).toEqual([["arata-1", "arata-3"], ["arata-2"]]);
  });

  it("keeps a copy in place when it suspends to use its effect", () => {
    const saved = permanent("watch-saved", WATCHMAKER, { stack: 1 });
    const plain = permanent("watch-plain", WATCHMAKER);
    const field = [plain, saved];
    expect(arrangeField(field, plainOptions).support.map((group) => group.key)).toEqual(["watch-plain", "watch-saved"]);
    plain.isSuspended = true;
    expect(arrangeField(field, plainOptions).support.map((group) => group.key)).toEqual(["watch-plain", "watch-saved"]);
  });

  it("treats a card held before an unsuspend sweep as still suspended", () => {
    const held = new Set(["ami-2"]);
    const { support } = arrangeField([permanent("ami-1", AMI_AIBA), permanent("ami-2", AMI_AIBA)], {
      ...plainOptions,
      isSuspended: (p) => p.isSuspended || held.has(p.permanentId),
    });
    expect(support).toHaveLength(2);
  });

  it("keeps a copy whose effect is spent apart from those that can still use it", () => {
    const { support } = arrangeField(
      [
        permanent("ami-1", AMI_AIBA, { activatable: true }),
        permanent("ami-2", AMI_AIBA),
        permanent("ami-3", AMI_AIBA, { activatable: true }),
      ],
      plainOptions,
    );
    expect(support.map((group) => ids(group.members))).toEqual([["ami-1", "ami-3"], ["ami-2"]]);
  });

  it("separates partially spent effect lists while grouping equal actions across instances and order", () => {
    const copies = [1, 2, 3].map((id) => permanent(`ami-${id}`, AMI_AIBA));
    copies.forEach((copy, index) => {
      const keys = index === 1 ? ["main-a"] : index === 2 ? ["main-b", "main-a"] : ["main-a", "main-b"];
      copy.activatableEffectsJson = JSON.stringify(
        keys.map((effectKey) => ({
          instanceId: copy.topCard.instanceId,
          effectKey,
          description: effectKey,
        })),
      );
    });
    expect(arrangeField(copies, plainOptions).support.map((group) => ids(group.members))).toEqual([
      ["ami-1", "ami-3"],
      ["ami-2"],
    ]);
  });

  it("never groups a Tamer that holds cards under it", () => {
    const { support } = arrangeField(
      [permanent("watch-1", WATCHMAKER, { stack: 1 }), permanent("watch-2", WATCHMAKER)],
      plainOptions,
    );
    expect(support).toHaveLength(2);
  });

  it("lets a singled-out copy step out of its group", () => {
    const { support } = arrangeField(
      [permanent("ami-1", AMI_AIBA), permanent("ami-2", AMI_AIBA), permanent("ami-3", AMI_AIBA)],
      { ...plainOptions, isSingledOut: (p) => p.permanentId === "ami-1" },
    );
    expect(support.map((group) => ids(group.members))).toEqual([["ami-1"], ["ami-2", "ami-3"]]);
  });
});

describe("carryGroupKeys", () => {
  const isSuspended = (p: Permanent) => p.isSuspended;
  const group = (key: string, ...members: Permanent[]) => ({ key, members });
  const placed = (entries: [string, string, boolean][]) =>
    new Map(entries.map(([id, key, suspended]) => [id, { key, suspended }]));

  it("lets a group keep its key when one copy leaves, and gives the leaver a new one", () => {
    const ami = [
      permanent("ami-1", AMI_AIBA, { isSuspended: true }),
      permanent("ami-2", AMI_AIBA),
      permanent("ami-3", AMI_AIBA),
    ];
    const previous = placed([
      ["ami-1", "ami-1", false],
      ["ami-2", "ami-1", false],
      ["ami-3", "ami-1", false],
    ]);
    const keys = carryGroupKeys([group("ami-2", ami[1]!, ami[2]!), group("ami-1", ami[0]!)], previous, isSuspended);
    expect(keys.map((g) => g.key)).toEqual(["ami-1", "ami-1~1"]);
  });

  it("keeps the larger share's key when copies merge back", () => {
    const ami = [permanent("ami-1", AMI_AIBA), permanent("ami-2", AMI_AIBA), permanent("ami-3", AMI_AIBA)];
    const previous = placed([
      ["ami-1", "ami-1~1", true],
      ["ami-2", "ami-1", false],
      ["ami-3", "ami-1", false],
    ]);
    expect(carryGroupKeys([group("ami-1", ...ami)], previous, isSuspended)[0]!.key).toBe("ami-1");
  });

  it("on an even split keeps the key with the copy whose state did not change", () => {
    const arata = [permanent("arata-1", ARATA_SANADA, { isSuspended: true }), permanent("arata-2", ARATA_SANADA)];
    const previous = placed([
      ["arata-1", "arata-1", false],
      ["arata-2", "arata-1", false],
    ]);
    const keys = carryGroupKeys([group("arata-2", arata[1]!), group("arata-1", arata[0]!)], previous, isSuspended);
    expect(keys.map((g) => g.key)).toEqual(["arata-1", "arata-1~1"]);
  });

  it("uses the first member's id for a card that was not on the field", () => {
    const watch = permanent("watch-1", WATCHMAKER);
    expect(carryGroupKeys([group("watch-1", watch)], new Map(), isSuspended)[0]!.key).toBe("watch-1");
  });
});

it("keeps manually marked support cards distinct instead of hiding their annotations in a group", () => {
  const plain = permanent("plain", AMI_AIBA);
  const marked = permanent("marked", AMI_AIBA);
  marked.manualMarker = "Once per turn used";
  const status = permanent("status", AMI_AIBA);
  status.manualStatuses.push("immune");
  const color = permanent("color", AMI_AIBA);
  color.originalColorsOverride.push("red");
  const security = permanent("security", AMI_AIBA);
  security.securityAttackModifier = 1;
  const hidden = permanent("hidden", AMI_AIBA);
  hidden.topCard.faceUp = false;
  expect(arrangeField([plain, marked, status, color, security, hidden], plainOptions).support).toHaveLength(6);
});

it("displays each identical Tamer separately when grouping is disabled while retaining authoritative references", () => {
  const field = [
    permanent("perm-8", AMI_AIBA),
    permanent("perm-12", AMI_AIBA),
    permanent("perm-15", KUREMI_AGENCY),
    permanent("perm-16", KUREMI_AGENCY),
  ];
  const enabled = arrangeField(field, plainOptions);
  expect(enabled.support.map((group) => ids(group.members))).toEqual([
    ["perm-8", "perm-12"],
    ["perm-15", "perm-16"],
  ]);
  const disabled = arrangeField(field, { ...plainOptions, groupIdenticalTamers: false });
  expect(disabled.support.map((group) => ids(group.members))).toEqual([
    ["perm-8"],
    ["perm-12"],
    ["perm-15", "perm-16"],
  ]);
  expect(field.map((item) => item.permanentId)).toEqual(["perm-8", "perm-12", "perm-15", "perm-16"]);
});
