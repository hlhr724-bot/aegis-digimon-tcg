import type { newDrillsEn } from "@/i18n/learn/newDrills.en";
import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnKo } from "@/i18n/learn/learn.ko";

export const battleLessonsKo = {
  ...buildRulePracticeTranslations({ dictionary: learnKo }),
  "learn.lesson.drill-retaliation.title": "Retaliation: 더 강한 디지몬 쓰러뜨리기",
  "learn.lesson.drill-retaliation.summary": "Retaliation으로 배틀에서 진 뒤 더 강한 Blocker를 소멸시키고 승리하세요.",
  "learn.lesson.drill-retaliation.goal1": "Retaliation 효과가 배틀에서 승리한 디지몬을 소멸하는 방법",
  "learn.lesson.drill-retaliation.goal2": "작은 어택 디지몬이 훨씬 더 강한 방어자를 제거할 수 있는 이유",
  "learn.lesson.drill-retaliation.done":
    "Candlemon은 배틀에서 패했고, Retaliation 효과로 Monochromon을 소멸하며 승리의 어택을 개시했습니다.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon은 DP 1000과 Retaliation을 가지고 있습니다. 봇의 Monochromon은 DP 5000, Blocker를 가진 레스트 상태의 디지몬입니다. 이 배틀에서 지면 Retaliation으로 Monochromon을 소멸시킬 수 있습니다.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation 효과는 다른 디지몬과의 배틀에서 패한 후 이 디지몬이 소멸되면 트리거됩니다.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Candlemon을 클릭하고 어택을 선택한 뒤 레스트 상태의 Monochromon을 선택하세요. 배틀과 Retaliation을 해결하세요.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon은 DP 비교에서 패배합니다. 이후 Retaliation이 Monochromon을 소멸시킵니다. 두 번째 배틀이 아니라 효과에 의한 소멸입니다.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon이 사라졌고 봇에 시큐리티가 없습니다. Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "첫 번째 배틀에서 희생하기보다는 이번 마지막 어택을 위해 Birdramon을 유지하세요.",
  "learn.lesson.drill-blitz.title": "Blitz: 메모리가 0을 넘은 후 어택",
  "learn.lesson.drill-blitz.summary": "진화 코스트로 메모리를 상대 쪽으로 넘기고 턴이 끝나기 전에 Blitz로 어택하세요.",
  "learn.lesson.drill-blitz.goal1": "메모리가 상대 쪽으로 넘어가도 진화 효과는 해결되는 이유",
  "learn.lesson.drill-blitz.goal2": "상대 쪽에 메모리가 있을 때 Blitz로 어택하는 방법",
  "learn.lesson.drill-blitz.done":
    "BetelGammamon은 진화 코스트로 메모리가 상대 쪽으로 넘어간 뒤 Blitz 어택으로 승리했습니다.",
  "learn.lesson.drill-blitz.step.intro":
    "내 메모리는 1이며 Biyomon이 필드에 있습니다. 패의 BetelGammamon은 진화 코스트가 2이고 When Digivolving의 Blitz를 가지고 있습니다.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "봇의 시큐리티는 0장입니다. 코스트를 지불한 뒤 Blitz 확인 창에서 어택해야 합니다. 새로운 보통 메인 페이즈 행동을 시작하려 하면 이미 턴이 끝납니다.",
  "learn.lesson.drill-blitz.step.digivolve":
    "패의 BetelGammamon을 Biyomon 위에 진화시키세요. 코스트를 지불하면 메모리가 상대 쪽 1로 넘어갑니다.",
  "learn.lesson.drill-blitz.step.digivolve.hint": "진화는 기존 디지몬을 변경하고 어택 권한을 재설정하지 않습니다.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Blitz 효과를 사용하세요. 턴이 넘어가기 전에 BetelGammamon으로 상대 플레이어를 어택해 승리하세요.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz는 상대 쪽에 메모리가 있을 때 이 어택을 허용합니다. Rush를 주거나 디지몬을 액티브로 만들지는 않습니다.",
  "learn.lesson.drill-raid.title": "Raid: 준비된 최강자에게 도전하세요 디지몬",
  "learn.lesson.drill-raid.summary": "Raid를 사용하여 액티브 Blocker로 어택을 리디렉션합니다.",
  "learn.lesson.drill-raid.goal1": "Raid가 선언된 어택 대상을 변경하는 방법",
  "learn.lesson.drill-raid.goal2": "상대의 액티브 디지몬 중 DP가 가장 높은 대상을 골라야 하는 이유",
  "learn.lesson.drill-raid.done":
    "Grizzlymon은 Raid를 사용하여 Monochromon을 제거했고, Birdramon은 승리의 어택을 전달했습니다.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon에는 Raid가 있고 그 아래에 있는 Agumon에서 DP +1000을 얻습니다. 봇에는 액티브 5000 DP Monochromon이 있습니다.",
  "learn.lesson.drill-raid.step.intro.hint":
    "일반적으로 액티브 디지몬에 대한 어택을 선언할 수 없습니다. Raid는 선언 후 대상을 변경합니다.",
  "learn.lesson.drill-raid.step.raid":
    "Grizzlymon으로 상대 플레이어를 어택하세요. Raid 선택 창에서 Monochromon을 새 어택 대상으로 선택하세요.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon은 DP가 6000이므로 이번 배틀에서 승리합니다. Monochromon은 적격 최고 DP 액티브 대상입니다.",
  "learn.lesson.drill-raid.step.win": "Blocker가 사라졌습니다. Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-raid.step.win.hint":
    "Raid를 통해 대상을 변경해도 시큐리티 검사가 생성되지 않았습니다. Birdramon은 별도의 어택을 합니다.",
  "learn.lesson.drill-collision.title": "Collision: 봇 블록 만들기",
  "learn.lesson.drill-collision.summary": "Blocker가 인쇄되지 않은 디지몬을 강제로 방어한 다음 시큐리티를 관통합니다.",
  "learn.lesson.drill-collision.goal1": "Collision가 어택하는 동안 상대 디지몬에게 Blocker를 부여하는 방법",
  "learn.lesson.drill-collision.goal2": "가능하다면 수비수가 막아야 하는 이유",
  "learn.lesson.drill-collision.done":
    "Proganomon이 Gomamon을 강제로 블록하고 마지막 시큐리티 카드를 뚫었고 Birdramon이 승리했습니다.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon에는 Collision 및 Piercing가 있습니다. 봇에는 Blocker를 인쇄하지 않는 Gomamon과 1개의 시큐리티 카드가 있습니다.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision은 이 어택 중 상대 디지몬에게 Blocker를 주며, 블록할 수 있으면 봇은 반드시 블록해야 합니다.",
  "learn.lesson.drill-collision.step.collision":
    "Proganomon으로 상대 플레이어를 어택하세요. 봇은 Gomamon으로 블록해야 합니다. Gomamon이 배틀에서 소멸하면 Piercing으로 시큐리티를 체크합니다.",
  "learn.lesson.drill-collision.step.collision.hint":
    "봇은 사용 가능한 블록을 거부할 수 없습니다. Proganomon은 Gomamon의 3000 DP에 비해 7000 DP를 가지고 있습니다.",
  "learn.lesson.drill-collision.step.win":
    "봇에는 시큐리티도 없고 수비수도 없습니다. Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision이 배틀을 강제했고, Proganomon이 배틀에서 이긴 뒤 Piercing으로 시큐리티를 체크했습니다.",
  "learn.lesson.drill-vortex.title": "Vortex: 턴 종료 시 마지막 배틀",
  "learn.lesson.drill-vortex.summary": "Galemon을 플레이하고 Vortex를 사용하여 같은 턴에 디지몬을 어택합니다.",
  "learn.lesson.drill-vortex.goal1": "Vortex가 턴 종료 어택을 생성하는 방법",
  "learn.lesson.drill-vortex.goal2":
    "Vortex가 디지몬이 플레이된 턴에 어택할 수 있지만 일반적으로 디지몬만 대상으로 하는 이유",
  "learn.lesson.drill-vortex.done":
    "Galemon은 Vortex를 사용하여 플레이 첫 번째 턴에 Monochromon을 클리어한 후 다음 턴에 승리했습니다.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon에는 Vortex가 있습니다. 봇에는 레스트 Monochromon이 있고 시큐리티는 없습니다. Galemon은 턴이 끝날 때 해당 Blocker를 제거할 수 있습니다.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "새로 등장한 일반 디지몬은 이번 턴에 어택할 수 없습니다. Vortex는 턴 종료 시 특정 예외를 제공합니다.",
  "learn.lesson.drill-vortex.step.play": "패의 Galemon을 메모리 6을 지불하고 등장시키세요.",
  "learn.lesson.drill-vortex.step.play.hint":
    "메모리가 0이 됩니다. 이번 턴에 등장한 Galemon으로 보통 어택을 시도하지 마세요.",
  "learn.lesson.drill-vortex.step.vortex":
    "턴 종료를 누르고 Vortex를 사용하세요. 레스트 상태의 Monochromon을 어택 대상으로 선택하세요.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex만으로는 플레이어를 대상으로 선택할 수 없습니다. Galemon의 DP 6000은 Monochromon의 DP 5000보다 높습니다.",
  "learn.lesson.drill-vortex.step.opponent-turn": "턴 종료 처리가 완료되고 봇의 턴이 시작됩니다.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "키워드 어택은 턴이 실제로 변경되기 전에 발생합니다. 그러면 봇이 통과합니다.",
  "learn.lesson.drill-vortex.step.your-turn": "봇이 통과하고 다음 메인 페이즈가 시작될 때까지 기다립니다.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon은 내 턴 시작에 액티브가 됩니다. 이제 이번 턴에 등장한 디지몬도 아닙니다.",
  "learn.lesson.drill-vortex.step.win": "Galemon으로 플레이어를 정상적으로 어택하면 승리합니다.",
  "learn.lesson.drill-vortex.step.win.hint":
    "이것은 일반적인 메인 페이즈 어택입니다. 디지몬 전용 Vortex 제한을 사용하지 않습니다.",
  "learn.lesson.drill-overclock.title": "Overclock: 일어서지 않고 다시 어택",
  "learn.lesson.drill-overclock.summary": "Puppet를 희생하여 턴 종료 시 레스트 ShoeShoemon 어택을 합니다.",
  "learn.lesson.drill-overclock.goal1": "Overclock 효과가 지정된 다른 디지몬을 소멸하여 코스트을 지불하는 방법",
  "learn.lesson.drill-overclock.goal2": "레스트가 없는 어택이 레스트 디지몬에서 발생할 수 있는 이유",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon은 시큐리티를 확인하고 Overclock의 Shoemon을 소멸한 후 액티브 없이 다시 어택했습니다.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon에는 Puppet 특성에 대한 Overclock 효과가 있습니다. Shoemon은 또 다른 Puppet이며 이번 턴에 플레이되었으므로 지불금으로 유지하세요.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock은 디지몬을 레스트하지 않고 상대 플레이어를 어택합니다. ShoeShoemon이 이미 레스트 상태여도 어택할 수 있습니다.",
  "learn.lesson.drill-overclock.step.clear-security":
    "ShoeShoemon으로 플레이어를 어택하여 마지막 시큐리티 카드를 제거합니다.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon은 이 어택 후에도 레스트로 유지됩니다. 다음 키워드 프롬프트를 건너뛰지 마십시오.",
  "learn.lesson.drill-overclock.step.overclock":
    "턴 종료를 누르고 Overclock를 사용하세요. 조건에 맞는 다른 Puppet인 Shoemon을 소멸시켜 코스트를 지불하세요. 이어서 상대 플레이어를 어택해 승리하세요.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "ShoeShoemon이 아니라 Shoemon으로 지불하세요. 지불한 뒤의 Overclock 어택은 필수이며, 어택 전에 액티브가 될 필요가 없습니다.",
  "learn.lesson.drill-iceclad.title": "Iceclad: 더 많은 진화원으로 승리",
  "learn.lesson.drill-iceclad.summary": "진화 카드 수를 비교하여 12000 DP 디지몬을 이겼습니다.",
  "learn.lesson.drill-iceclad.goal1": "디지몬 배틀에서 Iceclad가 DP 비교를 대체하는 방법",
  "learn.lesson.drill-iceclad.goal2": "시큐리티 배틀이 여전히 DP를 비교하는 이유",
  "learn.lesson.drill-iceclad.done":
    "PolarBearmon의 두 진화원은 낮은 DP에도 불구하고 WarGreymon의 0을 이겼고 Birdramon이 승리했습니다.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon에는 7000 DP, Iceclad 및 2개의 진화 카드가 있습니다. 레스트 WarGreymon에는 12000 DP가 있지만 진화 카드는 없습니다.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad는 시큐리티 배틀 이외의 배틀에서 DP 대신 진화원 수를 비교합니다. 진화원이 더 많은 쪽이 승리하며, 수가 같으면 양쪽 모두 패배합니다.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "PolarBearmon으로 레스트 WarGreymon을 어택하세요. Iceclad 배틀을 해결해 보세요.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "2개의 진화원을 0과 비교합니다. 7000 DP와 12000 DP를 비교하지 마세요. PolarBearmon은 승리한 배틀에서 살아남습니다.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon이 사라졌고 봇에 시큐리티가 없습니다. Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "시큐리티 디지몬은 여전히 DP를 사용하여 배틀합니다. Iceclad의 진화원 비교는 적용되지 않습니다.",
  "learn.lesson.drill-execute.title": "Execute: 어택 디지몬을 소비하여 방어를 무너뜨립니다.",
  "learn.lesson.drill-execute.summary": "턴 종료 시 액티브 Blocker를 어택한 다음 어택 디지몬의 소멸을 수락합니다.",
  "learn.lesson.drill-execute.goal1": "Execute가 액티브 디지몬에 대한 턴 종료 어택을 허용하는 방법",
  "learn.lesson.drill-execute.goal2": "어택이 끝나면 어택 디지몬이 소멸되는 이유",
  "learn.lesson.drill-execute.done":
    "Phantomon이 Execute로 Monochromon을 물리치고 소멸되었습니다. Birdramon은 다음 턴에 승리했습니다.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon에는 Execute 및 7000 DP가 있습니다. 봇의 액티브 Monochromon은 5000 DP를 가지며 Birdramon을 블록합니다.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute는 턴 종료 시 Phantomon의 어택을 허용하며 액티브 상태의 상대 디지몬도 대상으로 선택할 수 있습니다. 그 어택 종료 시 Phantomon은 소멸합니다.",
  "learn.lesson.drill-execute.step.execute":
    "턴 종료를 누르고 Execute를 사용한 뒤 Monochromon을 대상으로 선택하세요. 배틀과 Phantomon의 소멸 처리를 끝까지 해결하세요.",
  "learn.lesson.drill-execute.step.execute.hint":
    "상대 플레이어 대신 Blocker를 제거해야 합니다. Phantomon이 배틀에서 이겨도 Execute에 의한 어택 종료 시 소멸은 처리됩니다.",
  "learn.lesson.drill-execute.step.opponent-turn": "턴 종료 처리가 완료되고 봇의 턴이 시작됩니다.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "턴이 실제로 변경되기 전에 키워드 어택이 발생합니다. 그러면 봇이 통과합니다.",
  "learn.lesson.drill-execute.step.your-turn": "봇이 통과하고 다음 차례가 메인 페이즈에 도달할 때까지 기다립니다.",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon은 준비 상태를 유지했으며 Blocker가 남아 있지 않습니다.",
  "learn.lesson.drill-execute.step.win": "Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-execute.step.win.hint":
    "봇에 시큐리티가 없습니다. Phantomon의 희생으로 인해 자신을 보호하던 방어력이 제거되었습니다.",
  "learn.lesson.drill-progress.title": "Progress: 어택하는 동안 시큐리티 효과에 저항합니다.",
  "learn.lesson.drill-progress.summary": "Cocytus Breath를 통해 어택하고 Progress로 디지몬을 유지하세요.",
  "learn.lesson.drill-progress.goal1": "Progress가 상대 효과가 어택 디지몬에게 영향을 미치는 것을 방지하는 방법",
  "learn.lesson.drill-progress.goal2": "Progress가 모든 배틀 패배을 예방하지 못하는 이유",
  "learn.lesson.drill-progress.done":
    "Dimetromon은 어택 중에 시큐리티 효과를 무시하고 다음 턴에 복플레이어여 승리했습니다.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon에는 Progress가 있습니다. 어택하는 동안 상대 효과는 영향을 미치지 않습니다. 봇의 마지막 시큐리티 카드는 Cocytus Breath입니다.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath는 일반적으로 상대 디지몬을 패에 반환합니다. Progress는 해당 효과 동안 이 어택 디지몬을 보호합니다.",
  "learn.lesson.drill-progress.step.progress":
    "Dimetromon으로 상대 플레이어를 어택하세요. Cocytus Breath가 해결되어도 어택 중인 Dimetromon은 패로 돌아가지 않습니다.",
  "learn.lesson.drill-progress.step.progress.hint":
    "Progress는 어택 중에 상대 효과를 받지 않게 합니다. 더 강한 시큐리티 디지몬과의 배틀에서 지면 배틀에 의한 소멸은 막지 못합니다.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon은 현장에 머물렀습니다. 턴 종료를 클릭합니다.",
  "learn.lesson.drill-progress.step.end-turn.hint": "봇에는 나를 어택할 디지몬이 없습니다.",
  "learn.lesson.drill-progress.step.your-turn": "다음 메인 페이즈를 기다리세요.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon은 내 턴 시작에 액티브가 됩니다.",
  "learn.lesson.drill-progress.step.win": "Dimetromon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-progress.step.win.hint":
    "Progress 보호가 없었다면 유일한 어택 디지몬은 다시 패에 들어갔을 것입니다.",
  "learn.lesson.drill-engage.title": "Engage : 턴엔드 처리 중 어택",
  "learn.lesson.drill-engage.summary": "디지몬을 준비 상태로 유지하고 통과 후 Engage 어택을 수락하세요.",
  "learn.lesson.drill-engage.goal1": "턴이 끝날 때 Engage가 트리거되는 방식",
  "learn.lesson.drill-engage.goal2": "상대가 턴을 시작하기 전에 어택이 해결되는 이유",
  "learn.lesson.drill-engage.done": "WarGrowlmon은 턴 종료 처리 중에 Engage를 사용하여 어택하고 승리했습니다.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon에는 Engage가 있고 봇에는 시큐리티가 없습니다. 일반적인 메인 페이즈 어택 대신 턴 종료 키워드를 사용하여 승리하게 됩니다.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage는 선택 사항입니다. 효과를 처리하는 시점에 규칙상 그 어택을 할 수 있어야 합니다.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Engage를 사용할 수 있도록 WarGrowlmon 액티브를 유지하세요. 통과할 준비가 되면 계속하십시오.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage는 디지몬을 액티브로 만들지 않습니다. 이번 턴에 등장한 디지몬이 보통의 어택 제한을 무시하게 하지도 않습니다.",
  "learn.lesson.drill-engage.step.engage":
    "턴 종료를 누르고 Engage를 사용하세요. 상대 플레이어를 어택 대상으로 선택해 승리하세요.",
  "learn.lesson.drill-engage.step.engage.hint":
    "패스하면 봇에 3 메모리가 제공되지만 봇의 턴이 시작되기 전에 Engage와 어택이 해결됩니다.",
  "learn.lesson.drill-barrier.title": "Barrier: 디지몬을 유지하려면 시큐리티를 지불하세요.",
  "learn.lesson.drill-barrier.summary":
    "시큐리티 배틀에서 패배하지 않도록 Angemon을 보호한 다음 이를 사용하여 승리하세요.",
  "learn.lesson.drill-barrier.goal1": "Barrier가 배틀 소멸을 대체하는 방법",
  "learn.lesson.drill-barrier.goal2": "시큐리티 카드 결제와 확인이 다른 이유",
  "learn.lesson.drill-barrier.done":
    "Angemon은 Barrier를 위해 시큐리티 1개를 지불하고 배틀에서 살아남아 다음 턴에 승리했습니다.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon에는 4000 DP와 Barrier가 있습니다. 봇의 마지막 시큐리티 카드는 5000 DP Ikkakumon이므로 Angemon은 해당 배틀에서 패배합니다.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Barrier를 지불하고 Angemon의 배틀 소멸을 방지할 수 있는 시큐리티 카드 1개가 있습니다.",
  "learn.lesson.drill-barrier.step.barrier":
    "Angemon으로 상대 플레이어를 어택하세요. Barrier 확인 창에서 사용을 선택하고 내 시큐리티 맨 위 카드를 트래시해 Angemon의 소멸을 막으세요.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier는 이번 배틀에 의한 소멸을 막습니다. 코스트로 트래시한 시큐리티 카드는 체크한 것이 아니므로 Security 효과가 발휘되지 않습니다.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon은 살아남았으며 두 플레이어 모두 시큐리티가 없습니다. 턴 종료를 클릭합니다.",
  "learn.lesson.drill-barrier.step.end-turn.hint": "봇의 필드에 디지몬이 없으므로 여기에서는 패스하는 것이 안전합니다.",
  "learn.lesson.drill-barrier.step.your-turn": "다음 메인 페이즈를 기다리세요.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon은 내 턴 시작에 액티브가 됩니다.",
  "learn.lesson.drill-barrier.step.win": "Angemon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-barrier.step.win.hint": "Barrier는 이 마무리 어택에 필요한 유일한 어택 디지몬을 보존했습니다.",
  "learn.lesson.drill-training.title": "Training: 배틀에서 승리하는 진화원 구축",
  "learn.lesson.drill-training.summary":
    "Greymon을 훈련하여 다음 어택이 Blocker를 이길 수 있을 만큼 충분한 DP를 얻습니다.",
  "learn.lesson.drill-training.goal1": "Training으로 디지몬을 레스트하고 덱 맨 위 카드를 뒷면 진화원으로 추가하는 방법",
  "learn.lesson.drill-training.goal2": "추가 뒷면 진화원이 카드의 다른 효과를 강화하는 방법",
  "learn.lesson.drill-training.done":
    "Greymon은 Training으로 뒷면 진화원 1장을 얻고 어택 시 1장을 더 추가해 DP 7000으로 Blocker를 이겼습니다. 이어서 Dracomon이 승리했습니다.",
  "learn.lesson.drill-training.step.intro":
    "Greymon에는 Training 및 5000 DP가 있습니다. 봇의 Grizzlymon에는 6000 DP와 Blocker가 있습니다. Training는 Greymon이 해당 배틀에서 승리하는 데 필요한 추가 진화원을 구축할 수 있습니다.",
  "learn.lesson.drill-training.step.intro.hint":
    "Greymon의 어택 효과는 뒷면 진화원 하나당 +1000 DP를 제공합니다. 훈련된 뒷면 카드는 인쇄된 진화원 효과를 제공하지 않습니다.",
  "learn.lesson.drill-training.step.train":
    "Greymon을 클릭하고 Training을 사용하세요. Greymon을 레스트하고 덱 맨 위 카드를 뒷면으로 진화원 맨 아래에 놓습니다.",
  "learn.lesson.drill-training.step.train.hint":
    "Training은 메모리를 지불하지 않습니다. 추가한 카드는 뒷면으로 두세요. 그 카드의 이름, 색상, 효과는 참조할 수 없습니다.",
  "learn.lesson.drill-training.step.end-turn": "턴 종료를 클릭하면 Greymon이 다음 턴에 준비될 수 있습니다.",
  "learn.lesson.drill-training.step.end-turn.hint": "이 연습에서는 봇이 어택하지 않고 통과합니다.",
  "learn.lesson.drill-training.step.your-turn":
    "내 메인 페이즈를 기다리세요. Greymon은 액티브가 되고 Training으로 추가한 진화원을 유지합니다.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "Training의 진화원은 차례에 걸쳐 스택에 유지됩니다. 일시적인 DP 보너스가 아닙니다.",
  "learn.lesson.drill-training.step.battle":
    "Greymon으로 상대 플레이어를 어택하세요. When Attacking 효과를 사용해 덱 맨 위 카드를 뒷면으로 진화원에 추가하고 DP를 올리세요. 봇은 Grizzlymon으로 블록합니다.",
  "learn.lesson.drill-training.step.battle.hint":
    "뒷면 진화원 2장으로 +2000 DP를 얻어 DP 7000이 6000을 이깁니다. 이전 Training이 없었다면 1장만 있어 DP 6000이 되고 두 디지몬이 모두 패배합니다.",
  "learn.lesson.drill-training.step.win": "Blocker가 제거된 후 Dracomon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-training.step.win.hint":
    "최종 어택을 위해 Dracomon을 유지하세요. Training는 Greymon이 방어를 클리어할 수 있는 추가 진화원을 구축했습니다.",
  "learn.lesson.drill-decoy.title": "Decoy: 팀원 구출",
  "learn.lesson.drill-decoy.summary": "Machmon을 희생하여 봇의 Gaia Force로부터 BigMamemon을 보호합니다.",
  "learn.lesson.drill-decoy.goal1": "어느 디지몬 Decoy가 보호할 수 있습니까?",
  "learn.lesson.drill-decoy.goal2": "Decoy 홀더로 결제한 후 반격",
  "learn.lesson.drill-decoy.done": "Machmon은 Decoy를 지불했고, BigMamemon은 살아남았고, 저장된 디지몬이 승리했습니다.",
  "learn.lesson.drill-decoy.step.intro":
    "Machmon은 Decoy (Black)을 가지고 있습니다. 다른 내 검은색 디지몬이 상대 효과로 소멸할 때 Machmon을 대신 소멸시켜 그 소멸을 막을 수 있습니다. 봇은 Gaia Force로 BigMamemon을 선택합니다.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "규칙 16-18. Decoy는 지정한 조건에 맞는 다른 디지몬을 보호합니다. Machmon 자신을 보호하는 데 사용할 수는 없습니다.",
  "learn.lesson.drill-decoy.step.react":
    "Decoy 확인 창에서 Machmon의 보호를 사용하세요. 보호 효과를 선택하는 창이 나오면 Machmon의 Decoy를 선택하세요.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon은 지불금으로 트래시로 이동합니다. BigMamemon은 소멸되지 않고 배틀에 남아 있습니다.",
  "learn.lesson.drill-decoy.step.your-turn":
    "봇이 차례를 마칠 때까지 기다립니다. 살아남은 BigMamemon은 어택할 준비가 되어 있습니다.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "상대 Agumon은 Gaia Force의 색상 조건을 충족하는 카드일 뿐입니다. 이 스크립트 봇은 이제 통과할 것입니다.",
  "learn.lesson.drill-decoy.step.attack-player":
    "BigMamemon을 클릭하고 어택을 선택한 다음 상대의 빈 시큐리티 스택을 타겟팅하여 승리하세요.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Decoy가 보호한 것과 동일한 BigMamemon입니다.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge: 상단 카드를 흘렸습니다.",
  "learn.lesson.drill-armor-purge.summary":
    "디지몬 전체를 잃는 대신 Quetzalmon을 폐기하여 Gabumon을 계속 플레이하세요.",
  "learn.lesson.drill-armor-purge.goal1": "맨 위 카드를 트래시해 소멸을 막기",
  "learn.lesson.drill-armor-purge.goal2": "디지몬을 아래에 두고 어택하세요.",
  "learn.lesson.drill-armor-purge.done":
    "Quetzalmon이 제거되었고 Gabumon은 제거 후에도 살아남았으며 Gabumon이 승리했습니다.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon은 Armor Purge를 가지고 있고 그 아래에 Gabumon이 있습니다. Gaia Force로 소멸할 때 Armor Purge로 맨 위 Quetzalmon만 트래시해 소멸을 막을 수 있습니다.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "규칙 16-19. 이것은 갑옷 카드를 폐기합니다. 스택에 있는 두 카드를 모두 소멸하지는 않습니다.",
  "learn.lesson.drill-armor-purge.step.react":
    "봇의 Gaia Force가 Quetzalmon을 소멸시키려 하면 Armor Purge를 사용하세요.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon은 트래시로 이동합니다. 노출된 Gabumon은 현장에서 동일한 디지몬으로 유지됩니다.",
  "learn.lesson.drill-armor-purge.step.your-turn":
    "메인 페이즈를 기다리세요. Gabumon은 살아남아 어택할 수 있게 됩니다.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge가 이 소멸을 방지했습니다. 이후 효과로부터 영구적인 보호를 제공하지 않습니다.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Gabumon을 클릭하고 어택을 선택한 다음 상대의 빈 시큐리티 스택을 목표로 삼습니다.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "아래에 있는 살아남은 카드는 승리 어택을 제공합니다.",
  "learn.lesson.drill-save.title": "Save: 테이머 아래에 자원을 유지합니다.",
  "learn.lesson.drill-save.summary": "Save Shoutmon, 그런 다음 해당 카드를 재사용하여 우승 Rush 디지몬을 구축하세요.",
  "learn.lesson.drill-save.goal1": "Save로 소멸한 카드를 내 테이머 아래에 놓기",
  "learn.lesson.drill-save.goal2": "저장된 카드를 DigiXros 소재로 재사용",
  "learn.lesson.drill-save.done":
    "저장된 Shoutmon은 King Version의 진화원이 되었고 승리하는 데 필요한 Rush를 제공했습니다.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force가 Shoutmon을 소멸시킵니다. On Deletion의 Save를 사용하면 트래시 대신 Taiki 아래에 이 카드를 놓을 수 있습니다. 패의 Shoutmon (King Version)이 DigiXros 소재로 사용할 수 있습니다.",
  "learn.lesson.drill-save.step.intro.hint":
    "규칙 16-20. Save는 카드를 자원으로 남깁니다. Shoutmon의 소멸을 막는 효과는 아닙니다.",
  "learn.lesson.drill-save.step.react":
    "Shoutmon의 On Deletion 효과를 해결하고 Save를 사용하세요. 카드를 놓을 테이머를 선택해야 하면 Taiki Kudo를 선택하세요.",
  "learn.lesson.drill-save.step.react.hint":
    "Shoutmon은 이제 Taiki 아래에 있어야 하며 배틀 에어리어에 디지몬이 남아 있지 않습니다.",
  "learn.lesson.drill-save.step.your-turn":
    "내 메인 페이즈를 기다리세요. 저장한 Shoutmon을 재사용할 메모리 3이 주어집니다.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki를 레스트하면 DigiXros 소재로 내 테이머 아래의 카드도 사용할 수 있습니다.",
  "learn.lesson.drill-save.step.reuse":
    "패의 Shoutmon (King Version)을 선택하고 DigiXros를 선택하세요. 레스트할 테이머로 Taiki를 선택하고 그 아래에 저장한 Shoutmon을 소재로 선택한 뒤 확정하세요.",
  "learn.lesson.drill-save.step.reuse.hint":
    "소재 1장으로 등장 코스트가 5에서 3으로 줄어듭니다. Shoutmon의 진화원 효과가 이름에 Shoutmon을 포함한 이 디지몬에 Rush를 줍니다.",
  "learn.lesson.drill-save.step.attack-player": "Shoutmon (King Version)로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-save.step.attack-player.hint":
    "저장된 진화원이 없으면 새로 다시 등장한 이 디지몬은 지금 어택하는 데 필요한 진화원 Rush를 갖지 못할 것입니다.",
  "learn.lesson.drill-material-save.title": "Material Save: 진화원 구출",
  "learn.lesson.drill-material-save.summary":
    "Save DigiXros 재료를 모두 사용한 다음 Rush 어택에서 승리하기 위해 MetalGreymon을 재구성합니다.",
  "learn.lesson.drill-material-save.goal1": "소멸된 스택에서 지정된 재료를 구출합니다.",
  "learn.lesson.drill-material-save.goal2": "복구된 두 카드를 모두 재사용하여 코스트을 절감합니다.",
  "learn.lesson.drill-material-save.done":
    "구조된 두 재료 모두 3 메모리용 MetalGreymon을 재구성했으며 Rush 어택이 승리했습니다.",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon의 진화원에는 Greymon과 MailBirdramon이 있습니다. Gaia Force로 소멸할 때 Material Save 2를 사용하면 지정된 두 DigiXros 소재를 Kiriha 아래에 놓을 수 있습니다.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "규칙 16-21. 이렇게 하면 소멸된 MetalGreymon 자체가 아닌 적격 진화원이 저장됩니다.",
  "learn.lesson.drill-material-save.step.react":
    "Material Save 2를 사용하세요. Greymon과 MailBirdramon을 모두 선택하고 Kiriha Aonuma 아래에 놓으세요.",
  "learn.lesson.drill-material-save.step.react.hint":
    "두 가지 적격 진화원을 모두 사용합니다. MetalGreymon은 트래시로 이동하고 해당 재료는 Kiriha 아래에 유지됩니다.",
  "learn.lesson.drill-material-save.step.your-turn":
    "메인 페이즈를 기다리세요. 교체용 MetalGreymon과 3개의 메모리를 보유하고 있습니다.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha는 레스트를 사용하여 DigiXros 동안 테이머 아래에서 재료를 허용할 수 있습니다.",
  "learn.lesson.drill-material-save.step.reuse":
    "패의 MetalGreymon을 선택하고 DigiXros를 선택하세요. 레스트할 테이머로 Kiriha를 선택하고 그 아래에 저장한 두 소재를 선택한 뒤 확정하세요. On Play의 선택도 해결하세요.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "소재 2장으로 등장 코스트가 7에서 3으로 줄어듭니다. On Play로 Rush를 얻으므로 등장한 턴에 바로 어택할 수 있습니다.",
  "learn.lesson.drill-material-save.step.attack-player":
    "재건된 MetalGreymon으로 상대의 빈 시큐리티 스택을 어택하세요.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "내가 구출한 카드 두 장으로 인해 이 가격이 저렴해졌습니다. Rush를 사용하면 이 새로운 디지몬이 게임을 마무리할 수 있습니다.",
  "learn.lesson.drill-evade.title": "Evade: 레스트 살아남으려면",
  "learn.lesson.drill-evade.summary":
    "Gaia Force에 대해 Evade를 사용한 다음 액티브를 사용하고 자신의 차례에 승리합니다.",
  "learn.lesson.drill-evade.goal1": "위협받는 디지몬을 레스트로 지불합니다.",
  "learn.lesson.drill-evade.goal2": "상대 제거를 통해 어택 디지몬을 유지하세요.",
  "learn.lesson.drill-evade.done": "Syakomon은 레스트해 소멸을 피한 뒤, 내 턴에 액티브가 되어 승리했습니다.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon은 Evade를 가지고 있습니다. Gaia Force로 소멸하려 할 때 Syakomon을 레스트해 그 소멸을 막을 수 있습니다. 이 코스트를 내려면 레스트할 수 있어야 합니다.",
  "learn.lesson.drill-evade.step.intro.hint": "규칙 16-22. Syakomon은 현재 액티브이며 유일한 어택 디지몬입니다.",
  "learn.lesson.drill-evade.step.react":
    "Evade 확인 창에서 사용을 선택하세요. Syakomon이 레스트하고 Gaia Force에 의한 소멸을 피합니다.",
  "learn.lesson.drill-evade.step.react.hint":
    "이미 레스트인 디지몬은 다시 레스트해 지불할 수 없습니다. Evade는 이번 소멸만 막으며 효과 내성을 주지는 않습니다.",
  "learn.lesson.drill-evade.step.your-turn": "봇이 통과할 때까지 기다립니다. 다음 액티브 단계 동안 Syakomon 액티브.",
  "learn.lesson.drill-evade.step.your-turn.hint":
    "Gaia Force는 이제 상대 트래시에 있고 Syakomon은 여전히 필드에 있습니다.",
  "learn.lesson.drill-evade.step.attack-player":
    "Syakomon을 클릭하고 어택을 선택한 다음 상대의 빈 시큐리티 스택을 목표로 삼습니다.",
  "learn.lesson.drill-evade.step.attack-player.hint": "소멸을 회피한 디지몬이 승리하는 어택 디지몬입니다.",
  "learn.lesson.drill-fortitude.title": "Fortitude: 소멸 후 반환",
  "learn.lesson.drill-fortitude.summary": "Gaia Force 이후 Aquilamon을 다시 플레이하고 새로운 생명으로 승리하세요.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude에는 소멸 시 진화원이 필요합니다.",
  "learn.lesson.drill-fortitude.goal2": "다시 등장한 디지몬은 새로운 디지몬입니다.",
  "learn.lesson.drill-fortitude.done": "Aquilamon이 진화원 없이 반환되어 다음 턴에 승리했습니다.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon은 Fortitude를 가지고 있고 Kunemon을 진화원으로 가지고 있습니다. 진화원이 있는 채로 소멸하면 Fortitude로 코스트를 지불하지 않고 다시 등장합니다.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "규칙 16-27. 소멸을 막는 효과가 아닙니다. 다시 등장한 Aquilamon은 새 디지몬이며, 이전 진화원은 트래시에 남습니다.",
  "learn.lesson.drill-fortitude.step.react":
    "Gaia Force로 Aquilamon이 소멸하게 두세요. Fortitude를 해결하고, 효과 순서 창에서 요청하면 필수 효과를 확인하세요.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon은 진화원 없이 새 디지몬으로 다시 등장합니다. Kunemon은 트래시에 남습니다.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "내 턴을 기다리세요. Aquilamon은 봇의 턴에 다시 등장했으므로 내 턴에는 어택할 수 있습니다.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "진화원이 없으면 나중에 소멸해도 이 Fortitude가 다시 트리거되지 않습니다.",
  "learn.lesson.drill-fortitude.step.attack-player": "리플레이된 Aquilamon으로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-fortitude.step.attack-player.hint": "원래 지속물이 아닌 Fortitude 카드를 가져와서 승리했습니다.",
  "learn.lesson.drill-partition.title": "Partition: 두 개의 디지몬으로 분할",
  "learn.lesson.drill-partition.summary": "상대 소멸을 두 개의 플레이 가능한 레벨 4 디지몬으로 바꿉니다.",
  "learn.lesson.drill-partition.goal1": "지정된 진화원이 모두 필요합니다.",
  "learn.lesson.drill-partition.goal2": "상단 카드가 떠나기 전에 두 부분을 모두 등장합니다.",
  "learn.lesson.drill-partition.done": "Paildramon이 Ikkakumon과 Togemon으로 분할되어 Ikkakumon이 승리했습니다.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon에는 Partition(파란색 Lv.4 및 녹색 Lv.4)가 있습니다. Ikkakumon 및 Togemon은 이러한 요구 사항을 충족합니다. Gaia Force는 Paildramon을 제거하려고 시도합니다.",
  "learn.lesson.drill-partition.step.intro.hint":
    "규칙 16-29. Partition은 배틀 제거나 자신의 효과가 아닌 상대 효과에 작동합니다.",
  "learn.lesson.drill-partition.step.react":
    "Partition을 사용하세요. 파란색 Ikkakumon과 초록색 Togemon을 선택하고 두 장 모두 코스트 없이 등장시키세요.",
  "learn.lesson.drill-partition.step.react.hint":
    "지정된 각 종류에서 1장씩 모두 등장시켜야 합니다. Paildramon은 그대로 배틀 에어리어를 떠납니다. Partition은 그 소멸을 막지 않습니다.",
  "learn.lesson.drill-partition.step.your-turn":
    "메인 페이즈를 기다리세요. 이제 두 진화원 카드 모두 별도의 디지몬입니다.",
  "learn.lesson.drill-partition.step.your-turn.hint": "상대 턴에 들어와서 자신의 턴이 되면 어택할 수도 있습니다.",
  "learn.lesson.drill-partition.step.attack-player": "Ikkakumon으로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Togemon을 검사할 수도 있습니다. 지정된 두 진화원이 모두 동일한 Partition에서 등장되었습니다.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat: 팀원을 희생합니다",
  "learn.lesson.drill-scapegoat.summary": "Agumon을 소멸하여 봇의 Gaia Force를 통해 Bastemon을 유지합니다.",
  "learn.lesson.drill-scapegoat.goal1": "결제 수단으로 다른 디지몬을 선택하세요.",
  "learn.lesson.drill-scapegoat.goal2": "위협받는 디지몬 소멸 방지",
  "learn.lesson.drill-scapegoat.done": "Agumon이 Scapegoat를 지불하고 살아남은 Bastemon이 승리했습니다.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon은 Scapegoat를 가지고 있습니다. 자신의 효과 이외의 이유로 소멸하려 하면 다른 내 디지몬을 소멸시켜 그 소멸을 막을 수 있습니다. 코스트로 사용할 Agumon이 있습니다.",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "규칙 16-32. Bastemon을 희생하지 않고 다른 디지몬을 희생하여 Bastemon을 저장하고 있습니다.",
  "learn.lesson.drill-scapegoat.step.react":
    "Scapegoat를 사용하고 코스트로 소멸시킬 다른 내 디지몬으로 Agumon을 선택하세요.",
  "learn.lesson.drill-scapegoat.step.react.hint":
    "Agumon은 트래시로 이동하고 Bastemon은 유지됩니다. 보호를 거부하지 마십시오.",
  "learn.lesson.drill-scapegoat.step.your-turn": "봇이 Gaia Force를 완료하고 통과한 후 차례를 기다립니다.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon은 동일한 디지몬으로 유지되며 어택할 수 있습니다.",
  "learn.lesson.drill-scapegoat.step.attack-player": "Bastemon으로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "희생으로 인해 더 강한 디지몬이 승리할 수 있게 되었습니다.",
  "learn.lesson.drill-decode.title": "Decode: 떠나기 전에 진화원을 등장하세요",
  "learn.lesson.drill-decode.summary": "Save Sistermon Blanc는 각성된 형태가 바운드될 때 스택에서 제거됩니다.",
  "learn.lesson.drill-decode.goal1": "Decode는 배틀이 아닌 출발에도 대응할 수 있습니다.",
  "learn.lesson.drill-decode.goal2": "지불하지 않고 지정된 진화원을 등장합니다.",
  "learn.lesson.drill-decode.done": "Sistermon Blanc가 Decode를 통해 스택을 떠나 승리 어택을 했습니다.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened)에는 Decode(Sistermon Blanc)가 있고 그 아래에 정확한 이름의 카드가 있습니다. 봇의 Cocytus Breath는 각성된 카드를 패로 되돌려줍니다.",
  "learn.lesson.drill-decode.step.intro.hint":
    "규칙 16-36. Decode는 배틀 제거가 아니기 때문에 이번 복귀에 대응할 수 있습니다.",
  "learn.lesson.drill-decode.step.react":
    "Decode를 사용하고 진화원의 Sistermon Blanc을 선택하세요. 등장 후 요청되면 On Play의 Draw 1도 해결하세요.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc은 별도의 디지몬으로 등장합니다. 각성 형태의 카드는 그대로 패로 돌아갑니다. Decode는 원래 카드가 떠나는 것을 막지 않습니다.",
  "learn.lesson.drill-decode.step.your-turn":
    "메인 페이즈를 기다리세요. 디코딩된 Sistermon Blanc는 이제 유일한 디지몬입니다.",
  "learn.lesson.drill-decode.step.your-turn.hint": "봇의 턴에 플레이되었기 때문에 내 턴에 어택할 수도 있습니다.",
  "learn.lesson.drill-decode.step.attack-player": "Sistermon Blanc로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Decode가 없었다면 진화원은 출발 스택과 함께 폐기되었을 것입니다.",
  "learn.lesson.drill-fragment.title": "Fragment: 진화원으로 지불하기",
  "learn.lesson.drill-fragment.summary": "진화원 2장을 트래시해 Giromon이 Gaia Force에 소멸하지 않도록 지키세요.",
  "learn.lesson.drill-fragment.goal1": "Fragment에는 명시된 전체 진화원 수가 필요합니다.",
  "learn.lesson.drill-fragment.goal2": "정확히 두 장의 카드를 지불하여 소멸 방지",
  "learn.lesson.drill-fragment.done": "Giromon은 두 진화원 모두에서 Fragment 2를 지불하고 살아남아 승리했습니다.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon에는 Fragment(2)가 있고 그 아래에 Jazamon 및 Jazardmon이 있습니다. Gaia Force가 이를 소멸하면 Fragment는 해당 진화원 중 두 개를 트래시하여 해당 소멸을 방지할 수 있습니다.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "규칙 16-37. 한 진화원에 코스트을 지불하는 것만으로는 충분하지 않습니다. Giromon에는 정확히 필요한 두 가지가 있습니다.",
  "learn.lesson.drill-fragment.step.react":
    "Fragment를 사용하고 트래시할 진화원으로 Jazamon과 Jazardmon 두 장을 모두 선택하세요.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon은 진화원 없이 필드에 남습니다. 선택한 두 카드는 트래시로 갑니다.",
  "learn.lesson.drill-fragment.step.your-turn": "봇이 통과한 후 메인 페이즈를 기다리세요.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon은 이 소멸에서 살아남았지만 Fragment에 다시 지불할 진화원이 남아 있지 않습니다.",
  "learn.lesson.drill-fragment.step.attack-player": "Giromon으로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-fragment.step.attack-player.hint": "Fragment를 지불한 동일한 Giromon이 승리 어택을 제공합니다.",
  "learn.lesson.drill-guard.title": "Guard: 반품 방지",
  "learn.lesson.drill-guard.summary": "Gladimon을 희생하여 Cocytus Breath가 BigMamemon을 패로 되돌릴 수 없도록 합니다.",
  "learn.lesson.drill-guard.goal1": "Guard는 다른 디지몬이 제거되지 않도록 보호합니다.",
  "learn.lesson.drill-guard.goal2": "패로 돌아가는 것도 방지할 수 있습니다",
  "learn.lesson.drill-guard.done": "Gladimon은 Guard에게 돈을 지불해 복귀를 막았고, BigMamemon은 계속 승리했습니다.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon은 Guard를 가지고 있습니다. 다른 내 디지몬이 상대 효과로 배틀 에어리어를 떠나려 할 때 Gladimon을 소멸시켜 그 이탈을 막을 수 있습니다. 봇은 Cocytus Breath로 BigMamemon을 선택합니다.",
  "learn.lesson.drill-guard.step.intro.hint":
    "규칙 16-45. 소멸로 제한된 보호와 달리 Guard는 이러한 반환을 중지할 수도 있습니다.",
  "learn.lesson.drill-guard.step.react":
    "보호 효과가 제시되면 Gladimon의 Guard를 사용하세요. 반응 순서를 선택해야 하면 Guard를 선택하세요.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon을 소멸시켜 코스트를 지불합니다. BigMamemon은 패로 돌아가지 않고 배틀 에어리어에 남습니다.",
  "learn.lesson.drill-guard.step.your-turn":
    "봇이 지나간 후 차례를 기다리세요. 소멸 시 Gladimon 프롬프트가 나타나면 해결합니다.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "봇의 Gabumon은 이미 레벨 3이며 진화원도 없습니다. Gladimon으로 그 맨 위 카드를 트래시할 수 없습니다.",
  "learn.lesson.drill-guard.step.attack-player": "BigMamemon으로 상대의 빈 시큐리티 스택을 어택합니다.",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard는 필드에 남은 유일한 어택 디지몬을 유지했습니다.",
  "learn.lesson.drill-digisorption.title": "Digisorption: 레스트 메모리 절약",
  "learn.lesson.drill-digisorption.summary":
    "레스트 Kunemon으로 메모리 1개에 대해 진화 Pistmon을 사용한 다음 Pistmon으로 어택합니다.",
  "learn.lesson.drill-digisorption.goal1": "Digisorption에서 요구하는 레스트 코스트을 지불합니다.",
  "learn.lesson.drill-digisorption.goal2": "진화하는 디지몬을 어택 준비 상태로 유지하세요.",
  "learn.lesson.drill-digisorption.done": "Digisorption 코스트을 지불하고 액티브 Pistmon으로 승리했습니다.",
  "learn.lesson.drill-digisorption.step.intro":
    "내 메모리는 1입니다. Pistmon의 보통 진화 코스트는 3이지만 Digisorption -2로 다른 내 디지몬을 레스트하면 1로 줄어들어 내 턴을 유지할 수 있습니다.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Lighdramon 대신 Kunemon을 레스트하면 진화한 디지몬을 액티브 상태로 유지할 수 있습니다.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Lighdramon 위에 패의 Pistmon을 진화시키세요. Digisorption을 사용하고 레스트할 디지몬으로 Kunemon을 선택하세요.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "남은 메모리 1을 지불해 0으로 만들고 Pistmon은 액티브로 유지하세요. 감소 없이 3을 지불하면 보통 어택 전에 상대 쪽으로 메모리가 넘어갑니다.",
  "learn.lesson.drill-digisorption.step.attack-player": "Pistmon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "상대에게는 시큐리티가 없으며 Pistmon은 이미 Lighdramon으로 플레이 중이었습니다.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst: 진화원을 사용하세요",
  "learn.lesson.drill-digi-burst.summary": "진화원 2장을 트래시해 어택 전에 상대 Blocker를 레스트하세요.",
  "learn.lesson.drill-digi-burst.goal1": "메인 Digi-Burst 효과 활성화",
  "learn.lesson.drill-digi-burst.goal2": "정확히 2개의 진화 카드로 결제하세요.",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon은 두 가지 진화원을 소비하고 Blocker를 비활성화하고 승리하는 어택을 개시했습니다.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon은 Main의 Digi-Burst 2를 가지고 있습니다. 진화원 2장을 트래시하면 상대 디지몬 1마리를 레스트할 수 있습니다.",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromon은 액티브 동안 블록할 수 있습니다. 먼저 레스트를 만드세요.",
  "learn.lesson.drill-digi-burst.step.burst":
    "HerculesKabuterimon을 선택하고 Digi-Burst 효과를 사용하세요. 트래시할 진화원으로 Kunemon과 Kabuterimon을 선택한 뒤, 레스트할 상대 디지몬으로 Monochromon을 선택하세요.",
  "learn.lesson.drill-digi-burst.step.burst.hint": "상위 HerculesKabuterimon은 쓸 수 있는 진화원이 아닙니다.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "HerculesKabuterimon으로 플레이어를 어택하여 마지막 시큐리티 카드를 확인합니다.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "레스트 Monochromon은 블록할 수 없습니다.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint":
    "마지막 시큐리티 카드를 제거해도 저절로 승리하지 못했습니다.",
  "learn.lesson.drill-delay.title": "Delay: 준비된 옵션에 현금 포함",
  "learn.lesson.drill-delay.summary":
    "Rush 어택에서 승리하는 데 필요한 메모리를 얻으려면 Reinforcing Memory Boost!를 사용하세요.",
  "learn.lesson.drill-delay.goal1": "배치 턴 후 Delay 활성화",
  "learn.lesson.drill-delay.goal2": "저장된 옵션을 3개의 메모리로 변환",
  "learn.lesson.drill-delay.done": "Delay가 BushiAgumon을 지불하고 Rush로 승리했습니다.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost!는 이전 턴에 배틀 에어리어에 배치되었습니다. 이제 Delay가 준비되었습니다. 내 메모리는 2개뿐입니다.",
  "learn.lesson.drill-delay.step.intro.hint": "카드가 놓인 같은 턴에는 Delay를 사용할 수 없습니다.",
  "learn.lesson.drill-delay.step.delay":
    "Reinforcing Memory Boost!를 선택하고 Delay를 사용하세요. 이 카드를 트래시하고 메모리 3을 얻습니다.",
  "learn.lesson.drill-delay.step.delay.hint": "메모리가 2에서 5로 올라갑니다.",
  "learn.lesson.drill-delay.step.play-rush": "패의 BushiAgumon을 메모리 5를 지불하고 등장시키세요.",
  "learn.lesson.drill-delay.step.play-rush.hint":
    "Delay로 얻은 메모리 덕분에 코스트를 지불한 뒤에도 메모리가 0이라 내 턴이 유지됩니다.",
  "learn.lesson.drill-delay.step.attack-player": "BushiAgumon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-delay.step.attack-player.hint":
    "Rush 덕분에 이번 턴에 등장한 BushiAgumon이 바로 어택할 수 있습니다.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve: 어택 중 진화",
  "learn.lesson.drill-blast-digivolve.summary": "WarGreymon으로 봇 어택에 대응하고 블록한 후 다음 턴에 승리합니다.",
  "learn.lesson.drill-blast-digivolve.goal1": "무료로 진화에 카운터 타이밍을 사용합니다.",
  "learn.lesson.drill-blast-digivolve.goal2": "블록 타이밍 이전에 Blocker를 얻습니다.",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve는 WarGreymon을 제때에 만들어 치명적인 어택을 막고 나중에 승리했습니다.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "내 시큐리티는 0장이며 봇이 어택할 예정입니다. MetalGreymon에는 Blocker가 없지만, 패의 WarGreymon으로 Blast Digivolve하면 블록할 수 있습니다.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "카운터 타이밍이 블록 타이밍보다 먼저 발생합니다.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "Counter 창에서 패의 WarGreymon을 선택하고 MetalGreymon 위에 Blast Digivolve를 사용하세요.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "합법적인 진화는 메모리 코스트가 없으며 여전히 카드를 뽑습니다.",
  "learn.lesson.drill-blast-digivolve.step.block": "새로 진화한 WarGreymon으로 어택 중인 Ikkakumon을 블록하세요.",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon은 DP가 5000인 Ikkakumon에 비해 DP가 11000입니다.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "살아남았습니다. 봇이 턴을 끝내면 내 턴 시작에 디지몬이 액티브가 됩니다. 내 턴을 기다리세요.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "카운터가 자신의 차례를 시작하지 않았습니다.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "WarGreymon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "봇에 시큐리티 또는 Blocker가 남아 있지 않습니다.",
  "learn.lesson.drill-mind-link.title": "Mind Link: 테이머를 진화원으로 변환",
  "learn.lesson.drill-mind-link.summary":
    "Mind Link Eiji를 Loogarmon으로 변환하고 부여된 Alliance를 사용한 후 게임을 종료합니다.",
  "learn.lesson.drill-mind-link.goal1": "진화 카드에 일치하는 테이머를 배치합니다.",
  "learn.lesson.drill-mind-link.goal2": "Mind Link를 통해 얻은 계승 효과를 사용합니다.",
  "learn.lesson.drill-mind-link.done":
    "Eiji가 진화원이 되어 Alliance를 주었고 Loogarmon이 시큐리티 2장을 모두 체크했습니다.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi는 테이머 진화원이 없는 Dark Animal 또는 SoC 디지몬을 사용하여 Mind Link를 수행할 수 있습니다. Loogarmon은 자격이 있습니다.",
  "learn.lesson.drill-mind-link.step.intro.hint": "Eiji는 연결되면 진화원 상자에서 Alliance 및 Blocker를 부여합니다.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Eiji를 선택하고 Main의 Mind Link 효과를 사용하세요. 카드를 놓을 디지몬으로 Loogarmon을 선택하세요.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji가 Loogarmon 아래로 이동합니다. 더 이상 배틀에서 별도의 테이머가 아닙니다.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Loogarmon으로 상대 플레이어를 어택하세요. 어택 효과는 어느 순서로 해결해도 됩니다. Alliance는 사용하고 Birdramon을 레스트하세요. Loogarmon의 선택적 패 코스트 효과는 거절하거나 패 1장을 트래시해 해결할 수 있습니다. 두 효과를 모두 처리한 뒤 시큐리티 2장을 체크하세요.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Alliance에는 Birdramon을 선택하고 최종 어택에는 Dracomon 액티브를 유지합니다.",
  "learn.lesson.drill-mind-link.step.attack-player": "Dracomon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "Birdramon이 Alliance에 대해 지불했기 때문에 Dracomon은 아직 준비되어 있습니다.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve: 필드와 패 결합",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "디지몬 필드와 패 재료를 사용하여 카운터 타이밍에서 RagnaLoardmon을 생성합니다.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "카운터 중에 지정된 DNA 재료를 모두 공급합니다.",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "어택이 계속되기 전에 DNA 전용 제거 문제를 해결합니다.",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon은 두 재료를 무료로 결합하여 어택 디지몬을 제거하고 다음 턴에 승리했습니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "내 시큐리티가 0장인 상태에서 봇이 어택합니다. Durandamon은 배틀 에어리어에 있고 BryweLudramon과 RagnaLoardmon은 패에 있습니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve에는 배틀 에어리어의 지정 디지몬과 패의 지정 카드가 모두 필요합니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "Counter 창에서 RagnaLoardmon을 사용하세요. 배틀 에어리어의 Durandamon과 패의 BryweLudramon을 골라 Blast DNA Digivolve하세요. 효과를 해결하고 어택 중인 Plesiomon을 소멸 대상으로 선택하세요.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "진화 효과가 상대의 마지막 시큐리티를 트래시합니다. DNA 진화 시의 효과가 Plesiomon을 소멸시켜 내게 어택이 닿기 전에 제거합니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "봇이 통과할 때까지 기다립니다. 새로운 RagnaLoardmon이 여러분의 차례를 맞이할 준비가 되어 있습니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA는 새로운 디지몬을 생성하고 해당 진화원에서 두 가지 재료를 결합합니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "RagnaLoardmon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "카운터 도중 어택 디지몬이 소멸되었기 때문에 시큐리티 없이 살아남았습니다.",
  "learn.lesson.drill-link.title": "Link +: 추가 링크 유지",
  "learn.lesson.drill-link.summary": "첫 번째 링크를 교체하지 않고 Deusmon에 두 번째 링크를 제공합니다.",
  "learn.lesson.drill-link.goal1": "링크 코스트을 지불하여 패 카드를 링크합니다.",
  "learn.lesson.drill-link.goal2": "Link +1를 사용하여 두 개의 링크 카드 유지",
  "learn.lesson.drill-link.done":
    "Deusmon은 Navimon 링크를 모두 유지하고 시큐리티를 확인했으며 Birdramon이 승리하는 어택을 남겼습니다.",
  "learn.lesson.drill-link.step.intro":
    "디지몬은 일반적으로 링크 카드를 1개만 유지합니다. Deusmon에는 Link +1가 있으므로 제한은 2입니다. 이미 Navimon이 연결되어 있습니다.",
  "learn.lesson.drill-link.step.intro.hint": "링크 카드는 옆에 놓으며 진화원이 아닙니다.",
  "learn.lesson.drill-link.step.link":
    "패의 Navimon에서 Link를 선택하고 Deusmon을 대상으로 고르세요. 링크 코스트로 메모리 1을 지불하세요.",
  "learn.lesson.drill-link.step.link.hint":
    "Deusmon에 2개를 위한 공간이 있으므로 두 Navimon 카드는 모두 연결된 상태로 유지됩니다.",
  "learn.lesson.drill-link.step.attack-security": "Deusmon으로 플레이어를 어택하여 마지막 시큐리티 카드를 확인합니다.",
  "learn.lesson.drill-link.step.attack-security.hint":
    "링크 DP 보너스는 두 링크가 모두 연결되어 있는 동안 활성 상태로 유지됩니다.",
  "learn.lesson.drill-link.step.attack-player": "Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-link.step.attack-player.hint": "최종 어택은 시큐리티 확인과 별개입니다.",
  "learn.lesson.drill-use-req.title": "Use Req.: 색상 대신 특성을 충족",
  "learn.lesson.drill-use-req.summary": "현장에서 노란색만 공급하는 경우 흰색 e-Pulse를 사용하세요.",
  "learn.lesson.drill-use-req.goal1": "지정된 Use Req. 조건을 읽습니다.",
  "learn.lesson.drill-use-req.goal2": "색상 요구사항만 무시하고 옵션 코스트 지불",
  "learn.lesson.drill-use-req.done":
    "Liollmon은 Use Req.를 이행했고, e-Pulse는 다른 디지몬을 모집했으며 원래 Liollmon이 승리했습니다.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse는 흰색인데 배틀에는 노란색 Liollmon만 있습니다. Use Req.는 현장에서 BEATBREAK 카드를 수용합니다.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon에는 BEATBREAK가 있으므로 흰색 요구 사항을 무시할 수 있습니다.",
  "learn.lesson.drill-use-req.step.use-option":
    "패의 e-Pulse를 메모리 3으로 사용하세요. 효과를 사용하고 패의 다른 Liollmon을 코스트 없이 등장시키세요.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req.는 색상 조건만 무시합니다. 사용 코스트인 메모리 3은 지불해야 합니다. 해결 후 e-Pulse는 배틀 에어리어에 남습니다.",
  "learn.lesson.drill-use-req.step.attack-player":
    "이미 배틀에 참여하고 있는 Liollmon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "새로 등장한 Liollmon은 이번 턴에 어택할 수 없습니다. 원본을 선택하세요.",
  "learn.lesson.drill-ascension.title": "Ascension: 소멸을 시큐리티로 바꿉니다.",
  "learn.lesson.drill-ascension.summary":
    "ScourgeChiropmon을 시큐리티로 변경하면 봇에서 살아남아 나중에 승리할 수 있습니다.",
  "learn.lesson.drill-ascension.goal1": "실제 배틀 소멸 후 Ascension 해결",
  "learn.lesson.drill-ascension.goal2": "추가된 시큐리티를 사용하여 턴에서 살아남으세요.",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon이 시큐리티로 승천하여 봇 어택을 흡수하고 Birdramon이 승리하도록 했습니다.",
  "learn.lesson.drill-ascension.step.intro":
    "시큐리티가 0개 있습니다. Birdramon이 이번 턴에 플레이되었으며 기다려야 합니다. ScourgeChiropmon에는 Ascension 효과가 있으며 소멸 후 시큐리티가 될 수 있습니다.",
  "learn.lesson.drill-ascension.step.intro.hint":
    "봇은 자신의 차례에 어택하므로 통과하기 전에 시큐리티 카드가 필요합니다.",
  "learn.lesson.drill-ascension.step.ascend":
    "ScourgeChiropmon으로 레스트 상태의 Plesiomon을 어택하세요. 배틀에서 지면 Ascension을 사용해 ScourgeChiropmon을 내 시큐리티 맨 위에 놓으세요.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon은 DP 8000이고 Plesiomon은 DP 12000입니다. 다른 소멸 시 효과의 코스트로 사용할 테이머는 없습니다.",
  "learn.lesson.drill-ascension.step.end-turn": "새 시큐리티 카드가 준비되었습니다. 차례를 종료하세요.",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramon은 플레이된 턴에 여전히 어택할 수 없습니다.",
  "learn.lesson.drill-ascension.step.your-turn": "봇이 새로운 시큐리티 카드를 어택하도록 한 다음 차례를 기다립니다.",
  "learn.lesson.drill-ascension.step.your-turn.hint":
    "Ascension 효과가 없었다면 그 어택은 0 시큐리티에서 나를 이겼을 것입니다.",
  "learn.lesson.drill-ascension.step.attack-player": "Birdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-ascension.step.attack-player.hint":
    "Birdramon은 이제 어택할 수 있으며 봇에는 시큐리티가 없습니다.",
  "learn.lesson.drill-detach.title": "Detach: 플레이를 유지하려면 링크를 사용하세요.",
  "learn.lesson.drill-detach.summary": "일치하는 Seven Code 링크를 분리하여 Cocytus Breath를 방지합니다.",
  "learn.lesson.drill-detach.goal1": "상대 효과로 인해 디지몬이 제거될 때 Detach를 사용하세요.",
  "learn.lesson.drill-detach.goal2": "진화원이 아닌 일치하는 링크로 결제",
  "learn.lesson.drill-detach.done": "Weatherdramon은 링크를 잃었지만 배틀에 계속 참여하여 자신의 차례에 승리했습니다.",
  "learn.lesson.drill-detach.step.intro":
    "봇이 Cocytus Breath를 사용하여 Weatherdramon을 패로 되돌리려고 합니다. Weatherdramon에는 Seven Code 링크용 Detach가 있습니다.",
  "learn.lesson.drill-detach.step.intro.hint": "Roleplaymon 링크에는 필수 Seven Code 특성이 있습니다.",
  "learn.lesson.drill-detach.step.detach":
    "이탈 방지 효과가 제시되면 Detach를 사용하고 링크한 Roleplaymon을 트래시하세요. Weatherdramon은 배틀 에어리어에 남습니다.",
  "learn.lesson.drill-detach.step.detach.hint":
    "링크는 트래시로 이동합니다. Weatherdramon은 링크 DP를 잃었으나 패로 돌아오지 않습니다.",
  "learn.lesson.drill-detach.step.your-turn": "봇이 옵션을 사용했습니다. 봇이 턴을 끝낼 때까지 기다리세요.",
  "learn.lesson.drill-detach.step.your-turn.hint":
    "Detach는 원래 이탈을 막는 효과입니다. Weatherdramon을 다시 등장시키는 것이 아닙니다.",
  "learn.lesson.drill-detach.step.attack-player": "Weatherdramon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "Weatherdramon이 필드에 그대로 남았으므로 내 턴에 어택할 수 있습니다.",
  "learn.lesson.drill-succession.title": "Succession: 진화원 카드 일반 효과 사용",
  "learn.lesson.drill-succession.summary":
    "Palmon 어택 중에 Blocker를 제거하려면 Succession을 통해 Ceresmon 일반 진화원 텍스트를 사용합니다.",
  "learn.lesson.drill-succession.goal1": "Succession에서 선택한 최상위 일치 진화원을 읽습니다.",
  "learn.lesson.drill-succession.goal2": "진화원 상자가 아닌 복사된 일반 효과를 해결합니다.",
  "learn.lesson.drill-succession.done":
    "Succession으로 Ceresmon의 일반 레스트 반응 효과를 얻어 Monmon을 소멸시켰습니다. Palmon이 시큐리티를 체크하고 Dracomon이 승리했습니다.",
  "learn.lesson.drill-succession.step.intro":
    "맨 위 Ceresmon은 Succession (Ceresmon)을 가지고 있습니다. 아래 Ceresmon 카드에는 디지몬이 레스트할 때 레스트한 수마다 상대 디지몬 1마리에 -3000 DP를 주는 일반 All Turns 효과가 있습니다. Succession은 그 일반 효과를 얻습니다.",
  "learn.lesson.drill-succession.step.intro.hint":
    "이 텍스트는 진화원 상자가 아닌 진화원의 일반 효과 상자에 있습니다. Monmon에는 DP가 1000밖에 없습니다. Palmon의 2000 DP는 1000 DP 시큐리티 디지몬도 능가합니다.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Palmon으로 상대 플레이어를 어택하세요. Palmon의 레스트로 Ceresmon이 Succession을 통해 얻은 효과가 유발됩니다. Monmon에 -3000 DP를 주면 블록 전에 소멸합니다. 이어서 Palmon이 마지막 시큐리티를 체크하고 살아남습니다.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "블록 타이밍으로 이동하기 전에 복사된 Ceresmon 반응을 해결합니다.",
  "learn.lesson.drill-succession.step.attack-player":
    "Palmon이 시큐리티 확인을 마친 후 Dracomon으로 플레이어를 어택하여 승리합니다.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "마지막 시큐리티 검사는 저절로 승리하지 못했습니다. Dracomon은 별도의 승리 어택을 합니다.",
  "learn.lesson.practice-game-preparation.title": "오프닝 패부터 승리하는 배틀까지",
  "learn.lesson.practice-game-preparation.summary":
    "합법적인 덱, 5장의 카드 패, 5장의 시큐리티 카드로 메모리가 없는 상태에서 시작한 다음 어택 디지몬을 키워 승리하세요.",
  "learn.lesson.practice-game-preparation.goal1":
    "초기 패, 시큐리티 스택, 디지타마 덱 및 첫 번째 턴 드로우 예외를 인식합니다.",
  "learn.lesson.practice-game-preparation.goal2":
    "최종 직접 어택 전에 디지몬을 올리고 여러 턴을 사용하여 5개의 시큐리티 카드를 제거합니다.",
  "learn.lesson.practice-game-preparation.done":
    "레이즈, 진화, 메모리 패오버 및 최종 어택을 통해 정상적으로 준비된 오프닝 포지션에서 플레이했습니다.",
  "learn.lesson.practice-game-preparation.step.intro":
    "메인 덱 50장, 각자의 패 5장, 시큐리티 5장, 메모리 0으로 시작합니다. 선공인 내 첫 드로우 페이즈에는 드로우를 하지 않습니다. 봇은 턴을 넘기므로 전체 과정을 연습할 수 있습니다.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "패 5장과 시큐리티 5장을 준비한 뒤 각 메인 덱에는 40장이 남습니다. 디지타마 덱은 별도입니다.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "디지타마 덱의 Koromon을 비어 있는 육성 에어리어에 부화시키세요.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "부화에는 메모리가 들지 않으며 드로우도 하지 않습니다. 이번 턴의 보통 육성 페이즈 행동은 부화로 끝납니다.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "육성 에어리어의 Koromon 위에 패의 Agumon ST1-03을 진화시키세요. 코스트는 0이며 카드 1장을 드로우합니다.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "패에 있는 Agumon ST1-03를 사용하고 Koromon을 베이스로 선택합니다.",
  "learn.lesson.practice-game-preparation.step.champion":
    "육성한 Agumon을 Greymon으로 진화시키세요. 메모리 2를 지불하고 모든 처리가 끝나면 봇의 턴이 됩니다.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "육성 에어리어의 진화도 첫 턴부터 드로우를 합니다. 메모리는 0에서 상대 쪽 2로 넘어갑니다.",
  "learn.lesson.practice-game-preparation.step.move":
    "봇이 턴을 끝낼 때까지 기다리세요. 다음 내 육성 페이즈에 Greymon을 배틀 에어리어로 이동시키세요.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "이동 시 새로운 디지몬이 등장되지 않습니다. Greymon은 이동 후 이번 턴에 어택할 수 있습니다.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Greymon을 메모리 3으로 Garudamon으로 진화시키세요. Greymon의 진화원 효과 Security Attack +1로 시큐리티를 2장 체크할 수 있습니다.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "진화원 카드의 일반 효과는 진화원 효과와 다릅니다. Greymon의 하단 효과 상자를 읽어보세요.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Garudamon으로 상대 플레이어를 어택하세요. 봇의 시큐리티 5장 중 2장을 한 장씩 체크합니다.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon의 DP는 시큐리티 배틀에서 살아남을 만큼 충분히 높습니다. 봇에는 3개의 시큐리티 카드가 남아 있습니다.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Biyomon을 메모리 2를 지불하고 등장시키세요. 처리가 끝나면 봇의 턴이 됩니다. Biyomon은 마지막 승리 어택을 위해 남겨 두세요.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "이번 턴에 등장한 디지몬은 보통 바로 어택할 수 없습니다. 봇이 턴을 넘긴 뒤 Biyomon이 준비됩니다.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "내 턴마다 Garudamon으로 어택하고 레스트 상태가 되면 턴을 종료하세요. 상대 시큐리티가 0장이 될 때까지 반복하고, Biyomon은 마지막 어택을 위해 액티브로 남겨 두세요.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "할 수 있는 행동이 없으면 육성 페이즈를 넘기세요. Garudamon은 어택마다 시큐리티 2장을 체크합니다. 마지막 시큐리티 뒤에 남은 체크가 있어도 추가 직접 어택으로 바뀌지 않습니다.",
  "learn.lesson.practice-game-preparation.step.win":
    "봇의 시큐리티가 0장입니다. Biyomon으로 상대 플레이어를 어택해 승리하세요.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "시큐리티를 클리어한 후에도 별도의 성공적인 어택이 필요합니다. Biyomon은 이전 턴에 플레이되었으며 지금 어택할 수 있습니다.",
  "learn.lesson.practice-rule-checks.title": "규칙 확인: DP가 0인 디지몬을 제거합니다.",
  "learn.lesson.practice-rule-checks.summary":
    "노란색 Option으로 Blocker의 DP를 0 아래로 낮추세요. 룰 체크에 의한 소멸을 확인하고 Salamon으로 승리하세요.",
  "learn.lesson.practice-rule-checks.goal1": "옵션의 색상 요구 사항을 충족하고 DP 감소 문제를 해결합니다.",
  "learn.lesson.practice-rule-checks.goal2": "룰 체크에 의한 소멸과 효과가 직접 지시하는 소멸 구분하기",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens가 Monochromon의 DP를 낮췄고 룰 체크가 이를 소멸시켰습니다. 그 뒤 Salamon이 승리하는 어택을 했습니다.",
  "learn.lesson.practice-rule-checks.step.intro":
    "봇에는 시큐리티가 없지만 Monochromon은 Salamon을 블록할 수 있습니다. Seven Heavens는 -10000 DP를 제공합니다. 규칙은 DP가 0 이하인 배틀 에어리어 디지몬을 소멸합니다.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon은 옵션의 색상 요구 사항에 노란색을 제공합니다. 메모리는 9개이고 옵션 가격은 7입니다.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "패의 Seven Heavens를 사용하고 봇의 Monochromon을 선택하세요. 대상을 확정하면 효과 해결 뒤 룰 체크로 Monochromon이 소멸해 트래시로 갑니다.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "Option은 DP만 낮춥니다. 결과 DP가 0 이하면 규칙 17-1-3-1-1의 룰 체크가 그 디지몬을 소멸시킵니다.",
  "learn.lesson.practice-rule-checks.step.win": "Blocker가 사라졌습니다. Salamon으로 플레이어를 어택하면 승리합니다.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon은 이번 턴 이전에 이미 배틀 에어리어에 있었습니다. 옵션은 두 개의 메모리를 남기므로 차례는 내 것입니다.",
} satisfies Record<keyof typeof newDrillsEn, string>;
