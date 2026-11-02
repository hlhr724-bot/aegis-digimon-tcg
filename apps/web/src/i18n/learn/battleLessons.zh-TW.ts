import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnZhTW } from "@/i18n/learn/learn.zh-TW";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsZhTW = {
  ...buildRulePracticeTranslations({ dictionary: learnZhTW }),
  "learn.lesson.drill-retaliation.title": "Retaliation：以弱換強",
  "learn.lesson.drill-retaliation.summary": "用Retaliation在戰鬥落敗後消滅更強的Blocker，再贏下對戰。",
  "learn.lesson.drill-retaliation.goal1": "Retaliation如何消滅贏得戰鬥的數碼寶貝",
  "learn.lesson.drill-retaliation.goal2": "為什麼弱小的攻擊者也能除去更強的防守者",
  "learn.lesson.drill-retaliation.done": "Candlemon戰敗後以Retaliation消滅Monochromon，為最後一擊打開了道路。",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon有1000 DP和Retaliation。機器人的Monochromon已橫置，有5000 DP和Blocker。輸掉這場戰鬥反而能除去阻擋者。",
  "learn.lesson.drill-retaliation.step.intro.hint": "此數碼寶貝與另一隻數碼寶貝戰鬥落敗並被消滅時，Retaliation觸發。",
  "learn.lesson.drill-retaliation.step.retaliate":
    "點擊Candlemon，選擇攻擊，再選已橫置的Monochromon。等待戰鬥和Retaliation結算。",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon因DP較低而落敗。之後Retaliation消滅Monochromon；這是效果消滅，不是第二場戰鬥。",
  "learn.lesson.drill-retaliation.step.win": "Monochromon已離場，機器人沒有安防。用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-retaliation.step.win.hint": "保留Birdramon完成最後一擊，不要在第一場戰鬥中犧牲它。",
  "learn.lesson.drill-blitz.title": "Blitz：跨過零點後攻擊",
  "learn.lesson.drill-blitz.summary": "進化讓記憶體跨過零點後，在回合結束前使用Blitz。",
  "learn.lesson.drill-blitz.goal1": "為什麼費用跨過零點後仍能結算進化效果",
  "learn.lesson.drill-blitz.goal2": "Blitz如何在對手有記憶體時允許攻擊",
  "learn.lesson.drill-blitz.done": "BetelGammamon進化使記憶體移至對手一側，並以Blitz攻擊獲勝。",
  "learn.lesson.drill-blitz.step.intro":
    "你有1記憶體和場上的Biyomon。BetelGammamon的進化費用是2，擁有【進化時】Blitz。",
  "learn.lesson.drill-blitz.step.intro.hint":
    "機器人沒有安防。付款後必須透過Blitz提示攻擊，已經不能再開始普通的主要階段行動。",
  "learn.lesson.drill-blitz.step.digivolve": "將手牌的BetelGammamon進化到Biyomon上。付款後對手得到1記憶體。",
  "learn.lesson.drill-blitz.step.digivolve.hint": "進化改變現有數碼寶貝，不會重置其能否攻擊的狀態紀錄。",
  "learn.lesson.drill-blitz.step.blitz-attack": "接受Blitz效果，再用BetelGammamon攻擊玩家，在回合交接前獲勝。",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz允許在機器人有記憶體時進行這次攻擊，本身不會賦予Rush，也不會重置攻擊者。",
  "learn.lesson.drill-raid.title": "Raid：挑戰最強的未橫置數碼寶貝",
  "learn.lesson.drill-raid.summary": "用Raid將攻擊對象改為未橫置的Blocker。",
  "learn.lesson.drill-raid.goal1": "Raid如何改變已宣言攻擊的對象",
  "learn.lesson.drill-raid.goal2": "對象必須是對手未橫置數碼寶貝中DP最高的原因",
  "learn.lesson.drill-raid.done": "Grizzlymon用Raid除去Monochromon，Birdramon完成最後一擊。",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon有Raid，並從下方Agumon獲得+1000 DP。機器人有一隻未橫置的5000 DP Monochromon。",
  "learn.lesson.drill-raid.step.intro.hint": "通常不能宣言攻擊未橫置的數碼寶貝。Raid在宣言後改變對象。",
  "learn.lesson.drill-raid.step.raid": "用Grizzlymon攻擊玩家。在Raid選擇中，將Monochromon選為新對象。",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon有6000 DP，會贏得戰鬥。Monochromon是符合條件的未橫置且DP最高的對象。",
  "learn.lesson.drill-raid.step.win": "阻擋者已離場。用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-raid.step.win.hint": "Raid改變對象後沒有進行安防檢查；Birdramon會發起另一次攻擊。",
  "learn.lesson.drill-collision.title": "Collision：迫使機器人阻擋",
  "learn.lesson.drill-collision.summary": "迫使未印有Blocker的數碼寶貝防守，再用Piercing檢查安防。",
  "learn.lesson.drill-collision.goal1": "Collision如何在攻擊期間賦予對手數碼寶貝Blocker",
  "learn.lesson.drill-collision.goal2": "為什麼防守方能阻擋時就必須阻擋",
  "learn.lesson.drill-collision.done": "Proganomon迫使Gomamon阻擋，以Piercing打破最後一張安防，Birdramon隨後獲勝。",
  "learn.lesson.drill-collision.step.intro": "Proganomon有Collision和Piercing。機器人有未印Blocker的Gomamon和1張安防。",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision在本次攻擊期間賦予對手數碼寶貝Blocker，並要求機器人能阻擋時必須阻擋。",
  "learn.lesson.drill-collision.step.collision":
    "用Proganomon攻擊玩家。觀察機器人用Gomamon阻擋並戰敗，隨後因Piercing受到安防檢查。",
  "learn.lesson.drill-collision.step.collision.hint":
    "機器人不能拒絕可用的阻擋。Proganomon有7000 DP，Gomamon有3000 DP。",
  "learn.lesson.drill-collision.step.win": "機器人沒有安防，也沒有防守者。用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-collision.step.win.hint": "Collision迫使戰鬥發生；Proganomon獲勝後，由Piercing帶來安防檢查。",
  "learn.lesson.drill-vortex.title": "Vortex：回合結束時再戰",
  "learn.lesson.drill-vortex.summary": "登場Galemon，並用Vortex在同一回合攻擊一隻數碼寶貝。",
  "learn.lesson.drill-vortex.goal1": "Vortex如何產生回合結束時的攻擊",
  "learn.lesson.drill-vortex.goal2": "為什麼Vortex能在登場回合攻擊，但通常只能以數碼寶貝為物件",
  "learn.lesson.drill-vortex.done": "Galemon在登場回合用Vortex除去Monochromon，並在下回合獲勝。",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon有Vortex。機器人有已橫置的Monochromon，沒有安防。Galemon可以在回合結束時除去該阻擋者。",
  "learn.lesson.drill-vortex.step.intro.hint": "剛登場的數碼寶貝通常不能在該回合攻擊。Vortex在回合結束時提供特定例外。",
  "learn.lesson.drill-vortex.step.play": "從手牌支付6點記憶體登場Galemon。",
  "learn.lesson.drill-vortex.step.play.hint": "記憶體變為零。Galemon剛登場，不能進行普通攻擊。",
  "learn.lesson.drill-vortex.step.vortex": "點選“結束回合”，接受Vortex，並選擇已橫置的Monochromon為攻擊物件。",
  "learn.lesson.drill-vortex.step.vortex.hint": "Vortex通常不能攻擊玩家。Galemon的6000 DP高於Monochromon的5000 DP。",
  "learn.lesson.drill-vortex.step.opponent-turn": "等待回合結束處理完成，並進入機器人的回合。",
  "learn.lesson.drill-vortex.step.opponent-turn.hint": "關鍵詞攻擊發生在回合真正交接之前，之後機器人會結束回合。",
  "learn.lesson.drill-vortex.step.your-turn": "等待機器人結束回合，進入你的下一個主要階段。",
  "learn.lesson.drill-vortex.step.your-turn.hint": "Galemon會在你的回合開始時重置，也不再屬於本回合登場的數碼寶貝。",
  "learn.lesson.drill-vortex.step.win": "用Galemon進行普通的對玩家攻擊以獲勝。",
  "learn.lesson.drill-vortex.step.win.hint": "這是普通的主要階段攻擊，不受Vortex只能攻擊數碼寶貝的限制。",
  "learn.lesson.drill-overclock.title": "Overclock：不重置也能再攻",
  "learn.lesson.drill-overclock.summary": "犧牲一隻Puppet，讓已橫置的ShoeShoemon在回合結束時攻擊。",
  "learn.lesson.drill-overclock.goal1": "如何消滅另一隻指定數碼寶貝來支付Overclock",
  "learn.lesson.drill-overclock.goal2": "為什麼已橫置的數碼寶貝也能進行不需橫置的攻擊",
  "learn.lesson.drill-overclock.done": "ShoeShoemon檢查安防後，為Overclock消滅Shoemon，並在不重置的情況下再次攻擊。",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon擁有指定Puppet特徵的Overclock。另一隻Puppet——Shoemon是本回合登場的，請保留它作為費用。",
  "learn.lesson.drill-overclock.step.intro.hint": "Overclock不需橫置便可攻擊玩家，即使ShoeShoemon已經橫置也能使用。",
  "learn.lesson.drill-overclock.step.clear-security": "用ShoeShoemon攻擊玩家，除去最後一張安防。",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "這次攻擊後ShoeShoemon仍處於橫置狀態。不要拒絕接下來的關鍵詞提示。",
  "learn.lesson.drill-overclock.step.overclock":
    "點選“結束回合”並接受Overclock。唯一符合條件的Puppet——Shoemon會作為費用被消滅。然後選擇玩家作為攻擊物件獲勝。",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "費用由Shoemon而非ShoeShoemon支付。支付後必須進行Overclock的對玩家攻擊，無需重置。",
  "learn.lesson.drill-iceclad.title": "Iceclad：靠更多進化源獲勝",
  "learn.lesson.drill-iceclad.summary": "透過比較進化源數量，擊敗12000 DP的數碼寶貝。",
  "learn.lesson.drill-iceclad.goal1": "Iceclad如何替換數碼寶貝戰鬥中的DP比較",
  "learn.lesson.drill-iceclad.goal2": "為什麼安防戰鬥仍然比較DP",
  "learn.lesson.drill-iceclad.done":
    "PolarBearmon憑兩張進化源擊敗零進化源的WarGreymon，儘管DP更低仍存活，隨後Birdramon獲勝。",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon有7000 DP、Iceclad和2張進化源。已橫置的WarGreymon有12000 DP，但沒有進化源。",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad在安防戰鬥以外以進化源數量代替DP比較。更多者獲勝，相等則雙方落敗。",
  "learn.lesson.drill-iceclad.step.iceclad": "用PolarBearmon攻擊已橫置的WarGreymon，等待Iceclad戰鬥結算。",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "比較的是2張進化源和0張，不是7000 DP和12000 DP。PolarBearmon獲勝並存活。",
  "learn.lesson.drill-iceclad.step.win": "WarGreymon已離場，機器人沒有安防。用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-iceclad.step.win.hint": "與安防數碼寶貝戰鬥仍比較DP，不適用Iceclad的進化源數量比較。",
  "learn.lesson.drill-execute.title": "Execute：犧牲攻擊者突破防線",
  "learn.lesson.drill-execute.summary": "在回合結束時攻擊未橫置的Blocker，然後讓自己的攻擊者消滅。",
  "learn.lesson.drill-execute.goal1": "Execute如何允許在回合結束時攻擊未橫置的數碼寶貝",
  "learn.lesson.drill-execute.goal2": "為什麼攻擊者會在該次攻擊結束時被消滅",
  "learn.lesson.drill-execute.done": "Phantomon以Execute擊敗Monochromon後被消滅，Birdramon在你的下回合獲勝。",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon有Execute和7000 DP。機器人未橫置的Monochromon有5000 DP，可以阻擋Birdramon。",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute允許Phantomon在你的回合結束時攻擊，包括攻擊對手未橫置的數碼寶貝。攻擊結束時它會被消滅。",
  "learn.lesson.drill-execute.step.execute":
    "點選“結束回合”，接受Execute並選擇Monochromon。等待戰鬥及Phantomon的消滅完成。",
  "learn.lesson.drill-execute.step.execute.hint":
    "不要選擇玩家，目標是除去阻擋者。即使Phantomon贏得戰鬥，Execute延後的消滅仍會執行。",
  "learn.lesson.drill-execute.step.opponent-turn": "等待回合結束處理完成，並進入機器人的回合。",
  "learn.lesson.drill-execute.step.opponent-turn.hint": "關鍵詞攻擊發生在回合真正交接之前，之後機器人會結束回合。",
  "learn.lesson.drill-execute.step.your-turn": "等待機器人結束回合，進入你的下一個主要階段。",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon仍可攻擊，場上已經沒有阻擋者。",
  "learn.lesson.drill-execute.step.win": "用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-execute.step.win.hint": "機器人沒有安防。Phantomon的犧牲清除了保護它的防線。",
  "learn.lesson.drill-progress.title": "Progress：攻擊中抵禦安防效果",
  "learn.lesson.drill-progress.summary": "藉助Progress，穿過Cocytus Breath的效果並保住攻擊者。",
  "learn.lesson.drill-progress.goal1": "Progress如何防止對手效果影響攻擊者",
  "learn.lesson.drill-progress.goal2": "為什麼Progress不能防止所有戰鬥落敗",
  "learn.lesson.drill-progress.done": "Dimetromon在攻擊中無視安防效果，並在下回合再次攻擊獲勝。",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon擁有Progress，攻擊中不受對手效果影響。機器人最後一張安防是Cocytus Breath。",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath通常將一隻對手的數碼寶貝返回手牌。Progress會在該效果結算時保護攻擊者。",
  "learn.lesson.drill-progress.step.progress": "用Dimetromon攻擊玩家，觀察Cocytus Breath結算後攻擊者仍未回到手牌。",
  "learn.lesson.drill-progress.step.progress.hint":
    "保護僅針對攻擊期間的對手效果，不能阻止因更強安防數碼寶貝而發生的正常戰鬥消滅。",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon留在場上。點選“結束回合”。",
  "learn.lesson.drill-progress.step.end-turn.hint": "機器人沒有數碼寶貝可以攻擊你。",
  "learn.lesson.drill-progress.step.your-turn": "等待你的下一個主要階段。",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon會在你的回合開始時重置。",
  "learn.lesson.drill-progress.step.win": "用Dimetromon攻擊玩家獲勝。",
  "learn.lesson.drill-progress.step.win.hint": "沒有Progress的保護，你唯一的攻擊者早已返回手牌。",
  "learn.lesson.drill-engage.title": "Engage：回合結束處理期間攻擊",
  "learn.lesson.drill-engage.summary": "保持攻擊者可行動，並在結束回合後接受Engage攻擊。",
  "learn.lesson.drill-engage.goal1": "Engage如何在你的回合結束時觸發",
  "learn.lesson.drill-engage.goal2": "為什麼該攻擊會在對手回合開始前結算",
  "learn.lesson.drill-engage.done": "WarGrowlmon用Engage在回合結束處理期間攻擊並獲勝。",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon有Engage，機器人沒有安防。你將透過回合結束時的關鍵詞獲勝，而不是使用普通的主要階段攻擊。",
  "learn.lesson.drill-engage.step.intro.hint": "Engage是可選效果。處理效果時，該攻擊必須符合規則。",
  "learn.lesson.drill-engage.step.keep-ready": "保持WarGrowlmon未橫置，以便使用Engage。準備好結束回合後繼續。",
  "learn.lesson.drill-engage.step.keep-ready.hint": "Engage本身不會重置，也不會讓剛登場的數碼寶貝無視正常的攻擊等待。",
  "learn.lesson.drill-engage.step.engage": "點選“結束回合”，接受Engage並選擇玩家作為攻擊物件獲勝。",
  "learn.lesson.drill-engage.step.engage.hint":
    "結束回合會給機器人3點記憶體，但Engage及其攻擊會在機器人回合開始前結算。",
  "learn.lesson.drill-barrier.title": "Barrier：支付安防保住數碼寶貝",
  "learn.lesson.drill-barrier.summary": "保護在安防戰鬥中落敗的Angemon，再用它獲勝。",
  "learn.lesson.drill-barrier.goal1": "Barrier如何替代戰鬥消滅",
  "learn.lesson.drill-barrier.goal2": "為什麼支付安防卡與檢查安防不同",
  "learn.lesson.drill-barrier.done": "Angemon為Barrier支付1張安防，戰鬥後存活，並在下回合獲勝。",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon有4000 DP和Barrier。機器人最後一張安防是5000 DP的Ikkakumon，因此Angemon會輸掉戰鬥。",
  "learn.lesson.drill-barrier.step.intro.hint": "你有1張安防可以支付Barrier，防止Angemon的戰鬥消滅。",
  "learn.lesson.drill-barrier.step.barrier":
    "用Angemon攻擊玩家。出現Barrier提示時接受，丟棄你的安防頂卡並保住Angemon。",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier防止這次戰鬥消滅。丟棄的安防卡是費用，不會發動其Security效果。",
  "learn.lesson.drill-barrier.step.end-turn": "Angemon存活，雙方都沒有安防。點選“結束回合”。",
  "learn.lesson.drill-barrier.step.end-turn.hint": "機器人場上沒有數碼寶貝，因此此處可以安全地結束回合。",
  "learn.lesson.drill-barrier.step.your-turn": "等待你的下一個主要階段。",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon會在你的回合開始時重置。",
  "learn.lesson.drill-barrier.step.win": "用Angemon攻擊玩家獲勝。",
  "learn.lesson.drill-barrier.step.win.hint": "Barrier保住了完成最後一擊所需的唯一攻擊者。",
  "learn.lesson.drill-training.title": "Training：培養贏得戰鬥的進化源",
  "learn.lesson.drill-training.summary": "訓練Greymon，讓它在下一次攻擊中獲得足以擊敗Blocker的DP。",
  "learn.lesson.drill-training.goal1": "Training如何橫置數碼寶貝，並將卡組頂卡背面朝下置於其下方",
  "learn.lesson.drill-training.goal2": "額外的背面進化源如何強化卡牌的其他效果",
  "learn.lesson.drill-training.done":
    "Greymon先訓練一張背面進化源，再在攻擊中新增另一張，以7000 DP擊敗阻擋者，隨後Dracomon獲勝。",
  "learn.lesson.drill-training.step.intro":
    "Greymon有Training和5000 DP。機器人的Grizzlymon有6000 DP和Blocker。Training能建立Greymon獲勝所需的額外進化源。",
  "learn.lesson.drill-training.step.intro.hint":
    "Greymon的攻擊效果讓它每有一張背面進化源便獲得+1000 DP。訓練獲得的背面卡不會提供其印刷的進化源效果。",
  "learn.lesson.drill-training.step.train":
    "點選Greymon並發動Training。它橫置後，將卡組頂卡背面朝下置於其進化源最下方。",
  "learn.lesson.drill-training.step.train.hint":
    "Training不支付記憶體。新增卡保持背面朝下，不能引用其印刷的名稱、顏色或效果。",
  "learn.lesson.drill-training.step.end-turn": "點選“結束回合”，讓Greymon在你的下回合恢復行動。",
  "learn.lesson.drill-training.step.end-turn.hint": "本練習中的機器人會結束回合而不攻擊。",
  "learn.lesson.drill-training.step.your-turn": "等待你的主要階段。Greymon重置，並保留訓練獲得的進化源。",
  "learn.lesson.drill-training.step.your-turn.hint": "Training新增的進化源會跨回合留在疊卡中，不是臨時DP加成。",
  "learn.lesson.drill-training.step.battle":
    "用Greymon攻擊玩家。接受其【攻擊時】效果，再放一張卡組卡背面朝下並獲得DP。機器人會用Grizzlymon阻擋。",
  "learn.lesson.drill-training.step.battle.hint":
    "兩張背面進化源提供+2000 DP，7000高於6000。若未先訓練，只有一張會使其達到6000 DP，雙方都會落敗。",
  "learn.lesson.drill-training.step.win": "阻擋者被除去後，用Dracomon攻擊玩家獲勝。",
  "learn.lesson.drill-training.step.win.hint":
    "保留Dracomon完成最後一擊。Training建立的額外進化源讓Greymon突破了防線。",
  "learn.lesson.drill-decoy.title": "Decoy：保護隊友",
  "learn.lesson.drill-decoy.summary": "犧牲Machmon，保護BigMamemon免遭機器人的Gaia Force消滅。",
  "learn.lesson.drill-decoy.goal1": "哪些數碼寶貝可以受到Decoy保護",
  "learn.lesson.drill-decoy.goal2": "用Decoy持有者支付費用，再發起反攻",
  "learn.lesson.drill-decoy.done": "Machmon支付Decoy費用，BigMamemon存活，並由這隻獲救的數碼寶貝獲勝。",
  "learn.lesson.drill-decoy.step.intro":
    "另一隻自己的黑色數碼寶貝將被對手效果消滅時，Decoy (Black)可讓Machmon消滅自身。機器人即將用Gaia Force指定你唯一的另一隻數碼寶貝BigMamemon。",
  "learn.lesson.drill-decoy.step.intro.hint":
    "規則16-18。該關鍵詞保護另一隻符合條件的數碼寶貝，Machmon不能用它保護自身。",
  "learn.lesson.drill-decoy.step.react": "出現Decoy提示時，接受Machmon的保護。若需要選擇保護方式，選擇Machmon的Decoy。",
  "learn.lesson.drill-decoy.step.react.hint": "Machmon作為費用進入棄牌區。BigMamemon不被消滅，留在戰鬥區。",
  "learn.lesson.drill-decoy.step.your-turn": "等待機器人結束回合。存活的BigMamemon將可以攻擊。",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "對手的Agumon僅用於滿足Gaia Force的顏色條件；本練習中的機器人接下來會結束回合。",
  "learn.lesson.drill-decoy.step.attack-player": "點選BigMamemon，選擇攻擊，並指定對手的空安防區獲勝。",
  "learn.lesson.drill-decoy.step.attack-player.hint": "這是剛才被Decoy保護的同一只BigMamemon。",
  "learn.lesson.drill-armor-purge.title": "Armor Purge：捨棄頂卡保住本體",
  "learn.lesson.drill-armor-purge.summary": "丟棄Quetzalmon，避免失去整隻數碼寶貝，讓Gabumon留場。",
  "learn.lesson.drill-armor-purge.goal1": "透過丟棄最上方卡牌防止消滅",
  "learn.lesson.drill-armor-purge.goal2": "用下方存活的數碼寶貝攻擊",
  "learn.lesson.drill-armor-purge.done": "Quetzalmon被丟棄，Gabumon免於離場，並由Gabumon獲勝。",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon擁有Armor Purge，下方有Gabumon。Gaia Force將消滅它時，可僅丟棄頂卡來防止該消滅。",
  "learn.lesson.drill-armor-purge.step.intro.hint": "規則16-19。這會丟棄裝甲卡，不會將疊放的兩張卡一併消滅。",
  "learn.lesson.drill-armor-purge.step.react": "機器人的Gaia Force將消滅Quetzalmon時，接受Armor Purge。",
  "learn.lesson.drill-armor-purge.step.react.hint": "Quetzalmon進入棄牌區。露出的Gabumon仍是場上的同一只數碼寶貝。",
  "learn.lesson.drill-armor-purge.step.your-turn": "等待你的主要階段。Gabumon存活，並可以攻擊。",
  "learn.lesson.drill-armor-purge.step.your-turn.hint": "Armor Purge僅防止這一次消滅，不會永久免疫後續效果。",
  "learn.lesson.drill-armor-purge.step.attack-player": "點選Gabumon，選擇攻擊，並指定對手的空安防區。",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "下方存活的卡牌將完成最後一擊。",
  "learn.lesson.drill-save.title": "Save：將資源儲存在Tamer下方",
  "learn.lesson.drill-save.summary": "Save儲存Shoutmon，再利用同一張卡組建具有Rush的獲勝數碼寶貝。",
  "learn.lesson.drill-save.goal1": "將被消滅的卡以Save置於自己的Tamer下方",
  "learn.lesson.drill-save.goal2": "將儲存的卡重新用作DigiXros素材",
  "learn.lesson.drill-save.done": "儲存的Shoutmon成為King Version的進化源，賦予其獲勝所需的Rush。",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force將消滅Shoutmon。它的【消滅時】Save可將該卡置於Taiki下方，而非留在棄牌區。手牌中的Shoutmon (King Version)可將其用於DigiXros。",
  "learn.lesson.drill-save.step.intro.hint": "規則16-20。Save保留卡牌作為資源，但不會防止Shoutmon被消滅。",
  "learn.lesson.drill-save.step.react": "結算Shoutmon的【消滅時】效果並接受Save。若需選擇接收的Tamer，選擇Taiki Kudo。",
  "learn.lesson.drill-save.step.react.hint": "Shoutmon此時應位於Taiki下方，你的戰鬥區不再有數碼寶貝。",
  "learn.lesson.drill-save.step.your-turn": "等待你的主要階段。你將有3點記憶體來重新利用儲存的Shoutmon。",
  "learn.lesson.drill-save.step.your-turn.hint": "Taiki可以橫置，讓DigiXros使用你的Tamer下方的卡。",
  "learn.lesson.drill-save.step.reuse":
    "選擇手牌中的Shoutmon (King Version)並選擇DigiXros。選擇Taiki作為要橫置的Tamer，再選擇其下儲存的Shoutmon作為素材並確認。",
  "learn.lesson.drill-save.step.reuse.hint":
    "一張素材將費用從5減至3。Shoutmon的進化源效果會賦予這隻名稱含Shoutmon的數碼寶貝Rush。",
  "learn.lesson.drill-save.step.attack-player": "用Shoutmon (King Version)攻擊對手的空安防區。",
  "learn.lesson.drill-save.step.attack-player.hint":
    "若沒有儲存的進化源，這隻剛登場的數碼寶貝便沒有現在攻擊所需的繼承Rush。",
  "learn.lesson.drill-material-save.title": "Material Save：救回進化源",
  "learn.lesson.drill-material-save.summary": "儲存兩張DigiXros素材，再重組MetalGreymon以Rush攻擊獲勝。",
  "learn.lesson.drill-material-save.goal1": "從被消滅的疊卡中救出指定素材",
  "learn.lesson.drill-material-save.goal2": "重新利用兩張獲救卡來減少費用",
  "learn.lesson.drill-material-save.done": "兩張獲救素材以3點記憶體重組MetalGreymon，並以Rush攻擊獲勝。",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon下方有Greymon和MailBirdramon。Gaia Force即將消滅它，Material Save 2可將這些指定DigiXros素材置於Kiriha下方。",
  "learn.lesson.drill-material-save.step.intro.hint":
    "規則16-21。儲存的是符合條件的進化源，而不是被消滅的MetalGreymon本身。",
  "learn.lesson.drill-material-save.step.react":
    "接受Material Save 2，選擇Greymon和MailBirdramon，並在提示時將它們置於Kiriha Aonuma下方。",
  "learn.lesson.drill-material-save.step.react.hint":
    "使用兩張符合條件的進化源。MetalGreymon進入棄牌區，素材則儲存在Kiriha下方。",
  "learn.lesson.drill-material-save.step.your-turn": "等待你的主要階段。你有3點記憶體，手牌中還有另一張MetalGreymon。",
  "learn.lesson.drill-material-save.step.your-turn.hint": "Kiriha可以橫置，允許DigiXros使用你的Tamer下方的素材。",
  "learn.lesson.drill-material-save.step.reuse":
    "選擇手牌中的MetalGreymon並進行DigiXros。選擇Kiriha作為要橫置的Tamer，再選擇其下兩張儲存的素材並確認。結算其【登場時】選擇。",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "兩張素材將費用從7減至3。其【登場時】效果賦予Rush，因此重組的數碼寶貝可立即攻擊。",
  "learn.lesson.drill-material-save.step.attack-player": "用重組的MetalGreymon攻擊對手的空安防區。",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "救回的兩張卡讓費用變得可支付。Rush讓這隻新數碼寶貝能夠結束對戰。",
  "learn.lesson.drill-evade.title": "Evade：橫置以求生存",
  "learn.lesson.drill-evade.summary": "用Evade抵禦Gaia Force，再在自己的回合重置並獲勝。",
  "learn.lesson.drill-evade.goal1": "透過橫置受威脅的數碼寶貝支付費用",
  "learn.lesson.drill-evade.goal2": "面對對手的除去效果仍保留攻擊者",
  "learn.lesson.drill-evade.done": "Syakomon橫置以躲避消滅，隨後重置並獲勝。",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon擁有Evade。Gaia Force將消滅它時，可以橫置Syakomon來防止這次消滅。支付該費用需要它能夠橫置。",
  "learn.lesson.drill-evade.step.intro.hint": "規則16-22。Syakomon當前未橫置，而且是你唯一的攻擊者。",
  "learn.lesson.drill-evade.step.react": "出現Evade提示時接受。Syakomon橫置，並在Gaia Force後存活。",
  "learn.lesson.drill-evade.step.react.hint": "已經橫置的數碼寶貝不能再次支付此條件。這僅防止本次消滅，並非免疫效果。",
  "learn.lesson.drill-evade.step.your-turn": "等待機器人結束回合。Syakomon會在你的下一個活躍階段重置。",
  "learn.lesson.drill-evade.step.your-turn.hint": "Gaia Force已在對手棄牌區，Syakomon仍留在場上。",
  "learn.lesson.drill-evade.step.attack-player": "點選Syakomon，選擇攻擊，並指定對手的空安防區。",
  "learn.lesson.drill-evade.step.attack-player.hint": "躲過消滅的數碼寶貝將成為你獲勝的攻擊者。",
  "learn.lesson.drill-fortitude.title": "Fortitude：消滅後再次登場",
  "learn.lesson.drill-fortitude.summary": "在Gaia Force後再次登場Aquilamon，並用它的新生命獲勝。",
  "learn.lesson.drill-fortitude.goal1": "Fortitude要求消滅時具有進化源",
  "learn.lesson.drill-fortitude.goal2": "再次登場的數碼寶貝是新的數碼寶貝",
  "learn.lesson.drill-fortitude.done": "Aquilamon沒有進化源地返回，並在你的下回合獲勝。",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon有Fortitude，下方有Kunemon。當Aquilamon在有進化源的狀態下被消滅，Fortitude會不支付費用再次登場Aquilamon。",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "規則16-27。這不會防止消滅。再次登場的是新數碼寶貝，原本的進化源留在棄牌區。",
  "learn.lesson.drill-fortitude.step.react":
    "讓Gaia Force消滅Aquilamon，結算Fortitude觸發。若觸發面板要求確認，請確認這個必定執行的效果。",
  "learn.lesson.drill-fortitude.step.react.hint": "Aquilamon以新的場上身份返回，且沒有進化源。Kunemon留在棄牌區。",
  "learn.lesson.drill-fortitude.step.your-turn":
    "等待你的回合。Aquilamon是在機器人回合再次登場的，因此在你的回合可以攻擊。",
  "learn.lesson.drill-fortitude.step.your-turn.hint": "由於沒有進化源，之後再被消滅也不會再次觸發此Fortitude。",
  "learn.lesson.drill-fortitude.step.attack-player": "用再次登場的Aquilamon攻擊對手的空安防區。",
  "learn.lesson.drill-fortitude.step.attack-player.hint": "獲勝的是Fortitude帶回的卡，而非原本那個場上實體。",
  "learn.lesson.drill-partition.title": "Partition：分成兩隻數碼寶貝",
  "learn.lesson.drill-partition.summary": "將對手的消滅效果轉變為兩隻等級4數碼寶貝的登場機會。",
  "learn.lesson.drill-partition.goal1": "必須同時具有兩種指定進化源",
  "learn.lesson.drill-partition.goal2": "在頂卡離場前登場兩個部分",
  "learn.lesson.drill-partition.done": "Paildramon分成Ikkakumon和Togemon，並由Ikkakumon獲勝。",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon有Partition，要求藍色等級4和綠色等級4。其下方的Ikkakumon及Togemon符合要求。Gaia Force將嘗試除去Paildramon。",
  "learn.lesson.drill-partition.step.intro.hint": "規則16-29。Partition針對對手效果，不適用於戰鬥離場或自己的效果。",
  "learn.lesson.drill-partition.step.react": "接受Partition，選擇藍色Ikkakumon和綠色Togemon，不支付費用登場兩者。",
  "learn.lesson.drill-partition.step.react.hint":
    "必須從每種要求中各登場一隻。Paildramon仍會離場，Partition不會防止其消滅。",
  "learn.lesson.drill-partition.step.your-turn": "等待你的主要階段。兩張原本的進化源現在是各自獨立的數碼寶貝。",
  "learn.lesson.drill-partition.step.your-turn.hint": "它們在對手回合登場，輪到你的回合便可以攻擊。",
  "learn.lesson.drill-partition.step.attack-player": "用Ikkakumon攻擊對手的空安防區。",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "也可以檢視Togemon：同一次Partition將兩張指定進化源都登場了。",
  "learn.lesson.drill-scapegoat.title": "Scapegoat：犧牲隊友",
  "learn.lesson.drill-scapegoat.summary": "消滅Agumon，讓Bastemon在機器人的Gaia Force後留場。",
  "learn.lesson.drill-scapegoat.goal1": "選擇另一隻數碼寶貝作為費用",
  "learn.lesson.drill-scapegoat.goal2": "防止受威脅的數碼寶貝被消滅",
  "learn.lesson.drill-scapegoat.done": "Agumon支付Scapegoat費用，存活的Bastemon獲勝。",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon有Scapegoat。它將因自己的效果以外的原因被消滅時，可消滅自己另一隻數碼寶貝來防止該消滅。這裡可以用Agumon支付。",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "規則16-32。你是犧牲另一隻數碼寶貝來拯救Bastemon，而不是犧牲Bastemon。",
  "learn.lesson.drill-scapegoat.step.react": "接受Scapegoat，選擇自己的Agumon作為要消滅的數碼寶貝。",
  "learn.lesson.drill-scapegoat.step.react.hint": "Agumon進入棄牌區，Bastemon留場。不要拒絕這次保護。",
  "learn.lesson.drill-scapegoat.step.your-turn": "等待機器人結算Gaia Force並結束回合，輪到你的回合。",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon仍是同一只數碼寶貝，並將可以攻擊。",
  "learn.lesson.drill-scapegoat.step.attack-player": "用Bastemon攻擊對手的空安防區。",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "這次犧牲保住了更強的數碼寶貝，讓它能夠獲勝。",
  "learn.lesson.drill-decode.title": "Decode：離場前登場進化源",
  "learn.lesson.drill-decode.summary": "覺醒形態返回手牌時，將Sistermon Blanc從進化源中救出。",
  "learn.lesson.drill-decode.goal1": "Decode可響應戰鬥以外的離場",
  "learn.lesson.drill-decode.goal2": "不支付費用登場指定進化源",
  "learn.lesson.drill-decode.done": "Sistermon Blanc透過Decode離開疊卡，並完成了獲勝攻擊。",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened)擁有Decode (Sistermon Blanc)，下方有該確切名稱的卡。機器人的Cocytus Breath將覺醒形態返回你的手牌。",
  "learn.lesson.drill-decode.step.intro.hint": "規則16-36。此次返回手牌不是戰鬥離場，因此可以響應Decode。",
  "learn.lesson.drill-decode.step.react":
    "接受Decode並從進化源中選擇Sistermon Blanc。若有提示，結算Blanc的【登場時】Draw 1。",
  "learn.lesson.drill-decode.step.react.hint": "Blanc作為獨立數碼寶貝登場。覺醒卡仍返回手牌，Decode不會阻止它離場。",
  "learn.lesson.drill-decode.step.your-turn":
    "等待你的主要階段。透過Decode登場的Sistermon Blanc現在是你唯一的數碼寶貝。",
  "learn.lesson.drill-decode.step.your-turn.hint": "它在機器人回合登場，因此可以在你的回合攻擊。",
  "learn.lesson.drill-decode.step.attack-player": "用Sistermon Blanc攻擊對手的空安防區。",
  "learn.lesson.drill-decode.step.attack-player.hint": "沒有Decode，這張進化源本會隨離場的疊卡一起被丟棄。",
  "learn.lesson.drill-fragment.title": "Fragment：用進化源支付費用",
  "learn.lesson.drill-fragment.summary": "丟棄兩張進化源，保住受Gaia Force威脅的Giromon。",
  "learn.lesson.drill-fragment.goal1": "Fragment必須支付完整的指定進化源數量",
  "learn.lesson.drill-fragment.goal2": "恰好支付兩張卡以防止消滅",
  "learn.lesson.drill-fragment.done": "Giromon為Fragment 2支付兩張進化源，存活後贏下對戰。",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon有Fragment (2)，下方有Jazamon和Jazardmon。Gaia Force將消滅它時，Fragment可丟棄兩張進化源來防止該消滅。",
  "learn.lesson.drill-fragment.step.intro.hint": "規則16-37。只支付一張不夠；Giromon恰好有需要的兩張進化源。",
  "learn.lesson.drill-fragment.step.react": "接受Fragment，選擇Jazamon和Jazardmon兩張進化源丟棄。",
  "learn.lesson.drill-fragment.step.react.hint": "Giromon留場且不再有進化源，兩張選定的卡進入棄牌區。",
  "learn.lesson.drill-fragment.step.your-turn": "等待機器人結束回合，進入你的主要階段。",
  "learn.lesson.drill-fragment.step.your-turn.hint": "Giromon躲過了此次消滅，但已沒有進化源再次支付Fragment。",
  "learn.lesson.drill-fragment.step.attack-player": "用Giromon攻擊對手的空安防區。",
  "learn.lesson.drill-fragment.step.attack-player.hint": "支付Fragment的同一只Giromon將發起獲勝攻擊。",
  "learn.lesson.drill-guard.title": "Guard：防止返回手牌",
  "learn.lesson.drill-guard.summary": "犧牲Gladimon，阻止Cocytus Breath將BigMamemon返回手牌。",
  "learn.lesson.drill-guard.goal1": "Guard如何保護另一隻數碼寶貝免於對手的除去",
  "learn.lesson.drill-guard.goal2": "返回手牌也可以被防止",
  "learn.lesson.drill-guard.done": "Gladimon支付Guard來阻止返回，BigMamemon留場並獲勝。",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon有Guard。另一隻自己的數碼寶貝將因對手效果離開戰鬥區時，Gladimon可消滅自身來防止離場。機器人將用Cocytus Breath指定BigMamemon。",
  "learn.lesson.drill-guard.step.intro.hint": "規則16-45。與僅能防止消滅的保護不同，Guard也能阻止這次返回手牌。",
  "learn.lesson.drill-guard.step.react": "出現保護提示時接受Gladimon的Guard。若要求選擇反應順序，選擇Guard。",
  "learn.lesson.drill-guard.step.react.hint": "Gladimon作為費用被消滅。BigMamemon不會進入手牌，而是留在戰鬥區。",
  "learn.lesson.drill-guard.step.your-turn": "等待機器人結束回合並輪到你。若出現Gladimon的【消滅時】提示，請結算。",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "機器人的Gabumon已是等級3且沒有進化源，因此Gladimon不能剝去它的頂卡。",
  "learn.lesson.drill-guard.step.attack-player": "用BigMamemon攻擊對手的空安防區。",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard讓你最後一隻攻擊者得以留在場上。",
  "learn.lesson.drill-digisorption.title": "Digisorption：橫置以減少記憶體費用",
  "learn.lesson.drill-digisorption.summary": "橫置Kunemon，以1點記憶體進化Pistmon，再用Pistmon攻擊。",
  "learn.lesson.drill-digisorption.goal1": "支付Digisorption要求的橫置費用",
  "learn.lesson.drill-digisorption.goal2": "保持進化中的數碼寶貝可攻擊",
  "learn.lesson.drill-digisorption.done": "你支付了Digisorption費用，並以未橫置的Pistmon獲勝。",
  "learn.lesson.drill-digisorption.step.intro":
    "你只有1點記憶體。Pistmon有Digisorption -2：其普通進化費用為3，但橫置另一隻數碼寶貝可減至1，讓你保留回合。",
  "learn.lesson.drill-digisorption.step.intro.hint": "橫置Kunemon而非Lighdramon，讓攻擊者保持可行動。",
  "learn.lesson.drill-digisorption.step.digivolve":
    "將Pistmon進化到Lighdramon上。接受Digisorption，並選擇Kunemon作為要橫置的數碼寶貝。",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "支付你的1點記憶體後到達零，並保持Pistmon未橫置。若未減費而支付3，攻擊前記憶體便會移至對手一側。",
  "learn.lesson.drill-digisorption.step.attack-player": "用Pistmon攻擊玩家獲勝。",
  "learn.lesson.drill-digisorption.step.attack-player.hint": "對手沒有安防，而Pistmon原本就以Lighdramon的身份在場上。",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst：消耗進化源",
  "learn.lesson.drill-digi-burst.summary": "丟棄兩張進化源，先讓阻擋者橫置再發起攻擊。",
  "learn.lesson.drill-digi-burst.goal1": "發動主要階段的Digi-Burst效果",
  "learn.lesson.drill-digi-burst.goal2": "用恰好兩張進化源支付費用",
  "learn.lesson.drill-digi-burst.done": "HerculesKabuterimon消耗兩張進化源，使阻擋者無法阻擋，並開啟獲勝攻擊的道路。",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon有主要階段Digi-Burst 2。丟棄其兩張進化源，可使一隻對手數碼寶貝橫置。",
  "learn.lesson.drill-digi-burst.step.intro.hint": "Monochromon未橫置時可以阻擋，請先讓它橫置。",
  "learn.lesson.drill-digi-burst.step.burst":
    "選擇HerculesKabuterimon並發動Digi-Burst。選擇Kunemon和Kabuterimon兩張進化源丟棄，再選擇Monochromon使其橫置。",
  "learn.lesson.drill-digi-burst.step.burst.hint": "最上方的HerculesKabuterimon不是可以用作費用的進化源。",
  "learn.lesson.drill-digi-burst.step.attack-security": "用HerculesKabuterimon攻擊玩家，檢查最後一張安防。",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "已橫置的Monochromon不能阻擋。",
  "learn.lesson.drill-digi-burst.step.attack-player": "用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-digi-burst.step.attack-player.hint": "僅除去最後一張安防並不會直接獲勝。",
  "learn.lesson.drill-delay.title": "Delay：兌現準備好的Option",
  "learn.lesson.drill-delay.summary": "用Reinforcing Memory Boost!獲得獲勝Rush攻擊所需的記憶體。",
  "learn.lesson.drill-delay.goal1": "在放置回合之後發動Delay",
  "learn.lesson.drill-delay.goal2": "將保留的Option轉化為3點記憶體",
  "learn.lesson.drill-delay.done": "Delay提供了BushiAgumon的費用，隨後它用Rush獲勝。",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost!已在先前回合置於戰鬥區，現在可以使用Delay。你只有2點記憶體。",
  "learn.lesson.drill-delay.step.intro.hint": "不能在該卡被放置的同一回合使用Delay。",
  "learn.lesson.drill-delay.step.delay": "選擇Reinforcing Memory Boost!並發動Delay。丟棄它以獲得3點記憶體。",
  "learn.lesson.drill-delay.step.delay.hint": "你的記憶體由2升至5。",
  "learn.lesson.drill-delay.step.play-rush": "從手牌支付5點記憶體登場BushiAgumon。",
  "learn.lesson.drill-delay.step.play-rush.hint": "Delay帶來的記憶體讓你支付後仍能停在零。",
  "learn.lesson.drill-delay.step.attack-player": "用BushiAgumon攻擊玩家獲勝。",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush允許這隻剛登場的數碼寶貝攻擊。",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve：攻擊中進化",
  "learn.lesson.drill-blast-digivolve.summary": "用WarGreymon的Counter應對機器人攻擊，阻擋後在下回合獲勝。",
  "learn.lesson.drill-blast-digivolve.goal1": "在Counter時點免費進化",
  "learn.lesson.drill-blast-digivolve.goal2": "在阻擋時點前獲得Blocker",
  "learn.lesson.drill-blast-digivolve.done": "Blast Digivolve及時形成WarGreymon，擋下致命攻擊，並在之後獲勝。",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "你有0張安防，機器人即將攻擊。你的MetalGreymon沒有Blocker，但手牌WarGreymon可透過Blast Digivolve進化為阻擋者。",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "Counter時點發生在阻擋時點之前。",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "出現Counter提示時，選擇手牌WarGreymon，在MetalGreymon上使用Blast Digivolve。",
  "learn.lesson.drill-blast-digivolve.step.counter.hint": "符合條件的進化不支付記憶體，且仍會抽一張卡。",
  "learn.lesson.drill-blast-digivolve.step.block": "用新形成的WarGreymon阻擋來襲的Ikkakumon。",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon有11000 DP，Ikkakumon有5000 DP。",
  "learn.lesson.drill-blast-digivolve.step.your-turn": "你存活了。等待機器人結束回合，並讓你的數碼寶貝重置。",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "使用Counter並不意味著你的回合已經開始。",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "用WarGreymon攻擊玩家獲勝。",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "機器人已沒有安防，也沒有阻擋者。",
  "learn.lesson.drill-mind-link.title": "Mind Link：將Tamer變為進化源",
  "learn.lesson.drill-mind-link.summary": "將Eiji透過Mind Link置於Loogarmon下方，使用獲得的Alliance，再結束對戰。",
  "learn.lesson.drill-mind-link.goal1": "將符合條件的Tamer置入進化源",
  "learn.lesson.drill-mind-link.goal2": "使用透過Mind Link獲得的進化源效果",
  "learn.lesson.drill-mind-link.done": "Eiji成為進化源並賦予Alliance，幫助Loogarmon清除兩張安防。",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi可與沒有Tamer進化源的Dark Animal或SoC數碼寶貝進行Mind Link。Loogarmon符合條件。",
  "learn.lesson.drill-mind-link.step.intro.hint": "Eiji成為進化源後，其進化源效果賦予Alliance和Blocker。",
  "learn.lesson.drill-mind-link.step.mind-link": "選擇Eiji並發動其主要階段Mind Link效果，以Loogarmon為放置物件。",
  "learn.lesson.drill-mind-link.step.mind-link.hint": "Eiji移至Loogarmon下方，不再是戰鬥區中獨立的Tamer。",
  "learn.lesson.drill-mind-link.step.alliance":
    "用Loogarmon攻擊玩家，以任意順序結算攻擊觸發。使用Alliance時接受並橫置Birdramon作為支援。Loogarmon可選的手牌費用效果可以拒絕，或丟棄1張卡來結算。兩項觸發都完成後再檢查2張安防。",
  "learn.lesson.drill-mind-link.step.alliance.hint": "Alliance選擇Birdramon，並讓Dracomon保持未橫置以完成最後一擊。",
  "learn.lesson.drill-mind-link.step.attack-player": "用Dracomon攻擊玩家獲勝。",
  "learn.lesson.drill-mind-link.step.attack-player.hint": "Birdramon支付了Alliance，因此Dracomon仍可行動。",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve：結合場上與手牌",
  "learn.lesson.drill-blast-dna-digivolve.summary": "使用場上的數碼寶貝及手牌素材，在Counter時點形成RagnaLoardmon。",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "在Counter期間提供兩種指定DNA素材",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "攻擊繼續前結算僅限DNA的除去效果",
  "learn.lesson.drill-blast-dna-digivolve.done": "RagnaLoardmon免費結合兩種素材，除去攻擊者，並在下回合獲勝。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "你沒有安防，機器人即將攻擊。Durandamon在戰鬥區，BryweLudramon與RagnaLoardmon在手牌。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve需要場上的指定數碼寶貝，以及手牌中另一張指定卡。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "在Counter時使用RagnaLoardmon。選擇Durandamon與手牌的BryweLudramon進行Blast DNA Digivolve。結算效果，並選擇正在攻擊的Plesiomon消滅。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "其進化效果丟棄對手最後一張安防，DNA專屬效果會在攻擊命中你之前消滅攻擊者。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "等待機器人結束回合。新形成的RagnaLoardmon已準備好迎接你的回合。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint": "DNA創造新的數碼寶貝，並將兩種素材結合為其進化源。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "用RagnaLoardmon攻擊玩家獲勝。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "攻擊者在Counter期間被消滅，因此你即使沒有安防也存活了。",
  "learn.lesson.drill-link.title": "Link +：保留額外連結",
  "learn.lesson.drill-link.summary": "為Deusmon新增第二張連結卡，同時保留第一張。",
  "learn.lesson.drill-link.goal1": "支付連結費用以連結一張手牌",
  "learn.lesson.drill-link.goal2": "利用Link +1保留兩張連結卡",
  "learn.lesson.drill-link.done": "Deusmon保留兩張Navimon連結並檢查安防，讓Birdramon完成獲勝攻擊。",
  "learn.lesson.drill-link.step.intro":
    "數碼寶貝通常最多保留1張連結卡。Deusmon有Link +1，所以上限為2。它已有一張Navimon連結。",
  "learn.lesson.drill-link.step.intro.hint": "連結卡橫放在一旁，不屬於進化源。",
  "learn.lesson.drill-link.step.link": "選擇手牌中的Navimon，選擇Link並指定Deusmon。支付1點記憶體的連結費用。",
  "learn.lesson.drill-link.step.link.hint": "Deusmon可容納2張連結，因此兩張Navimon都會保留。",
  "learn.lesson.drill-link.step.attack-security": "用Deusmon攻擊玩家，檢查最後一張安防。",
  "learn.lesson.drill-link.step.attack-security.hint": "兩張連結卡仍附著時，其連結DP加成持續有效。",
  "learn.lesson.drill-link.step.attack-player": "用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-link.step.attack-player.hint": "最後一擊與安防檢查是不同的攻擊。",
  "learn.lesson.drill-use-req.title": "Use Req.：以特徵代替顏色條件",
  "learn.lesson.drill-use-req.summary": "在場上只提供黃色的情況下使用白色e-Pulse。",
  "learn.lesson.drill-use-req.goal1": "閱讀Use Req.的指定條件",
  "learn.lesson.drill-use-req.goal2": "僅無視顏色要求，仍支付Option費用",
  "learn.lesson.drill-use-req.done": "Liollmon滿足Use Req.，e-Pulse招來另一隻數碼寶貝，原本的Liollmon隨後獲勝。",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse是白色，但你的戰鬥區只有黃色Liollmon。其Use Req.接受自己場上的BEATBREAK卡。",
  "learn.lesson.drill-use-req.step.intro.hint": "Liollmon具有BEATBREAK，因此可以無視白色要求。",
  "learn.lesson.drill-use-req.step.use-option":
    "從手牌支付3點記憶體使用e-Pulse。接受其效果，不支付登場費用登場手牌中的另一張Liollmon。",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req.免除的是顏色要求，而非3點記憶體的使用費用。之後e-Pulse留在戰鬥區。",
  "learn.lesson.drill-use-req.step.attack-player": "用原本就在戰鬥區的Liollmon攻擊玩家獲勝。",
  "learn.lesson.drill-use-req.step.attack-player.hint": "新登場的Liollmon本回合不能攻擊，請選擇原本那一隻。",
  "learn.lesson.drill-ascension.title": "Ascension：將消滅轉化為安防",
  "learn.lesson.drill-ascension.summary": "讓ScourgeChiropmon成為安防，撐過機器人回合後獲勝。",
  "learn.lesson.drill-ascension.goal1": "實際戰鬥消滅後結算Ascension",
  "learn.lesson.drill-ascension.goal2": "利用新增安防撐過一個回合",
  "learn.lesson.drill-ascension.done": "ScourgeChiropmon升至安防，承受機器人攻擊，讓Birdramon得以獲勝。",
  "learn.lesson.drill-ascension.step.intro":
    "你有0張安防。Birdramon本回合剛登場，必須等待。ScourgeChiropmon有Ascension，可在被消滅後成為你的安防。",
  "learn.lesson.drill-ascension.step.intro.hint": "機器人會在它的回合攻擊，因此結束回合前你需要一張安防。",
  "learn.lesson.drill-ascension.step.ascend":
    "用ScourgeChiropmon攻擊已橫置的Plesiomon。它會戰敗。接受Ascension，將ScourgeChiropmon置於自己的安防最上方。",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon有8000 DP，Plesiomon有12000 DP。它的另一項消滅效果沒有可用的Tamer費用。",
  "learn.lesson.drill-ascension.step.end-turn": "新的安防卡已就位。結束你的回合。",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramon在登場的本回合仍不能攻擊。",
  "learn.lesson.drill-ascension.step.your-turn": "讓機器人攻擊你的新安防卡，再等待你的回合。",
  "learn.lesson.drill-ascension.step.your-turn.hint": "若沒有Ascension，你會在0張安防時被該次攻擊擊敗。",
  "learn.lesson.drill-ascension.step.attack-player": "用Birdramon攻擊玩家獲勝。",
  "learn.lesson.drill-ascension.step.attack-player.hint": "Birdramon現在可以攻擊，機器人也沒有安防。",
  "learn.lesson.drill-detach.title": "Detach：消耗連結以留場",
  "learn.lesson.drill-detach.summary": "分離符合條件的Seven Code連結，阻止Cocytus Breath。",
  "learn.lesson.drill-detach.goal1": "對手效果將除去數碼寶貝時使用Detach",
  "learn.lesson.drill-detach.goal2": "支付符合條件的連結，而非進化源",
  "learn.lesson.drill-detach.done": "Weatherdramon失去連結但留在戰鬥區，並在你的回合獲勝。",
  "learn.lesson.drill-detach.step.intro":
    "機器人即將使用Cocytus Breath，將Weatherdramon返回你的手牌。Weatherdramon擁有指定Seven Code連結的Detach。",
  "learn.lesson.drill-detach.step.intro.hint": "其連結的Roleplaymon具有所需的Seven Code特徵。",
  "learn.lesson.drill-detach.step.detach":
    "出現離場提示時，接受Detach並丟棄連結的Roleplaymon，讓Weatherdramon留在戰鬥區。",
  "learn.lesson.drill-detach.step.detach.hint": "連結卡進入棄牌區。Weatherdramon失去連結DP，但不會返回手牌。",
  "learn.lesson.drill-detach.step.your-turn": "機器人已使用完Option，等待它結束回合。",
  "learn.lesson.drill-detach.step.your-turn.hint": "Detach防止離場，並非重新登場Weatherdramon。",
  "learn.lesson.drill-detach.step.attack-player": "用Weatherdramon攻擊玩家獲勝。",
  "learn.lesson.drill-detach.step.attack-player.hint": "因為保持了原本的場上存在，它可以在你的回合攻擊。",
  "learn.lesson.drill-succession.title": "Succession：使用進化源卡的普通效果",
  "learn.lesson.drill-succession.summary": "透過Succession使用進化源Ceresmon的普通效果，在Palmon攻擊中除去阻擋者。",
  "learn.lesson.drill-succession.goal1": "閱讀Succession選取的最上方符合條件進化源",
  "learn.lesson.drill-succession.goal2": "結算複製的普通效果，而不是進化源效果欄",
  "learn.lesson.drill-succession.done":
    "Succession複製Ceresmon對橫置的普通反應效果，消滅Monmon，讓Palmon清除安防，再由Dracomon獲勝。",
  "learn.lesson.drill-succession.step.intro":
    "頂端Ceresmon有Succession (Ceresmon)。其進化源Ceresmon有普通【雙方回合】效果：每隻發生橫置的數碼寶貝，使一隻對手數碼寶貝-3000 DP。Succession複製該普通效果。",
  "learn.lesson.drill-succession.step.intro.hint":
    "該文字位於進化源卡的普通效果欄，而非進化源效果欄。Monmon只有1000 DP。Palmon的2000 DP也高於安防數碼寶貝的1000 DP。",
  "learn.lesson.drill-succession.step.copy-effect":
    "用Palmon攻擊玩家。它的橫置觸發Ceresmon透過Succession獲得的效果。選擇Monmon使其-3000 DP，它會在阻擋前被消滅。隨後Palmon檢查最後一張安防並存活。",
  "learn.lesson.drill-succession.step.copy-effect.hint": "先結算複製的Ceresmon反應效果，再進入阻擋時點。",
  "learn.lesson.drill-succession.step.attack-player": "Palmon完成安防檢查後，用Dracomon攻擊玩家獲勝。",
  "learn.lesson.drill-succession.step.attack-player.hint": "最後一次安防檢查本身不會獲勝，Dracomon會另行發起獲勝攻擊。",
  "learn.lesson.practice-game-preparation.title": "從初始手牌走向戰鬥勝利",
  "learn.lesson.practice-game-preparation.summary": "以合法卡組、各5張手牌、5張安防和零記憶體開始，培養攻擊者並獲勝。",
  "learn.lesson.practice-game-preparation.goal1": "認識初始手牌、安防區、數碼蛋卡組，以及先攻首回合的抽牌例外",
  "learn.lesson.practice-game-preparation.goal2": "培養一隻數碼寶貝，經過多個回合清除五張安防，再發起最後一次直接攻擊",
  "learn.lesson.practice-game-preparation.done":
    "你從正常準備完畢的開局出發，經歷養成、進化、記憶體交接，並完成了最後一擊。",
  "learn.lesson.practice-game-preparation.step.intro":
    "本局以五十張卡組、雙方各五張手牌、五張安防和零記憶體開始。你先攻，跳過第一次普通抽牌。機器人會結束回合，讓你練習完整流程。",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "為手牌和安防各留出五張後，雙方主卡組各剩四十張。數碼蛋卡組獨立計算。",
  "learn.lesson.practice-game-preparation.step.hatch": "從數碼蛋卡組孵化Koromon，放入空的養成區。",
  "learn.lesson.practice-game-preparation.step.hatch.hint": "孵化不支付記憶體，也不抽卡。它會用掉本回合的養成行動。",
  "learn.lesson.practice-game-preparation.step.rookie": "在養成區將Koromon進化為Agumon。此路線費用為零，並抽一張卡。",
  "learn.lesson.practice-game-preparation.step.rookie.hint": "使用手牌中的Agumon ST1-03，並選擇Koromon作為進化基礎。",
  "learn.lesson.practice-game-preparation.step.champion":
    "將養成中的Agumon進化為Greymon，支付兩點記憶體。處理完成後回合交給機器人。",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "即使在你的首回合，養成區進化仍會抽卡。記憶體從零移至對手一側的兩點。",
  "learn.lesson.practice-game-preparation.step.move": "等待機器人結束回合。在你的下一個養成階段，將Greymon移至戰鬥區。",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "移動不屬於登場新數碼寶貝。Greymon在移出養成區的本回合就可以攻擊。",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "支付三點記憶體，將Greymon進化為Garudamon。Greymon的進化源效果Security Attack +1會讓Garudamon進行兩次檢查。",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "進化源卡的普通效果與進化源效果不同，請閱讀Greymon的下方效果欄。",
  "learn.lesson.practice-game-preparation.step.first-checks": "用Garudamon攻擊玩家，從機器人的五張安防中逐張檢查兩張。",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon的DP足以在這些安防戰鬥中存活。機器人會剩下三張安防。",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "支付兩點記憶體登場Biyomon。這會將回合交給機器人，請保留Biyomon用於最後的獲勝攻擊。",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "剛登場的數碼寶貝通常本回合不能攻擊。機器人結束回合後，Biyomon便準備好了。",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "在你的回合用Garudamon攻擊，它橫置後便結束回合。重複至機器人安防為零，同時保留Biyomon進行最後一擊。",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "養成階段沒有可用行動時可跳過。Garudamon每次攻擊檢查兩張。最後一張安防被除去後，未用完的檢查不會變成額外直接攻擊。",
  "learn.lesson.practice-game-preparation.step.win": "機器人沒有安防。用Biyomon攻擊玩家，贏下對戰。",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "清空安防後仍需要這一次獨立的成功攻擊。Biyomon在之前的回合登場，現在可以攻擊。",
  "learn.lesson.practice-rule-checks.title": "規則檢查：消滅零DP數碼寶貝",
  "learn.lesson.practice-rule-checks.summary": "用黃色Option將阻擋者的DP減至零以下，觀察規則消滅，再用Salamon獲勝。",
  "learn.lesson.practice-rule-checks.goal1": "滿足Option的顏色條件並結算DP削減",
  "learn.lesson.practice-rule-checks.goal2": "區分規則檢查造成的消滅與效果直接指示的消滅",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens降低Monochromon的DP，規則檢查將其消滅，讓Salamon完成獲勝攻擊。",
  "learn.lesson.practice-rule-checks.step.intro":
    "機器人沒有安防，但Monochromon能阻擋Salamon。Seven Heavens給予-10000 DP；戰鬥區中DP為零或更低的數碼寶貝會被規則消滅。",
  "learn.lesson.practice-rule-checks.step.intro.hint": "Salamon滿足Option的黃色要求。你有九點記憶體，Option費用為七。",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "從手牌使用Seven Heavens，選擇機器人的Monochromon並確認物件。觀察效果結算後它進入棄牌區。",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "Option僅給予DP削減。最終DP為零或更低時，由規則17-1-3-1-1執行消滅。",
  "learn.lesson.practice-rule-checks.step.win": "阻擋者已離場。用Salamon攻擊玩家獲勝。",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon在本回合開始前已在戰鬥區。使用Option後還剩兩點記憶體，因此回合仍屬於你。",
} satisfies Record<keyof typeof newDrillsEn, string>;
