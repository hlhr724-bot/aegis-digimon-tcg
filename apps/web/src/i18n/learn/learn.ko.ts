import type { learnEn } from "@/i18n/learn/learn.en";
import type { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const learnKo = {
  "learn.eyebrow": "배우기",
  "learn.title": "디지몬 카드 게임이 처음인가요?",
  "learn.lede": "가이드 봇과 짧은 레슨을 플레이하거나, 원하는 속도로 규칙을 읽어 보세요.",
  "learn.startLesson": "레슨 {number} 시작",
  "learn.replayLessons": "레슨 다시 플레이",
  "learn.readRules": "플레이 방법 읽기",
  "learn.progress": "레슨 {total}개 중 {completed}개 완료",
  "learn.guestNote":
    "게스트로 플레이 중입니다. 진행 상황은 이 브라우저에 저장됩니다. 로그인하면 모든 기기에서 유지됩니다.",
  "learn.lessonsHeading": "레슨",
  "learn.lessonNumber": "레슨 {number}",
  "learn.minutes": "{minutes}분",
  "learn.status.done": "완료",
  "learn.status.next": "다음",
  "learn.status.ready": "준비됨",
  "learn.status.locked": "잠김",
  "learn.lockedReason": "먼저 레슨 1을 마치세요",
  "learn.start": "시작",
  "learn.replay": "다시 하기",
  "learn.rulesHeading": "플레이 방법",
  "learn.rulesLede": "규칙을 쉬운 말로, 주제별로 하나씩 설명합니다.",

  "learn.briefing.counter": "레슨 {number}/{total}",
  "learn.briefing.goals": "배울 내용:",
  "learn.briefing.note": "덱과 필드는 미리 준비되어 있습니다. 봇은 정해진 간단한 플레이를 합니다.",
  "learn.briefing.drill": "키워드 연습",
  "learn.briefing.notNow": "나중에",
  "learn.briefing.start": "레슨 시작",

  "learn.coach.region": "레슨 코치",
  "learn.coach.counter": "단계 {current}/{total}",
  "learn.coach.next": "다음",
  "learn.coach.hint": "힌트",
  "learn.coach.hideHint": "힌트 숨기기",
  "learn.coach.skip": "단계 건너뛰기",
  "learn.coach.restart": "다시 시작",
  "learn.coach.done": "잘했어요!",
  "learn.coach.collapse": "코치 최소화",
  "learn.coach.expand": "코치 보기",
  "learn.coach.move": "레슨 코치 이동",
  "learn.coach.moveHelp": "드래그하거나 화살표 키로 이동하세요. Home 키를 누르면 위치가 초기화됩니다.",
  "learn.coach.finished": "이 레슨의 내용을 모두 배웠습니다. 게임을 끝까지 진행하면 레슨이 완료됩니다.",
  "learn.coach.chip": "단계 {current}/{total}",

  "learn.complete.title": "레슨 완료",
  "learn.complete.learned": "배운 내용:",
  "learn.complete.next": "다음 레슨",
  "learn.complete.back": "배우기로 돌아가기",
  "learn.complete.readMore": "더 읽기: {chapter}",
  "learn.complete.failedTitle": "레슨 미완료",
  "learn.complete.failedBody": "괜찮습니다. 레슨을 다시 해 보세요. 필드는 매번 초기화됩니다.",
  "learn.complete.tryAgain": "다시 하기",

  "learn.lobbyButton": "플레이 방법 배우기",

  "learn.rules.back": "배우기",
  "learn.rules.contents": "목차",
  "learn.rules.previous": "이전: {chapter}",
  "learn.rules.nextChapter": "다음: {chapter}",
  "learn.rules.tryIt": "해 보기",
  "learn.rules.tryItLesson": "레슨 {number}: {title}",
  "learn.rules.tryDrillLabel": "≪{keyword}≫ 연습해 보기",
  "learn.rules.officialRules": "공식 종합 규칙(PDF)",
  "learn.rules.keywordFilter": "키워드 검색",
  "learn.rules.keywordEmpty": "검색과 일치하는 키워드가 없습니다.",
  "learn.rules.keywordRule": "규칙 {rule}",

  "learn.rules.goal.title": "목표",
  "learn.rules.goal.p1":
    "각 플레이어는 시큐리티라는 뒷면 카드 더미를 가지고 있습니다. 시큐리티가 플레이어를 지켜 줍니다.",
  "learn.rules.goal.p2":
    "어택해서 상대의 시큐리티 카드를 없애세요. 상대의 시큐리티가 모두 사라지면, 한 번 더 어택해서 승리합니다.",
  "learn.rules.goal.p3": "상대가 카드를 드로우해야 하는데 덱이 비어 있어도 승리합니다.",

  "learn.rules.deck.title": "덱",
  "learn.rules.deck.p1": "덱 2개로 플레이합니다.",
  "learn.rules.deck.p2": "메인 덱은 정확히 50장입니다. 디지몬, 테이머, 옵션으로 구성합니다.",
  "learn.rules.deck.p3": "디지타마 덱에는 디지타마를 최대 5장 넣습니다. 디지타마는 육성 에어리어에서 부화합니다.",
  "learn.rules.deck.p4": "카드 번호가 같은 카드는 최대 4장까지 넣을 수 있습니다.",

  "learn.rules.setup.title": "준비",
  "learn.rules.setup.p1": "두 플레이어는 덱을 섞고 카드를 5장 드로우합니다.",
  "learn.rules.setup.p2": "패가 마음에 들지 않으면 한 번만 덱에 섞고 새로 5장을 드로우할 수 있습니다.",
  "learn.rules.setup.p3": "그다음 각 플레이어는 덱 위에서 카드 5장을 뒷면으로 시큐리티에 놓습니다.",
  "learn.rules.setup.p4": "먼저 하는 플레이어는 첫 턴에 드로우하지 않습니다.",

  "learn.rules.turn.title": "턴 진행",
  "learn.rules.turn.p1": "모든 턴에는 페이즈가 4개 있으며, 항상 같은 순서로 진행됩니다.",
  "learn.rules.turn.p2": "액티브: 레스트 상태인 카드를 다시 액티브로 되돌립니다.",
  "learn.rules.turn.p3": "드로우: 카드를 1장 드로우합니다.",
  "learn.rules.turn.p4": "육성: 디지타마를 부화하거나, 육성 에어리어에서 디지몬을 이동하거나, 아무것도 하지 않습니다.",
  "learn.rules.turn.p5": "메인: 카드를 등장시키고, 진화하고, 어택합니다. 메모리가 상대 쪽으로 넘어가면 턴이 끝납니다.",
  "learn.rules.turn.phaseUnsuspend": "액티브",
  "learn.rules.turn.phaseDraw": "드로우",
  "learn.rules.turn.phaseBreeding": "육성",
  "learn.rules.turn.phaseMain": "메인",

  "learn.rules.breeding.title": "육성 에어리어",
  "learn.rules.breeding.p1": "육성 에어리어에는 디지몬을 1장 둘 수 있습니다. 디지몬을 안전하게 키우는 곳입니다.",
  "learn.rules.breeding.p2":
    "육성 에어리어가 비어 있으면 부화할 수 있습니다. 디지타마 덱 맨 위 카드를 뒤집어 놓습니다.",
  "learn.rules.breeding.p3": "그곳의 디지몬도 다른 디지몬처럼 진화할 수 있습니다.",
  "learn.rules.breeding.p4":
    "육성 에어리어의 디지몬은 어택할 수 없고, 어택받지도 않습니다. 레벨 3 이상이 되면 육성 페이즈에 배틀 에어리어로 이동하세요.",

  "learn.rules.memory.title": "메모리",
  "learn.rules.memory.p1":
    "두 플레이어는 메모리 게이지 1개를 함께 사용합니다. 게이지는 내 쪽 10부터 상대 쪽 10까지입니다.",
  "learn.rules.memory.p2": "카드를 등장시키거나 진화하려면 카운터를 상대 쪽으로 옮겨 코스트를 지불합니다.",
  "learn.rules.memory.p3":
    "카운터가 내 쪽이나 0에 있는 동안 턴이 계속됩니다. 상대 쪽으로 넘어가면 턴이 끝나고, 상대는 그 메모리로 턴을 시작합니다.",
  "learn.rules.memory.p4": "턴을 일찍 끝낼 수도 있습니다. 그러면 카운터는 상대 쪽 3으로 이동합니다.",
  "learn.rules.memory.example": "메모리가 3입니다. 코스트 5인 디지몬을 등장시킵니다. 카운터는 상대 쪽 2로 이동합니다.",

  "learn.rules.digivolve.title": "진화",
  "learn.rules.digivolve.p1": "패의 디지몬을, 레벨이 1 낮고 색이 같은 내 디지몬 위에 겹쳐 놓습니다.",
  "learn.rules.digivolve.p2": "진화 코스트를 지불합니다. 보통 등장 코스트보다 낮습니다.",
  "learn.rules.digivolve.p3": "진화할 때마다 카드를 1장 드로우합니다.",
  "learn.rules.digivolve.p4":
    "아래에 있는 카드는 진화원으로 남습니다. 카드 아래쪽에 적힌 진화원 효과는 계속 작동합니다.",
  "learn.rules.digivolve.p5":
    "진화해도 디지몬의 상태는 유지됩니다. 어택할 수 있던 디지몬은 진화한 뒤에도 어택할 수 있습니다.",

  "learn.rules.attack.title": "어택과 시큐리티",
  "learn.rules.attack.p1":
    "내 디지몬 1장을 레스트해서 어택합니다. 상대 플레이어나 상대의 레스트 상태 디지몬을 어택할 수 있습니다.",
  "learn.rules.attack.p2": "디지몬은 ≪속공≫이 없으면 등장한 턴에 어택할 수 없습니다.",
  "learn.rules.attack.p3":
    "상대 플레이어를 어택하면, 상대는 시큐리티 맨 위 카드를 공개합니다. 디지몬이면 두 디지몬이 배틀하고 DP가 낮은 쪽이 소멸합니다. DP가 같으면 둘 다 소멸합니다.",
  "learn.rules.attack.p4": "테이머나 옵션이면 그 카드의 【시큐리티】 효과가 발동합니다. 그 뒤 카드는 트래시로 갑니다.",
  "learn.rules.attack.p5": "상대의 시큐리티가 모두 사라지면, 다음에 상대를 어택할 때 게임에서 승리합니다.",
  "learn.rules.attack.flowAttack": "어택",
  "learn.rules.attack.flowCheck": "시큐리티 맨 위 카드 확인",
  "learn.rules.attack.flowBattle": "디지몬: DP 비교",
  "learn.rules.attack.flowEffect": "테이머나 옵션: 【시큐리티】 효과",
  "learn.rules.attack.flowWin": "시큐리티 없음: 승리",

  "learn.rules.blocking.title": "블록",
  "learn.rules.blocking.p1": "일부 디지몬은 ≪블로커≫를 가지고 있습니다.",
  "learn.rules.blocking.p2":
    "상대가 어택할 때, ≪블로커≫를 가진 액티브 상태 디지몬을 레스트할 수 있습니다. 그러면 어택 대상이 그 디지몬으로 바뀝니다.",
  "learn.rules.blocking.p3": "두 디지몬이 배틀합니다. 그 어택으로 내 시큐리티는 줄지 않습니다.",

  "learn.rules.cardTypes.title": "카드 종류",
  "learn.rules.cardTypes.p1": "디지타마: 레벨 2입니다. 디지타마 덱에 넣고, 육성 에어리어에서 부화합니다.",
  "learn.rules.cardTypes.p2":
    "디지몬: 레벨, DP, 등장 코스트, 그리고 보통 진화 코스트를 가집니다. 디지몬은 어택하고 배틀합니다.",
  "learn.rules.cardTypes.p3": "테이머: 내 필드에 남아 효과를 계속 발휘합니다. 테이머는 어택할 수 없습니다.",
  "learn.rules.cardTypes.p4":
    "옵션: 코스트를 지불하고 효과를 한 번 사용한 뒤 트래시로 보냅니다. 내 필드에 같은 색의 디지몬이나 테이머가 있어야 합니다.",
  "learn.rules.cardTypes.p5":
    "진화원 효과: 디지몬 카드 아래쪽에 적힌 텍스트입니다. 그 카드가 다른 디지몬 아래에 있는 동안 작동합니다.",

  "learn.rules.keywords.title": "키워드",
  "learn.rules.keywords.p1":
    "키워드는 자주 쓰는 효과의 짧은 이름이며, ≪블로커≫처럼 괄호 안에 적습니다. 이 목록은 영어판 카드에 인쇄된 영어 이름을 사용합니다.",

  "learn.rules.levels.egg": "Lv.2 디지타마",
  "learn.rules.levels.rookie": "Lv.3 성장기",
  "learn.rules.levels.champion": "Lv.4 성숙기",
  "learn.rules.levels.ultimate": "Lv.5 완전체",
  "learn.rules.levels.mega": "Lv.6 궁극체",
  "learn.rules.levels.draw": "+1장",
  "learn.rules.memory.you": "나",
  "learn.rules.memory.opponent": "상대",

  "learn.lesson.tutorial-attack-security.title": "어택해서 승리하기",
  "learn.lesson.tutorial-attack-security.summary": "디지몬으로 마지막 시큐리티 카드를 깨고 상대 플레이어를 어택합니다.",
  "learn.lesson.tutorial-attack-security.goal1": "상대 시큐리티를 어택하는 방법",
  "learn.lesson.tutorial-attack-security.goal2": "다이렉트 어택으로 승리하는 방법",
  "learn.lesson.tutorial-attack-security.done":
    "마지막 시큐리티 카드를 깬 뒤 상대 플레이어를 직접 어택해 승리했습니다.",
  "learn.lesson.tutorial-attack-security.step.intro":
    "상대의 시큐리티 카드가 없을 때 내 디지몬이 상대를 어택하면 승리합니다. 상대의 시큐리티 카드는 1장입니다.",
  "learn.lesson.tutorial-attack-security.step.intro.hint":
    "내 디지몬은 아래쪽 필드에 있습니다. 상대 시큐리티는 위쪽에 있습니다.",
  "learn.lesson.tutorial-attack-security.step.attack-security":
    "버드라몬으로 어택하세요. 버드라몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-attack-security.step.attack-security.hint":
    "플레이어를 어택할 때마다 시큐리티 카드 1장을 확인합니다. 시큐리티의 디지몬은 어택한 디지몬과 배틀하고, DP가 높은 쪽이 이깁니다.",
  "learn.lesson.tutorial-attack-security.step.security-gone":
    "버드라몬의 DP가 시큐리티의 쉬라몬보다 높아서 그 카드는 트래시로 갔습니다. 버드라몬은 이제 레스트 상태입니다. 카드가 옆으로 돌아갔다는 뜻입니다.",
  "learn.lesson.tutorial-attack-security.step.security-gone.hint":
    "레스트 상태인 디지몬은 이번 턴에 다시 어택할 수 없습니다. 다음 내 턴이 시작될 때 액티브로 돌아옵니다.",
  "learn.lesson.tutorial-attack-security.step.attack-player":
    "상대의 시큐리티가 없습니다. 드라코몬으로 어택해서 승리하세요. 드라코몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-attack-security.step.attack-player.hint":
    "시큐리티 카드가 없는 플레이어를 어택하면 게임이 끝납니다. 이것이 기본적인 승리 방법입니다.",

  "learn.lesson.tutorial-hatch.title": "육성 에어리어",
  "learn.lesson.tutorial-hatch.summary":
    "육성 에어리어에서 디지몬을 키우고, 새 디지몬이 언제 어택할 수 있는지 배웁니다.",
  "learn.lesson.tutorial-hatch.goal1": "디지타마를 부화하고 육성 에어리어에서 디지몬을 이동하는 방법",
  "learn.lesson.tutorial-hatch.goal2": "방금 등장시킨 디지몬이 어택할 수 없는 이유",
  "learn.lesson.tutorial-hatch.done":
    "육성 에어리어를 사용하고, 새 디지몬의 첫 턴을 기다린 뒤 그 디지몬으로 승리했습니다.",
  "learn.lesson.tutorial-hatch.step.intro":
    "육성 에어리어는 디지몬을 안전하게 키우는 곳입니다. 상대는 이곳을 어택하거나 대상으로 지정할 수 없습니다. 육성 행동은 매 턴 1번 할 수 있습니다.",
  "learn.lesson.tutorial-hatch.step.intro.hint":
    "육성 행동은 메인 페이즈 전에 합니다. 디지타마를 부화하거나, 디지몬을 이동하거나, 아무것도 하지 않습니다.",
  "learn.lesson.tutorial-hatch.step.move-out":
    "육성 에어리어의 드라코몬이 준비되었습니다. 육성 에어리어의 드라코몬을 클릭한 뒤 필드로 이동하세요.",
  "learn.lesson.tutorial-hatch.step.move-out.hint":
    "레벨 3 이상인 디지몬만 육성 에어리어에서 나갈 수 있습니다. 이동한 디지몬은 같은 턴에 어택할 수 있습니다.",
  "learn.lesson.tutorial-hatch.step.play-biyomon":
    "피요몬을 등장시키세요. 패의 피요몬을 필드로 드래그하세요. 메모리 2가 듭니다.",
  "learn.lesson.tutorial-hatch.step.play-biyomon.hint":
    "패에서 등장시킨 디지몬은 등장한 턴에 어택할 수 없습니다. 이것을 소환 멀미라고 합니다.",
  "learn.lesson.tutorial-hatch.step.attack-security":
    "피요몬은 기다려야 하지만 드라코몬은 어택할 수 있습니다. 드라코몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-hatch.step.attack-security.hint":
    "드라코몬은 DP 4000이므로, 시큐리티에 있는 DP 3000 쉬라몬을 이깁니다.",
  "learn.lesson.tutorial-hatch.step.end-turn": "더 할 일이 없습니다. 턴 종료를 클릭해 봇에게 턴을 넘기세요.",
  "learn.lesson.tutorial-hatch.step.end-turn.hint": "턴을 넘기면 봇은 메모리 3으로 턴을 시작합니다.",
  "learn.lesson.tutorial-hatch.step.hatch":
    "육성 에어리어가 다시 비었습니다. 디지타마 덱을 클릭해 코로몬을 부화하세요.",
  "learn.lesson.tutorial-hatch.step.hatch.hint":
    "부화하면 디지타마 덱 맨 위 카드가 육성 에어리어에 놓입니다. 육성 에어리어가 비어 있을 때만 부화할 수 있습니다.",
  "learn.lesson.tutorial-hatch.step.attack-player":
    "피요몬은 이제 새 카드가 아니므로 어택할 수 있습니다. 피요몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭해 승리하세요.",
  "learn.lesson.tutorial-hatch.step.attack-player.hint": "소환 멀미는 디지몬을 등장시킨 턴에만 적용됩니다.",

  "learn.lesson.tutorial-memory.title": "메모리",
  "learn.lesson.tutorial-memory.summary":
    "메모리를 지불해 디지몬을 등장시키고, 메모리가 턴 종료를 어떻게 정하는지 확인합니다.",
  "learn.lesson.tutorial-memory.goal1": "메모리를 지불해 카드를 등장시키는 방법",
  "learn.lesson.tutorial-memory.goal2": "메모리가 상대 쪽으로 넘어가면 턴이 끝나는 이유",
  "learn.lesson.tutorial-memory.done": "메모리를 지불하고, 봇에게 턴을 넘긴 뒤, 등장시킨 디지몬으로 승리했습니다.",
  "learn.lesson.tutorial-memory.step.intro":
    "메모리는 나와 상대 사이에 있는 카운터입니다. 지금 메모리는 3입니다. 카드를 등장시킬 때마다 카운터가 상대 쪽으로 움직입니다.",
  "learn.lesson.tutorial-memory.step.intro.hint":
    "카운터가 0을 넘어 상대 쪽으로 가면 내 턴이 끝나고 상대 턴이 시작됩니다.",
  "learn.lesson.tutorial-memory.step.play-biyomon":
    "피요몬을 등장시키세요. 패의 피요몬을 필드로 드래그하세요. 메모리 2가 듭니다.",
  "learn.lesson.tutorial-memory.step.play-biyomon.hint": "등장 코스트는 카드 왼쪽 위에 있는 숫자입니다.",
  "learn.lesson.tutorial-memory.step.play-birdramon":
    "메모리가 1 남았습니다. 그래도 버드라몬을 등장시키세요. 패의 버드라몬을 필드로 드래그하세요. 메모리 4가 듭니다.",
  "learn.lesson.tutorial-memory.step.play-birdramon.hint":
    "가진 것보다 많은 메모리를 지불할 수 있습니다. 카운터는 상대 쪽 3으로 이동하고 내 턴이 끝납니다.",
  "learn.lesson.tutorial-memory.step.attack-security":
    "봇이 턴을 넘겼으므로 메모리 3으로 시작합니다. 버드라몬으로 어택하세요. 버드라몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-memory.step.attack-security.hint":
    "두 디지몬 모두 지난 턴에 등장했으므로 지금 어택할 수 있습니다.",
  "learn.lesson.tutorial-memory.step.attack-player":
    "상대의 시큐리티가 없습니다. 피요몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭해 승리하세요.",
  "learn.lesson.tutorial-memory.step.attack-player.hint":
    "어택에는 메모리가 들지 않습니다. 카드를 등장시키거나 진화할 때만 메모리가 듭니다.",

  "learn.lesson.tutorial-digivolve.title": "진화",
  "learn.lesson.tutorial-digivolve.summary": "성장기를 더 강한 성숙기로 진화시키고 어택합니다.",
  "learn.lesson.tutorial-digivolve.goal1": "진화하고 진화 코스트를 지불하는 방법",
  "learn.lesson.tutorial-digivolve.goal2": "진화원과 진화원 효과가 작동하는 방식",
  "learn.lesson.tutorial-digivolve.done":
    "아구몬을 그레이몬으로 진화시키고, 보너스 카드를 드로우한 뒤, 더 강한 디지몬으로 승리했습니다.",
  "learn.lesson.tutorial-digivolve.step.intro":
    "아구몬은 레벨 3 성장기입니다. 레벨 4 성숙기인 그레이몬으로 진화할 수 있습니다. 그레이몬을 등장시키는 것보다 메모리가 적게 듭니다.",
  "learn.lesson.tutorial-digivolve.step.intro.hint":
    "카드는 색과 레벨이 맞는 디지몬에서 진화할 수 있습니다. 진화 코스트는 카드에 인쇄되어 있습니다.",
  "learn.lesson.tutorial-digivolve.step.digivolve":
    "패의 그레이몬을 아구몬 위로 드래그하세요. 진화에는 메모리 2가 듭니다.",
  "learn.lesson.tutorial-digivolve.step.digivolve.hint":
    "그레이몬을 등장시키면 메모리 5가 듭니다. 진화가 더 저렴하고, 아구몬이 어택할 수 있는 상태도 유지됩니다.",
  "learn.lesson.tutorial-digivolve.step.bonus":
    "진화 보너스로 카드를 1장 드로우했습니다. 아구몬은 이제 그레이몬 아래에 진화원으로 있습니다.",
  "learn.lesson.tutorial-digivolve.step.bonus.hint":
    "디지몬 아래의 카드는 진화원 효과를 줍니다. 아구몬은 내 턴 동안 그레이몬에게 DP +1000을 주므로, 그레이몬은 DP 5000입니다.",
  "learn.lesson.tutorial-digivolve.step.attack-security":
    "그레이몬으로 어택하세요. 그레이몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-digivolve.step.attack-security.hint":
    "진화한 디지몬은 같은 디지몬이므로 이번 턴에 어택할 수 있습니다.",
  "learn.lesson.tutorial-digivolve.step.attack-player":
    "상대의 시큐리티가 없습니다. 피요몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭해 승리하세요.",
  "learn.lesson.tutorial-digivolve.step.attack-player.hint":
    "진화하면 새 카드의 소환 멀미 없이 디지몬을 강하게 만들 수 있습니다.",

  "learn.lesson.tutorial-block.title": "블록",
  "learn.lesson.tutorial-block.summary": "≪블로커≫로 어택을 막고, 내 턴에 승리합니다.",
  "learn.lesson.tutorial-block.goal1": "≪블로커≫를 가진 디지몬이 나를 지키는 방법",
  "learn.lesson.tutorial-block.goal2": "두 디지몬의 배틀이 진행되는 방식",
  "learn.lesson.tutorial-block.done": "모노크로몬으로 봇의 어택을 블록하고, 다음 내 턴에 승리했습니다.",
  "learn.lesson.tutorial-block.step.intro":
    "봇의 턴입니다. 내 모노크로몬은 ≪블로커≫를 가지고 있습니다. 상대 디지몬이 어택할 때 대신 막아설 수 있습니다.",
  "learn.lesson.tutorial-block.step.intro.hint":
    "≪블로커≫는 상대 턴에 작동합니다. 블록하려면 디지몬이 액티브 상태여야 합니다.",
  "learn.lesson.tutorial-block.step.incoming-attack":
    "봇의 쉬라몬이 곧 어택합니다. 블록 선택 창이 나올 때까지 기다리세요.",
  "learn.lesson.tutorial-block.step.incoming-attack.hint":
    "블록하지 않으면 쉬라몬이 내 시큐리티 카드 1장을 확인합니다.",
  "learn.lesson.tutorial-block.step.block": "모노크로몬으로 블록하세요. 블록 선택 창에서 모노크로몬을 고르세요.",
  "learn.lesson.tutorial-block.step.block.hint":
    "모노크로몬은 DP 5000, 쉬라몬은 DP 3000입니다. DP가 낮은 디지몬이 소멸합니다.",
  "learn.lesson.tutorial-block.step.your-turn":
    "모노크로몬이 배틀에서 이겼고 지금은 레스트 상태입니다. 봇이 턴을 끝낼 때까지 기다리세요.",
  "learn.lesson.tutorial-block.step.your-turn.hint":
    "블록하면 디지몬이 레스트됩니다. 내 턴이 시작될 때 액티브로 돌아오므로 어택도 할 수 있습니다.",
  "learn.lesson.tutorial-block.step.attack-security":
    "내 턴입니다. 모노크로몬으로 어택하세요. 모노크로몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-block.step.attack-security.hint":
    "모노크로몬은 DP 5000이므로, 시큐리티에 있는 DP 4000 베어몬을 이깁니다.",
  "learn.lesson.tutorial-block.step.attack-player":
    "상대의 시큐리티가 없습니다. 버드라몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭해 승리하세요.",
  "learn.lesson.tutorial-block.step.attack-player.hint": "봇에게 블록할 디지몬이 남아 있지 않으므로 어택이 통과합니다.",

  "learn.lesson.tutorial-tamers.title": "테이머",
  "learn.lesson.tutorial-tamers.summary": "테이머를 등장시켜 디지몬을 강화하고, 진화원 효과를 사용해 승리합니다.",
  "learn.lesson.tutorial-tamers.goal1": "테이머가 필드에 남아 디지몬을 돕는 방식",
  "learn.lesson.tutorial-tamers.goal2": "진화원 효과로 시큐리티를 더 많이 확인하는 방법",
  "learn.lesson.tutorial-tamers.done":
    "신태일을 등장시키고, Garudamon으로 시큐리티 카드 2장을 확인한 뒤, 드라코몬으로 승리했습니다.",
  "learn.lesson.tutorial-tamers.step.intro":
    "상대의 시큐리티 카드는 2장입니다. DP가 충분하면 Garudamon은 어택 1번으로 둘 다 깰 수 있습니다.",
  "learn.lesson.tutorial-tamers.step.intro.hint":
    "테이머는 필드에 남는 카드입니다. 어택하지는 않지만, 효과로 디지몬을 돕습니다.",
  "learn.lesson.tutorial-tamers.step.play-tamer":
    "신태일을 등장시키세요. 패의 신태일을 필드로 드래그하세요. 메모리 2가 듭니다.",
  "learn.lesson.tutorial-tamers.step.play-tamer.hint":
    "신태일은 내 턴 동안 내 디지몬 모두에게 DP +1000을 줍니다. Garudamon은 이제 DP 8000입니다.",
  "learn.lesson.tutorial-tamers.step.inherited":
    "그레이몬이 Garudamon 아래에 있습니다. 그 진화원 효과로 Garudamon은 ≪시큐리티 어택 +1≫을 얻어 시큐리티 카드 2장을 확인합니다.",
  "learn.lesson.tutorial-tamers.step.inherited.hint":
    "Garudamon을 열면 진화원을 볼 수 있습니다. 각 진화원은 진화원 효과를 줄 수 있습니다.",
  "learn.lesson.tutorial-tamers.step.attack-security":
    "Garudamon으로 어택하세요. Garudamon을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭하세요.",
  "learn.lesson.tutorial-tamers.step.attack-security.hint":
    "두 번째 시큐리티 카드는 DP 7000 WereGarurumon입니다. 신태일이 없으면 DP가 같아 두 디지몬 모두 소멸합니다.",
  "learn.lesson.tutorial-tamers.step.attack-player":
    "상대의 시큐리티가 없습니다. 드라코몬을 클릭하고 어택을 선택한 뒤 상대 시큐리티를 클릭해 승리하세요.",
  "learn.lesson.tutorial-tamers.step.attack-player.hint": "테이머 효과는 테이머가 필드에 있는 동안 계속 작동합니다.",
} satisfies Record<keyof typeof learnEn | keyof typeof learnLessonsEn, string>;
