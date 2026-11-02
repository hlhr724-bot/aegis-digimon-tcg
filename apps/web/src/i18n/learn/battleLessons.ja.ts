import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnJa } from "@/i18n/learn/learn.ja";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsJa = {
  ...buildRulePracticeTranslations({ dictionary: learnJa }),
  "learn.lesson.drill-retaliation.title": "Retaliation：強い相手と相打ちにする",
  "learn.lesson.drill-retaliation.summary":
    "Retaliationでバトルに負けても強いBlockerを消滅させ、勝ちにつなげましょう。",
  "learn.lesson.drill-retaliation.goal1": "Retaliationでバトルに勝った相手を消滅させる仕組み",
  "learn.lesson.drill-retaliation.goal2": "小さなアタッカーで強い守りを崩せる理由",
  "learn.lesson.drill-retaliation.done":
    "Candlemonはバトルに負け、RetaliationでMonochromonを消滅させて、とどめの道を開きました。",
  "learn.lesson.drill-retaliation.step.intro":
    "CandlemonはDP1000でRetaliationを持ちます。相手にはDP5000のレストしたMonochromonがいて、Blockerを持ちます。このバトルに負けることで守りを除去できます。",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliationは、他のデジモンとのバトルに負けてこのデジモンが消滅したときに誘発します。",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Candlemonを選び、アタックでレストしたMonochromonを指定してください。バトルとRetaliationの解決を待ちます。",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "CandlemonはDPで負けます。その後RetaliationがMonochromonを消滅させます。これは効果による消滅で、2回目のバトルではありません。",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromonはいなくなり、相手のセキュリティは0枚です。Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Birdramonは最初のバトルで失わず、このとどめのアタックに残してください。",
  "learn.lesson.drill-blitz.title": "Blitz：メモリーが相手側でもアタック",
  "learn.lesson.drill-blitz.summary": "進化でメモリーを0より先へ進め、ターンが終わる前にBlitzを使います。",
  "learn.lesson.drill-blitz.goal1": "支払いが0を越えても進化時効果を解決できる理由",
  "learn.lesson.drill-blitz.goal2": "相手にメモリーがある間にBlitzでアタックする方法",
  "learn.lesson.drill-blitz.done": "BetelGammamonはメモリーを相手側に進めて進化し、Blitzのアタックで勝ちました。",
  "learn.lesson.drill-blitz.step.intro":
    "メモリーは1で、場にはBiyomonがいます。BetelGammamonの進化コストは2で、【進化時】Blitzを持ちます。",
  "learn.lesson.drill-blitz.step.intro.hint":
    "相手のセキュリティは0枚です。支払い後のBlitzの確認を使ってください。新たな通常のメインフェイズ行動を始めるには遅すぎます。",
  "learn.lesson.drill-blitz.step.digivolve":
    "手札のBetelGammamonをBiyomonに進化させてください。支払いで相手にメモリー1を渡します。",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "進化は既存のデジモンを変えます。アタックできるかどうかの履歴はリセットしません。",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Blitzを使うことを承認し、BetelGammamonでプレイヤーをアタックしてください。ターンが移る前に勝てます。",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitzは相手にメモリーがあってもこのアタックを許可します。Rushを与えたり、アクティブにしたりする効果ではありません。",
  "learn.lesson.drill-raid.title": "Raid：最強のアクティブな相手を狙う",
  "learn.lesson.drill-raid.summary": "Raidでアタックの対象をアクティブなBlockerに変えます。",
  "learn.lesson.drill-raid.goal1": "宣言済みのアタックの対象をRaidで変える方法",
  "learn.lesson.drill-raid.goal2": "対象は相手のアクティブなデジモンのうちDP最大である必要があること",
  "learn.lesson.drill-raid.done": "GrizzlymonがRaidでMonochromonを除去し、Birdramonがとどめを刺しました。",
  "learn.lesson.drill-raid.step.intro":
    "GrizzlymonはRaidを持ち、下のAgumonからDP+1000を得ています。相手にはアクティブなDP5000のMonochromonがいます。",
  "learn.lesson.drill-raid.step.intro.hint":
    "通常はアクティブなデジモンを対象にアタックを宣言できません。Raidは宣言後に対象を変えます。",
  "learn.lesson.drill-raid.step.raid":
    "Grizzlymonでプレイヤーをアタックし、Raidの選択でMonochromonを新しい対象にしてください。",
  "learn.lesson.drill-raid.step.raid.hint":
    "GrizzlymonはDP6000なので勝てます。MonochromonはDP最大のアクティブな相手として条件を満たします。",
  "learn.lesson.drill-raid.step.win": "Blockerはいなくなりました。Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-raid.step.win.hint":
    "Raidで対象を変えたバトルではセキュリティをチェックしていません。Birdramonは別のアタックを行います。",
  "learn.lesson.drill-collision.title": "Collision：相手にブロックを強いる",
  "learn.lesson.drill-collision.summary": "Blockerの記載がないデジモンに守らせ、Piercingでセキュリティを突破します。",
  "learn.lesson.drill-collision.goal1": "Collisionがアタック中に相手へBlockerを与える仕組み",
  "learn.lesson.drill-collision.goal2": "可能なら防御側が必ずブロックする理由",
  "learn.lesson.drill-collision.done":
    "ProganomonがGomamonにブロックさせ、Piercingで最後のセキュリティを破り、Birdramonが勝ちました。",
  "learn.lesson.drill-collision.step.intro":
    "ProganomonはCollisionとPiercingを持ちます。相手にはBlockerの記載がないGomamonとセキュリティ1枚があります。",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collisionはこのアタック中、相手のデジモンにBlockerを与え、可能ならブロックさせます。",
  "learn.lesson.drill-collision.step.collision":
    "Proganomonでプレイヤーをアタックしてください。相手がGomamonでブロックし、バトルに負け、Piercingでセキュリティをチェックする流れを確認します。",
  "learn.lesson.drill-collision.step.collision.hint":
    "相手は可能なブロックを断れません。ProganomonはDP7000、GomamonはDP3000です。",
  "learn.lesson.drill-collision.step.win":
    "相手にはセキュリティも守るデジモンもいません。Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-collision.step.win.hint":
    "Collisionがバトルを強制し、Proganomonが勝った後のチェックはPiercingが行いました。",
  "learn.lesson.drill-vortex.title": "Vortex：ターン終了時にもう一度バトル",
  "learn.lesson.drill-vortex.summary": "Galemonを登場させ、Vortexでそのターンに相手のデジモンをアタックします。",
  "learn.lesson.drill-vortex.goal1": "Vortexでターン終了時のアタックを行う仕組み",
  "learn.lesson.drill-vortex.goal2": "登場したターンに使えるが、通常はデジモンしか狙えないこと",
  "learn.lesson.drill-vortex.done": "Galemonは登場したターンにVortexでMonochromonを倒し、次のターンに勝ちました。",
  "learn.lesson.drill-vortex.step.intro":
    "GalemonはVortexを持ちます。相手にはレストしたMonochromonがいて、セキュリティは0枚です。ターン終了時にこのBlockerを倒せます。",
  "learn.lesson.drill-vortex.step.intro.hint":
    "通常、登場したばかりのデジモンはそのターンにアタックできません。Vortexはターン終了時だけの例外を与えます。",
  "learn.lesson.drill-vortex.step.play": "手札のGalemonをメモリー6で登場させてください。",
  "learn.lesson.drill-vortex.step.play.hint":
    "メモリーは0になります。登場したばかりなので、通常のアタックは行わないでください。",
  "learn.lesson.drill-vortex.step.vortex":
    "「ターン終了」を選び、Vortexを承認して、レストしたMonochromonを対象にしてください。",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortexは通常プレイヤーを狙えません。GalemonのDP6000はMonochromonのDP5000に勝ちます。",
  "learn.lesson.drill-vortex.step.opponent-turn": "ターン終了時の処理が終わり、相手のターンになるまで待ってください。",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "キーワードのアタックは実際のターン交代前に行われます。その後、相手はパスします。",
  "learn.lesson.drill-vortex.step.your-turn": "相手がパスし、次の自分のメインフェイズになるまで待ってください。",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemonは自分のターン開始時にアクティブになり、もうこのターンに登場したデジモンではありません。",
  "learn.lesson.drill-vortex.step.win": "Galemonで通常のプレイヤーへのアタックを行い、勝ちましょう。",
  "learn.lesson.drill-vortex.step.win.hint":
    "これは通常のメインフェイズのアタックです。Vortexのデジモン限定の制限は適用されません。",
  "learn.lesson.drill-overclock.title": "Overclock：アクティブにせず再びアタック",
  "learn.lesson.drill-overclock.summary": "Puppetを犠牲にして、レストしたShoeShoemonでターン終了時にアタックします。",
  "learn.lesson.drill-overclock.goal1": "他の指定デジモンの消滅でOverclockの条件を満たす方法",
  "learn.lesson.drill-overclock.goal2": "レストせずに行うアタックを、すでにレストしたデジモンでも行える理由",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemonがセキュリティをチェックし、ShoemonをOverclockで消滅させ、アクティブにならず再びアタックしました。",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemonはPuppetを指定するOverclockを持ちます。もう1体のPuppetであるShoemonはこのターンに登場したので、条件の支払いに残します。",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclockはレストせずプレイヤーをアタックします。ShoeShoemonがすでにレストしていても使えます。",
  "learn.lesson.drill-overclock.step.clear-security":
    "ShoeShoemonでプレイヤーをアタックし、最後のセキュリティを除いてください。",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "アタック後もShoeShoemonはレストしたままです。次のキーワードの確認を断らないでください。",
  "learn.lesson.drill-overclock.step.overclock":
    "「ターン終了」を選んでOverclockを承認してください。唯一使えるPuppetのShoemonが支払いとして消滅します。その後プレイヤーをアタックの対象にして勝ちます。",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "支払いはShoeShoemonではなくShoemonです。支払い後はプレイヤーへのアタックが必須になり、アクティブにする必要はありません。",
  "learn.lesson.drill-iceclad.title": "Iceclad：進化元の枚数で勝つ",
  "learn.lesson.drill-iceclad.summary": "DP12000の相手を、進化元の枚数の比較で倒します。",
  "learn.lesson.drill-iceclad.goal1": "デジモン同士のバトルでIcecladがDP比較を置き換える仕組み",
  "learn.lesson.drill-iceclad.goal2": "セキュリティバトルではDPを比べること",
  "learn.lesson.drill-iceclad.done":
    "PolarBearmonの進化元2枚がWarGreymonの0枚に勝ちました。DPは低くても生き残り、Birdramonが勝ちました。",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmonはDP7000、Iceclad、進化元2枚を持ちます。レストしたWarGreymonはDP12000ですが、進化元はありません。",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Icecladはセキュリティ以外のバトルでDPの代わりに進化元を比べます。多い方が勝ち、同数なら両方が負けます。",
  "learn.lesson.drill-iceclad.step.iceclad":
    "PolarBearmonでレストしたWarGreymonをアタックし、Icecladのバトルを解決してください。",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "DP7000と12000ではなく、進化元2枚と0枚を比べます。PolarBearmonは勝って場に残ります。",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymonはいなくなり、相手のセキュリティは0枚です。Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-iceclad.step.win.hint":
    "セキュリティデジモンとのバトルは引き続きDPを使います。Icecladの枚数比較は適用されません。",
  "learn.lesson.drill-execute.title": "Execute：アタッカーを犠牲に守りを崩す",
  "learn.lesson.drill-execute.summary":
    "ターン終了時にアクティブなBlockerをアタックし、後で自分のアタッカーを失います。",
  "learn.lesson.drill-execute.goal1": "Executeで終了時にアクティブなデジモンを狙えること",
  "learn.lesson.drill-execute.goal2": "そのアタック終了時にアタッカーが消滅する理由",
  "learn.lesson.drill-execute.done":
    "PhantomonはExecuteでMonochromonを倒した後に消滅し、次の自分のターンにBirdramonが勝ちました。",
  "learn.lesson.drill-execute.step.intro":
    "PhantomonはExecuteとDP7000を持ちます。相手のアクティブなMonochromonはDP5000で、Birdramonをブロックできます。",
  "learn.lesson.drill-execute.step.intro.hint":
    "Executeは自分のターン終了時にアタックでき、相手のアクティブなデジモンも狙えます。そのアタック終了時にPhantomonは消滅します。",
  "learn.lesson.drill-execute.step.execute":
    "「ターン終了」を選び、Executeを承認してMonochromonを対象にします。バトルとPhantomonの消滅まで待ってください。",
  "learn.lesson.drill-execute.step.execute.hint":
    "ここではプレイヤーを選ばずBlockerを除去します。バトルに勝ってもExecuteの後からの消滅処理は行われます。",
  "learn.lesson.drill-execute.step.opponent-turn": "ターン終了時の処理が終わり、相手のターンになるまで待ってください。",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "このキーワードのアタックはターン交代前に行われます。その後、相手はパスします。",
  "learn.lesson.drill-execute.step.your-turn": "相手がパスし、次の自分のメインフェイズになるまで待ってください。",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramonはアクティブなままで、Blockerはもういません。",
  "learn.lesson.drill-execute.step.win": "Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-execute.step.win.hint":
    "相手のセキュリティは0枚です。Phantomonの犠牲で、その守りを除去できました。",
  "learn.lesson.drill-progress.title": "Progress：アタック中はセキュリティ効果にも耐える",
  "learn.lesson.drill-progress.summary": "Cocytus Breathを受けても、Progressでアタッカーを場に残します。",
  "learn.lesson.drill-progress.goal1": "Progressがアタッカーへの相手の効果を防ぐ仕組み",
  "learn.lesson.drill-progress.goal2": "Progressでもすべてのバトルの敗北を防げるわけではないこと",
  "learn.lesson.drill-progress.done":
    "Dimetromonはアタック中にセキュリティ効果を受けず、次のターンのアタックで勝ちました。",
  "learn.lesson.drill-progress.step.intro":
    "DimetromonのProgressにより、アタック中は相手の効果を受けません。相手の最後のセキュリティはCocytus Breathです。",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breathは通常、相手のデジモンを手札へ戻します。この効果を受ける間もProgressがアタッカーを守ります。",
  "learn.lesson.drill-progress.step.progress":
    "Dimetromonでプレイヤーをアタックしてください。Cocytus Breathが解決しても手札に戻らないことを確認します。",
  "learn.lesson.drill-progress.step.progress.hint":
    "守られるのはアタック中に相手の効果を受ける場合です。強いセキュリティデジモンとのバトルによる通常の消滅は防げません。",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromonは場に残りました。「ターン終了」を選んでください。",
  "learn.lesson.drill-progress.step.end-turn.hint": "相手にはアタックできるデジモンがいません。",
  "learn.lesson.drill-progress.step.your-turn": "次の自分のメインフェイズまで待ってください。",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromonは自分のターン開始時にアクティブになります。",
  "learn.lesson.drill-progress.step.win": "Dimetromonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-progress.step.win.hint": "Progressがなければ、唯一のアタッカーは手札に戻っていました。",
  "learn.lesson.drill-engage.title": "Engage：ターン終了時の処理中にアタック",
  "learn.lesson.drill-engage.summary": "アタッカーをアクティブに残し、パス後にEngageのアタックを行います。",
  "learn.lesson.drill-engage.goal1": "Engageが自分のターン終了時に誘発すること",
  "learn.lesson.drill-engage.goal2": "相手のターン開始前にアタックを解決する理由",
  "learn.lesson.drill-engage.done": "WarGrowlmonはEngageでターン終了時の処理中にアタックして勝ちました。",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmonはEngageを持ち、相手のセキュリティは0枚です。通常のメインフェイズのアタックではなく、終了時のキーワードを使って勝ちます。",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engageは任意です。効果を処理する時点で、そのアタックをルール上行える必要があります。",
  "learn.lesson.drill-engage.step.keep-ready":
    "WarGrowlmonをレストせずEngageに残してください。パスする準備ができたら進みます。",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage自体はアクティブにする効果ではなく、登場したばかりのデジモンの通常の待ち時間も無視できません。",
  "learn.lesson.drill-engage.step.engage": "「ターン終了」を選び、Engageを承認してプレイヤーを対象にし、勝ちましょう。",
  "learn.lesson.drill-engage.step.engage.hint":
    "パスで相手にメモリー3を渡しますが、Engageとそのアタックは相手のターン開始前に解決します。",
  "learn.lesson.drill-barrier.title": "Barrier：セキュリティを払ってデジモンを守る",
  "learn.lesson.drill-barrier.summary": "セキュリティバトルに負けるAngemonを守り、その後の勝利に使います。",
  "learn.lesson.drill-barrier.goal1": "Barrierがバトルでの消滅を置き換える仕組み",
  "learn.lesson.drill-barrier.goal2": "セキュリティを支払うこととチェックすることの違い",
  "learn.lesson.drill-barrier.done":
    "Angemonはセキュリティ1枚をBarrierに払い、バトルを生き残って次のターンに勝ちました。",
  "learn.lesson.drill-barrier.step.intro":
    "AngemonはDP4000とBarrierを持ちます。相手の最後のセキュリティはDP5000のIkkakumonなので、このバトルには負けます。",
  "learn.lesson.drill-barrier.step.intro.hint":
    "自分のセキュリティ1枚をBarrierの支払いに使い、Angemonのバトルによる消滅を防げます。",
  "learn.lesson.drill-barrier.step.barrier":
    "Angemonでプレイヤーをアタックしてください。Barrierの確認を承認し、自分のセキュリティの一番上を破棄してAngemonを残します。",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrierは今回のバトルによる消滅を防ぎます。破棄した自分のセキュリティは支払いなので、Security効果は発揮しません。",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemonは生き残り、両者のセキュリティは0枚です。「ターン終了」を選んでください。",
  "learn.lesson.drill-barrier.step.end-turn.hint": "相手の場にデジモンはいないので、ここでは安全にパスできます。",
  "learn.lesson.drill-barrier.step.your-turn": "次の自分のメインフェイズまで待ってください。",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemonは自分のターン開始時にアクティブになります。",
  "learn.lesson.drill-barrier.step.win": "Angemonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-barrier.step.win.hint": "Barrierで、最後の一撃に必要な唯一のアタッカーを守れました。",
  "learn.lesson.drill-training.title": "Training：バトルに勝つための進化元を作る",
  "learn.lesson.drill-training.summary": "GreymonをTrainingさせ、次のアタックでBlockerを倒せるDPを得ます。",
  "learn.lesson.drill-training.goal1": "Trainingでデジモンをレストし、デッキの上を裏向きの進化元にする方法",
  "learn.lesson.drill-training.goal2": "裏向きの進化元が他の効果を強くする仕組み",
  "learn.lesson.drill-training.done":
    "GreymonはTrainingとアタック中に裏向きの進化元を1枚ずつ増やし、DP7000でBlockerを倒しました。Dracomonがとどめを刺しました。",
  "learn.lesson.drill-training.step.intro":
    "GreymonはTrainingとDP5000を持ちます。相手のGrizzlymonはDP6000でBlockerを持ちます。Trainingで勝利に必要な追加の進化元を作れます。",
  "learn.lesson.drill-training.step.intro.hint":
    "Greymonのアタック時効果は裏向きの進化元1枚につきDP+1000です。Trainingで置いた裏向きのカードの印刷された進化元効果は使えません。",
  "learn.lesson.drill-training.step.train":
    "Greymonを選んでTrainingを使ってください。レストし、デッキの一番上を裏向きで進化元の一番下に置きます。",
  "learn.lesson.drill-training.step.train.hint":
    "Trainingはメモリーを払いません。追加したカードは裏向きのままで、印刷された名前・色・効果を参照できません。",
  "learn.lesson.drill-training.step.end-turn": "「ターン終了」を選び、次のターンにGreymonを使えるようにしてください。",
  "learn.lesson.drill-training.step.end-turn.hint": "この練習では相手はアタックせずパスします。",
  "learn.lesson.drill-training.step.your-turn":
    "自分のメインフェイズまで待ってください。Greymonはアクティブになり、Trainingの進化元を保ちます。",
  "learn.lesson.drill-training.step.your-turn.hint":
    "Trainingの進化元はターンが変わっても残ります。一時的なDPボーナスではありません。",
  "learn.lesson.drill-training.step.battle":
    "Greymonでプレイヤーをアタックし、【アタック時】効果を承認して、デッキからもう1枚裏向きに置きDPを得ます。相手はGrizzlymonでブロックします。",
  "learn.lesson.drill-training.step.battle.hint":
    "裏向き2枚でDP+2000となり、7000で6000に勝ちます。先にTrainingしていなければ1枚だけでDP6000となり、両方が負けます。",
  "learn.lesson.drill-training.step.win": "Blockerがいなくなったら、Dracomonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-training.step.win.hint":
    "Dracomonはとどめに残します。Trainingで増やした進化元が、Greymonの守りを崩す力になりました。",
  "learn.lesson.drill-decoy.title": "Decoy：仲間を守る",
  "learn.lesson.drill-decoy.summary": "Machmonを犠牲にして、相手のGaia ForceからBigMamemonを守ります。",
  "learn.lesson.drill-decoy.goal1": "Decoyで守れるデジモンの条件",
  "learn.lesson.drill-decoy.goal2": "Decoyを持つデジモンを支払いにして反撃する方法",
  "learn.lesson.drill-decoy.done": "MachmonがDecoyの支払いとなり、守られたBigMamemonが場に残って勝ちました。",
  "learn.lesson.drill-decoy.step.intro":
    "Decoy (Black)により、他の自分の黒いデジモンが相手の効果で消滅するとき、Machmon自身を消滅させられます。相手は唯一の仲間BigMamemonにGaia Forceを使います。",
  "learn.lesson.drill-decoy.step.intro.hint":
    "ルール16-18。このキーワードは条件に合う他のデジモンを守ります。Machmon自身は守れません。",
  "learn.lesson.drill-decoy.step.react":
    "Decoyの確認でMachmonによる保護を承認してください。保護方法を選ぶ場合はMachmonのDecoyを指定します。",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmonは支払いとしてトラッシュへ行きます。BigMamemonは消滅せずバトルエリアに残ります。",
  "learn.lesson.drill-decoy.step.your-turn":
    "相手のターンが終わるまで待ってください。生き残ったBigMamemonがアタックできるようになります。",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "相手のAgumonはGaia Forceの色条件を満たすためにいます。この相手はこの後パスします。",
  "learn.lesson.drill-decoy.step.attack-player":
    "BigMamemonを選び、アタックの対象を相手の空のセキュリティにして勝ちましょう。",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Decoyで守った同じBigMamemonがアタックします。",
  "learn.lesson.drill-armor-purge.title": "Armor Purge：一番上のカードを捨てて守る",
  "learn.lesson.drill-armor-purge.summary": "全体を失う代わりにQuetzalmonを破棄し、Gabumonを場に残します。",
  "learn.lesson.drill-armor-purge.goal1": "一番上を破棄して消滅を防ぐ方法",
  "learn.lesson.drill-armor-purge.goal2": "下に残ったデジモンでアタックする方法",
  "learn.lesson.drill-armor-purge.done": "Quetzalmonを破棄してGabumonが除去を生き残り、そのGabumonで勝ちました。",
  "learn.lesson.drill-armor-purge.step.intro":
    "QuetzalmonはArmor Purgeを持ち、下にGabumonがあります。Gaia Forceで消滅するとき、一番上だけを破棄してその消滅を防げます。",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "ルール16-19。破棄するのはアーマーのカードです。重なった2枚を両方消滅させる処理ではありません。",
  "learn.lesson.drill-armor-purge.step.react": "Gaia ForceでQuetzalmonが狙われたら、Armor Purgeを承認してください。",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmonはトラッシュへ行きます。表れたGabumonは、場の同じデジモンとして残ります。",
  "learn.lesson.drill-armor-purge.step.your-turn":
    "自分のメインフェイズまで待ってください。Gabumonは残っていてアタックできます。",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purgeは今回の消滅を防いだだけで、後の効果への永続的な耐性を与えるわけではありません。",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Gabumonを選び、アタックの対象を相手の空のセキュリティにしてください。",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "下に残ったカードがとどめのアタックを行います。",
  "learn.lesson.drill-save.title": "Save：テイマーの下に資源を残す",
  "learn.lesson.drill-save.summary": "ShoutmonをSaveし、その同じカードをRushを持つ勝利のデジモンに再利用します。",
  "learn.lesson.drill-save.goal1": "消滅したカードをテイマーの下にSaveする方法",
  "learn.lesson.drill-save.goal2": "保存したカードをDigiXros素材に再利用する方法",
  "learn.lesson.drill-save.done": "SaveしたShoutmonがKing Versionの進化元になり、勝利に必要なRushを与えました。",
  "learn.lesson.drill-save.step.intro":
    "Gaia ForceがShoutmonを消滅させます。【消滅時】Saveでトラッシュに残す代わりにTaikiの下へ置けます。手札のShoutmon (King Version)はそれをDigiXrosに使えます。",
  "learn.lesson.drill-save.step.intro.hint":
    "ルール16-20。Saveは資源としてカードを残しますが、Shoutmonの消滅は防ぎません。",
  "learn.lesson.drill-save.step.react":
    "Shoutmonの【消滅時】効果を解決してSaveを承認し、必要なら受け取るテイマーとしてTaiki Kudoを選んでください。",
  "learn.lesson.drill-save.step.react.hint":
    "ShoutmonはTaikiの下に置かれ、自分のバトルエリアにデジモンはいなくなります。",
  "learn.lesson.drill-save.step.your-turn":
    "自分のメインフェイズまで待ってください。メモリー3で保存したShoutmonを再利用できます。",
  "learn.lesson.drill-save.step.your-turn.hint": "Taikiをレストすると、テイマーの下のカードをDigiXrosに使えます。",
  "learn.lesson.drill-save.step.reuse":
    "手札のShoutmon (King Version)でDigiXrosを選んでください。レストするテイマーにTaikiを選び、その下のShoutmonを素材にして確定します。",
  "learn.lesson.drill-save.step.reuse.hint":
    "素材1枚でコストは5から3になります。Shoutmonの進化元効果は、名前にShoutmonを含むこのデジモンにRushを与えます。",
  "learn.lesson.drill-save.step.attack-player":
    "Shoutmon (King Version)で相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-save.step.attack-player.hint":
    "保存した進化元がなければ、このターン登場したデジモンに今アタックするためのRushはありません。",
  "learn.lesson.drill-material-save.title": "Material Save：進化元を救い出す",
  "learn.lesson.drill-material-save.summary": "DigiXrosの素材2枚を保存し、MetalGreymonを組み直してRushで勝ちます。",
  "learn.lesson.drill-material-save.goal1": "消滅する重なりから指定された素材を救う方法",
  "learn.lesson.drill-material-save.goal2": "救った2枚を再利用して支払いを減らす方法",
  "learn.lesson.drill-material-save.done":
    "救い出した2枚でMetalGreymonをメモリー3で組み直し、Rushのアタックで勝ちました。",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymonの下にはGreymonとMailBirdramonがいます。Gaia Forceで消滅するとき、Material Save 2で指定のDigiXros素材をKirihaの下に置けます。",
  "learn.lesson.drill-material-save.step.intro.hint":
    "ルール16-21。保存するのは条件に合う進化元で、消滅したMetalGreymon自身ではありません。",
  "learn.lesson.drill-material-save.step.react":
    "Material Save 2を承認し、GreymonとMailBirdramonを選んで、指定されたらKiriha Aonumaの下に置いてください。",
  "learn.lesson.drill-material-save.step.react.hint":
    "使える進化元を2枚とも選びます。MetalGreymonはトラッシュへ行きますが、素材はKirihaの下に残ります。",
  "learn.lesson.drill-material-save.step.your-turn":
    "自分のメインフェイズまで待ってください。手札には次のMetalGreymonがあり、メモリーは3です。",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "KirihaをレストするとDigiXrosにテイマーの下の素材を使えます。",
  "learn.lesson.drill-material-save.step.reuse":
    "手札のMetalGreymonでDigiXrosを選びます。Kirihaをレストするテイマーにして、下に保存した2枚を素材に選び確定し、【登場時】の選択を解決してください。",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "素材2枚でコストは7から3になります。【登場時】にRushを得るので、組み直したデジモンはすぐアタックできます。",
  "learn.lesson.drill-material-save.step.attack-player":
    "組み直したMetalGreymonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "救った2枚で支払えるコストになりました。Rushで新しいデジモンがとどめを刺せます。",
  "learn.lesson.drill-evade.title": "Evade：レストして生き残る",
  "learn.lesson.drill-evade.summary": "Gaia ForceにEvadeを使い、自分のターンにアクティブになって勝ちます。",
  "learn.lesson.drill-evade.goal1": "狙われたデジモンをレストして支払う方法",
  "learn.lesson.drill-evade.goal2": "相手の除去を受けてもアタッカーを残す方法",
  "learn.lesson.drill-evade.done": "Syakomonはレストして消滅を回避し、アクティブになって勝ちました。",
  "learn.lesson.drill-evade.step.intro":
    "SyakomonはEvadeを持ちます。Gaia Forceで消滅するとき、Syakomonをレストしてその消滅を防げます。支払うにはレストできる必要があります。",
  "learn.lesson.drill-evade.step.intro.hint": "ルール16-22。Syakomonは現在アクティブで、唯一のアタッカーです。",
  "learn.lesson.drill-evade.step.react":
    "Evadeの確認が出たら承認してください。Syakomonはレストし、Gaia Forceの後も残ります。",
  "learn.lesson.drill-evade.step.react.hint":
    "すでにレストしていれば、この条件を再び支払えません。これは今回の消滅の防止で、効果を受けない耐性ではありません。",
  "learn.lesson.drill-evade.step.your-turn":
    "相手のパスを待ってください。Syakomonは次の自分のアクティブフェイズにアクティブになります。",
  "learn.lesson.drill-evade.step.your-turn.hint": "Gaia Forceは相手のトラッシュにあり、Syakomonはまだ場にいます。",
  "learn.lesson.drill-evade.step.attack-player":
    "Syakomonを選び、アタックの対象を相手の空のセキュリティにしてください。",
  "learn.lesson.drill-evade.step.attack-player.hint": "消滅を回避したデジモンが、とどめのアタッカーになります。",
  "learn.lesson.drill-fortitude.title": "Fortitude：消滅後に再登場",
  "learn.lesson.drill-fortitude.summary": "Gaia Forceの後にAquilamonを再登場させ、新しいデジモンで勝ちます。",
  "learn.lesson.drill-fortitude.goal1": "Fortitudeは消滅時に進化元が必要であること",
  "learn.lesson.drill-fortitude.goal2": "再登場したデジモンは新しいデジモンであること",
  "learn.lesson.drill-fortitude.done": "Aquilamonは進化元を失って戻り、次の自分のターンに勝ちました。",
  "learn.lesson.drill-fortitude.step.intro":
    "AquilamonはFortitudeを持ち、下にKunemonがあります。進化元がある状態で消滅すると、コストを払わずAquilamonを再び登場させます。",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "ルール16-27。消滅は防ぎません。再登場するデジモンは新しく、以前の進化元はトラッシュに残ります。",
  "learn.lesson.drill-fortitude.step.react":
    "Gaia ForceでAquilamonを消滅させ、Fortitudeの誘発を解決してください。誘発効果パネルが尋ねたら、この必須効果を確認します。",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamonは進化元なしの新しい場のデジモンとして戻ります。Kunemonはトラッシュに残ります。",
  "learn.lesson.drill-fortitude.step.your-turn":
    "自分のターンを待ってください。Aquilamonは相手のターンに再登場したので、自分のターンにはアタックできます。",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "進化元がないため、次に消滅してもこのFortitudeは再び誘発しません。",
  "learn.lesson.drill-fortitude.step.attack-player":
    "再登場したAquilamonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "勝つのは元の場のデジモンではなく、Fortitudeで戻ったカードです。",
  "learn.lesson.drill-partition.title": "Partition：2体のデジモンに分かれる",
  "learn.lesson.drill-partition.summary": "相手の消滅効果に対応し、レベル4のデジモン2体を登場させます。",
  "learn.lesson.drill-partition.goal1": "指定された進化元が両方必要であること",
  "learn.lesson.drill-partition.goal2": "一番上が離れる前に両方を登場させる方法",
  "learn.lesson.drill-partition.done": "PaildramonがIkkakumonとTogemonに分かれ、Ikkakumonが勝ちました。",
  "learn.lesson.drill-partition.step.intro":
    "PaildramonのPartitionは青のLv.4と緑のLv.4を指定します。下のIkkakumonとTogemonが条件を満たします。Gaia ForceがPaildramonを除去しようとしています。",
  "learn.lesson.drill-partition.step.intro.hint":
    "ルール16-29。Partitionは相手の効果に対応します。バトルや自分の効果による除去には使えません。",
  "learn.lesson.drill-partition.step.react":
    "Partitionを承認し、青のIkkakumonと緑のTogemonを選んで、両方をコストを払わず登場させてください。",
  "learn.lesson.drill-partition.step.react.hint":
    "指定された種類を1体ずつ登場させる必要があります。Paildramonはそのまま離れます。Partitionは消滅を防ぎません。",
  "learn.lesson.drill-partition.step.your-turn":
    "自分のメインフェイズまで待ってください。進化元だった2枚は、別々のデジモンになっています。",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "相手のターンに登場したので、自分のターンになればアタックできます。",
  "learn.lesson.drill-partition.step.attack-player": "Ikkakumonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Togemonも確認できます。同じPartitionで指定された進化元を両方登場させました。",
  "learn.lesson.drill-scapegoat.title": "Scapegoat：仲間を犠牲にする",
  "learn.lesson.drill-scapegoat.summary": "Agumonを消滅させ、相手のGaia ForceからBastemonを守ります。",
  "learn.lesson.drill-scapegoat.goal1": "別のデジモンを支払いに選ぶ方法",
  "learn.lesson.drill-scapegoat.goal2": "狙われたデジモンの消滅を防ぐ方法",
  "learn.lesson.drill-scapegoat.done": "AgumonがScapegoatの支払いとなり、生き残ったBastemonが勝ちました。",
  "learn.lesson.drill-scapegoat.step.intro":
    "BastemonはScapegoatを持ちます。自分の効果以外で消滅するとき、他の自分のデジモンを消滅させて防げます。ここではAgumonを支払いに使えます。",
  "learn.lesson.drill-scapegoat.step.intro.hint": "ルール16-32。犠牲にするのはBastemonではなく、別のデジモンです。",
  "learn.lesson.drill-scapegoat.step.react": "Scapegoatを承認し、消滅させるデジモンに自分のAgumonを選んでください。",
  "learn.lesson.drill-scapegoat.step.react.hint":
    "Agumonはトラッシュへ行き、Bastemonは残ります。保護を断らないでください。",
  "learn.lesson.drill-scapegoat.step.your-turn":
    "相手がGaia Forceを解決してパスし、自分のターンになるまで待ってください。",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemonは同じデジモンとして残り、アタックできます。",
  "learn.lesson.drill-scapegoat.step.attack-player": "Bastemonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "犠牲を払ったことで、より強いデジモンを勝利に残せました。",
  "learn.lesson.drill-decode.title": "Decode：離れる前に進化元を登場させる",
  "learn.lesson.drill-decode.summary": "覚醒した姿が手札に戻るとき、Sistermon Blancを進化元から救います。",
  "learn.lesson.drill-decode.goal1": "Decodeがバトル以外での離脱に対応できること",
  "learn.lesson.drill-decode.goal2": "指定された進化元をコストを払わず登場させる方法",
  "learn.lesson.drill-decode.done": "Sistermon BlancがDecodeで進化元から出て、とどめのアタックを行いました。",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened)はDecode (Sistermon Blanc)を持ち、下にはその正確な名前のカードがあります。相手のCocytus Breathは覚醒したカードを手札へ戻します。",
  "learn.lesson.drill-decode.step.intro.hint":
    "ルール16-36。今回の手札に戻す処理はバトルでの除去ではないため、Decodeを使えます。",
  "learn.lesson.drill-decode.step.react":
    "Decodeを承認し、進化元からSistermon Blancを選んでください。必要ならBlancの【登場時】Draw 1を解決します。",
  "learn.lesson.drill-decode.step.react.hint":
    "Blancは別のデジモンとして登場します。覚醒したカードは手札へ戻ります。Decodeはその離脱を防ぎません。",
  "learn.lesson.drill-decode.step.your-turn":
    "自分のメインフェイズまで待ってください。Decodeで登場したSistermon Blancが唯一の自分のデジモンです。",
  "learn.lesson.drill-decode.step.your-turn.hint": "相手のターンに登場したので、自分のターンにはアタックできます。",
  "learn.lesson.drill-decode.step.attack-player": "Sistermon Blancで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Decodeがなければ、この進化元は場を離れる重なりとともに破棄されていました。",
  "learn.lesson.drill-fragment.title": "Fragment：進化元を支払いにする",
  "learn.lesson.drill-fragment.summary": "進化元2枚を破棄し、Gaia ForceからGiromonを守ります。",
  "learn.lesson.drill-fragment.goal1": "Fragmentで指定された枚数をすべて払う必要があること",
  "learn.lesson.drill-fragment.goal2": "ちょうど2枚を払って消滅を防ぐ方法",
  "learn.lesson.drill-fragment.done": "Giromonは両方の進化元をFragment 2に払い、生き残って勝ちました。",
  "learn.lesson.drill-fragment.step.intro":
    "GiromonはFragment (2)を持ち、下にJazamonとJazardmonがあります。Gaia Forceで消滅するとき、進化元2枚を破棄してその消滅を防げます。",
  "learn.lesson.drill-fragment.step.intro.hint":
    "ルール16-37。1枚だけでは足りません。Giromonには必要な2枚がちょうどあります。",
  "learn.lesson.drill-fragment.step.react":
    "Fragmentを承認し、破棄する進化元としてJazamonとJazardmonを両方選んでください。",
  "learn.lesson.drill-fragment.step.react.hint": "Giromonは進化元なしで場に残り、選んだ2枚はトラッシュへ行きます。",
  "learn.lesson.drill-fragment.step.your-turn": "相手がパスして自分のメインフェイズになるまで待ってください。",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "今回の消滅は防げましたが、もうFragmentを再び払える進化元はありません。",
  "learn.lesson.drill-fragment.step.attack-player": "Giromonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-fragment.step.attack-player.hint": "Fragmentを払った同じGiromonが、とどめのアタックを行います。",
  "learn.lesson.drill-guard.title": "Guard：手札への戻しも防ぐ",
  "learn.lesson.drill-guard.summary": "Gladimonを犠牲にして、Cocytus BreathがBigMamemonを手札に戻すことを防ぎます。",
  "learn.lesson.drill-guard.goal1": "Guardで相手の除去から他のデジモンを守る方法",
  "learn.lesson.drill-guard.goal2": "手札への戻しも防げること",
  "learn.lesson.drill-guard.done": "GladimonがGuardの支払いとなって手札への戻しを防ぎ、BigMamemonが残って勝ちました。",
  "learn.lesson.drill-guard.step.intro":
    "GladimonはGuardを持ちます。他の自分のデジモンが相手の効果でバトルエリアを離れるとき、自身を消滅させて防げます。相手はCocytus BreathでBigMamemonを狙います。",
  "learn.lesson.drill-guard.step.intro.hint":
    "ルール16-45。消滅だけを防ぐ保護とは異なり、Guardは今回の手札に戻す処理にも使えます。",
  "learn.lesson.drill-guard.step.react":
    "保護の確認でGladimonのGuardを承認してください。反応の順序を選ぶ場合はGuardを選びます。",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimonが支払いとして消滅します。BigMamemonは手札に入らず、バトルエリアに残ります。",
  "learn.lesson.drill-guard.step.your-turn":
    "相手がパスして自分のターンになるまで待ちます。Gladimonの【消滅時】確認が出たら解決してください。",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "相手のGabumonは進化元なしのレベル3なので、Gladimonはその一番上のカードを破棄できません。",
  "learn.lesson.drill-guard.step.attack-player": "BigMamemonで相手の空のセキュリティをアタックしてください。",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guardで、残された唯一のアタッカーを場に残せました。",
  "learn.lesson.drill-digisorption.title": "Digisorption：レストしてメモリーを節約",
  "learn.lesson.drill-digisorption.summary": "KunemonをレストしてPistmonにメモリー1で進化し、そのままアタックします。",
  "learn.lesson.drill-digisorption.goal1": "Digisorptionで必要なレストを支払う方法",
  "learn.lesson.drill-digisorption.goal2": "進化するデジモンをアタックできる状態に残す方法",
  "learn.lesson.drill-digisorption.done": "Digisorptionの条件を払い、アクティブなPistmonで勝ちました。",
  "learn.lesson.drill-digisorption.step.intro":
    "メモリーは1しかありません。PistmonのDigisorption -2で、他のデジモンをレストすれば通常3の進化コストが1になり、自分のターンを続けられます。",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "LighdramonではなくKunemonをレストし、アタッカーをアクティブに残してください。",
  "learn.lesson.drill-digisorption.step.digivolve":
    "LighdramonをPistmonに進化させてください。Digisorptionを承認し、レストするデジモンにKunemonを選びます。",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "メモリー1を払って0にし、Pistmonをアクティブに残します。軽減なしで3払うと、アタック前にメモリーを相手へ渡してしまいます。",
  "learn.lesson.drill-digisorption.step.attack-player": "Pistmonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "相手のセキュリティは0枚で、PistmonはLighdramonとしてすでに場にいたデジモンです。",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst：進化元を使う",
  "learn.lesson.drill-digi-burst.summary": "進化元2枚を破棄してBlockerをレストさせてからアタックします。",
  "learn.lesson.drill-digi-burst.goal1": "メインのDigi-Burst効果を使う方法",
  "learn.lesson.drill-digi-burst.goal2": "進化元をちょうど2枚支払う方法",
  "learn.lesson.drill-digi-burst.done": "HerculesKabuterimonは進化元2枚を使ってBlockerを止め、とどめの道を開きました。",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimonはメインのDigi-Burst 2を持ちます。進化元2枚を破棄すると相手のデジモンをレストできます。",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromonはアクティブならブロックできます。先にレストさせましょう。",
  "learn.lesson.drill-digi-burst.step.burst":
    "HerculesKabuterimonを選んでDigi-Burstを使います。破棄する進化元にKunemonとKabuterimonを選び、レストさせる相手にMonochromonを選んでください。",
  "learn.lesson.drill-digi-burst.step.burst.hint":
    "一番上のHerculesKabuterimonは、支払いに使える進化元ではありません。",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "HerculesKabuterimonでプレイヤーをアタックし、最後のセキュリティをチェックしてください。",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "レストしたMonochromonはブロックできません。",
  "learn.lesson.drill-digi-burst.step.attack-player": "Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-digi-burst.step.attack-player.hint": "最後のセキュリティを除くだけでは勝利になりません。",
  "learn.lesson.drill-delay.title": "Delay：準備したオプションを使う",
  "learn.lesson.drill-delay.summary": "Reinforcing Memory Boost!でメモリーを得て、Rushのとどめに使います。",
  "learn.lesson.drill-delay.goal1": "置いたターンより後にDelayを使う方法",
  "learn.lesson.drill-delay.goal2": "残したオプションをメモリー3に変える方法",
  "learn.lesson.drill-delay.done": "DelayでBushiAgumonを支払い、Rushで勝ちました。",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost!は前のターンにバトルエリアへ置かれ、今はDelayを使えます。現在のメモリーは2だけです。",
  "learn.lesson.drill-delay.step.intro.hint": "カードを置いた同じターンにはDelayを使えません。",
  "learn.lesson.drill-delay.step.delay":
    "Reinforcing Memory Boost!を選びDelayを使ってください。それを破棄してメモリー3を得ます。",
  "learn.lesson.drill-delay.step.delay.hint": "メモリーは2から5になります。",
  "learn.lesson.drill-delay.step.play-rush": "手札からBushiAgumonをメモリー5で登場させてください。",
  "learn.lesson.drill-delay.step.play-rush.hint": "Delayで得た分により、支払い後もメモリーを0に残せます。",
  "learn.lesson.drill-delay.step.attack-player": "BushiAgumonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rushで、登場したばかりのデジモンもアタックできます。",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve：アタック中に進化",
  "learn.lesson.drill-blast-digivolve.summary":
    "相手のアタックにWarGreymonでCounterし、ブロックして次のターンに勝ちます。",
  "learn.lesson.drill-blast-digivolve.goal1": "Counterのタイミングで無料で進化する方法",
  "learn.lesson.drill-blast-digivolve.goal2": "ブロックタイミング前にBlockerを得る方法",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast DigivolveでWarGreymonになり、負けにつながるアタックを間に合ってブロックし、その後勝ちました。",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "自分のセキュリティは0枚で、相手がアタックします。MetalGreymonにBlockerはありませんが、手札のWarGreymonへBlast Digivolveすれば得られます。",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "Counterのタイミングはブロックタイミングより前です。",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "Counterの確認で手札のWarGreymonを選び、MetalGreymonにBlast Digivolveを使ってください。",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "条件を満たす進化はメモリー不要で、通常どおり1枚ドローします。",
  "learn.lesson.drill-blast-digivolve.step.block": "新しいWarGreymonでアタック中のIkkakumonをブロックしてください。",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymonはDP11000、IkkakumonはDP5000です。",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "生き残りました。相手がパスし、自分のデジモンがアクティブになるまで待ってください。",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint":
    "Counterを行っても自分のターンが始まったわけではありません。",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "WarGreymonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "相手にはセキュリティもBlockerも残っていません。",
  "learn.lesson.drill-mind-link.title": "Mind Link：テイマーを進化元にする",
  "learn.lesson.drill-mind-link.summary": "EijiをLoogarmonにMind Linkし、得たAllianceを使って勝ちにつなげます。",
  "learn.lesson.drill-mind-link.goal1": "条件に合うテイマーを進化元に置く方法",
  "learn.lesson.drill-mind-link.goal2": "Mind Linkで得た進化元効果を使う方法",
  "learn.lesson.drill-mind-link.done":
    "Eijiが進化元になってAllianceを与え、Loogarmonがセキュリティ2枚を除く助けになりました。",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumiは、テイマーの進化元がないDark AnimalまたはSoCのデジモンへMind Linkできます。Loogarmonは条件に合います。",
  "learn.lesson.drill-mind-link.step.intro.hint": "進化元になったEijiの効果から、AllianceとBlockerを得ます。",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Eijiを選んでメインのMind Link効果を使い、行き先をLoogarmonにしてください。",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "EijiはLoogarmonの下へ移り、バトルエリアの独立したテイマーではなくなります。",
  "learn.lesson.drill-mind-link.step.alliance":
    "Loogarmonでプレイヤーをアタックし、アタックの誘発効果を好きな順序で解決してください。AllianceではBirdramonをレストします。Loogarmonの任意の手札コスト効果は断るか、1枚破棄して解決できます。両方を終えてからセキュリティ2枚をチェックします。",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "AllianceにはBirdramonを選び、Dracomonをとどめ用にアクティブに残してください。",
  "learn.lesson.drill-mind-link.step.attack-player": "Dracomonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "AllianceはBirdramonが支払ったので、Dracomonはまだアクティブです。",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve：場と手札を組み合わせる",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "場のデジモンと手札の素材を使い、CounterでRagnaLoardmonを作ります。",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Counter中に指定されたDNA素材を両方そろえる方法",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "アタックが続く前にDNA限定の除去を解決する方法",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmonは両方の素材を無料で合わせ、アタッカーを除去して次のターンに勝ちました。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "セキュリティ0枚の状態で相手がアタックします。場にはDurandamon、手札にはBryweLudramonとRagnaLoardmonがあります。",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolveには、指定された場のデジモンと、もう一方の指定カードが手札に必要です。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "CounterでRagnaLoardmonを使い、Durandamonと手札のBryweLudramonをBlast DNA Digivolveの素材に選びます。効果を解決し、消滅させる相手にアタック中のPlesiomonを選んでください。",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "進化時効果で最後の相手のセキュリティを破棄し、DNA限定の効果で攻撃を受ける前にアタッカーを消滅させます。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "相手のパスを待ってください。新しいRagnaLoardmonは自分のターンに使えます。",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNAは新しいデジモンを作り、両方の素材を進化元に合わせます。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "RagnaLoardmonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "Counter中にアタッカーを消滅させたので、セキュリティなしでも生き残れました。",
  "learn.lesson.drill-link.title": "Link +：追加のリンクを保つ",
  "learn.lesson.drill-link.summary": "最初のリンクを入れ替えず、Deusmonに2枚目をリンクします。",
  "learn.lesson.drill-link.goal1": "リンクコストを払って手札からリンクする方法",
  "learn.lesson.drill-link.goal2": "Link +1でリンクカードを2枚保つ方法",
  "learn.lesson.drill-link.done":
    "DeusmonがNavimonを2枚リンクしたままセキュリティをチェックし、Birdramonにとどめを残しました。",
  "learn.lesson.drill-link.step.intro":
    "通常デジモンのリンク上限は1枚です。DeusmonはLink +1を持つので2枚まで保てます。すでにNavimonが1枚リンクされています。",
  "learn.lesson.drill-link.step.intro.hint": "リンクカードは横に置かれ、進化元ではありません。",
  "learn.lesson.drill-link.step.link":
    "手札のNavimonを選び、LinkでDeusmonを指定し、リンクコストのメモリー1を払ってください。",
  "learn.lesson.drill-link.step.link.hint": "Deusmonには2枚分の枠があるので、両方のNavimonがリンクされたまま残ります。",
  "learn.lesson.drill-link.step.attack-security":
    "Deusmonでプレイヤーをアタックし、最後のセキュリティをチェックしてください。",
  "learn.lesson.drill-link.step.attack-security.hint": "両方のリンクがある間、それぞれのリンクDPボーナスは有効です。",
  "learn.lesson.drill-link.step.attack-player": "Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-link.step.attack-player.hint": "とどめのアタックはセキュリティチェックとは別です。",
  "learn.lesson.drill-use-req.title": "Use Req.：色の代わりに特徴を満たす",
  "learn.lesson.drill-use-req.summary": "自分の場が黄色だけでも、白いe-Pulseを使います。",
  "learn.lesson.drill-use-req.goal1": "指定されたUse Req.条件の読み方",
  "learn.lesson.drill-use-req.goal2": "色条件だけを無視し、オプションのコストを払うこと",
  "learn.lesson.drill-use-req.done":
    "LiollmonがUse Req.を満たし、e-Pulseでもう1体を登場させ、元のLiollmonで勝ちました。",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulseは白ですが、場には黄色のLiollmonしかいません。Use Req.は自分の場のBEATBREAKカードを条件にできます。",
  "learn.lesson.drill-use-req.step.intro.hint": "LiollmonはBEATBREAKを持つため、白の色条件を無視できます。",
  "learn.lesson.drill-use-req.step.use-option":
    "手札のe-Pulseをメモリー3で使ってください。効果を承認し、もう1枚のLiollmonを手札から登場コストを払わず登場させます。",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req.が無視するのは色で、使用コスト3ではありません。その後e-Pulseはバトルエリアに残ります。",
  "learn.lesson.drill-use-req.step.attack-player":
    "前からバトルエリアにいたLiollmonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "新しく登場したLiollmonはこのターンにアタックできません。元からいた方を選びます。",
  "learn.lesson.drill-ascension.title": "Ascension：消滅をセキュリティに変える",
  "learn.lesson.drill-ascension.summary": "ScourgeChiropmonをセキュリティにし、相手のターンを耐えてから勝ちます。",
  "learn.lesson.drill-ascension.goal1": "実際にバトルで消滅した後にAscensionを解決する方法",
  "learn.lesson.drill-ascension.goal2": "追加したセキュリティで1ターン生き残る方法",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmonがセキュリティとなって相手のアタックを受け止め、Birdramonの勝利につなげました。",
  "learn.lesson.drill-ascension.step.intro":
    "セキュリティは0枚です。Birdramonはこのターンに登場したので待つ必要があります。ScourgeChiropmonのAscensionで、消滅後にセキュリティにできます。",
  "learn.lesson.drill-ascension.step.intro.hint":
    "相手は自分のターンにアタックするため、パスする前にセキュリティが必要です。",
  "learn.lesson.drill-ascension.step.ascend":
    "ScourgeChiropmonでレストしたPlesiomonをアタックしてください。バトルに負けたらAscensionを承認し、自分のセキュリティの一番上に置きます。",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmonはDP8000、PlesiomonはDP12000です。他の消滅時効果に使えるテイマーの支払いはありません。",
  "learn.lesson.drill-ascension.step.end-turn": "セキュリティが1枚できました。ターンを終了してください。",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramonは登場したこのターンにはまだアタックできません。",
  "learn.lesson.drill-ascension.step.your-turn":
    "相手に新しいセキュリティをアタックさせて、自分のターンを待ってください。",
  "learn.lesson.drill-ascension.step.your-turn.hint":
    "Ascensionがなければ、セキュリティ0枚の状態でそのアタックを受けて負けていました。",
  "learn.lesson.drill-ascension.step.attack-player": "Birdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-ascension.step.attack-player.hint": "Birdramonはもうアタックでき、相手のセキュリティは0枚です。",
  "learn.lesson.drill-detach.title": "Detach：リンクを払って場に残る",
  "learn.lesson.drill-detach.summary": "条件に合うSeven Codeのリンクを外し、Cocytus Breathを防ぎます。",
  "learn.lesson.drill-detach.goal1": "相手の効果で除去されるときにDetachを使う方法",
  "learn.lesson.drill-detach.goal2": "進化元ではなく条件に合うリンクを支払うこと",
  "learn.lesson.drill-detach.done": "Weatherdramonはリンクを失ってもバトルエリアに残り、自分のターンに勝ちました。",
  "learn.lesson.drill-detach.step.intro":
    "相手はCocytus BreathでWeatherdramonを手札に戻そうとしています。WeatherdramonはSeven Codeのリンクを使うDetachを持ちます。",
  "learn.lesson.drill-detach.step.intro.hint": "リンクされているRoleplaymonは、必要なSeven Codeの特徴を持ちます。",
  "learn.lesson.drill-detach.step.detach":
    "除去の確認が出たらDetachを承認し、リンクされているRoleplaymonを破棄してWeatherdramonをバトルエリアに残してください。",
  "learn.lesson.drill-detach.step.detach.hint":
    "リンクはトラッシュへ行きます。WeatherdramonはリンクDPを失いますが、手札には戻りません。",
  "learn.lesson.drill-detach.step.your-turn": "相手はオプションを使い終わりました。パスを待ってください。",
  "learn.lesson.drill-detach.step.your-turn.hint":
    "Detachは除去を防ぎます。Weatherdramonを再登場させるわけではありません。",
  "learn.lesson.drill-detach.step.attack-player": "Weatherdramonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "同じデジモンとして場に残ったため、自分のターンにアタックできます。",
  "learn.lesson.drill-succession.title": "Succession：進化元の通常効果を使う",
  "learn.lesson.drill-succession.summary":
    "Successionで進化元のCeresmonの通常効果を得て、Palmonのアタック中にBlockerを除きます。",
  "learn.lesson.drill-succession.goal1": "Successionが選ぶ条件に合う一番上の進化元を読む方法",
  "learn.lesson.drill-succession.goal2": "進化元効果欄ではなくコピーした通常効果を解決すること",
  "learn.lesson.drill-succession.done":
    "SuccessionでCeresmonのレストへの反応をコピーし、Monmonを消滅させました。Palmonがセキュリティを除き、Dracomonが勝ちました。",
  "learn.lesson.drill-succession.step.intro":
    "一番上のCeresmonはSuccession (Ceresmon)を持ちます。進化元のCeresmonには、デジモンがレストしたとき、その数1体につき相手1体をDP-3000する【お互いのターン】の通常効果があり、それをコピーします。",
  "learn.lesson.drill-succession.step.intro.hint":
    "これは進化元の通常効果欄の文章で、進化元効果欄ではありません。MonmonはDP1000です。PalmonのDP2000は、DP1000のセキュリティデジモンにも勝てます。",
  "learn.lesson.drill-succession.step.copy-effect":
    "Palmonでプレイヤーをアタックすると、レストによってCeresmonがSuccessionで得た効果が誘発します。MonmonをDP-3000にし、ブロック前に消滅させてください。その後Palmonが最後のセキュリティをチェックして生き残ります。",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "コピーしたCeresmonの反応を、ブロックタイミングへ進む前に解決します。",
  "learn.lesson.drill-succession.step.attack-player":
    "Palmonのセキュリティチェックが終わったら、Dracomonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "最後のセキュリティチェックだけでは勝ちません。Dracomonが別のアタックでとどめを刺します。",
  "learn.lesson.practice-game-preparation.title": "初期手札から勝利のバトルまで",
  "learn.lesson.practice-game-preparation.summary":
    "正しいデッキ、手札5枚、セキュリティ5枚、メモリー0で始め、アタッカーを育てて勝ちます。",
  "learn.lesson.practice-game-preparation.goal1":
    "初期手札・セキュリティ・デジタマデッキと、先攻初回のドローの例外を理解すること",
  "learn.lesson.practice-game-preparation.goal2":
    "デジモンを育て、何ターンか使ってセキュリティ5枚を除き、最後に直接アタックすること",
  "learn.lesson.practice-game-preparation.done":
    "通常の準備済みの開始状態から、育成・進化・メモリーの受け渡しを経て、とどめのアタックまで行いました。",
  "learn.lesson.practice-game-preparation.step.intro":
    "デッキ50枚、手札各5枚、セキュリティ各5枚、メモリー0で始まります。自分が先攻で、最初の通常ドローを行いません。相手はパスするので、全体の流れを練習できます。",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "手札5枚とセキュリティ5枚を分けた後、各メインデッキには40枚残っています。デジタマデッキは別です。",
  "learn.lesson.practice-game-preparation.step.hatch":
    "デジタマデッキからKoromonを孵化させ、空の育成エリアに置いてください。",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "孵化はメモリーを払わず、ドローもしません。これでこのターンの育成の行動が終わります。",
  "learn.lesson.practice-game-preparation.step.rookie":
    "育成エリアのKoromonをAgumonに進化させてください。このルートはコスト0で、1枚ドローします。",
  "learn.lesson.practice-game-preparation.step.rookie.hint": "手札のAgumon ST1-03を使い、進化元にKoromonを選びます。",
  "learn.lesson.practice-game-preparation.step.champion":
    "育てたAgumonをGreymonに進化させ、メモリー2を払います。処理が終わると相手へターンが渡ります。",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "先攻の最初のターンでも、育成エリアでの進化はドローします。メモリーは0から相手側の2へ動きます。",
  "learn.lesson.practice-game-preparation.step.move":
    "相手のパスを待ち、次の自分の育成フェイズでGreymonをバトルエリアへ移動してください。",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "移動は新しいデジモンの登場ではありません。Greymonは移動したこのターンにアタックできます。",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "メモリー3でGreymonをGarudamonに進化させてください。Greymonの進化元効果Security Attack +1で、Garudamonは2枚チェックできます。",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "進化元の通常効果と進化元効果は異なります。Greymonの下の効果欄を読んでください。",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Garudamonでプレイヤーをアタックしてください。相手のセキュリティ5枚のうち2枚を、1枚ずつチェックします。",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "GarudamonのDPは、今回のセキュリティバトルを生き残れる値です。相手のセキュリティは3枚残ります。",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Biyomonをメモリー2で登場させてください。ターンが相手へ渡ります。Biyomonは最後のとどめに残します。",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "通常、登場したばかりのデジモンはこのターンにアタックできません。相手がパスすればBiyomonを使えます。",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "自分のターンにGarudamonでアタックし、レストしたらパスしてください。相手のセキュリティが0枚になるまで繰り返し、Biyomonはとどめに残します。",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "育成でできることがなければスキップします。Garudamonは1回で2枚チェックします。最後のセキュリティの後に余ったチェックが直接の一撃になることはありません。",
  "learn.lesson.practice-game-preparation.step.win":
    "相手のセキュリティは0枚です。Biyomonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "セキュリティを除いた後も、別の成功したアタックが必要です。Biyomonは前のターンに登場したので今はアタックできます。",
  "learn.lesson.practice-rule-checks.title": "ルールチェック：DP0のデジモンを消滅させる",
  "learn.lesson.practice-rule-checks.summary":
    "黄色のオプションでBlockerのDPを0未満にし、ルールで消滅した後Salamonで勝ちます。",
  "learn.lesson.practice-rule-checks.goal1": "オプションの色条件を満たし、DPマイナスを解決する方法",
  "learn.lesson.practice-rule-checks.goal2": "ルールチェックの消滅と、効果が直接指示する消滅の違い",
  "learn.lesson.practice-rule-checks.done":
    "Seven HeavensでMonochromonのDPが減り、ルールチェックで消滅しました。Salamonがとどめのアタックを行いました。",
  "learn.lesson.practice-rule-checks.step.intro":
    "相手のセキュリティは0枚ですが、MonochromonがSalamonをブロックできます。Seven HeavensはDP-10000し、バトルエリアのDP0以下のデジモンはルールで消滅します。",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamonがオプションの黄色の条件を満たします。自分のメモリーは9で、オプションのコストは7です。",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "手札のSeven Heavensを使い、相手のMonochromonを選んで対象を確定してください。効果解決後にトラッシュへ行くことを確認します。",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "オプションはDPを減らすだけです。結果がDP0以下になったとき、ルール17-1-3-1-1が消滅を行います。",
  "learn.lesson.practice-rule-checks.step.win":
    "Blockerはいなくなりました。Salamonでプレイヤーをアタックして勝ちましょう。",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamonはこのターンより前からバトルエリアにいました。オプションを使ってもメモリーが2残るので、自分のターンを続けられます。",
} satisfies Record<keyof typeof newDrillsEn, string>;
