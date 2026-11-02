import type { learnEn } from "@/i18n/learn/learn.en";
import type { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const learnJa = {
  "learn.eyebrow": "学ぶ",
  "learn.title": "デジモンカードゲームは初めてですか？",
  "learn.lede": "ガイド付きのボットと短いレッスンで対戦するか、自分のペースでルールを読みましょう。",
  "learn.startLesson": "レッスン{number}を始める",
  "learn.replayLessons": "レッスンをもう一度プレイ",
  "learn.readRules": "遊び方を読む",
  "learn.progress": "{total}レッスン中{completed}レッスン完了",
  "learn.guestNote":
    "ゲストとしてプレイ中です。進行状況はこのブラウザに保存されます。サインインすると、どのデバイスでも引き継げます。",
  "learn.lessonsHeading": "レッスン",
  "learn.lessonNumber": "レッスン{number}",
  "learn.minutes": "{minutes}分",
  "learn.status.done": "完了",
  "learn.status.next": "次",
  "learn.status.ready": "プレイ可能",
  "learn.status.locked": "ロック中",
  "learn.lockedReason": "先にレッスン1を終えてください",
  "learn.start": "開始",
  "learn.replay": "もう一度",
  "learn.rulesHeading": "遊び方",
  "learn.rulesLede": "ルールをわかりやすく、1つずつ説明します。",

  "learn.briefing.counter": "レッスン{number}/{total}",
  "learn.briefing.goals": "このレッスンで学ぶこと:",
  "learn.briefing.note": "デッキと盤面は用意されています。ボットは決まった簡単な動きをします。",
  "learn.briefing.drill": "キーワード練習",
  "learn.briefing.notNow": "今はしない",
  "learn.briefing.start": "レッスンを始める",

  "learn.coach.region": "レッスンコーチ",
  "learn.coach.counter": "ステップ{current}/{total}",
  "learn.coach.next": "次へ",
  "learn.coach.hint": "ヒント",
  "learn.coach.hideHint": "ヒントを隠す",
  "learn.coach.skip": "ステップを飛ばす",
  "learn.coach.restart": "やり直す",
  "learn.coach.done": "いいですね！",
  "learn.coach.collapse": "コーチを最小化",
  "learn.coach.expand": "コーチを表示",
  "learn.coach.move": "レッスンガイドを移動",
  "learn.coach.moveHelp": "ドラッグするか矢印キーで移動します。Homeキーで位置をリセットします。",
  "learn.coach.finished": "このレッスンの内容はすべて学びました。ゲームを最後まで進めると完了です。",
  "learn.coach.chip": "ステップ{current}/{total}",

  "learn.complete.title": "レッスン完了",
  "learn.complete.learned": "学んだこと:",
  "learn.complete.next": "次のレッスン",
  "learn.complete.back": "「学ぶ」に戻る",
  "learn.complete.readMore": "詳しく読む: {chapter}",
  "learn.complete.failedTitle": "レッスン未完了",
  "learn.complete.failedBody": "大丈夫です。もう一度挑戦しましょう。盤面は毎回リセットされます。",
  "learn.complete.tryAgain": "もう一度挑戦",

  "learn.lobbyButton": "遊び方を学ぶ",

  "learn.rules.back": "学ぶ",
  "learn.rules.contents": "目次",
  "learn.rules.previous": "前へ: {chapter}",
  "learn.rules.nextChapter": "次へ: {chapter}",
  "learn.rules.tryIt": "試してみる",
  "learn.rules.tryItLesson": "レッスン{number}: {title}",
  "learn.rules.tryDrillLabel": "《{keyword}》の練習をする",
  "learn.rules.officialRules": "公式総合ルール（PDF）",
  "learn.rules.keywordFilter": "キーワードを絞り込む",
  "learn.rules.keywordEmpty": "条件に合うキーワードはありません。",
  "learn.rules.keywordRule": "ルール{rule}",

  "learn.rules.goal.title": "勝利条件",
  "learn.rules.goal.p1":
    "各プレイヤーは、セキュリティと呼ばれる裏向きのカードの山を持っています。セキュリティはあなたを守ります。",
  "learn.rules.goal.p2":
    "アタックして相手のセキュリティを減らしましょう。相手のセキュリティが0枚になったら、もう一度アタックすると勝ちです。",
  "learn.rules.goal.p3": "相手がカードを引くときにデッキが0枚の場合も、あなたの勝ちです。",

  "learn.rules.deck.title": "デッキ",
  "learn.rules.deck.p1": "2つのデッキを使います。",
  "learn.rules.deck.p2": "メインデッキはちょうど50枚です。デジモン、テイマー、オプションで構成します。",
  "learn.rules.deck.p3": "デジタマデッキにはデジタマを5枚まで入れます。デジタマは育成エリアで孵化させます。",
  "learn.rules.deck.p4": "同じカード番号のカードは4枚まで入れられます。",

  "learn.rules.setup.title": "準備",
  "learn.rules.setup.p1": "両プレイヤーはデッキをシャッフルし、カードを5枚引きます。",
  "learn.rules.setup.p2": "手札が気に入らなければ、1回だけデッキに戻してシャッフルし、5枚引き直せます。",
  "learn.rules.setup.p3": "次に、各プレイヤーはデッキの上から5枚を裏向きのままセキュリティに置きます。",
  "learn.rules.setup.p4": "先攻のプレイヤーは、最初のターンにカードを引きません。",

  "learn.rules.turn.title": "ターンの流れ",
  "learn.rules.turn.p1": "各ターンには4つのフェイズがあり、いつも同じ順番で進みます。",
  "learn.rules.turn.p2": "アクティブ: レストしているカードをアクティブに戻します。",
  "learn.rules.turn.p3": "ドロー: カードを1枚引きます。",
  "learn.rules.turn.p4": "育成: デジタマを孵化させる、育成エリアからデジモンを移動する、または何もしません。",
  "learn.rules.turn.p5":
    "メイン: カードを登場させ、進化し、アタックします。メモリーが相手側に移るとターンが終わります。",
  "learn.rules.turn.phaseUnsuspend": "アクティブ",
  "learn.rules.turn.phaseDraw": "ドロー",
  "learn.rules.turn.phaseBreeding": "育成",
  "learn.rules.turn.phaseMain": "メイン",

  "learn.rules.breeding.title": "育成エリア",
  "learn.rules.breeding.p1": "育成エリアにはデジモンを1体置けます。デジモンを安全に育てる場所です。",
  "learn.rules.breeding.p2": "育成エリアが空なら孵化できます。デジタマデッキの一番上のカードをめくって置きます。",
  "learn.rules.breeding.p3": "そこにいるデジモンも、ほかのデジモンと同じように進化できます。",
  "learn.rules.breeding.p4":
    "育成エリアのデジモンはアタックできず、アタックされることもありません。Lv.3以上になったら、育成フェイズにバトルエリアへ移動しましょう。",

  "learn.rules.memory.title": "メモリー",
  "learn.rules.memory.p1":
    "両プレイヤーは1つのメモリーゲージを共有します。ゲージはあなた側の10から相手側の10まであります。",
  "learn.rules.memory.p2": "カードを登場させたり進化したりするときは、カウンターを相手側へ動かしてコストを支払います。",
  "learn.rules.memory.p3":
    "カウンターがあなた側か0にある間は、ターンが続きます。相手側に移るとターンが終わり、相手はそのメモリーでターンを始めます。",
  "learn.rules.memory.p4": "ターンを早めに終えることもできます。その場合、カウンターは相手側の3に移ります。",
  "learn.rules.memory.example": "メモリー3のとき、コスト5のデジモンを登場させます。カウンターは相手側の2に移ります。",

  "learn.rules.digivolve.title": "進化",
  "learn.rules.digivolve.p1": "手札のデジモンを、レベルが1つ低く同じ色を持つ自分のデジモンの上に重ねます。",
  "learn.rules.digivolve.p2": "進化コストを支払います。ふつうは登場コストより低いです。",
  "learn.rules.digivolve.p3": "進化するたびに、カードを1枚引きます。",
  "learn.rules.digivolve.p4":
    "下にあるカードは進化元として残ります。カードの下部に書かれた進化元効果は、引き続き働きます。",
  "learn.rules.digivolve.p5":
    "進化してもデジモンの状態は変わりません。アタックできたデジモンは、進化後もアタックできます。",

  "learn.rules.attack.title": "アタックとセキュリティ",
  "learn.rules.attack.p1":
    "自分のデジモンを1体レストしてアタックします。相手プレイヤーか、相手のレスト状態のデジモンをアタックできます。",
  "learn.rules.attack.p2": "登場させたターンには、《速攻》を持たないデジモンはアタックできません。",
  "learn.rules.attack.p3":
    "相手プレイヤーにアタックすると、相手はセキュリティの一番上のカードをめくります。デジモンなら2体がバトルし、DPが低いほうが消滅します。DPが同じなら両方とも消滅します。",
  "learn.rules.attack.p4":
    "テイマーかオプションなら、その【セキュリティ】効果が発揮されます。その後、カードはトラッシュに置かれます。",
  "learn.rules.attack.p5": "相手のセキュリティが0枚のとき、次に相手プレイヤーへアタックすると勝ちです。",
  "learn.rules.attack.flowAttack": "アタック",
  "learn.rules.attack.flowCheck": "セキュリティの一番上をめくる",
  "learn.rules.attack.flowBattle": "デジモン: DPを比べる",
  "learn.rules.attack.flowEffect": "テイマーかオプション: 【セキュリティ】効果",
  "learn.rules.attack.flowWin": "セキュリティが0枚: あなたの勝ち",

  "learn.rules.blocking.title": "ブロック",
  "learn.rules.blocking.p1": "《ブロッカー》を持つデジモンがいます。",
  "learn.rules.blocking.p2":
    "相手がアタックしたとき、アクティブ状態の《ブロッカー》を持つデジモンをレストできます。するとアタックの対象がそのデジモンに変わります。",
  "learn.rules.blocking.p3": "2体のデジモンがバトルします。そのアタックでセキュリティは減りません。",

  "learn.rules.cardTypes.title": "カードの種類",
  "learn.rules.cardTypes.p1": "デジタマ: Lv.2です。デジタマデッキに入れ、育成エリアで孵化させます。",
  "learn.rules.cardTypes.p2":
    "デジモン: レベル、DP、登場コスト、そしてふつうは進化コストを持ちます。デジモンはアタックとバトルをします。",
  "learn.rules.cardTypes.p3": "テイマー: 自分の場に残り、効果を発揮し続けます。テイマーはアタックできません。",
  "learn.rules.cardTypes.p4":
    "オプション: コストを支払い、効果を1回使ってからトラッシュに置きます。自分の場に同じ色のデジモンかテイマーが必要です。",
  "learn.rules.cardTypes.p5":
    "進化元効果: デジモンカードの下部にあるテキストです。そのカードがほかのデジモンの下にある間に働きます。",

  "learn.rules.keywords.title": "キーワード",
  "learn.rules.keywords.p1":
    "キーワードはよく使う効果の短い名前で、《ブロッカー》のように括弧で書かれます。この一覧では英語版カードに印刷された英語名を使います。",

  "learn.rules.levels.egg": "Lv.2 デジタマ",
  "learn.rules.levels.rookie": "Lv.3 成長期",
  "learn.rules.levels.champion": "Lv.4 成熟期",
  "learn.rules.levels.ultimate": "Lv.5 完全体",
  "learn.rules.levels.mega": "Lv.6 究極体",
  "learn.rules.levels.draw": "+1枚",
  "learn.rules.memory.you": "あなた",
  "learn.rules.memory.opponent": "相手",

  "learn.lesson.tutorial-attack-security.title": "アタックして勝つ",
  "learn.lesson.tutorial-attack-security.summary":
    "デジモンで最後のセキュリティを破り、相手プレイヤーにアタックします。",
  "learn.lesson.tutorial-attack-security.goal1": "相手のセキュリティにアタックする方法",
  "learn.lesson.tutorial-attack-security.goal2": "ダイレクトアタックで勝つ方法",
  "learn.lesson.tutorial-attack-security.done":
    "最後のセキュリティを破り、相手プレイヤーにダイレクトアタックして勝ちました。",
  "learn.lesson.tutorial-attack-security.step.intro":
    "相手のセキュリティが0枚のときに自分のデジモンがアタックすると勝ちです。相手のセキュリティは1枚です。",
  "learn.lesson.tutorial-attack-security.step.intro.hint":
    "自分のデジモンは下側の場にいます。相手のセキュリティは上側にあります。",
  "learn.lesson.tutorial-attack-security.step.attack-security":
    "バードラモンでアタックします。バードラモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-attack-security.step.attack-security.hint":
    "プレイヤーへのアタック1回ごとに、セキュリティを1枚チェックします。セキュリティのデジモンはアタックしたデジモンとバトルし、DPが高いほうが勝ちます。",
  "learn.lesson.tutorial-attack-security.step.security-gone":
    "バードラモンのDPはセキュリティのゴマモンより高かったので、そのカードはトラッシュに置かれました。バードラモンはレスト状態、つまり横向きになりました。",
  "learn.lesson.tutorial-attack-security.step.security-gone.hint":
    "レスト状態のデジモンは、このターンもうアタックできません。次の自分のターンの開始時にアクティブに戻ります。",
  "learn.lesson.tutorial-attack-security.step.attack-player":
    "相手のセキュリティは0枚です。ドラコモンでアタックして勝ちましょう。ドラコモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-attack-security.step.attack-player.hint":
    "セキュリティが0枚のプレイヤーへのアタックで、ゲームは終わります。これが主な勝ち方です。",

  "learn.lesson.tutorial-hatch.title": "育成エリア",
  "learn.lesson.tutorial-hatch.summary": "育成エリアでデジモンを育て、新しいデジモンがいつアタックできるかを学びます。",
  "learn.lesson.tutorial-hatch.goal1": "デジタマを孵化させ、育成エリアからデジモンを移動する方法",
  "learn.lesson.tutorial-hatch.goal2": "登場させたばかりのデジモンがアタックできない理由",
  "learn.lesson.tutorial-hatch.done":
    "育成エリアを使い、新しいデジモンの最初のターンを待って、そのデジモンで勝ちました。",
  "learn.lesson.tutorial-hatch.step.intro":
    "育成エリアはデジモンを安全に育てる場所です。相手はアタックも対象に選ぶこともできません。育成の行動は毎ターン1回できます。",
  "learn.lesson.tutorial-hatch.step.intro.hint":
    "育成の行動はメインフェイズの前に行います。デジタマを孵化させる、デジモンを移動する、または何もしません。",
  "learn.lesson.tutorial-hatch.step.move-out":
    "育成エリアのドラコモンは準備ができています。育成エリアのドラコモンをクリックし、場に移動してください。",
  "learn.lesson.tutorial-hatch.step.move-out.hint":
    "育成エリアから出られるのはLv.3以上のデジモンだけです。移動したデジモンは、そのターンにアタックできます。",
  "learn.lesson.tutorial-hatch.step.play-biyomon":
    "ピヨモンを登場させます。手札のピヨモンを場にドラッグしてください。コストはメモリー2です。",
  "learn.lesson.tutorial-hatch.step.play-biyomon.hint":
    "手札から登場させたデジモンは、そのターンにはアタックできません。これを召喚酔いと呼びます。",
  "learn.lesson.tutorial-hatch.step.attack-security":
    "ピヨモンは待つ必要がありますが、ドラコモンはアタックできます。ドラコモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-hatch.step.attack-security.hint":
    "ドラコモンはDP4000なので、セキュリティにいるDP3000のゴマモンに勝ちます。",
  "learn.lesson.tutorial-hatch.step.end-turn":
    "ほかにできることはありません。「ターン終了」をクリックして、ボットにターンを渡してください。",
  "learn.lesson.tutorial-hatch.step.end-turn.hint": "ターンを渡すと、ボットはメモリー3でターンを始めます。",
  "learn.lesson.tutorial-hatch.step.hatch":
    "育成エリアがまた空になりました。デジタマデッキをクリックして、コロモンを孵化させてください。",
  "learn.lesson.tutorial-hatch.step.hatch.hint":
    "孵化すると、デジタマデッキの一番上のカードが育成エリアに置かれます。孵化できるのは育成エリアが空のときだけです。",
  "learn.lesson.tutorial-hatch.step.attack-player":
    "ピヨモンはもう新しくないので、アタックできます。ピヨモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックして勝ちましょう。",
  "learn.lesson.tutorial-hatch.step.attack-player.hint": "召喚酔いは、デジモンを登場させたターンの間だけ続きます。",

  "learn.lesson.tutorial-memory.title": "メモリー",
  "learn.lesson.tutorial-memory.summary":
    "メモリーを支払ってデジモンを登場させ、メモリーでターンの終わりが決まる仕組みを見ます。",
  "learn.lesson.tutorial-memory.goal1": "メモリーを支払ってカードを登場させる方法",
  "learn.lesson.tutorial-memory.goal2": "メモリーが相手側に移るとターンが終わる理由",
  "learn.lesson.tutorial-memory.done": "メモリーを支払い、ボットにターンを渡し、登場させたデジモンで勝ちました。",
  "learn.lesson.tutorial-memory.step.intro":
    "メモリーは、あなたと相手の間にあるカウンターです。あなたのメモリーは3です。カードを登場させるたびに、カウンターは相手側へ動きます。",
  "learn.lesson.tutorial-memory.step.intro.hint":
    "カウンターが0を越えて相手側に移ると、あなたのターンが終わり、相手のターンが始まります。",
  "learn.lesson.tutorial-memory.step.play-biyomon":
    "ピヨモンを登場させます。手札のピヨモンを場にドラッグしてください。コストはメモリー2です。",
  "learn.lesson.tutorial-memory.step.play-biyomon.hint": "登場コストは、カードの左上にある数字です。",
  "learn.lesson.tutorial-memory.step.play-birdramon":
    "残りのメモリーは1です。それでもバードラモンを登場させます。手札のバードラモンを場にドラッグしてください。コストはメモリー4です。",
  "learn.lesson.tutorial-memory.step.play-birdramon.hint":
    "持っている以上のメモリーを支払えます。カウンターは相手側の3に移り、あなたのターンが終わります。",
  "learn.lesson.tutorial-memory.step.attack-security":
    "ボットがターンを渡したので、あなたはメモリー3で始めます。バードラモンでアタックします。バードラモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-memory.step.attack-security.hint":
    "どちらのデジモンも前のターンに登場させたので、今はアタックできます。",
  "learn.lesson.tutorial-memory.step.attack-player":
    "相手のセキュリティは0枚です。ピヨモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックして勝ちましょう。",
  "learn.lesson.tutorial-memory.step.attack-player.hint":
    "アタックにメモリーは必要ありません。メモリーを使うのは、カードの登場と進化だけです。",

  "learn.lesson.tutorial-digivolve.title": "進化",
  "learn.lesson.tutorial-digivolve.summary": "成長期をより強い成熟期に進化させ、アタックします。",
  "learn.lesson.tutorial-digivolve.goal1": "進化して進化コストを支払う方法",
  "learn.lesson.tutorial-digivolve.goal2": "進化元と進化元効果の仕組み",
  "learn.lesson.tutorial-digivolve.done":
    "アグモンをグレイモンに進化させ、ボーナスでカードを1枚引き、より強いデジモンで勝ちました。",
  "learn.lesson.tutorial-digivolve.step.intro":
    "アグモンはLv.3の成長期です。Lv.4の成熟期であるグレイモンに進化できます。グレイモンを登場させるより少ないメモリーで済みます。",
  "learn.lesson.tutorial-digivolve.step.intro.hint":
    "カードは、色とレベルが合うデジモンから進化できます。進化コストはカードに書かれています。",
  "learn.lesson.tutorial-digivolve.step.digivolve":
    "手札のグレイモンをアグモンの上にドラッグしてください。進化のコストはメモリー2です。",
  "learn.lesson.tutorial-digivolve.step.digivolve.hint":
    "グレイモンを登場させるとメモリー5かかります。進化のほうが安く、アグモンはアタックできる状態のままです。",
  "learn.lesson.tutorial-digivolve.step.bonus":
    "進化のボーナスでカードを1枚引きました。アグモンは進化元としてグレイモンの下にあります。",
  "learn.lesson.tutorial-digivolve.step.bonus.hint":
    "デジモンの下にあるカードは進化元効果を与えます。アグモンは自分のターンの間グレイモンにDP+1000を与えるので、グレイモンはDP5000です。",
  "learn.lesson.tutorial-digivolve.step.attack-security":
    "グレイモンでアタックします。グレイモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-digivolve.step.attack-security.hint":
    "進化したデジモンは同じデジモンのままなので、このターンにアタックできます。",
  "learn.lesson.tutorial-digivolve.step.attack-player":
    "相手のセキュリティは0枚です。ピヨモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックして勝ちましょう。",
  "learn.lesson.tutorial-digivolve.step.attack-player.hint":
    "進化すれば、新しいカードの召喚酔いなしにデジモンを強くできます。",

  "learn.lesson.tutorial-block.title": "ブロック",
  "learn.lesson.tutorial-block.summary": "《ブロッカー》でアタックを止め、自分のターンに勝ちます。",
  "learn.lesson.tutorial-block.goal1": "《ブロッカー》を持つデジモンがあなたを守る仕組み",
  "learn.lesson.tutorial-block.goal2": "2体のデジモンのバトルの仕組み",
  "learn.lesson.tutorial-block.done": "モノクロモンでボットのアタックをブロックし、次の自分のターンに勝ちました。",
  "learn.lesson.tutorial-block.step.intro":
    "ボットのターンです。あなたのモノクロモンは《ブロッカー》を持っています。相手のデジモンがアタックしたとき、割り込めます。",
  "learn.lesson.tutorial-block.step.intro.hint":
    "《ブロッカー》は相手のターンに働きます。ブロックするには、デジモンがアクティブ状態である必要があります。",
  "learn.lesson.tutorial-block.step.incoming-attack":
    "ボットのゴマモンがアタックしようとしています。ブロックの確認が出るまで待ってください。",
  "learn.lesson.tutorial-block.step.incoming-attack.hint":
    "ブロックしなければ、ゴマモンはあなたのセキュリティを1枚チェックします。",
  "learn.lesson.tutorial-block.step.block":
    "モノクロモンでブロックします。ブロックの確認でモノクロモンを選んでください。",
  "learn.lesson.tutorial-block.step.block.hint":
    "モノクロモンはDP5000、ゴマモンはDP3000です。DPが低いデジモンが消滅します。",
  "learn.lesson.tutorial-block.step.your-turn":
    "モノクロモンはバトルに勝ち、今はレスト状態です。ボットがターンを終えるまで待ってください。",
  "learn.lesson.tutorial-block.step.your-turn.hint":
    "ブロックするとデジモンはレストします。自分のターンの開始時にアクティブに戻るので、アタックもできます。",
  "learn.lesson.tutorial-block.step.attack-security":
    "あなたのターンです。モノクロモンでアタックします。モノクロモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-block.step.attack-security.hint":
    "モノクロモンはDP5000なので、セキュリティにいるDP4000のBearmonに勝ちます。",
  "learn.lesson.tutorial-block.step.attack-player":
    "相手のセキュリティは0枚です。バードラモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックして勝ちましょう。",
  "learn.lesson.tutorial-block.step.attack-player.hint":
    "ボットにはブロックできるデジモンが残っていないので、アタックは通ります。",

  "learn.lesson.tutorial-tamers.title": "テイマー",
  "learn.lesson.tutorial-tamers.summary": "テイマーを登場させてデジモンを強化し、進化元効果を使って勝ちます。",
  "learn.lesson.tutorial-tamers.goal1": "テイマーが場に残ってデジモンを助ける仕組み",
  "learn.lesson.tutorial-tamers.goal2": "進化元効果でより多くのセキュリティをチェックする方法",
  "learn.lesson.tutorial-tamers.done":
    "八神太一を登場させ、Garudamonでセキュリティを2枚チェックし、ドラコモンで勝ちました。",
  "learn.lesson.tutorial-tamers.step.intro":
    "相手のセキュリティは2枚です。DPが足りれば、Garudamonは1回のアタックで両方を破れます。",
  "learn.lesson.tutorial-tamers.step.intro.hint":
    "テイマーは場に残るカードです。アタックはしませんが、その効果がデジモンを助けます。",
  "learn.lesson.tutorial-tamers.step.play-tamer":
    "八神太一を登場させます。手札の八神太一を場にドラッグしてください。コストはメモリー2です。",
  "learn.lesson.tutorial-tamers.step.play-tamer.hint":
    "八神太一は、自分のターンの間、自分のデジモンすべてにDP+1000を与えます。GarudamonはDP8000になりました。",
  "learn.lesson.tutorial-tamers.step.inherited":
    "グレイモンはGarudamonの下にあります。その進化元効果でGarudamonは《セキュリティアタック+1》を得るので、セキュリティを2枚チェックします。",
  "learn.lesson.tutorial-tamers.step.inherited.hint":
    "Garudamonを開くと進化元を確認できます。それぞれが進化元効果を与えられます。",
  "learn.lesson.tutorial-tamers.step.attack-security":
    "Garudamonでアタックします。Garudamonをクリックし、「アタック」を選んでから相手のセキュリティをクリックしてください。",
  "learn.lesson.tutorial-tamers.step.attack-security.hint":
    "2枚目のセキュリティはDP7000のWereGarurumonです。八神太一がいなければ同じDPになり、両方のデジモンが消滅します。",
  "learn.lesson.tutorial-tamers.step.attack-player":
    "相手のセキュリティは0枚です。ドラコモンをクリックし、「アタック」を選んでから相手のセキュリティをクリックして勝ちましょう。",
  "learn.lesson.tutorial-tamers.step.attack-player.hint": "テイマーの効果は、テイマーが場にいる限り働き続けます。",
} satisfies Record<keyof typeof learnEn | keyof typeof learnLessonsEn, string>;
