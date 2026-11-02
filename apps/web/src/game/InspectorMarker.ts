export const InspectorMarker = {
  ATTACK: { name: "ATTACK", value: "attack", pattern: /^(When Attacking|攻击时)$/i },
  EVOLUTION: { name: "EVOLUTION", value: "evolution", pattern: /^(When Digivolving|进化时)$/i },
  LIMIT: { name: "LIMIT", value: "limit", pattern: /^(Once Per Turn|\d+ Times? Per Turn|每回合\d+次)$/i },
  TIMING: {
    name: "TIMING",
    value: "timing",
    pattern:
      /^(On Play|On Deletion|Your Turn|Opponent's Turn|All Turns|Main|Security|Hand|Trash|Counter|Rule|Breeding|On Link|When Moving|(?:At )?(?:Start|End) of .+|登场时|消灭时|我方的回合|对方的回合|双方的回合|主要|安防|手牌|废弃区|养成|反击|链接时|移动时|攻击结束时|(?:我方|对方|双方)的(?:主要阶段|回合)(?:开始|结束)时)$/i,
  },
} as const;
