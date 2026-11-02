import type { learnEn } from "@/i18n/learn/learn.en";
import type { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const learnZhTW = {
  "learn.eyebrow": "學習",
  "learn.title": "剛接觸數碼寶貝卡牌遊戲？",
  "learn.lede": "跟著引導機器人玩簡短的課程，或按自己的節奏閱讀規則。",
  "learn.startLesson": "開始第 {number} 課",
  "learn.replayLessons": "重新遊玩課程",
  "learn.readRules": "閱讀玩法說明",
  "learn.progress": "已完成 {completed} / {total} 課",
  "learn.guestNote": "你正以訪客身份遊玩。進度只會保存在此瀏覽器中。登入後可在所有裝置上保留進度。",
  "learn.lessonsHeading": "課程",
  "learn.lessonNumber": "第 {number} 課",
  "learn.minutes": "{minutes} 分鐘",
  "learn.status.done": "已完成",
  "learn.status.next": "下一課",
  "learn.status.ready": "可開始",
  "learn.status.locked": "未解鎖",
  "learn.lockedReason": "請先完成第 1 課",
  "learn.start": "開始",
  "learn.replay": "再玩一次",
  "learn.rulesHeading": "玩法說明",
  "learn.rulesLede": "用簡單的話講解規則，一次一個主題。",

  "learn.briefing.counter": "第 {number} 課，共 {total} 課",
  "learn.briefing.goals": "你將學到：",
  "learn.briefing.note": "卡組和場面已為你準備好。機器人會按固定的簡單方式行動。",
  "learn.briefing.drill": "關鍵字練習",
  "learn.briefing.notNow": "稍後再說",
  "learn.briefing.start": "開始課程",

  "learn.coach.region": "課程教練",
  "learn.coach.counter": "第 {current} 步，共 {total} 步",
  "learn.coach.next": "下一步",
  "learn.coach.hint": "提示",
  "learn.coach.hideHint": "隱藏提示",
  "learn.coach.skip": "跳過此步",
  "learn.coach.restart": "重新開始",
  "learn.coach.done": "做得好！",
  "learn.coach.collapse": "收起教練",
  "learn.coach.expand": "顯示教練",
  "learn.coach.move": "移動課程教練",
  "learn.coach.moveHelp": "拖曳或使用方向鍵移動。按 Home 重置位置。",
  "learn.coach.finished": "這一課的內容你都學會了。打完這局即可完成課程。",
  "learn.coach.chip": "第 {current} 步，共 {total} 步",

  "learn.complete.title": "課程完成",
  "learn.complete.learned": "你學到了：",
  "learn.complete.next": "下一課",
  "learn.complete.back": "返回學習",
  "learn.complete.readMore": "延伸閱讀：{chapter}",
  "learn.complete.failedTitle": "課程未完成",
  "learn.complete.failedBody": "沒關係。再試一次吧。每次場面都會重設。",
  "learn.complete.tryAgain": "再試一次",

  "learn.lobbyButton": "學習玩法",

  "learn.rules.back": "學習",
  "learn.rules.contents": "目錄",
  "learn.rules.previous": "上一章：{chapter}",
  "learn.rules.nextChapter": "下一章：{chapter}",
  "learn.rules.tryIt": "試一試",
  "learn.rules.tryItLesson": "第 {number} 課：{title}",
  "learn.rules.tryDrillLabel": "試玩＜{keyword}＞練習",
  "learn.rules.officialRules": "官方綜合規則（PDF）",
  "learn.rules.keywordFilter": "篩選關鍵字",
  "learn.rules.keywordEmpty": "沒有符合篩選條件的關鍵字。",
  "learn.rules.keywordRule": "規則 {rule}",

  "learn.rules.goal.title": "目標",
  "learn.rules.goal.p1": "每位玩家都有一疊背面朝上的卡片，稱為安防區。它保護著你。",
  "learn.rules.goal.p2": "發動攻擊，移除對手的安防卡。對手的安防區沒有卡片後，再攻擊對手一次即可獲勝。",
  "learn.rules.goal.p3": "如果對手必須抽牌但卡組已空，你也會獲勝。",

  "learn.rules.deck.title": "你的卡組",
  "learn.rules.deck.p1": "你需要使用兩個卡組。",
  "learn.rules.deck.p2": "主卡組正好 50 張：數碼寶貝、馴獸師和選項。",
  "learn.rules.deck.p3": "數碼蛋卡組最多 5 張數碼蛋。你在培育區孵化它們。",
  "learn.rules.deck.p4": "同一卡號的卡片最多可放入 4 張。",

  "learn.rules.setup.title": "準備",
  "learn.rules.setup.p1": "雙方洗切卡組並抽 5 張牌。",
  "learn.rules.setup.p2": "如果不滿意手牌，可以洗回卡組並重新抽 5 張，限一次。",
  "learn.rules.setup.p3": "然後雙方將卡組頂的 5 張牌背面朝上放置，作為安防區。",
  "learn.rules.setup.p4": "先攻玩家在第一回合不抽牌。",

  "learn.rules.turn.title": "回合",
  "learn.rules.turn.p1": "每個回合有四個階段，順序始終相同。",
  "learn.rules.turn.p2": "重置階段：你已橫置的卡片重新豎起。",
  "learn.rules.turn.p3": "抽牌階段：抽 1 張牌。",
  "learn.rules.turn.p4": "培育階段：孵化數碼蛋、將數碼寶貝移出培育區，或什麼都不做。",
  "learn.rules.turn.p5": "主要階段：使用卡片、進化和攻擊。記憶體移到對手一側時，你的回合結束。",
  "learn.rules.turn.phaseUnsuspend": "重置",
  "learn.rules.turn.phaseDraw": "抽牌",
  "learn.rules.turn.phaseBreeding": "培育",
  "learn.rules.turn.phaseMain": "主要",

  "learn.rules.breeding.title": "培育區",
  "learn.rules.breeding.p1": "培育區可放置一隻數碼寶貝。這裡是培養它的安全場所。",
  "learn.rules.breeding.p2": "培育區為空時，你可以孵化：把數碼蛋卡組頂的卡片翻開放進去。",
  "learn.rules.breeding.p3": "你可以像其他數碼寶貝一樣讓這裡的數碼寶貝進化。",
  "learn.rules.breeding.p4":
    "培育區的數碼寶貝不能攻擊，也不會被攻擊。等級達到 3 或以上後，可在你的培育階段將它移到戰鬥區。",

  "learn.rules.memory.title": "記憶體",
  "learn.rules.memory.p1": "雙方共用一個記憶體量表。範圍從你這一側的 10 到對手一側的 10。",
  "learn.rules.memory.p2": "登場或進化卡片時，把計數器往對手一側移動來支付費用。",
  "learn.rules.memory.p3":
    "計數器在你這一側或位於 0 時，你的回合繼續。計數器到達對手一側時，你的回合結束，對手以該記憶體開始回合。",
  "learn.rules.memory.p4": "你也可以提前結束回合。此時計數器會移到對手一側的 3。",
  "learn.rules.memory.example": "記憶體 3。你登場一隻費用為 5 的數碼寶貝。計數器移到對手一側的 2。",

  "learn.rules.digivolve.title": "進化",
  "learn.rules.digivolve.p1": "從手牌選一隻數碼寶貝，疊放到你的一隻等級低一級且顏色相同的數碼寶貝上。",
  "learn.rules.digivolve.p2": "支付進化費用。它通常比登場費用低。",
  "learn.rules.digivolve.p3": "每次進化，你都會抽 1 張牌。",
  "learn.rules.digivolve.p4": "下方的卡片會成為進化源。印在卡片底部的繼承效果仍然有效。",
  "learn.rules.digivolve.p5": "進化會保留數碼寶貝的狀態。原本可以攻擊的數碼寶貝，進化後仍可攻擊。",

  "learn.rules.attack.title": "攻擊與安防區",
  "learn.rules.attack.p1": "橫置你的一隻數碼寶貝來發動攻擊。它可以攻擊對手，或攻擊對手已橫置的數碼寶貝。",
  "learn.rules.attack.p2": "數碼寶貝在登場的回合不能攻擊，除非它擁有＜速攻＞。",
  "learn.rules.attack.p3":
    "你攻擊對手時，對手翻開安防區頂的卡片。如果是數碼寶貝，兩隻數碼寶貝進行戰鬥：DP 較低的一方被消滅。DP 相同時，雙方都被消滅。",
  "learn.rules.attack.p4": "如果是馴獸師或選項，就發動它的【安防】效果。之後該卡片送入廢棄區。",
  "learn.rules.attack.p5": "對手的安防區沒有卡片時，你的下一次攻擊就能贏得遊戲。",
  "learn.rules.attack.flowAttack": "攻擊",
  "learn.rules.attack.flowCheck": "檢查安防區頂的卡片",
  "learn.rules.attack.flowBattle": "數碼寶貝：比較 DP",
  "learn.rules.attack.flowEffect": "馴獸師或選項：【安防】效果",
  "learn.rules.attack.flowWin": "安防區已空：你獲勝",

  "learn.rules.blocking.title": "阻擋",
  "learn.rules.blocking.p1": "有些數碼寶貝擁有＜阻擋者＞。",
  "learn.rules.blocking.p2": "對手攻擊時，你可以橫置一隻未橫置且擁有＜阻擋者＞的數碼寶貝。攻擊對象會改為這隻數碼寶貝。",
  "learn.rules.blocking.p3": "兩隻數碼寶貝進行戰鬥。這次攻擊不會影響你的安防區。",

  "learn.rules.cardTypes.title": "卡片種類",
  "learn.rules.cardTypes.p1": "數碼蛋：等級 2。放在數碼蛋卡組中，在培育區孵化。",
  "learn.rules.cardTypes.p2": "數碼寶貝：有等級、DP、登場費用，通常還有進化費用。數碼寶貝負責攻擊和戰鬥。",
  "learn.rules.cardTypes.p3": "馴獸師：留在你的場上，提供持續效果。馴獸師不能攻擊。",
  "learn.rules.cardTypes.p4": "選項：支付費用，使用一次效果，然後送入廢棄區。你的場上需要有同色的數碼寶貝或馴獸師。",
  "learn.rules.cardTypes.p5": "繼承效果：數碼寶貝卡底部的文字。該卡片位於其他數碼寶貝下方時生效。",

  "learn.rules.keywords.title": "關鍵字",
  "learn.rules.keywords.p1": "關鍵字是常見效果的簡稱，寫在＜阻擋者＞這樣的括號中。此列表使用英文卡片上印的英文名稱。",

  "learn.rules.levels.egg": "Lv.2 數碼蛋",
  "learn.rules.levels.rookie": "Lv.3 成長期",
  "learn.rules.levels.champion": "Lv.4 成熟期",
  "learn.rules.levels.ultimate": "Lv.5 完全體",
  "learn.rules.levels.mega": "Lv.6 究極體",
  "learn.rules.levels.draw": "+1 張",
  "learn.rules.memory.you": "你",
  "learn.rules.memory.opponent": "對手",

  "learn.lesson.tutorial-attack-security.title": "攻擊並獲勝",
  "learn.lesson.tutorial-attack-security.summary": "用你的數碼寶貝擊破最後一張安防卡，然後攻擊玩家。",
  "learn.lesson.tutorial-attack-security.goal1": "如何攻擊對手的安防區",
  "learn.lesson.tutorial-attack-security.goal2": "直接攻擊如何贏得遊戲",
  "learn.lesson.tutorial-attack-security.done": "你擊破了最後一張安防卡，然後直接攻擊玩家，贏得了勝利。",
  "learn.lesson.tutorial-attack-security.step.intro":
    "對手的安防區沒有卡片，而你的數碼寶貝攻擊對手時，你就獲勝。對手現在有 1 張安防卡。",
  "learn.lesson.tutorial-attack-security.step.intro.hint": "你的數碼寶貝在下方的場上。對手的安防區在上方。",
  "learn.lesson.tutorial-attack-security.step.attack-security":
    "用 Birdramon 攻擊。點擊 Birdramon，選擇「攻擊」，然後點擊對手的安防區發動攻擊。",
  "learn.lesson.tutorial-attack-security.step.attack-security.hint":
    "每次攻擊玩家都會檢查 1 張安防卡。安防區中的數碼寶貝會與攻擊者戰鬥，DP 較高的一方獲勝。",
  "learn.lesson.tutorial-attack-security.step.security-gone":
    "Birdramon 的 DP 比安防區的 Gomamon 高，所以那張卡片送入了廢棄區。Birdramon 現在處於橫置狀態，也就是橫放。",
  "learn.lesson.tutorial-attack-security.step.security-gone.hint":
    "橫置的數碼寶貝本回合不能再攻擊。它會在你下個回合開始時重置。",
  "learn.lesson.tutorial-attack-security.step.attack-player":
    "對手的安防區已空。用 Dracomon 攻擊來獲勝。點擊 Dracomon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-attack-security.step.attack-player.hint":
    "攻擊安防區已空的玩家會結束遊戲。這是主要的獲勝方式。",

  "learn.lesson.tutorial-hatch.title": "培育區",
  "learn.lesson.tutorial-hatch.summary": "在培育區培養數碼寶貝，並了解新數碼寶貝何時可以攻擊。",
  "learn.lesson.tutorial-hatch.goal1": "如何孵化數碼蛋並將數碼寶貝移出培育區",
  "learn.lesson.tutorial-hatch.goal2": "為什麼剛登場的數碼寶貝不能攻擊",
  "learn.lesson.tutorial-hatch.done": "你使用了培育區，等新數碼寶貝過了第一個回合，並用它贏得了勝利。",
  "learn.lesson.tutorial-hatch.step.intro":
    "培育區是培養數碼寶貝的安全場所。對手不能攻擊它，也不能以它為目標。每回合你可以進行 1 次培育操作。",
  "learn.lesson.tutorial-hatch.step.intro.hint": "培育操作在主要階段之前：孵化數碼蛋、移出數碼寶貝，或什麼都不做。",
  "learn.lesson.tutorial-hatch.step.move-out": "Dracomon 已在培育區準備好。點擊培育區中的 Dracomon，然後把它移到場上。",
  "learn.lesson.tutorial-hatch.step.move-out.hint":
    "只有等級 3 或以上的數碼寶貝才能離開培育區。移出的數碼寶貝當回合就能攻擊。",
  "learn.lesson.tutorial-hatch.step.play-biyomon": "登場 Biyomon。把 Biyomon 從手牌拖到場上。它需要 2 點記憶體。",
  "learn.lesson.tutorial-hatch.step.play-biyomon.hint": "從手牌登場的數碼寶貝在登場的回合不能攻擊。這叫作召喚失調。",
  "learn.lesson.tutorial-hatch.step.attack-security":
    "Biyomon 必須等待，但 Dracomon 可以攻擊。點擊 Dracomon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-hatch.step.attack-security.hint":
    "Dracomon 有 4000 DP，所以能擊敗安防區中 3000 DP 的 Gomamon。",
  "learn.lesson.tutorial-hatch.step.end-turn": "你已經沒有其他事要做。點擊「結束回合」，把回合交給機器人。",
  "learn.lesson.tutorial-hatch.step.end-turn.hint": "你結束回合後，機器人以 3 點記憶體開始它的回合。",
  "learn.lesson.tutorial-hatch.step.hatch": "你的培育區又空了。點擊數碼蛋卡組來孵化 Koromon。",
  "learn.lesson.tutorial-hatch.step.hatch.hint": "孵化會把數碼蛋卡組頂的卡片放入培育區。只有培育區為空時才能孵化。",
  "learn.lesson.tutorial-hatch.step.attack-player":
    "Biyomon 不再是新登場的數碼寶貝，可以攻擊了。點擊 Biyomon，選擇「攻擊」，然後點擊對手的安防區來獲勝。",
  "learn.lesson.tutorial-hatch.step.attack-player.hint": "召喚失調只在數碼寶貝登場的那個回合有效。",

  "learn.lesson.tutorial-memory.title": "記憶體",
  "learn.lesson.tutorial-memory.summary": "支付記憶體來登場數碼寶貝，並了解記憶體如何決定回合何時結束。",
  "learn.lesson.tutorial-memory.goal1": "如何支付記憶體來使用卡片",
  "learn.lesson.tutorial-memory.goal2": "為什麼記憶體移到對手一側時你的回合會結束",
  "learn.lesson.tutorial-memory.done": "你支付了記憶體，把回合交給了機器人，並用登場的數碼寶貝贏得了勝利。",
  "learn.lesson.tutorial-memory.step.intro":
    "記憶體是你和對手之間的計數器。你有 3 點記憶體。你每使用一張卡片，計數器就往對手一側移動。",
  "learn.lesson.tutorial-memory.step.intro.hint": "計數器越過 0 到達對手一側時，你的回合結束，對手的回合開始。",
  "learn.lesson.tutorial-memory.step.play-biyomon": "登場 Biyomon。把 Biyomon 從手牌拖到場上。它需要 2 點記憶體。",
  "learn.lesson.tutorial-memory.step.play-biyomon.hint": "登場費用是卡片左上角的數字。",
  "learn.lesson.tutorial-memory.step.play-birdramon":
    "你還剩 1 點記憶體。仍然登場 Birdramon。把 Birdramon 從手牌拖到場上。它需要 4 點記憶體。",
  "learn.lesson.tutorial-memory.step.play-birdramon.hint":
    "你可以支付超過現有數量的記憶體。計數器會移到對手一側的 3，你的回合結束。",
  "learn.lesson.tutorial-memory.step.attack-security":
    "機器人結束了它的回合，所以你以 3 點記憶體開始。用 Birdramon 攻擊。點擊 Birdramon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-memory.step.attack-security.hint": "你的數碼寶貝是上回合登場的，所以現在都可以攻擊。",
  "learn.lesson.tutorial-memory.step.attack-player":
    "對手的安防區已空。點擊 Biyomon，選擇「攻擊」，然後點擊對手的安防區來獲勝。",
  "learn.lesson.tutorial-memory.step.attack-player.hint": "攻擊不消耗記憶體。只有登場和進化卡片才需要。",

  "learn.lesson.tutorial-digivolve.title": "進化",
  "learn.lesson.tutorial-digivolve.summary": "將成長期進化為更強的成熟期，並用它攻擊。",
  "learn.lesson.tutorial-digivolve.goal1": "如何進化並支付進化費用",
  "learn.lesson.tutorial-digivolve.goal2": "進化源和繼承效果如何運作",
  "learn.lesson.tutorial-digivolve.done": "你將 Agumon 進化為 Greymon，額外抽了 1 張牌，並用更強的數碼寶貝贏得了勝利。",
  "learn.lesson.tutorial-digivolve.step.intro":
    "Agumon 是等級 3 的成長期。你可以把它進化為等級 4 的成熟期 Greymon，所需記憶體比直接登場 Greymon 更少。",
  "learn.lesson.tutorial-digivolve.step.intro.hint": "卡片可以從顏色和等級符合的數碼寶貝進化而來。進化費用印在卡片上。",
  "learn.lesson.tutorial-digivolve.step.digivolve": "把 Greymon 從手牌拖到 Agumon 上。進化需要 2 點記憶體。",
  "learn.lesson.tutorial-digivolve.step.digivolve.hint":
    "直接登場 Greymon 需要 5 點記憶體。進化更便宜，而且 Agumon 仍可以攻擊。",
  "learn.lesson.tutorial-digivolve.step.bonus": "你因進化額外抽了 1 張牌。Agumon 現在作為進化源位於 Greymon 下方。",
  "learn.lesson.tutorial-digivolve.step.bonus.hint":
    "數碼寶貝下方的卡片會提供繼承效果。Agumon 讓 Greymon 在你的回合 +1000 DP，所以 Greymon 有 5000 DP。",
  "learn.lesson.tutorial-digivolve.step.attack-security":
    "用 Greymon 攻擊。點擊 Greymon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-digivolve.step.attack-security.hint":
    "進化後的數碼寶貝仍是同一隻數碼寶貝，所以本回合可以攻擊。",
  "learn.lesson.tutorial-digivolve.step.attack-player":
    "對手的安防區已空。點擊 Biyomon，選擇「攻擊」，然後點擊對手的安防區來獲勝。",
  "learn.lesson.tutorial-digivolve.step.attack-player.hint": "進化能讓數碼寶貝變強，又不會像新卡片那樣受召喚失調影響。",

  "learn.lesson.tutorial-block.title": "阻擋",
  "learn.lesson.tutorial-block.summary": "用＜阻擋者＞擋下攻擊，然後在你的回合獲勝。",
  "learn.lesson.tutorial-block.goal1": "擁有＜阻擋者＞的數碼寶貝如何保護你",
  "learn.lesson.tutorial-block.goal2": "兩隻數碼寶貝之間的戰鬥如何進行",
  "learn.lesson.tutorial-block.done": "你用 Monochromon 擋下了機器人的攻擊，並在下個回合獲勝。",
  "learn.lesson.tutorial-block.step.intro":
    "現在是機器人的回合。你的 Monochromon 擁有＜阻擋者＞。對手的數碼寶貝攻擊時，它可以挺身而出。",
  "learn.lesson.tutorial-block.step.intro.hint": "＜阻擋者＞在對手的回合生效。數碼寶貝必須處於未橫置狀態才能阻擋。",
  "learn.lesson.tutorial-block.step.incoming-attack": "機器人的 Gomamon 即將攻擊你。請等待阻擋提示出現。",
  "learn.lesson.tutorial-block.step.incoming-attack.hint": "如果不阻擋，Gomamon 會檢查你的 1 張安防卡。",
  "learn.lesson.tutorial-block.step.block": "用 Monochromon 阻擋。在阻擋提示中選擇 Monochromon。",
  "learn.lesson.tutorial-block.step.block.hint":
    "Monochromon 有 5000 DP，Gomamon 有 3000 DP。DP 較低的數碼寶貝被消滅。",
  "learn.lesson.tutorial-block.step.your-turn": "Monochromon 贏得了戰鬥，現在處於橫置狀態。請等待機器人結束回合。",
  "learn.lesson.tutorial-block.step.your-turn.hint": "阻擋會橫置你的數碼寶貝。它會在你的回合開始時重置，所以仍可攻擊。",
  "learn.lesson.tutorial-block.step.attack-security":
    "現在是你的回合。用 Monochromon 攻擊。點擊 Monochromon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-block.step.attack-security.hint":
    "Monochromon 有 5000 DP，所以能擊敗安防區中 4000 DP 的 Bearmon。",
  "learn.lesson.tutorial-block.step.attack-player":
    "對手的安防區已空。點擊 Birdramon，選擇「攻擊」，然後點擊對手的安防區來獲勝。",
  "learn.lesson.tutorial-block.step.attack-player.hint": "機器人沒有可以阻擋的數碼寶貝，所以你的攻擊會成功。",

  "learn.lesson.tutorial-tamers.title": "馴獸師",
  "learn.lesson.tutorial-tamers.summary": "登場馴獸師來強化你的數碼寶貝，並用繼承效果獲勝。",
  "learn.lesson.tutorial-tamers.goal1": "馴獸師如何留在場上並幫助你的數碼寶貝",
  "learn.lesson.tutorial-tamers.goal2": "繼承效果如何讓你檢查更多安防卡",
  "learn.lesson.tutorial-tamers.done": "你登場了 Tai Kamiya，用 Garudamon 檢查了 2 張安防卡，並用 Dracomon 獲勝。",
  "learn.lesson.tutorial-tamers.step.intro": "對手有 2 張安防卡。只要 DP 足夠，Garudamon 一次攻擊就能擊破兩張。",
  "learn.lesson.tutorial-tamers.step.intro.hint": "馴獸師是留在場上的卡片。它們不攻擊，但效果能幫助你的數碼寶貝。",
  "learn.lesson.tutorial-tamers.step.play-tamer": "登場 Tai Kamiya。把 Tai Kamiya 從手牌拖到場上。它需要 2 點記憶體。",
  "learn.lesson.tutorial-tamers.step.play-tamer.hint":
    "Tai Kamiya 讓你的所有數碼寶貝在你的回合 +1000 DP。Garudamon 現在有 8000 DP。",
  "learn.lesson.tutorial-tamers.step.inherited":
    "Greymon 位於 Garudamon 下方。它的繼承效果讓 Garudamon 獲得＜安防攻擊 +1＞，所以會檢查 2 張安防卡。",
  "learn.lesson.tutorial-tamers.step.inherited.hint": "打開 Garudamon 可以查看它的進化源。每一張都可能提供繼承效果。",
  "learn.lesson.tutorial-tamers.step.attack-security":
    "用 Garudamon 攻擊。點擊 Garudamon，選擇「攻擊」，然後點擊對手的安防區。",
  "learn.lesson.tutorial-tamers.step.attack-security.hint":
    "第二張安防卡是 7000 DP 的 WereGarurumon。如果沒有 Tai Kamiya，戰鬥會打平，兩隻數碼寶貝都會被消滅。",
  "learn.lesson.tutorial-tamers.step.attack-player":
    "對手的安防區已空。點擊 Dracomon，選擇「攻擊」，然後點擊對手的安防區來獲勝。",
  "learn.lesson.tutorial-tamers.step.attack-player.hint": "只要馴獸師留在場上，它的效果就會持續生效。",
} satisfies Record<keyof typeof learnEn | keyof typeof learnLessonsEn, string>;
