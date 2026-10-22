import type { advancedBattlesEn } from "@/i18n/learn/advancedBattles.en";

export const advancedBattlesZhCN = {
  "learn.lesson.practice-derived-trash-triggers.title": "派生触发：旧队列中的新时点",
  "learn.lesson.practice-derived-trash-triggers.summary":
    "以Ogremon攻击，安排进化源效果，从弃牌区进化两次，并通过新事件的连锁清除三张安防。",
  "learn.lesson.practice-derived-trash-triggers.goal1": "区分原本的同时触发与优先结算的新派生触发",
  "learn.lesson.practice-derived-trash-triggers.goal2": "在两次进化期间跟踪进化源效果及每回合一次的抽牌限制",
  "learn.lesson.practice-derived-trash-triggers.done":
    "你先于旧待处理组结算了新的Tsunomon时点，进化到Titamon，使用SkullGreymon的进化源效果增加检查次数，最后用Birdramon获胜。",
  "learn.lesson.practice-derived-trash-triggers.step.intro":
    "Ogremon下方有Goblimon和Tsunomon，两者的进化源效果都会在你因效果弃手牌时触发。SkullGreymon和Titamon在弃牌区。电脑有阻挡者，以及三张12000 DP的安防数码宝贝。4000 DP的Ogremon需要在安防战斗开始前完成一连串进化。",
  "learn.lesson.practice-derived-trash-triggers.step.intro.hint":
    "规则15-4-3、15-4-5、15-14和15-3。其他效果结算期间产生的触发会等待当前处理完成，再由新的派生组优先于较早待处理的效果结算。",
  "learn.lesson.practice-derived-trash-triggers.step.attack-and-discard":
    "用Ogremon攻击玩家。接受其攻击效果，丢弃一张Monodramon，并选择对手的Monochromon使其休息。保留Birdramon完成最后一击。",
  "learn.lesson.practice-derived-trash-triggers.step.attack-and-discard.hint":
    "这次弃牌同时触发Goblimon从弃牌区进化的进化源效果与Tsunomon的进化源抽卡 1。攻击尚未进入反击、阻挡或安防处理。",
  "learn.lesson.practice-derived-trash-triggers.step.first-upgrade":
    "在同时触发面板中，将Goblimon的进化源效果排在Tsunomon之前。接受进化并选择弃牌区的SkullGreymon，其费用减少1。",
  "learn.lesson.practice-derived-trash-triggers.step.first-upgrade.hint":
    "让最初的Tsunomon触发继续等待。进化会进行正常的额外抽牌，并产生新的【进化时】处理，然后才恢复旧组。",
  "learn.lesson.practice-derived-trash-triggers.step.derived-draw":
    "结算SkullGreymon的【进化时】：丢弃另一张Monodramon，并将保护赋予SkullGreymon自身。新的时点中包含Ogremon的进化源效果及另一个Tsunomon触发。将Tsunomon排在前面，抽到Garudamon。",
  "learn.lesson.practice-derived-trash-triggers.step.derived-draw.hint":
    "这次Tsunomon来自第二次弃牌，会在新派生时点中先于最初待处理的Tsunomon结算。一旦发动便占用每回合一次的次数，较早的触发不能再带来第二次抽牌。",
  "learn.lesson.practice-derived-trash-triggers.step.second-upgrade":
    "接着结算这个新时点中的Ogremon进化源效果。接受并从弃牌区选择Titamon，进化费用减少1。完成额外抽牌及新产生的触发。",
  "learn.lesson.practice-derived-trash-triggers.step.second-upgrade.hint":
    "Ogremon现在已是进化源，其进化源效果可以运作。它原本的普通攻击效果不再属于当前顶卡。同一只正在攻击的数码宝贝会连续经历这两次进化。",
  "learn.lesson.practice-derived-trash-triggers.step.finish-checks":
    "结算Titamon的【进化时】，丢弃Phoenixmon并消灭对手DP最高的数码宝贝。因为Titamon是通过效果进化，还要丢弃对手最上方安防。结算新触发的最低DP消灭效果，然后让攻击检查剩余两张安防。",
  "learn.lesson.practice-derived-trash-triggers.step.finish-checks.hint":
    "Titamon的弃牌产生另一个派生触发。现在作为进化源的SkullGreymon会赋予Titamon 安防攻击 +1。它的13000 DP可在两次12000 DP Plesiomon安防战斗中存活。丢弃第一张安防并不是检查。",
  "learn.lesson.practice-derived-trash-triggers.step.win":
    "三张安防和两只防守数码宝贝都已被除去。用Birdramon攻击玩家获胜。",
  "learn.lesson.practice-derived-trash-triggers.step.win.hint":
    "最后的直接攻击与Titamon的检查不同。你先完成所有触发效果，再回到剩余的攻击流程。",
  "learn.lesson.practice-order-before-digivolving.title": "顺序很重要：改变顶卡前先抽牌",
  "learn.lesson.practice-order-before-digivolving.summary":
    "选择同时触发的攻击效果先后顺序，抽到具有Jamming的进化卡，保住唯一的攻击者。",
  "learn.lesson.practice-order-before-digivolving.goal1": "根据各效果结算后的状态，安排两个同时触发的【攻击时】效果",
  "learn.lesson.practice-order-before-digivolving.goal2":
    "解释为何待处理的普通效果可能消失，而之后的进化源效果仍可运作",
  "learn.lesson.practice-order-before-digivolving.done":
    "你在进化效果前抽到Beowolfmon，以Jamming撑过安防战斗，并在结算KendoGarurumon的进化源抽牌后获胜。",
  "learn.lesson.practice-order-before-digivolving.step.intro":
    "KendoGarurumon有两个独立的【攻击时】效果：抽卡 1，以及费用减少1的可选Hybrid进化。手牌中的DaiPenmon没有Jamming。下一次攻击效果抽牌将找到有Jamming的Beowolfmon。电脑最后一张安防是12000 DP的Plesiomon。",
  "learn.lesson.practice-order-before-digivolving.step.intro.hint":
    "规则15-4-3、15-4-4-4、15-3和16-9。6000 DP的KendoGarurumon与7000 DP的DaiPenmon通常都无法在这场安防战斗中存活，Beowolfmon的Jamming能提供必要保护。",
  "learn.lesson.practice-order-before-digivolving.step.declare-attack":
    "用KendoGarurumon攻击玩家。在同时触发面板停下，确认顺序前先查看两个【攻击时】条目。",
  "learn.lesson.practice-order-before-digivolving.step.declare-attack.hint":
    "攻击宣言使KendoGarurumon休息一次。其效果在安防前结算，进化不会宣言另一次攻击。",
  "learn.lesson.practice-order-before-digivolving.step.draw-first":
    "将KendoGarurumon的抽卡 1排在前面，Hybrid进化排在后面。先结算抽牌，将Beowolfmon加入手牌，再选择进化卡。",
  "learn.lesson.practice-order-before-digivolving.step.draw-first.hint":
    "选择依据效果发动时的状态进行。这次抽牌为另一个待处理效果提供了新的合法选择。",
  "learn.lesson.practice-order-before-digivolving.step.digivolve":
    "接受剩余的Hybrid进化效果，并选择刚抽到的Beowolfmon。其费用由3降至2。继续结算额外抽牌及安防检查。",
  "learn.lesson.practice-order-before-digivolving.step.digivolve.hint":
    "请选择Beowolfmon，而非DaiPenmon。Beowolfmon虽只有7000 DP，却可用Jamming撑过12000 DP的安防战斗。若先进行进化，旧顶卡待处理的普通抽卡 1会消失；之后的进化额外抽牌已来不及改变此次进化选择。",
  "learn.lesson.practice-order-before-digivolving.step.end-turn":
    "Beowolfmon存活，对手没有安防。结束你的回合，让休息的攻击者能再次行动。",
  "learn.lesson.practice-order-before-digivolving.step.end-turn.hint":
    "电脑没有数码宝贝，将会结束回合。经过这次普通进化，Beowolfmon仍是同一只场上数码宝贝。",
  "learn.lesson.practice-order-before-digivolving.step.your-turn":
    "等待电脑结束回合并进入你的主要阶段。如出现养成提示，可跳过。",
  "learn.lesson.practice-order-before-digivolving.step.your-turn.hint":
    "KendoGarurumon现在是进化源。即使原本的普通效果已消失，下方的进化源效果仍可在下次攻击时触发。",
  "learn.lesson.practice-order-before-digivolving.step.win":
    "用Beowolfmon攻击玩家。在直接攻击获胜前，先结算KendoGarurumon的进化源抽卡 1。",
  "learn.lesson.practice-order-before-digivolving.step.win.hint":
    "这次进化源抽牌是本次攻击产生的新触发，并非上一回合待处理的普通抽牌。普通效果与进化源效果的作用不同。",
  "learn.lesson.practice-inherited-sacrifice-recruit.title": "进化源保护：将牺牲转化为新攻击者",
  "learn.lesson.practice-inherited-sacrifice-recruit.summary":
    "阅读Chuumon的进化源效果，从Gaia Force中保住KingSukamon，再用牺牲Sukamon的消灭效果招来获胜的攻击者。",
  "learn.lesson.practice-inherited-sacrifice-recruit.goal1": "区分下方卡的普通文本与其上数码宝贝使用的进化源效果",
  "learn.lesson.practice-inherited-sacrifice-recruit.goal2": "从替代处理的费用跟踪至真实消灭、新触发及免费登场",
  "learn.lesson.practice-inherited-sacrifice-recruit.done":
    "Chuumon的进化源防止效果让同一只KingSukamon及其进化源留场。牺牲的Sukamon确实被消灭，并招来Chuumon，由这个新攻击者完成最后一击。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.intro":
    "电脑会对KingSukamon使用Gaia Force。KingSukamon下方的Chuumon EX13-027，其进化源效果可通过消灭另一只名称含Sukamon的数码宝贝来防止离场。旁边独立的Sukamon EX13-028可支付该费用，并有自己的【消灭时】效果。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.intro.hint":
    "请阅读下方Chuumon的下部效果栏，而非普通【登场时】检索。其上的数码宝贝使用的是进化源效果，仅将Chuumon置于下方不会发动其普通检索。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.protect":
    "Gaia Force威胁KingSukamon时，接受Chuumon EX13-027的进化源防止效果。用独立的Sukamon EX13-028支付；若它是唯一合法费用，会自动选定。保住KingSukamon及其两张进化源。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.protect.hint":
    "防止KingSukamon消灭，意味着KingSukamon不会触发【消灭时】。旁边的Sukamon确实作为费用被消灭，因此会触发自己的【消灭时】。不要尝试丢弃KingSukamon下方的Sukamon进化源来支付。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.recruit":
    "结算被消灭Sukamon的【消灭时】。从卡组展示的三张卡中选择Chuumon BT3-061，不支付费用登场。其他两张展示卡进入弃牌区。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.recruit.hint":
    "这个新效果来自为保护费用而被消灭的数码宝贝，并不代表Gaia Force消灭了KingSukamon。招来的Chuumon是在电脑回合登场的新数码宝贝。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.your-turn":
    "等待Gaia Force及所有后续效果完成，再让电脑结束回合。到你的回合，获救的KingSukamon和招来的Chuumon都将可以攻击。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.your-turn.hint":
    "费用可以引发另一个效果，但开始新的普通行动前，必须完成必要处理。Chuumon在对手回合登场，因此能在你的回合攻击。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.clear-security":
    "用KingSukamon攻击玩家，清除最后一张安防。保留Chuumon未休息，用于另一次获胜攻击。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.clear-security.hint":
    "KingSukamon仍是被保护的同一只数码宝贝：防止效果没有使它离场、重新登场或丢弃两张进化源。它的6000 DP能在这场安防战斗中存活。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.win": "电脑没有安防。用Sukamon招来的Chuumon攻击玩家获胜。",
  "learn.lesson.practice-inherited-sacrifice-recruit.step.win.hint":
    "回顾整条连锁：进化源防止效果、牺牲支付、【消灭时】、免费招来数码宝贝、以及新数码宝贝的获胜攻击。清除最后一张安防本身并不会获胜。",
  "learn.lesson.practice-inherited-unsuspend-engage.title": "回合结束时：先以进化源效果解除休息，再Engage",
  "learn.lesson.practice-inherited-unsuspend-engage.summary":
    "用Chaosdramon的第一次攻击清空安防，再先于Engage结算MetalMamemon的进化源解除休息，在回合交接前获胜。",
  "learn.lesson.practice-inherited-unsuspend-engage.goal1": "将数码宝贝本体与进化源的回合结束效果一起排序",
  "learn.lesson.practice-inherited-unsuspend-engage.goal2": "在要求攻击的效果结算前，先让攻击者满足条件",
  "learn.lesson.practice-inherited-unsuspend-engage.done":
    "MetalMamemon的进化源效果先让Chaosdramon解除休息。随后Engage产生合法的获胜攻击，虽然内存值仍在电脑一侧，却在其回合开始前获胜。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.intro":
    "Chaosdramon有安防攻击 +1和Engage，进化源为MetalMamemon EX9-018及HiAndromon BT2-064。MetalMamemon的进化源【你的回合结束时】效果可使自己一只数码宝贝解除休息。你需要该进化源文本准备回合结束时的第二次攻击。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.intro.hint":
    "请阅读MetalMamemon的进化源效果栏：仅因它位于Chaosdramon下方，不会使用其普通【登场时】和【进化时】除去文本。两个回合结束效果都属于你，因此由你选择结算顺序。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.clear-security":
    "用Chaosdramon攻击玩家。安防攻击 +1会逐张检查电脑的两张安防。等待攻击完成；Chaosdramon会处于休息状态，电脑将没有安防。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.clear-security.hint":
    "清除两张卡尚未获胜。已休息的Chaosdramon不能正常攻击。此处无需支付其可选的两张卡除去费用，若出现提示可以拒绝。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.order-effects":
    "点击“结束回合”。在触发顺序提示中，先结算MetalMamemon EX9-018的进化源解除休息，再结算Chaosdramon EX12-060的Engage。让Chaosdramon解除休息，然后继续Engage。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.order-effects.hint":
    "将进化源解除休息选为下一个效果，或在完整排序时把它放在最前。Chaosdramon仍休息时结算Engage不会产生攻击；之后解除休息也不会重试已经结算的效果。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.engage-win":
    "Chaosdramon现已解除休息，接受Engage并选择玩家作为攻击对象。这次针对零安防的独立攻击会在电脑回合开始前获胜。",
  "learn.lesson.practice-inherited-unsuspend-engage.step.engage-win.hint":
    "结束回合已将内存值移至对手一侧的三点，但必须先完成回合结束处理。进化源效果准备攻击者，Engage允许在此时攻击。如果过早结算了Engage，就让电脑结束回合，并在你的下回合改用普通攻击。",
} satisfies Record<keyof typeof advancedBattlesEn, string>;
