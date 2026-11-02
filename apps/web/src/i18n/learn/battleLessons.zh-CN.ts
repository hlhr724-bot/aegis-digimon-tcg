import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnZhCN } from "@/i18n/learn/learn.zh-CN";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsZhCN = {
  ...buildRulePracticeTranslations({ dictionary: learnZhCN }),
  "learn.lesson.drill-retaliation.title": "Retaliation：以弱换强",
  "learn.lesson.drill-retaliation.summary": "用Retaliation在战斗落败后消灭更强的Blocker，再赢下对局。",
  "learn.lesson.drill-retaliation.goal1": "Retaliation如何消灭赢得战斗的数码宝贝",
  "learn.lesson.drill-retaliation.goal2": "为什么弱小的攻击者也能除去更强的防守者",
  "learn.lesson.drill-retaliation.done": "Candlemon战败后以Retaliation消灭Monochromon，为最后一击打开了道路。",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon有1000 DP和Retaliation。电脑的Monochromon已休息，有5000 DP和Blocker。输掉这场战斗反而能除去阻挡者。",
  "learn.lesson.drill-retaliation.step.intro.hint": "此数码宝贝与另一只数码宝贝战斗落败并被消灭时，Retaliation触发。",
  "learn.lesson.drill-retaliation.step.retaliate":
    "点击Candlemon，选择攻击，再选已休息的Monochromon。等待战斗和Retaliation结算。",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon因DP较低而落败。之后Retaliation消灭Monochromon；这是效果消灭，不是第二场战斗。",
  "learn.lesson.drill-retaliation.step.win": "Monochromon已离场，电脑没有安防。用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-retaliation.step.win.hint": "保留Birdramon完成最后一击，不要在第一场战斗中牺牲它。",
  "learn.lesson.drill-blitz.title": "Blitz：跨过零点后攻击",
  "learn.lesson.drill-blitz.summary": "进化让内存值跨过零点后，在回合结束前使用Blitz。",
  "learn.lesson.drill-blitz.goal1": "为什么费用跨过零点后仍能结算进化效果",
  "learn.lesson.drill-blitz.goal2": "Blitz如何在对手有内存值时允许攻击",
  "learn.lesson.drill-blitz.done": "BetelGammamon进化使内存值移至对手一侧，并以Blitz攻击获胜。",
  "learn.lesson.drill-blitz.step.intro":
    "你有1点内存值和场上的Biyomon。BetelGammamon的进化费用是2，拥有【进化时】Blitz。",
  "learn.lesson.drill-blitz.step.intro.hint":
    "电脑没有安防。付款后必须通过Blitz提示攻击，已经不能再开始普通的主要阶段行动。",
  "learn.lesson.drill-blitz.step.digivolve": "将手牌的BetelGammamon进化到Biyomon上。付款后对手得到1点内存值。",
  "learn.lesson.drill-blitz.step.digivolve.hint": "进化改变现有数码宝贝，不会重置其能否攻击的状态记录。",
  "learn.lesson.drill-blitz.step.blitz-attack": "接受Blitz效果，再用BetelGammamon攻击玩家，在回合交接前获胜。",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz允许在电脑有内存值时进行这次攻击，本身不会赋予Rush，也不会解除攻击者的休息。",
  "learn.lesson.drill-raid.title": "Raid：挑战最强的未休息数码宝贝",
  "learn.lesson.drill-raid.summary": "用Raid将攻击对象改为未休息的Blocker。",
  "learn.lesson.drill-raid.goal1": "Raid如何改变已宣言攻击的对象",
  "learn.lesson.drill-raid.goal2": "对象必须是对手未休息数码宝贝中DP最高的原因",
  "learn.lesson.drill-raid.done": "Grizzlymon用Raid除去Monochromon，Birdramon完成最后一击。",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon有Raid，并从下方Agumon获得+1000 DP。电脑有一只未休息的5000 DP Monochromon。",
  "learn.lesson.drill-raid.step.intro.hint": "通常不能宣言攻击未休息的数码宝贝。Raid在宣言后改变对象。",
  "learn.lesson.drill-raid.step.raid": "用Grizzlymon攻击玩家。在Raid选择中，将Monochromon选为新对象。",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon有6000 DP，会赢得战斗。Monochromon是符合条件的未休息且DP最高的对象。",
  "learn.lesson.drill-raid.step.win": "阻挡者已离场。用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-raid.step.win.hint": "Raid改变对象后没有进行安防检查；Birdramon会发起另一次攻击。",
  "learn.lesson.drill-collision.title": "Collision：迫使电脑阻挡",
  "learn.lesson.drill-collision.summary": "迫使未印有Blocker的数码宝贝防守，再用Piercing检查安防。",
  "learn.lesson.drill-collision.goal1": "Collision如何在攻击期间赋予对手数码宝贝Blocker",
  "learn.lesson.drill-collision.goal2": "为什么防守方能阻挡时就必须阻挡",
  "learn.lesson.drill-collision.done": "Proganomon迫使Gomamon阻挡，以Piercing打破最后一张安防，Birdramon随后获胜。",
  "learn.lesson.drill-collision.step.intro": "Proganomon有Collision和Piercing。电脑有未印Blocker的Gomamon和1张安防。",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision在本次攻击期间赋予对手数码宝贝Blocker，并要求电脑能阻挡时必须阻挡。",
  "learn.lesson.drill-collision.step.collision":
    "用Proganomon攻击玩家。观察电脑用Gomamon阻挡并战败，随后因Piercing受到安防检查。",
  "learn.lesson.drill-collision.step.collision.hint": "电脑不能拒绝可用的阻挡。Proganomon有7000 DP，Gomamon有3000 DP。",
  "learn.lesson.drill-collision.step.win": "电脑没有安防，也没有防守者。用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-collision.step.win.hint": "Collision迫使战斗发生；Proganomon获胜后，由Piercing带来安防检查。",
  "learn.lesson.drill-vortex.title": "Vortex：回合结束时再战",
  "learn.lesson.drill-vortex.summary": "登场Galemon，并用Vortex在同一回合攻击一只数码宝贝。",
  "learn.lesson.drill-vortex.goal1": "Vortex如何产生回合结束时的攻击",
  "learn.lesson.drill-vortex.goal2": "为什么Vortex能在登场回合攻击，但通常只能以数码宝贝为对象",
  "learn.lesson.drill-vortex.done": "Galemon在登场回合用Vortex除去Monochromon，并在下回合获胜。",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon有Vortex。电脑有已休息的Monochromon，没有安防。Galemon可以在回合结束时除去该阻挡者。",
  "learn.lesson.drill-vortex.step.intro.hint": "刚登场的数码宝贝通常不能在该回合攻击。Vortex在回合结束时提供特定例外。",
  "learn.lesson.drill-vortex.step.play": "从手牌支付6点内存值登场Galemon。",
  "learn.lesson.drill-vortex.step.play.hint": "内存值变为零。Galemon刚登场，不能进行普通攻击。",
  "learn.lesson.drill-vortex.step.vortex": "点击“结束回合”，接受Vortex，并选择已休息的Monochromon为攻击对象。",
  "learn.lesson.drill-vortex.step.vortex.hint": "Vortex通常不能攻击玩家。Galemon的6000 DP高于Monochromon的5000 DP。",
  "learn.lesson.drill-vortex.step.opponent-turn": "等待回合结束处理完成，并进入电脑的回合。",
  "learn.lesson.drill-vortex.step.opponent-turn.hint": "关键词攻击发生在回合真正交接之前，之后电脑会结束回合。",
  "learn.lesson.drill-vortex.step.your-turn": "等待电脑结束回合，进入你的下一个主要阶段。",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon会在你的回合开始时解除休息，也不再属于本回合登场的数码宝贝。",
  "learn.lesson.drill-vortex.step.win": "用Galemon进行普通的对玩家攻击以获胜。",
  "learn.lesson.drill-vortex.step.win.hint": "这是普通的主要阶段攻击，不受Vortex只能攻击数码宝贝的限制。",
  "learn.lesson.drill-overclock.title": "Overclock：不解除休息也能再攻",
  "learn.lesson.drill-overclock.summary": "牺牲一只Puppet，让已休息的ShoeShoemon在回合结束时攻击。",
  "learn.lesson.drill-overclock.goal1": "如何消灭另一只指定数码宝贝来支付Overclock",
  "learn.lesson.drill-overclock.goal2": "为什么已休息的数码宝贝也能进行不需休息的攻击",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon检查安防后，为Overclock消灭Shoemon，并在不解除休息的情况下再次攻击。",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon拥有指定Puppet特征的Overclock。另一只Puppet——Shoemon是本回合登场的，请保留它作为费用。",
  "learn.lesson.drill-overclock.step.intro.hint": "Overclock不需休息便可攻击玩家，即使ShoeShoemon已经休息也能使用。",
  "learn.lesson.drill-overclock.step.clear-security": "用ShoeShoemon攻击玩家，除去最后一张安防。",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "这次攻击后ShoeShoemon仍处于休息状态。不要拒绝接下来的关键词提示。",
  "learn.lesson.drill-overclock.step.overclock":
    "点击“结束回合”并接受Overclock。唯一符合条件的Puppet——Shoemon会作为费用被消灭。然后选择玩家作为攻击对象获胜。",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "费用由Shoemon而非ShoeShoemon支付。支付后必须进行Overclock的对玩家攻击，无需解除休息。",
  "learn.lesson.drill-iceclad.title": "Iceclad：靠更多进化源获胜",
  "learn.lesson.drill-iceclad.summary": "通过比较进化源数量，击败12000 DP的数码宝贝。",
  "learn.lesson.drill-iceclad.goal1": "Iceclad如何替换数码宝贝战斗中的DP比较",
  "learn.lesson.drill-iceclad.goal2": "为什么安防战斗仍然比较DP",
  "learn.lesson.drill-iceclad.done":
    "PolarBearmon凭两张进化源击败零进化源的WarGreymon，尽管DP更低仍存活，随后Birdramon获胜。",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon有7000 DP、Iceclad和2张进化源。已休息的WarGreymon有12000 DP，但没有进化源。",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad在安防战斗以外以进化源数量代替DP比较。更多者获胜，相等则双方落败。",
  "learn.lesson.drill-iceclad.step.iceclad": "用PolarBearmon攻击已休息的WarGreymon，等待Iceclad战斗结算。",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "比较的是2张进化源和0张，不是7000 DP和12000 DP。PolarBearmon获胜并存活。",
  "learn.lesson.drill-iceclad.step.win": "WarGreymon已离场，电脑没有安防。用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-iceclad.step.win.hint": "与安防数码宝贝战斗仍比较DP，不适用Iceclad的进化源数量比较。",
  "learn.lesson.drill-execute.title": "Execute：牺牲攻击者突破防线",
  "learn.lesson.drill-execute.summary": "在回合结束时攻击未休息的Blocker，然后让自己的攻击者消灭。",
  "learn.lesson.drill-execute.goal1": "Execute如何允许在回合结束时攻击未休息的数码宝贝",
  "learn.lesson.drill-execute.goal2": "为什么攻击者会在该次攻击结束时被消灭",
  "learn.lesson.drill-execute.done": "Phantomon以Execute击败Monochromon后被消灭，Birdramon在你的下回合获胜。",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon有Execute和7000 DP。电脑未休息的Monochromon有5000 DP，可以阻挡Birdramon。",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute允许Phantomon在你的回合结束时攻击，包括攻击对手未休息的数码宝贝。攻击结束时它会被消灭。",
  "learn.lesson.drill-execute.step.execute":
    "点击“结束回合”，接受Execute并选择Monochromon。等待战斗及Phantomon的消灭完成。",
  "learn.lesson.drill-execute.step.execute.hint":
    "不要选择玩家，目标是除去阻挡者。即使Phantomon赢得战斗，Execute延后的消灭仍会执行。",
  "learn.lesson.drill-execute.step.opponent-turn": "等待回合结束处理完成，并进入电脑的回合。",
  "learn.lesson.drill-execute.step.opponent-turn.hint": "关键词攻击发生在回合真正交接之前，之后电脑会结束回合。",
  "learn.lesson.drill-execute.step.your-turn": "等待电脑结束回合，进入你的下一个主要阶段。",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon仍可攻击，场上已经没有阻挡者。",
  "learn.lesson.drill-execute.step.win": "用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-execute.step.win.hint": "电脑没有安防。Phantomon的牺牲清除了保护它的防线。",
  "learn.lesson.drill-progress.title": "Progress：攻击中抵御安防效果",
  "learn.lesson.drill-progress.summary": "借助Progress，穿过Cocytus Breath的效果并保住攻击者。",
  "learn.lesson.drill-progress.goal1": "Progress如何防止对手效果影响攻击者",
  "learn.lesson.drill-progress.goal2": "为什么Progress不能防止所有战斗落败",
  "learn.lesson.drill-progress.done": "Dimetromon在攻击中无视安防效果，并在下回合再次攻击获胜。",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon拥有Progress，攻击中不受对手效果影响。电脑最后一张安防是Cocytus Breath。",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath通常将一只对手的数码宝贝返回手牌。Progress会在该效果结算时保护攻击者。",
  "learn.lesson.drill-progress.step.progress": "用Dimetromon攻击玩家，观察Cocytus Breath结算后攻击者仍未回到手牌。",
  "learn.lesson.drill-progress.step.progress.hint":
    "保护仅针对攻击期间的对手效果，不能阻止因更强安防数码宝贝而发生的正常战斗消灭。",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon留在场上。点击“结束回合”。",
  "learn.lesson.drill-progress.step.end-turn.hint": "电脑没有数码宝贝可以攻击你。",
  "learn.lesson.drill-progress.step.your-turn": "等待你的下一个主要阶段。",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon会在你的回合开始时解除休息。",
  "learn.lesson.drill-progress.step.win": "用Dimetromon攻击玩家获胜。",
  "learn.lesson.drill-progress.step.win.hint": "没有Progress的保护，你唯一的攻击者早已返回手牌。",
  "learn.lesson.drill-engage.title": "Engage：回合结束处理期间攻击",
  "learn.lesson.drill-engage.summary": "保持攻击者可行动，并在结束回合后接受Engage攻击。",
  "learn.lesson.drill-engage.goal1": "Engage如何在你的回合结束时触发",
  "learn.lesson.drill-engage.goal2": "为什么该攻击会在对手回合开始前结算",
  "learn.lesson.drill-engage.done": "WarGrowlmon用Engage在回合结束处理期间攻击并获胜。",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon有Engage，电脑没有安防。你将通过回合结束时的关键词获胜，而不是使用普通的主要阶段攻击。",
  "learn.lesson.drill-engage.step.intro.hint": "Engage是可选效果。处理效果时，该攻击必须符合规则。",
  "learn.lesson.drill-engage.step.keep-ready": "保持WarGrowlmon未休息，以便使用Engage。准备好结束回合后继续。",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage本身不会解除休息，也不会让刚登场的数码宝贝无视正常的攻击等待。",
  "learn.lesson.drill-engage.step.engage": "点击“结束回合”，接受Engage并选择玩家作为攻击对象获胜。",
  "learn.lesson.drill-engage.step.engage.hint": "结束回合会给电脑3点内存值，但Engage及其攻击会在电脑回合开始前结算。",
  "learn.lesson.drill-barrier.title": "Barrier：支付安防保住数码宝贝",
  "learn.lesson.drill-barrier.summary": "保护在安防战斗中落败的Angemon，再用它获胜。",
  "learn.lesson.drill-barrier.goal1": "Barrier如何替代战斗消灭",
  "learn.lesson.drill-barrier.goal2": "为什么支付安防卡与检查安防不同",
  "learn.lesson.drill-barrier.done": "Angemon为Barrier支付1张安防，战斗后存活，并在下回合获胜。",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon有4000 DP和Barrier。电脑最后一张安防是5000 DP的Ikkakumon，因此Angemon会输掉战斗。",
  "learn.lesson.drill-barrier.step.intro.hint": "你有1张安防可以支付Barrier，防止Angemon的战斗消灭。",
  "learn.lesson.drill-barrier.step.barrier":
    "用Angemon攻击玩家。出现Barrier提示时接受，丢弃你的安防顶卡并保住Angemon。",
  "learn.lesson.drill-barrier.step.barrier.hint": "Barrier防止这次战斗消灭。丢弃的安防卡是费用，不会发动其安防效果。",
  "learn.lesson.drill-barrier.step.end-turn": "Angemon存活，双方都没有安防。点击“结束回合”。",
  "learn.lesson.drill-barrier.step.end-turn.hint": "电脑场上没有数码宝贝，因此此处可以安全地结束回合。",
  "learn.lesson.drill-barrier.step.your-turn": "等待你的下一个主要阶段。",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon会在你的回合开始时解除休息。",
  "learn.lesson.drill-barrier.step.win": "用Angemon攻击玩家获胜。",
  "learn.lesson.drill-barrier.step.win.hint": "Barrier保住了完成最后一击所需的唯一攻击者。",
  "learn.lesson.drill-training.title": "Training：培养赢得战斗的进化源",
  "learn.lesson.drill-training.summary": "训练Greymon，让它在下一次攻击中获得足以击败Blocker的DP。",
  "learn.lesson.drill-training.goal1": "Training如何休息数码宝贝，并将卡组顶卡背面朝下置于其下方",
  "learn.lesson.drill-training.goal2": "额外的背面进化源如何强化卡牌的其他效果",
  "learn.lesson.drill-training.done":
    "Greymon先训练一张背面进化源，再在攻击中添加另一张，以7000 DP击败阻挡者，随后Dracomon获胜。",
  "learn.lesson.drill-training.step.intro":
    "Greymon有Training和5000 DP。电脑的Grizzlymon有6000 DP和Blocker。Training能建立Greymon获胜所需的额外进化源。",
  "learn.lesson.drill-training.step.intro.hint":
    "Greymon的攻击效果让它每有一张背面进化源便获得+1000 DP。训练获得的背面卡不会提供其印刷的进化源效果。",
  "learn.lesson.drill-training.step.train":
    "点击Greymon并发动Training。它休息后，将卡组顶卡背面朝下置于其进化源最下方。",
  "learn.lesson.drill-training.step.train.hint":
    "Training不支付内存值。新增卡保持背面朝下，不能引用其印刷的名称、颜色或效果。",
  "learn.lesson.drill-training.step.end-turn": "点击“结束回合”，让Greymon在你的下回合恢复行动。",
  "learn.lesson.drill-training.step.end-turn.hint": "本练习中的电脑会结束回合而不攻击。",
  "learn.lesson.drill-training.step.your-turn": "等待你的主要阶段。Greymon解除休息，并保留训练获得的进化源。",
  "learn.lesson.drill-training.step.your-turn.hint": "Training添加的进化源会跨回合留在叠卡中，不是临时DP加成。",
  "learn.lesson.drill-training.step.battle":
    "用Greymon攻击玩家。接受其【攻击时】效果，再放一张卡组卡背面朝下并获得DP。电脑会用Grizzlymon阻挡。",
  "learn.lesson.drill-training.step.battle.hint":
    "两张背面进化源提供+2000 DP，7000高于6000。若未先训练，只有一张会使其达到6000 DP，双方都会落败。",
  "learn.lesson.drill-training.step.win": "阻挡者被除去后，用Dracomon攻击玩家获胜。",
  "learn.lesson.drill-training.step.win.hint":
    "保留Dracomon完成最后一击。Training建立的额外进化源让Greymon突破了防线。",
  "learn.lesson.drill-decoy.title": "Decoy：保护队友",
  "learn.lesson.drill-decoy.summary": "牺牲Machmon，保护BigMamemon免遭电脑的Gaia Force消灭。",
  "learn.lesson.drill-decoy.goal1": "哪些数码宝贝可以受到Decoy保护",
  "learn.lesson.drill-decoy.goal2": "用Decoy持有者支付费用，再发起反攻",
  "learn.lesson.drill-decoy.done": "Machmon支付Decoy费用，BigMamemon存活，并由这只获救的数码宝贝获胜。",
  "learn.lesson.drill-decoy.step.intro":
    "另一只自己的黑色数码宝贝将被对手效果消灭时，Decoy (黑色)可让Machmon消灭自身。电脑即将用Gaia Force指定你唯一的另一只数码宝贝BigMamemon。",
  "learn.lesson.drill-decoy.step.intro.hint":
    "规则16-18。该关键词保护另一只符合条件的数码宝贝，Machmon不能用它保护自身。",
  "learn.lesson.drill-decoy.step.react": "出现Decoy提示时，接受Machmon的保护。若需要选择保护方式，选择Machmon的Decoy。",
  "learn.lesson.drill-decoy.step.react.hint": "Machmon作为费用进入弃牌区。BigMamemon不被消灭，留在战斗区。",
  "learn.lesson.drill-decoy.step.your-turn": "等待电脑结束回合。存活的BigMamemon将可以攻击。",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "对手的Agumon仅用于满足Gaia Force的颜色条件；本练习中的电脑接下来会结束回合。",
  "learn.lesson.drill-decoy.step.attack-player": "点击BigMamemon，选择攻击，并指定对手的空安防区获胜。",
  "learn.lesson.drill-decoy.step.attack-player.hint": "这是刚才被Decoy保护的同一只BigMamemon。",
  "learn.lesson.drill-armor-purge.title": "Armor Purge：舍弃顶卡保住本体",
  "learn.lesson.drill-armor-purge.summary": "丢弃Quetzalmon，避免失去整只数码宝贝，让Gabumon留场。",
  "learn.lesson.drill-armor-purge.goal1": "通过丢弃最上方卡牌防止消灭",
  "learn.lesson.drill-armor-purge.goal2": "用下方存活的数码宝贝攻击",
  "learn.lesson.drill-armor-purge.done": "Quetzalmon被丢弃，Gabumon免于离场，并由Gabumon获胜。",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon拥有Armor Purge，下方有Gabumon。Gaia Force将消灭它时，可仅丢弃顶卡来防止该消灭。",
  "learn.lesson.drill-armor-purge.step.intro.hint": "规则16-19。这会丢弃装甲卡，不会将叠放的两张卡一并消灭。",
  "learn.lesson.drill-armor-purge.step.react": "电脑的Gaia Force将消灭Quetzalmon时，接受Armor Purge。",
  "learn.lesson.drill-armor-purge.step.react.hint": "Quetzalmon进入弃牌区。露出的Gabumon仍是场上的同一只数码宝贝。",
  "learn.lesson.drill-armor-purge.step.your-turn": "等待你的主要阶段。Gabumon存活，并可以攻击。",
  "learn.lesson.drill-armor-purge.step.your-turn.hint": "Armor Purge仅防止这一次消灭，不会永久免疫后续效果。",
  "learn.lesson.drill-armor-purge.step.attack-player": "点击Gabumon，选择攻击，并指定对手的空安防区。",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "下方存活的卡牌将完成最后一击。",
  "learn.lesson.drill-save.title": "Save：将资源保存在驯兽师下方",
  "learn.lesson.drill-save.summary": "Save保存Shoutmon，再利用同一张卡组建具有Rush的获胜数码宝贝。",
  "learn.lesson.drill-save.goal1": "将被消灭的卡以Save置于自己的驯兽师下方",
  "learn.lesson.drill-save.goal2": "将保存的卡重新用作数码合体素材",
  "learn.lesson.drill-save.done": "保存的Shoutmon成为王者形态的进化源，赋予其获胜所需的Rush。",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force将消灭Shoutmon。它的【消灭时】Save可将该卡置于工藤大器下方，而非留在弃牌区。手牌中的高吼兽（王者形态）可将其用于数码合体。",
  "learn.lesson.drill-save.step.intro.hint": "规则16-20。Save保留卡牌作为资源，但不会防止Shoutmon被消灭。",
  "learn.lesson.drill-save.step.react":
    "结算Shoutmon的【消灭时】效果并接受Save。若需选择接收的驯兽师，选择Taiki Kudo。",
  "learn.lesson.drill-save.step.react.hint": "Shoutmon此时应位于工藤大器下方，你的战斗区不再有数码宝贝。",
  "learn.lesson.drill-save.step.your-turn": "等待你的主要阶段。你将有3点内存值来重新利用保存的Shoutmon。",
  "learn.lesson.drill-save.step.your-turn.hint": "工藤大器可以休息，让数码合体使用你的驯兽师下方的卡。",
  "learn.lesson.drill-save.step.reuse":
    "选择手牌中的高吼兽（王者形态）并选择数码合体。选择工藤大器作为要休息的驯兽师，再选择其下保存的Shoutmon作为素材并确认。",
  "learn.lesson.drill-save.step.reuse.hint":
    "一张素材将费用从5减至3。Shoutmon的进化源效果会赋予这只名称含Shoutmon的数码宝贝Rush。",
  "learn.lesson.drill-save.step.attack-player": "用高吼兽（王者形态）攻击对手的空安防区。",
  "learn.lesson.drill-save.step.attack-player.hint":
    "若没有保存的进化源，这只刚登场的数码宝贝便没有现在攻击所需的继承Rush。",
  "learn.lesson.drill-material-save.title": "Material Save：救回进化源",
  "learn.lesson.drill-material-save.summary": "保存两张数码合体素材，再重组MetalGreymon以Rush攻击获胜。",
  "learn.lesson.drill-material-save.goal1": "从被消灭的叠卡中救出指定素材",
  "learn.lesson.drill-material-save.goal2": "重新利用两张获救卡来减少费用",
  "learn.lesson.drill-material-save.done": "两张获救素材以3点内存值重组MetalGreymon，并以Rush攻击获胜。",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon下方有Greymon和MailBirdramon。Gaia Force即将消灭它，Material Save 2可将这些指定数码合体素材置于苍沼切羽下方。",
  "learn.lesson.drill-material-save.step.intro.hint":
    "规则16-21。保存的是符合条件的进化源，而不是被消灭的MetalGreymon本身。",
  "learn.lesson.drill-material-save.step.react":
    "接受Material Save 2，选择Greymon和MailBirdramon，并在提示时将它们置于Kiriha Aonuma下方。",
  "learn.lesson.drill-material-save.step.react.hint":
    "使用两张符合条件的进化源。MetalGreymon进入弃牌区，素材则保存在苍沼切羽下方。",
  "learn.lesson.drill-material-save.step.your-turn": "等待你的主要阶段。你有3点内存值，手牌中还有另一张MetalGreymon。",
  "learn.lesson.drill-material-save.step.your-turn.hint": "苍沼切羽可以休息，允许数码合体使用你的驯兽师下方的素材。",
  "learn.lesson.drill-material-save.step.reuse":
    "选择手牌中的MetalGreymon并进行数码合体。选择苍沼切羽作为要休息的驯兽师，再选择其下两张保存的素材并确认。结算其【登场时】选择。",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "两张素材将费用从7减至3。其【登场时】效果赋予Rush，因此重组的数码宝贝可立即攻击。",
  "learn.lesson.drill-material-save.step.attack-player": "用重组的MetalGreymon攻击对手的空安防区。",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "救回的两张卡让费用变得可支付。Rush让这只新数码宝贝能够结束对局。",
  "learn.lesson.drill-evade.title": "Evade：休息以求生存",
  "learn.lesson.drill-evade.summary": "用Evade抵御Gaia Force，再在自己的回合解除休息并获胜。",
  "learn.lesson.drill-evade.goal1": "通过休息受威胁的数码宝贝支付费用",
  "learn.lesson.drill-evade.goal2": "面对对手的除去效果仍保留攻击者",
  "learn.lesson.drill-evade.done": "Syakomon休息以躲避消灭，随后解除休息并获胜。",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon拥有Evade。Gaia Force将消灭它时，可以休息Syakomon来防止这次消灭。支付该费用需要它能够休息。",
  "learn.lesson.drill-evade.step.intro.hint": "规则16-22。Syakomon当前未休息，而且是你唯一的攻击者。",
  "learn.lesson.drill-evade.step.react": "出现Evade提示时接受。Syakomon休息，并在Gaia Force后存活。",
  "learn.lesson.drill-evade.step.react.hint": "已经休息的数码宝贝不能再次支付此条件。这仅防止本次消灭，并非免疫效果。",
  "learn.lesson.drill-evade.step.your-turn": "等待电脑结束回合。Syakomon会在你的下一个活跃阶段解除休息。",
  "learn.lesson.drill-evade.step.your-turn.hint": "Gaia Force已在对手弃牌区，Syakomon仍留在场上。",
  "learn.lesson.drill-evade.step.attack-player": "点击Syakomon，选择攻击，并指定对手的空安防区。",
  "learn.lesson.drill-evade.step.attack-player.hint": "躲过消灭的数码宝贝将成为你获胜的攻击者。",
  "learn.lesson.drill-fortitude.title": "Fortitude：消灭后再次登场",
  "learn.lesson.drill-fortitude.summary": "在Gaia Force后再次登场Aquilamon，并用它的新生命获胜。",
  "learn.lesson.drill-fortitude.goal1": "Fortitude要求消灭时具有进化源",
  "learn.lesson.drill-fortitude.goal2": "再次登场的数码宝贝是新的数码宝贝",
  "learn.lesson.drill-fortitude.done": "Aquilamon没有进化源地返回，并在你的下回合获胜。",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon有Fortitude，下方有Kunemon。当Aquilamon在有进化源的状态下被消灭，Fortitude会不支付费用再次登场Aquilamon。",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "规则16-27。这不会防止消灭。再次登场的是新数码宝贝，原本的进化源留在弃牌区。",
  "learn.lesson.drill-fortitude.step.react":
    "让Gaia Force消灭Aquilamon，结算Fortitude触发。若触发面板要求确认，请确认这个必定执行的效果。",
  "learn.lesson.drill-fortitude.step.react.hint": "Aquilamon以新的场上身份返回，且没有进化源。Kunemon留在弃牌区。",
  "learn.lesson.drill-fortitude.step.your-turn":
    "等待你的回合。Aquilamon是在电脑回合再次登场的，因此在你的回合可以攻击。",
  "learn.lesson.drill-fortitude.step.your-turn.hint": "由于没有进化源，之后再被消灭也不会再次触发此Fortitude。",
  "learn.lesson.drill-fortitude.step.attack-player": "用再次登场的Aquilamon攻击对手的空安防区。",
  "learn.lesson.drill-fortitude.step.attack-player.hint": "获胜的是Fortitude带回的卡，而非原本那个场上实体。",
  "learn.lesson.drill-partition.title": "Partition：分成两只数码宝贝",
  "learn.lesson.drill-partition.summary": "将对手的消灭效果转变为两只等级4数码宝贝的登场机会。",
  "learn.lesson.drill-partition.goal1": "必须同时具有两种指定进化源",
  "learn.lesson.drill-partition.goal2": "在顶卡离场前登场两个部分",
  "learn.lesson.drill-partition.done": "Paildramon分成Ikkakumon和Togemon，并由Ikkakumon获胜。",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon有Partition，要求蓝色等级4和绿色等级4。其下方的Ikkakumon及Togemon符合要求。Gaia Force将尝试除去Paildramon。",
  "learn.lesson.drill-partition.step.intro.hint": "规则16-29。Partition针对对手效果，不适用于战斗离场或自己的效果。",
  "learn.lesson.drill-partition.step.react": "接受Partition，选择蓝色Ikkakumon和绿色Togemon，不支付费用登场两者。",
  "learn.lesson.drill-partition.step.react.hint":
    "必须从每种要求中各登场一只。Paildramon仍会离场，Partition不会防止其消灭。",
  "learn.lesson.drill-partition.step.your-turn": "等待你的主要阶段。两张原本的进化源现在是各自独立的数码宝贝。",
  "learn.lesson.drill-partition.step.your-turn.hint": "它们在对手回合登场，轮到你的回合便可以攻击。",
  "learn.lesson.drill-partition.step.attack-player": "用Ikkakumon攻击对手的空安防区。",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "也可以查看Togemon：同一次Partition将两张指定进化源都登场了。",
  "learn.lesson.drill-scapegoat.title": "Scapegoat：牺牲队友",
  "learn.lesson.drill-scapegoat.summary": "消灭Agumon，让Bastemon在电脑的Gaia Force后留场。",
  "learn.lesson.drill-scapegoat.goal1": "选择另一只数码宝贝作为费用",
  "learn.lesson.drill-scapegoat.goal2": "防止受威胁的数码宝贝被消灭",
  "learn.lesson.drill-scapegoat.done": "Agumon支付Scapegoat费用，存活的Bastemon获胜。",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon有Scapegoat。它将因自己的效果以外的原因被消灭时，可消灭自己另一只数码宝贝来防止该消灭。这里可以用Agumon支付。",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "规则16-32。你是牺牲另一只数码宝贝来拯救Bastemon，而不是牺牲Bastemon。",
  "learn.lesson.drill-scapegoat.step.react": "接受Scapegoat，选择自己的Agumon作为要消灭的数码宝贝。",
  "learn.lesson.drill-scapegoat.step.react.hint": "Agumon进入弃牌区，Bastemon留场。不要拒绝这次保护。",
  "learn.lesson.drill-scapegoat.step.your-turn": "等待电脑结算Gaia Force并结束回合，轮到你的回合。",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon仍是同一只数码宝贝，并将可以攻击。",
  "learn.lesson.drill-scapegoat.step.attack-player": "用Bastemon攻击对手的空安防区。",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "这次牺牲保住了更强的数码宝贝，让它能够获胜。",
  "learn.lesson.drill-decode.title": "Decode：离场前登场进化源",
  "learn.lesson.drill-decode.summary": "觉醒形态返回手牌时，将Sistermon Blanc从进化源中救出。",
  "learn.lesson.drill-decode.goal1": "Decode可响应战斗以外的离场",
  "learn.lesson.drill-decode.goal2": "不支付费用登场指定进化源",
  "learn.lesson.drill-decode.done": "Sistermon Blanc通过Decode离开叠卡，并完成了获胜攻击。",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened)拥有Decode (Sistermon Blanc)，下方有该确切名称的卡。电脑的Cocytus Breath将觉醒形态返回你的手牌。",
  "learn.lesson.drill-decode.step.intro.hint": "规则16-36。此次返回手牌不是战斗离场，因此可以响应Decode。",
  "learn.lesson.drill-decode.step.react":
    "接受Decode并从进化源中选择Sistermon Blanc。若有提示，结算修女兽白的【登场时】抽卡 1。",
  "learn.lesson.drill-decode.step.react.hint": "修女兽白作为独立数码宝贝登场。觉醒卡仍返回手牌，Decode不会阻止它离场。",
  "learn.lesson.drill-decode.step.your-turn":
    "等待你的主要阶段。通过Decode登场的Sistermon Blanc现在是你唯一的数码宝贝。",
  "learn.lesson.drill-decode.step.your-turn.hint": "它在电脑回合登场，因此可以在你的回合攻击。",
  "learn.lesson.drill-decode.step.attack-player": "用Sistermon Blanc攻击对手的空安防区。",
  "learn.lesson.drill-decode.step.attack-player.hint": "没有Decode，这张进化源本会随离场的叠卡一起被丢弃。",
  "learn.lesson.drill-fragment.title": "Fragment：用进化源支付费用",
  "learn.lesson.drill-fragment.summary": "丢弃两张进化源，保住受Gaia Force威胁的Giromon。",
  "learn.lesson.drill-fragment.goal1": "Fragment必须支付完整的指定进化源数量",
  "learn.lesson.drill-fragment.goal2": "恰好支付两张卡以防止消灭",
  "learn.lesson.drill-fragment.done": "Giromon为Fragment 2支付两张进化源，存活后赢下对局。",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon有Fragment (2)，下方有Jazamon和Jazardmon。Gaia Force将消灭它时，Fragment可丢弃两张进化源来防止该消灭。",
  "learn.lesson.drill-fragment.step.intro.hint": "规则16-37。只支付一张不够；Giromon恰好有需要的两张进化源。",
  "learn.lesson.drill-fragment.step.react": "接受Fragment，选择Jazamon和Jazardmon两张进化源丢弃。",
  "learn.lesson.drill-fragment.step.react.hint": "Giromon留场且不再有进化源，两张选定的卡进入弃牌区。",
  "learn.lesson.drill-fragment.step.your-turn": "等待电脑结束回合，进入你的主要阶段。",
  "learn.lesson.drill-fragment.step.your-turn.hint": "Giromon躲过了此次消灭，但已没有进化源再次支付Fragment。",
  "learn.lesson.drill-fragment.step.attack-player": "用Giromon攻击对手的空安防区。",
  "learn.lesson.drill-fragment.step.attack-player.hint": "支付Fragment的同一只Giromon将发起获胜攻击。",
  "learn.lesson.drill-guard.title": "Guard：防止返回手牌",
  "learn.lesson.drill-guard.summary": "牺牲Gladimon，阻止Cocytus Breath将BigMamemon返回手牌。",
  "learn.lesson.drill-guard.goal1": "Guard如何保护另一只数码宝贝免于对手的除去",
  "learn.lesson.drill-guard.goal2": "返回手牌也可以被防止",
  "learn.lesson.drill-guard.done": "Gladimon支付Guard来阻止返回，BigMamemon留场并获胜。",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon有Guard。另一只自己的数码宝贝将因对手效果离开战斗区时，Gladimon可消灭自身来防止离场。电脑将用Cocytus Breath指定BigMamemon。",
  "learn.lesson.drill-guard.step.intro.hint": "规则16-45。与仅能防止消灭的保护不同，Guard也能阻止这次返回手牌。",
  "learn.lesson.drill-guard.step.react": "出现保护提示时接受Gladimon的Guard。若要求选择反应顺序，选择Guard。",
  "learn.lesson.drill-guard.step.react.hint": "Gladimon作为费用被消灭。BigMamemon不会进入手牌，而是留在战斗区。",
  "learn.lesson.drill-guard.step.your-turn": "等待电脑结束回合并轮到你。若出现Gladimon的【消灭时】提示，请结算。",
  "learn.lesson.drill-guard.step.your-turn.hint": "电脑的Gabumon已是等级3且没有进化源，因此Gladimon不能剥去它的顶卡。",
  "learn.lesson.drill-guard.step.attack-player": "用BigMamemon攻击对手的空安防区。",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard让你最后一只攻击者得以留在场上。",
  "learn.lesson.drill-digisorption.title": "Digisorption：休息以减少内存值费用",
  "learn.lesson.drill-digisorption.summary": "休息Kunemon，以1点内存值进化Pistmon，再用Pistmon攻击。",
  "learn.lesson.drill-digisorption.goal1": "支付Digisorption要求的休息费用",
  "learn.lesson.drill-digisorption.goal2": "保持进化中的数码宝贝可攻击",
  "learn.lesson.drill-digisorption.done": "你支付了Digisorption费用，并以未休息的Pistmon获胜。",
  "learn.lesson.drill-digisorption.step.intro":
    "你只有1点内存值。Pistmon有Digisorption -2：其普通进化费用为3，但休息另一只数码宝贝可减至1，让你保留回合。",
  "learn.lesson.drill-digisorption.step.intro.hint": "休息Kunemon而非Lighdramon，让攻击者保持可行动。",
  "learn.lesson.drill-digisorption.step.digivolve":
    "将Pistmon进化到Lighdramon上。接受Digisorption，并选择Kunemon作为要休息的数码宝贝。",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "支付你的1点内存值后到达零，并保持Pistmon未休息。若未减费而支付3，攻击前内存值便会移至对手一侧。",
  "learn.lesson.drill-digisorption.step.attack-player": "用Pistmon攻击玩家获胜。",
  "learn.lesson.drill-digisorption.step.attack-player.hint": "对手没有安防，而Pistmon原本就以Lighdramon的身份在场上。",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst：消耗进化源",
  "learn.lesson.drill-digi-burst.summary": "丢弃两张进化源，先让阻挡者休息再发起攻击。",
  "learn.lesson.drill-digi-burst.goal1": "发动主要阶段的Digi-Burst效果",
  "learn.lesson.drill-digi-burst.goal2": "用恰好两张进化源支付费用",
  "learn.lesson.drill-digi-burst.done": "HerculesKabuterimon消耗两张进化源，使阻挡者无法阻挡，并打开获胜攻击的道路。",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon有主要阶段Digi-Burst 2。丢弃其两张进化源，可使一只对手数码宝贝休息。",
  "learn.lesson.drill-digi-burst.step.intro.hint": "Monochromon未休息时可以阻挡，请先让它休息。",
  "learn.lesson.drill-digi-burst.step.burst":
    "选择HerculesKabuterimon并发动Digi-Burst。选择Kunemon和Kabuterimon两张进化源丢弃，再选择Monochromon使其休息。",
  "learn.lesson.drill-digi-burst.step.burst.hint": "最上方的HerculesKabuterimon不是可以用作费用的进化源。",
  "learn.lesson.drill-digi-burst.step.attack-security": "用HerculesKabuterimon攻击玩家，检查最后一张安防。",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "已休息的Monochromon不能阻挡。",
  "learn.lesson.drill-digi-burst.step.attack-player": "用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-digi-burst.step.attack-player.hint": "仅除去最后一张安防并不会直接获胜。",
  "learn.lesson.drill-delay.title": "Delay：兑现准备好的选项卡",
  "learn.lesson.drill-delay.summary": "用增援·内存值推进!获得获胜Rush攻击所需的内存值。",
  "learn.lesson.drill-delay.goal1": "在放置回合之后发动Delay",
  "learn.lesson.drill-delay.goal2": "将保留的选项卡转化为3点内存值",
  "learn.lesson.drill-delay.done": "Delay提供了BushiAgumon的费用，随后它用Rush获胜。",
  "learn.lesson.drill-delay.step.intro": "增援·内存值推进!已在先前回合置于战斗区，现在可以使用Delay。你只有2点内存值。",
  "learn.lesson.drill-delay.step.intro.hint": "不能在该卡被放置的同一回合使用Delay。",
  "learn.lesson.drill-delay.step.delay": "选择增援·内存值推进!并发动Delay。丢弃它以获得3点内存值。",
  "learn.lesson.drill-delay.step.delay.hint": "你的内存值由2升至5。",
  "learn.lesson.drill-delay.step.play-rush": "从手牌支付5点内存值登场BushiAgumon。",
  "learn.lesson.drill-delay.step.play-rush.hint": "Delay带来的内存值让你支付后仍能停在零。",
  "learn.lesson.drill-delay.step.attack-player": "用BushiAgumon攻击玩家获胜。",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush允许这只刚登场的数码宝贝攻击。",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve：攻击中进化",
  "learn.lesson.drill-blast-digivolve.summary": "用WarGreymon的反击应对电脑攻击，阻挡后在下回合获胜。",
  "learn.lesson.drill-blast-digivolve.goal1": "在反击时点免费进化",
  "learn.lesson.drill-blast-digivolve.goal2": "在阻挡时点前获得Blocker",
  "learn.lesson.drill-blast-digivolve.done": "Blast Digivolve及时形成WarGreymon，挡下致命攻击，并在之后获胜。",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "你有0张安防，电脑即将攻击。你的MetalGreymon没有Blocker，但手牌WarGreymon可通过Blast Digivolve进化为阻挡者。",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "反击时点发生在阻挡时点之前。",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "出现反击提示时，选择手牌WarGreymon，在MetalGreymon上使用Blast Digivolve。",
  "learn.lesson.drill-blast-digivolve.step.counter.hint": "符合条件的进化不支付内存值，且仍会抽一张卡。",
  "learn.lesson.drill-blast-digivolve.step.block": "用新形成的WarGreymon阻挡来袭的Ikkakumon。",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon有11000 DP，Ikkakumon有5000 DP。",
  "learn.lesson.drill-blast-digivolve.step.your-turn": "你存活了。等待电脑结束回合，并让你的数码宝贝解除休息。",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "使用反击并不意味着你的回合已经开始。",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "用WarGreymon攻击玩家获胜。",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "电脑已没有安防，也没有阻挡者。",
  "learn.lesson.drill-mind-link.title": "Mind Link：将驯兽师变为进化源",
  "learn.lesson.drill-mind-link.summary": "将永住瑛士通过Mind Link置于Loogarmon下方，使用获得的Alliance，再结束对局。",
  "learn.lesson.drill-mind-link.goal1": "将符合条件的驯兽师置入进化源",
  "learn.lesson.drill-mind-link.goal2": "使用通过Mind Link获得的进化源效果",
  "learn.lesson.drill-mind-link.done": "永住瑛士成为进化源并赋予Alliance，帮助Loogarmon清除两张安防。",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi可与没有驯兽师进化源的Dark Animal或SoC数码宝贝进行Mind Link。Loogarmon符合条件。",
  "learn.lesson.drill-mind-link.step.intro.hint": "永住瑛士成为进化源后，其进化源效果赋予Alliance和Blocker。",
  "learn.lesson.drill-mind-link.step.mind-link": "选择永住瑛士并发动其主要阶段Mind Link效果，以Loogarmon为放置对象。",
  "learn.lesson.drill-mind-link.step.mind-link.hint": "永住瑛士移至Loogarmon下方，不再是战斗区中独立的驯兽师。",
  "learn.lesson.drill-mind-link.step.alliance":
    "用Loogarmon攻击玩家，以任意顺序结算攻击触发。使用Alliance时接受并休息Birdramon作为支援。Loogarmon可选的手牌费用效果可以拒绝，或丢弃1张卡来结算。两项触发都完成后再检查2张安防。",
  "learn.lesson.drill-mind-link.step.alliance.hint": "Alliance选择Birdramon，并让Dracomon保持未休息以完成最后一击。",
  "learn.lesson.drill-mind-link.step.attack-player": "用Dracomon攻击玩家获胜。",
  "learn.lesson.drill-mind-link.step.attack-player.hint": "Birdramon支付了Alliance，因此Dracomon仍可行动。",
  "learn.lesson.drill-blast-dna-digivolve.title": "突风合步：结合场上与手牌",
  "learn.lesson.drill-blast-dna-digivolve.summary": "使用场上的数码宝贝及手牌素材，在反击时点形成RagnaLoardmon。",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "在反击期间提供两种指定合步素材",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "攻击继续前结算仅限合步的除去效果",
  "learn.lesson.drill-blast-dna-digivolve.done": "RagnaLoardmon免费结合两种素材，除去攻击者，并在下回合获胜。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "你没有安防，电脑即将攻击。Durandamon在战斗区，BryweLudramon与RagnaLoardmon在手牌。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint": "突风合步需要场上的指定数码宝贝，以及手牌中另一张指定卡。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "在反击时使用RagnaLoardmon。选择Durandamon与手牌的BryweLudramon进行突风合步。结算效果，并选择正在攻击的Plesiomon消灭。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "其进化效果丢弃对手最后一张安防，合步专属效果会在攻击命中你之前消灭攻击者。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "等待电脑结束回合。新形成的RagnaLoardmon已准备好迎接你的回合。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint": "合步创造新的数码宝贝，并将两种素材结合为其进化源。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "用RagnaLoardmon攻击玩家获胜。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "攻击者在反击期间被消灭，因此你即使没有安防也存活了。",
  "learn.lesson.drill-link.title": "Link +：保留额外链接",
  "learn.lesson.drill-link.summary": "为Deusmon添加第二张链接卡，同时保留第一张。",
  "learn.lesson.drill-link.goal1": "支付链接费用以链接一张手牌",
  "learn.lesson.drill-link.goal2": "利用Link +1保留两张链接卡",
  "learn.lesson.drill-link.done": "Deusmon保留两张Navimon链接并检查安防，让Birdramon完成获胜攻击。",
  "learn.lesson.drill-link.step.intro":
    "数码宝贝通常最多保留1张链接卡。Deusmon有Link +1，所以上限为2。它已有一张Navimon链接。",
  "learn.lesson.drill-link.step.intro.hint": "链接卡横放在一旁，不属于进化源。",
  "learn.lesson.drill-link.step.link": "选择手牌中的Navimon，选择Link并指定Deusmon。支付1点内存值的链接费用。",
  "learn.lesson.drill-link.step.link.hint": "Deusmon可容纳2张链接，因此两张Navimon都会保留。",
  "learn.lesson.drill-link.step.attack-security": "用Deusmon攻击玩家，检查最后一张安防。",
  "learn.lesson.drill-link.step.attack-security.hint": "两张链接卡仍附着时，其链接DP加成持续有效。",
  "learn.lesson.drill-link.step.attack-player": "用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-link.step.attack-player.hint": "最后一击与安防检查是不同的攻击。",
  "learn.lesson.drill-use-req.title": "使用条件：以特征代替颜色条件",
  "learn.lesson.drill-use-req.summary": "在场上只提供黄色的情况下使用白色e-Pulse。",
  "learn.lesson.drill-use-req.goal1": "阅读使用条件的指定条件",
  "learn.lesson.drill-use-req.goal2": "仅无视颜色要求，仍支付选项卡费用",
  "learn.lesson.drill-use-req.done": "Liollmon满足使用条件，e-Pulse招来另一只数码宝贝，原本的Liollmon随后获胜。",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse是白色，但你的战斗区只有黄色Liollmon。其使用条件接受自己场上的BEATBREAK卡。",
  "learn.lesson.drill-use-req.step.intro.hint": "Liollmon具有BEATBREAK，因此可以无视白色要求。",
  "learn.lesson.drill-use-req.step.use-option":
    "从手牌支付3点内存值使用e-Pulse。接受其效果，不支付登场费用登场手牌中的另一张Liollmon。",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "使用条件免除的是颜色要求，而非3点内存值的使用费用。之后e-Pulse留在战斗区。",
  "learn.lesson.drill-use-req.step.attack-player": "用原本就在战斗区的Liollmon攻击玩家获胜。",
  "learn.lesson.drill-use-req.step.attack-player.hint": "新登场的Liollmon本回合不能攻击，请选择原本那一只。",
  "learn.lesson.drill-ascension.title": "Ascension：将消灭转化为安防",
  "learn.lesson.drill-ascension.summary": "让ScourgeChiropmon成为安防，撑过电脑回合后获胜。",
  "learn.lesson.drill-ascension.goal1": "实际战斗消灭后结算Ascension",
  "learn.lesson.drill-ascension.goal2": "利用新增安防撑过一个回合",
  "learn.lesson.drill-ascension.done": "ScourgeChiropmon升至安防，承受电脑攻击，让Birdramon得以获胜。",
  "learn.lesson.drill-ascension.step.intro":
    "你有0张安防。Birdramon本回合刚登场，必须等待。ScourgeChiropmon有Ascension，可在被消灭后成为你的安防。",
  "learn.lesson.drill-ascension.step.intro.hint": "电脑会在它的回合攻击，因此结束回合前你需要一张安防。",
  "learn.lesson.drill-ascension.step.ascend":
    "用ScourgeChiropmon攻击已休息的Plesiomon。它会战败。接受Ascension，将ScourgeChiropmon置于自己的安防最上方。",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon有8000 DP，Plesiomon有12000 DP。它的另一项消灭效果没有可用的驯兽师费用。",
  "learn.lesson.drill-ascension.step.end-turn": "新的安防卡已就位。结束你的回合。",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramon在登场的本回合仍不能攻击。",
  "learn.lesson.drill-ascension.step.your-turn": "让电脑攻击你的新安防卡，再等待你的回合。",
  "learn.lesson.drill-ascension.step.your-turn.hint": "若没有Ascension，你会在0张安防时被该次攻击击败。",
  "learn.lesson.drill-ascension.step.attack-player": "用Birdramon攻击玩家获胜。",
  "learn.lesson.drill-ascension.step.attack-player.hint": "Birdramon现在可以攻击，电脑也没有安防。",
  "learn.lesson.drill-detach.title": "Detach：消耗链接以留场",
  "learn.lesson.drill-detach.summary": "分离符合条件的Seven Code链接，阻止Cocytus Breath。",
  "learn.lesson.drill-detach.goal1": "对手效果将除去数码宝贝时使用Detach",
  "learn.lesson.drill-detach.goal2": "支付符合条件的链接，而非进化源",
  "learn.lesson.drill-detach.done": "Weatherdramon失去链接但留在战斗区，并在你的回合获胜。",
  "learn.lesson.drill-detach.step.intro":
    "电脑即将使用Cocytus Breath，将Weatherdramon返回你的手牌。Weatherdramon拥有指定Seven Code链接的Detach。",
  "learn.lesson.drill-detach.step.intro.hint": "其链接的Roleplaymon具有所需的Seven Code特征。",
  "learn.lesson.drill-detach.step.detach":
    "出现离场提示时，接受Detach并丢弃链接的Roleplaymon，让Weatherdramon留在战斗区。",
  "learn.lesson.drill-detach.step.detach.hint": "链接卡进入弃牌区。Weatherdramon失去链接DP，但不会返回手牌。",
  "learn.lesson.drill-detach.step.your-turn": "电脑已使用完选项卡，等待它结束回合。",
  "learn.lesson.drill-detach.step.your-turn.hint": "Detach防止离场，并非重新登场Weatherdramon。",
  "learn.lesson.drill-detach.step.attack-player": "用Weatherdramon攻击玩家获胜。",
  "learn.lesson.drill-detach.step.attack-player.hint": "因为保持了原本的场上存在，它可以在你的回合攻击。",
  "learn.lesson.drill-succession.title": "Succession：使用进化源卡的普通效果",
  "learn.lesson.drill-succession.summary": "通过Succession使用进化源Ceresmon的普通效果，在Palmon攻击中除去阻挡者。",
  "learn.lesson.drill-succession.goal1": "阅读Succession选取的最上方符合条件进化源",
  "learn.lesson.drill-succession.goal2": "结算复制的普通效果，而不是进化源效果栏",
  "learn.lesson.drill-succession.done":
    "Succession复制Ceresmon对休息的普通反应效果，消灭Monmon，让Palmon清除安防，再由Dracomon获胜。",
  "learn.lesson.drill-succession.step.intro":
    "顶端Ceresmon有Succession (Ceresmon)。其进化源Ceresmon有普通【双方回合】效果：每只发生休息的数码宝贝，使一只对手数码宝贝-3000 DP。Succession复制该普通效果。",
  "learn.lesson.drill-succession.step.intro.hint":
    "该文本位于进化源卡的普通效果栏，而非进化源效果栏。Monmon只有1000 DP。Palmon的2000 DP也高于安防数码宝贝的1000 DP。",
  "learn.lesson.drill-succession.step.copy-effect":
    "用Palmon攻击玩家。它的休息触发Ceresmon通过Succession获得的效果。选择Monmon使其-3000 DP，它会在阻挡前被消灭。随后Palmon检查最后一张安防并存活。",
  "learn.lesson.drill-succession.step.copy-effect.hint": "先结算复制的Ceresmon反应效果，再进入阻挡时点。",
  "learn.lesson.drill-succession.step.attack-player": "Palmon完成安防检查后，用Dracomon攻击玩家获胜。",
  "learn.lesson.drill-succession.step.attack-player.hint": "最后一次安防检查本身不会获胜，Dracomon会另行发起获胜攻击。",
  "learn.lesson.practice-game-preparation.title": "从初始手牌走向战斗胜利",
  "learn.lesson.practice-game-preparation.summary": "以合法卡组、各5张手牌、5张安防和零内存值开始，培养攻击者并获胜。",
  "learn.lesson.practice-game-preparation.goal1": "认识初始手牌、安防区、数码蛋卡组，以及先攻首回合的抽牌例外",
  "learn.lesson.practice-game-preparation.goal2": "培养一只数码宝贝，经过多个回合清除五张安防，再发起最后一次直接攻击",
  "learn.lesson.practice-game-preparation.done":
    "你从正常准备完毕的开局出发，经历养成、进化、内存值交接，并完成了最后一击。",
  "learn.lesson.practice-game-preparation.step.intro":
    "本局以五十张卡组、双方各五张手牌、五张安防和零内存值开始。你先攻，跳过第一次普通抽牌。电脑会结束回合，让你练习完整流程。",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "为手牌和安防各留出五张后，双方主卡组各剩四十张。数码蛋卡组独立计算。",
  "learn.lesson.practice-game-preparation.step.hatch": "从数码蛋卡组孵化Koromon，放入空的养成区。",
  "learn.lesson.practice-game-preparation.step.hatch.hint": "孵化不支付内存值，也不抽卡。它会用掉本回合的养成行动。",
  "learn.lesson.practice-game-preparation.step.rookie": "在养成区将Koromon进化为Agumon。此路线费用为零，并抽一张卡。",
  "learn.lesson.practice-game-preparation.step.rookie.hint": "使用手牌中的Agumon ST1-03，并选择Koromon作为进化基础。",
  "learn.lesson.practice-game-preparation.step.champion":
    "将养成中的Agumon进化为Greymon，支付两点内存值。处理完成后回合交给电脑。",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "即使在你的首回合，养成区进化仍会抽卡。内存值从零移至对手一侧的两点。",
  "learn.lesson.practice-game-preparation.step.move": "等待电脑结束回合。在你的下一个养成阶段，将Greymon移至战斗区。",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "移动不属于登场新数码宝贝。Greymon在移出养成区的本回合就可以攻击。",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "支付三点内存值，将Greymon进化为Garudamon。Greymon的进化源效果安防攻击 +1会让Garudamon进行两次检查。",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "进化源卡的普通效果与进化源效果不同，请阅读Greymon的下方效果栏。",
  "learn.lesson.practice-game-preparation.step.first-checks": "用Garudamon攻击玩家，从电脑的五张安防中逐张检查两张。",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon的DP足以在这些安防战斗中存活。电脑会剩下三张安防。",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "支付两点内存值登场Biyomon。这会将回合交给电脑，请保留Biyomon用于最后的获胜攻击。",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "刚登场的数码宝贝通常本回合不能攻击。电脑结束回合后，Biyomon便准备好了。",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "在你的回合用Garudamon攻击，它休息后便结束回合。重复至电脑安防为零，同时保留Biyomon进行最后一击。",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "养成阶段没有可用行动时可跳过。Garudamon每次攻击检查两张。最后一张安防被除去后，未用完的检查不会变成额外直接攻击。",
  "learn.lesson.practice-game-preparation.step.win": "电脑没有安防。用Biyomon攻击玩家，赢下对局。",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "清空安防后仍需要这一次独立的成功攻击。Biyomon在之前的回合登场，现在可以攻击。",
  "learn.lesson.practice-rule-checks.title": "规则检查：消灭零DP数码宝贝",
  "learn.lesson.practice-rule-checks.summary": "用黄色选项卡将阻挡者的DP减至零以下，观察规则消灭，再用Salamon获胜。",
  "learn.lesson.practice-rule-checks.goal1": "满足选项卡的颜色条件并结算DP削减",
  "learn.lesson.practice-rule-checks.goal2": "区分规则检查造成的消灭与效果直接指示的消灭",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens降低Monochromon的DP，规则检查将其消灭，让Salamon完成获胜攻击。",
  "learn.lesson.practice-rule-checks.step.intro":
    "电脑没有安防，但Monochromon能阻挡Salamon。Seven Heavens给予-10000 DP；战斗区中DP为零或更低的数码宝贝会被规则消灭。",
  "learn.lesson.practice-rule-checks.step.intro.hint": "Salamon满足选项卡的黄色要求。你有九点内存值，选项卡费用为七。",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "从手牌使用Seven Heavens，选择电脑的Monochromon并确认对象。观察效果结算后它进入弃牌区。",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "选项卡仅给予DP削减。最终DP为零或更低时，由规则17-1-3-1-1执行消灭。",
  "learn.lesson.practice-rule-checks.step.win": "阻挡者已离场。用Salamon攻击玩家获胜。",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon在本回合开始前已在战斗区。使用选项卡后还剩两点内存值，因此回合仍属于你。",
} satisfies Record<keyof typeof newDrillsEn, string>;
