import type { learnEn } from "@/i18n/learn/learn.en";
import type { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const learnId = {
  "learn.eyebrow": "Belajar",
  "learn.title": "Baru mengenal Digimon TCG?",
  "learn.lede": "Mainkan pelajaran singkat melawan bot pemandu, atau baca aturannya sesuai kecepatan Anda.",
  "learn.startLesson": "Mulai pelajaran {number}",
  "learn.replayLessons": "Mainkan pelajaran lagi",
  "learn.readRules": "Baca Cara Bermain",
  "learn.progress": "{completed} dari {total} pelajaran selesai",
  "learn.guestNote":
    "Anda bermain sebagai tamu. Progres Anda tersimpan di browser ini. Masuk untuk menyimpannya di semua perangkat.",
  "learn.lessonsHeading": "Pelajaran",
  "learn.lessonNumber": "Pelajaran {number}",
  "learn.minutes": "{minutes} mnt",
  "learn.status.done": "Selesai",
  "learn.status.next": "Berikutnya",
  "learn.status.ready": "Siap",
  "learn.status.locked": "Terkunci",
  "learn.lockedReason": "Selesaikan pelajaran 1 terlebih dahulu",
  "learn.start": "Mulai",
  "learn.replay": "Main lagi",
  "learn.rulesHeading": "Cara Bermain",
  "learn.rulesLede": "Aturan dengan kata-kata sederhana, satu topik setiap kali.",

  "learn.briefing.counter": "Pelajaran {number} dari {total}",
  "learn.briefing.goals": "Anda akan belajar:",
  "learn.briefing.note": "Deck dan papan sudah disiapkan untuk Anda. Bot memainkan permainan yang sederhana dan tetap.",
  "learn.briefing.drill": "Latihan keyword",
  "learn.briefing.notNow": "Nanti saja",
  "learn.briefing.start": "Mulai pelajaran",

  "learn.coach.region": "Pemandu pelajaran",
  "learn.coach.counter": "Langkah {current} dari {total}",
  "learn.coach.next": "Berikutnya",
  "learn.coach.hint": "Petunjuk",
  "learn.coach.hideHint": "Sembunyikan petunjuk",
  "learn.coach.skip": "Lewati langkah",
  "learn.coach.restart": "Mulai ulang",
  "learn.coach.done": "Bagus!",
  "learn.coach.collapse": "Kecilkan pemandu",
  "learn.coach.expand": "Tampilkan pemandu",
  "learn.coach.move": "Pindahkan pemandu pelajaran",
  "learn.coach.moveHelp": "Seret untuk memindahkan atau gunakan tombol panah. Tekan Home untuk mengembalikan posisi.",
  "learn.coach.finished": "Anda sudah tahu semua hal untuk pelajaran ini. Selesaikan permainan untuk menuntaskannya.",
  "learn.coach.chip": "Langkah {current} dari {total}",

  "learn.complete.title": "Pelajaran selesai",
  "learn.complete.learned": "Anda telah belajar:",
  "learn.complete.next": "Pelajaran berikutnya",
  "learn.complete.back": "Kembali ke Belajar",
  "learn.complete.readMore": "Baca selengkapnya: {chapter}",
  "learn.complete.failedTitle": "Pelajaran belum selesai",
  "learn.complete.failedBody": "Tidak masalah. Coba pelajaran ini lagi. Papan diatur ulang setiap kali.",
  "learn.complete.tryAgain": "Coba lagi",

  "learn.lobbyButton": "Belajar bermain",

  "learn.rules.back": "Belajar",
  "learn.rules.contents": "Daftar isi",
  "learn.rules.previous": "Sebelumnya: {chapter}",
  "learn.rules.nextChapter": "Berikutnya: {chapter}",
  "learn.rules.tryIt": "Coba",
  "learn.rules.tryItLesson": "Pelajaran {number}: {title}",
  "learn.rules.tryDrillLabel": "Coba latihan untuk <{keyword}>",
  "learn.rules.officialRules": "Aturan Lengkap Resmi (PDF, bahasa Inggris)",
  "learn.rules.keywordFilter": "Filter keyword",
  "learn.rules.keywordEmpty": "Tidak ada keyword yang cocok dengan filter Anda.",
  "learn.rules.keywordRule": "Aturan {rule}",

  "learn.rules.goal.title": "Tujuan",
  "learn.rules.goal.p1": "Setiap pemain punya tumpukan kartu tertutup yang disebut security. Security melindungi Anda.",
  "learn.rules.goal.p2":
    "Serang untuk membuang kartu security lawan. Saat lawan tidak punya security lagi, serang sekali lagi untuk menang.",
  "learn.rules.goal.p3": "Anda juga menang jika lawan harus draw kartu dan deck-nya kosong.",

  "learn.rules.deck.title": "Deck Anda",
  "learn.rules.deck.p1": "Anda bermain dengan dua deck.",
  "learn.rules.deck.p2": "Deck utama berisi tepat 50 kartu: Digimon, Tamer, dan Option.",
  "learn.rules.deck.p3": "Deck Digi-Egg berisi hingga 5 Digi-Egg. Anda hatch Digi-Egg di breeding area.",
  "learn.rules.deck.p4": "Anda boleh memakai hingga 4 salinan kartu dengan nomor kartu yang sama.",

  "learn.rules.setup.title": "Persiapan",
  "learn.rules.setup.p1": "Kedua pemain mengocok deck dan draw 5 kartu.",
  "learn.rules.setup.p2":
    "Jika tidak suka kartu di tangan, Anda dapat mengocoknya kembali dan draw 5 kartu baru sekali.",
  "learn.rules.setup.p3": "Lalu setiap pemain menaruh 5 kartu teratas deck-nya secara tertutup sebagai security.",
  "learn.rules.setup.p4": "Pemain yang jalan pertama tidak draw pada giliran pertama.",

  "learn.rules.turn.title": "Satu giliran",
  "learn.rules.turn.p1": "Setiap giliran punya empat phase, selalu dengan urutan yang sama.",
  "learn.rules.turn.p2": "Unsuspend: kartu Anda yang suspend berdiri tegak lagi.",
  "learn.rules.turn.p3": "Draw: draw 1 kartu.",
  "learn.rules.turn.p4":
    "Breeding: hatch Digi-Egg, pindahkan Digimon keluar dari breeding area, atau tidak melakukan apa pun.",
  "learn.rules.turn.p5":
    "Main: mainkan kartu, digivolve, dan serang. Giliran Anda berakhir saat memory pindah ke sisi lawan.",
  "learn.rules.turn.phaseUnsuspend": "Unsuspend",
  "learn.rules.turn.phaseDraw": "Draw",
  "learn.rules.turn.phaseBreeding": "Breeding",
  "learn.rules.turn.phaseMain": "Main",

  "learn.rules.breeding.title": "Breeding area",
  "learn.rules.breeding.p1": "Breeding area menampung satu Digimon. Di sana Digimon dapat tumbuh dengan aman.",
  "learn.rules.breeding.p2": "Jika area itu kosong, Anda dapat hatch: buka kartu teratas deck Digi-Egg Anda ke sana.",
  "learn.rules.breeding.p3": "Anda dapat digivolve Digimon di sana seperti Digimon lain.",
  "learn.rules.breeding.p4":
    "Digimon di breeding area tidak dapat menyerang dan tidak dapat diserang. Saat level-nya 3 atau lebih, pindahkan ke battle area pada breeding phase Anda.",

  "learn.rules.memory.title": "Memory",
  "learn.rules.memory.p1":
    "Kedua pemain berbagi satu pengukur memory. Nilainya dari 10 di sisi Anda sampai 10 di sisi lawan.",
  "learn.rules.memory.p2":
    "Untuk memainkan atau digivolve kartu, bayar biayanya dengan menggeser penanda ke arah lawan.",
  "learn.rules.memory.p3":
    "Giliran Anda berlanjut selama penanda ada di sisi Anda atau di 0. Saat penanda mencapai sisi lawan, giliran Anda berakhir dan lawan mulai dengan memory itu.",
  "learn.rules.memory.p4": "Anda juga dapat mengakhiri giliran lebih awal. Penanda lalu pindah ke 3 di sisi lawan.",
  "learn.rules.memory.example": "Memory 3. Anda memainkan Digimon dengan biaya 5. Penanda pindah ke 2 di sisi lawan.",

  "learn.rules.digivolve.title": "Digivolve",
  "learn.rules.digivolve.p1":
    "Taruh Digimon dari tangan di atas salah satu Digimon Anda yang satu level lebih rendah dan punya warna yang sama.",
  "learn.rules.digivolve.p2": "Bayar digivolution cost. Biasanya lebih murah daripada play cost.",
  "learn.rules.digivolve.p3": "Setiap kali digivolve, Anda draw 1 kartu.",
  "learn.rules.digivolve.p4":
    "Kartu di bawahnya tetap menjadi kartu digivolution. Inherited effect-nya, yang tercetak di bagian bawah kartu, tetap berlaku.",
  "learn.rules.digivolve.p5":
    "Digivolve tidak mengubah status Digimon. Digimon yang tadinya dapat menyerang tetap dapat menyerang setelah digivolve.",

  "learn.rules.attack.title": "Serangan dan security",
  "learn.rules.attack.p1":
    "Suspend salah satu Digimon Anda untuk menyerang. Digimon itu dapat menyerang lawan, atau salah satu Digimon lawan yang suspend.",
  "learn.rules.attack.p2": "Digimon tidak dapat menyerang pada giliran Anda memainkannya, kecuali punya <Rush>.",
  "learn.rules.attack.p3":
    "Saat Anda menyerang lawan, lawan membuka kartu security teratasnya. Jika itu Digimon, kedua Digimon bertarung: yang DP-nya lebih rendah di-delete. Jika DP sama, keduanya di-delete.",
  "learn.rules.attack.p4": "Jika itu Tamer atau Option, efek [Security]-nya aktif. Lalu kartu itu masuk ke trash.",
  "learn.rules.attack.p5":
    "Saat lawan tidak punya kartu security lagi, serangan Anda berikutnya ke lawan memenangkan permainan.",
  "learn.rules.attack.flowAttack": "Serang",
  "learn.rules.attack.flowCheck": "Periksa kartu security teratas",
  "learn.rules.attack.flowBattle": "Digimon: bandingkan DP",
  "learn.rules.attack.flowEffect": "Tamer atau Option: efek [Security]",
  "learn.rules.attack.flowWin": "Security habis: Anda menang",

  "learn.rules.blocking.title": "Block",
  "learn.rules.blocking.p1": "Beberapa Digimon punya <Blocker>.",
  "learn.rules.blocking.p2":
    "Saat lawan menyerang, Anda boleh suspend Digimon dengan <Blocker> yang belum suspend. Serangan lalu mengarah ke Digimon itu.",
  "learn.rules.blocking.p3": "Kedua Digimon bertarung. Security Anda aman dari serangan itu.",

  "learn.rules.cardTypes.title": "Jenis kartu",
  "learn.rules.cardTypes.p1": "Digi-Egg: level 2. Ada di deck Digi-Egg Anda dan di-hatch di breeding area.",
  "learn.rules.cardTypes.p2":
    "Digimon: punya level, DP, play cost, dan biasanya digivolution cost. Digimon menyerang dan bertarung.",
  "learn.rules.cardTypes.p3":
    "Tamer: tetap berada di field Anda dan memberi efek yang terus berlaku. Tamer tidak dapat menyerang.",
  "learn.rules.cardTypes.p4":
    "Option: bayar biayanya, gunakan efeknya sekali, lalu masukkan ke trash. Anda perlu Digimon atau Tamer berwarna sama di field Anda.",
  "learn.rules.cardTypes.p5":
    "Inherited effect: teks di bagian bawah kartu Digimon. Efek ini berlaku selama kartu itu ada di bawah Digimon lain.",

  "learn.rules.keywords.title": "Keyword",
  "learn.rules.keywords.p1":
    "Keyword adalah nama singkat untuk efek umum, ditulis dalam tanda kurung sudut seperti <Blocker>. Teks kartu dicetak dalam bahasa Inggris, jadi daftar ini juga.",

  "learn.rules.levels.egg": "Lv.2 Digi-Egg",
  "learn.rules.levels.rookie": "Lv.3 Rookie",
  "learn.rules.levels.champion": "Lv.4 Champion",
  "learn.rules.levels.ultimate": "Lv.5 Ultimate",
  "learn.rules.levels.mega": "Lv.6 Mega",
  "learn.rules.levels.draw": "+1 kartu",
  "learn.rules.memory.you": "Anda",
  "learn.rules.memory.opponent": "Lawan",

  "learn.lesson.tutorial-attack-security.title": "Serang dan menang",
  "learn.lesson.tutorial-attack-security.summary":
    "Gunakan Digimon Anda untuk menembus kartu security terakhir dan menyerang pemain.",
  "learn.lesson.tutorial-attack-security.goal1": "Cara menyerang security lawan",
  "learn.lesson.tutorial-attack-security.goal2": "Cara serangan langsung memenangkan permainan",
  "learn.lesson.tutorial-attack-security.done":
    "Anda menang dengan menembus kartu security terakhir, lalu menyerang pemain secara langsung.",
  "learn.lesson.tutorial-attack-security.step.intro":
    "Anda menang saat lawan tidak punya kartu security lagi dan salah satu Digimon Anda menyerangnya. Lawan punya 1 kartu security.",
  "learn.lesson.tutorial-attack-security.step.intro.hint":
    "Digimon Anda ada di field bagian bawah. Tumpukan security lawan ada di bagian atas.",
  "learn.lesson.tutorial-attack-security.step.attack-security":
    "Serang dengan Birdramon. Klik Birdramon, pilih Serang, lalu klik tumpukan security lawan untuk menyerang.",
  "learn.lesson.tutorial-attack-security.step.attack-security.hint":
    "Setiap serangan ke pemain memeriksa 1 kartu security. Digimon di security bertarung dengan penyerang Anda, dan DP yang lebih tinggi menang.",
  "learn.lesson.tutorial-attack-security.step.security-gone":
    "DP Birdramon lebih tinggi daripada Gomamon dari security, jadi kartu itu masuk ke trash. Birdramon sekarang suspend, artinya kartunya diputar menyamping.",
  "learn.lesson.tutorial-attack-security.step.security-gone.hint":
    "Digimon yang suspend tidak dapat menyerang lagi pada giliran ini. Digimon itu unsuspend di awal giliran Anda berikutnya.",
  "learn.lesson.tutorial-attack-security.step.attack-player":
    "Lawan tidak punya security lagi. Serang dengan Dracomon untuk menang. Klik Dracomon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-attack-security.step.attack-player.hint":
    "Serangan ke pemain yang tidak punya kartu security mengakhiri permainan. Itulah cara utama untuk menang.",

  "learn.lesson.tutorial-hatch.title": "Breeding area",
  "learn.lesson.tutorial-hatch.summary":
    "Besarkan Digimon di breeding area dan pelajari kapan Digimon baru dapat menyerang.",
  "learn.lesson.tutorial-hatch.goal1": "Cara hatch Digi-Egg dan memindahkan Digimon keluar dari breeding area",
  "learn.lesson.tutorial-hatch.goal2": "Mengapa Digimon yang baru dimainkan tidak dapat menyerang",
  "learn.lesson.tutorial-hatch.done":
    "Anda memakai breeding area, menunggu giliran pertama Digimon baru berlalu, lalu menang dengannya.",
  "learn.lesson.tutorial-hatch.step.intro":
    "Breeding area adalah tempat aman untuk membesarkan Digimon. Lawan tidak dapat menyerang atau menargetkannya. Anda dapat melakukan 1 aksi breeding setiap giliran.",
  "learn.lesson.tutorial-hatch.step.intro.hint":
    "Aksi breeding dilakukan sebelum main phase: hatch Digi-Egg, pindahkan Digimon keluar, atau tidak melakukan apa pun.",
  "learn.lesson.tutorial-hatch.step.move-out":
    "Dracomon sudah siap di breeding area Anda. Klik Dracomon di breeding area, lalu pindahkan ke field.",
  "learn.lesson.tutorial-hatch.step.move-out.hint":
    "Hanya Digimon level 3 atau lebih yang dapat keluar dari breeding area. Digimon yang Anda pindahkan keluar dapat menyerang pada giliran yang sama.",
  "learn.lesson.tutorial-hatch.step.play-biyomon":
    "Mainkan Biyomon. Seret Biyomon dari tangan ke field. Biayanya 2 memory.",
  "learn.lesson.tutorial-hatch.step.play-biyomon.hint":
    "Digimon yang Anda mainkan dari tangan tidak dapat menyerang pada giliran saat dimainkan. Ini disebut summoning sickness.",
  "learn.lesson.tutorial-hatch.step.attack-security":
    "Biyomon harus menunggu, tetapi Dracomon dapat menyerang. Klik Dracomon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-hatch.step.attack-security.hint":
    "Dracomon punya 4000 DP, jadi Dracomon mengalahkan Gomamon 3000 DP di security.",
  "learn.lesson.tutorial-hatch.step.end-turn":
    "Tidak ada lagi yang perlu dilakukan. Klik Akhiri giliran untuk memberikan giliran ke bot.",
  "learn.lesson.tutorial-hatch.step.end-turn.hint":
    "Saat Anda mengakhiri giliran, bot memulai gilirannya dengan 3 memory.",
  "learn.lesson.tutorial-hatch.step.hatch":
    "Breeding area Anda kosong lagi. Klik deck Digi-Egg Anda untuk hatch Koromon.",
  "learn.lesson.tutorial-hatch.step.hatch.hint":
    "Hatch menaruh kartu teratas deck Digi-Egg Anda ke breeding area. Anda hanya dapat hatch saat breeding area kosong.",
  "learn.lesson.tutorial-hatch.step.attack-player":
    "Biyomon tidak baru lagi, jadi Biyomon dapat menyerang. Klik Biyomon, pilih Serang, lalu klik tumpukan security lawan untuk menang.",
  "learn.lesson.tutorial-hatch.step.attack-player.hint":
    "Summoning sickness hanya berlaku pada giliran saat Anda memainkan Digimon.",

  "learn.lesson.tutorial-memory.title": "Memory",
  "learn.lesson.tutorial-memory.summary":
    "Bayar memory untuk memainkan Digimon dan lihat bagaimana memory menentukan kapan giliran Anda berakhir.",
  "learn.lesson.tutorial-memory.goal1": "Cara membayar memory untuk memainkan kartu",
  "learn.lesson.tutorial-memory.goal2": "Mengapa giliran Anda berakhir saat memory pindah ke sisi lawan",
  "learn.lesson.tutorial-memory.done":
    "Anda membayar memory, memberikan giliran ke bot, dan menang dengan Digimon yang Anda mainkan.",
  "learn.lesson.tutorial-memory.step.intro":
    "Memory adalah penanda di antara Anda dan lawan. Anda punya 3 memory. Setiap kartu yang Anda mainkan menggeser penanda ke arah lawan.",
  "learn.lesson.tutorial-memory.step.intro.hint":
    "Saat penanda melewati 0 ke sisi lawan, giliran Anda berakhir dan giliran lawan dimulai.",
  "learn.lesson.tutorial-memory.step.play-biyomon":
    "Mainkan Biyomon. Seret Biyomon dari tangan ke field. Biayanya 2 memory.",
  "learn.lesson.tutorial-memory.step.play-biyomon.hint": "Play cost adalah angka di kiri atas kartu.",
  "learn.lesson.tutorial-memory.step.play-birdramon":
    "Memory Anda tinggal 1. Tetap mainkan Birdramon. Seret Birdramon dari tangan ke field. Biayanya 4 memory.",
  "learn.lesson.tutorial-memory.step.play-birdramon.hint":
    "Anda boleh membayar memory lebih dari yang Anda punya. Penanda pindah ke 3 di sisi lawan, dan giliran Anda berakhir.",
  "learn.lesson.tutorial-memory.step.attack-security":
    "Bot melewati gilirannya, jadi Anda mulai dengan 3 memory. Serang dengan Birdramon. Klik Birdramon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-memory.step.attack-security.hint":
    "Digimon Anda dimainkan pada giliran sebelumnya, jadi keduanya dapat menyerang sekarang.",
  "learn.lesson.tutorial-memory.step.attack-player":
    "Lawan tidak punya security lagi. Klik Biyomon, pilih Serang, lalu klik tumpukan security lawan untuk menang.",
  "learn.lesson.tutorial-memory.step.attack-player.hint":
    "Serangan tidak membutuhkan memory. Hanya memainkan kartu dan digivolve yang membutuhkannya.",

  "learn.lesson.tutorial-digivolve.title": "Digivolve",
  "learn.lesson.tutorial-digivolve.summary": "Digivolve Rookie menjadi Champion yang lebih kuat dan serang dengannya.",
  "learn.lesson.tutorial-digivolve.goal1": "Cara digivolve dan membayar digivolution cost",
  "learn.lesson.tutorial-digivolve.goal2": "Cara kerja kartu digivolution dan inherited effect",
  "learn.lesson.tutorial-digivolve.done":
    "Anda digivolve Agumon menjadi Greymon, draw kartu bonus, dan menang dengan Digimon yang lebih kuat.",
  "learn.lesson.tutorial-digivolve.step.intro":
    "Agumon adalah Rookie level 3. Anda dapat digivolve Agumon menjadi Greymon, Champion level 4, dengan memory lebih sedikit daripada memainkan Greymon.",
  "learn.lesson.tutorial-digivolve.step.intro.hint":
    "Sebuah kartu dapat digivolve dari Digimon dengan warna dan level yang tepat. Digivolution cost tercetak di kartu.",
  "learn.lesson.tutorial-digivolve.step.digivolve":
    "Seret Greymon dari tangan ke atas Agumon. Digivolve membutuhkan 2 memory.",
  "learn.lesson.tutorial-digivolve.step.digivolve.hint":
    "Memainkan Greymon akan membutuhkan 5 memory. Digivolve lebih murah dan membuat Agumon tetap siap menyerang.",
  "learn.lesson.tutorial-digivolve.step.bonus":
    "Anda draw 1 kartu sebagai bonus digivolve. Agumon sekarang ada di bawah Greymon sebagai kartu digivolution.",
  "learn.lesson.tutorial-digivolve.step.bonus.hint":
    "Kartu di bawah Digimon memberikan inherited effect-nya. Agumon memberi Greymon +1000 DP pada giliran Anda, jadi Greymon punya 5000 DP.",
  "learn.lesson.tutorial-digivolve.step.attack-security":
    "Serang dengan Greymon. Klik Greymon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-digivolve.step.attack-security.hint":
    "Digimon yang digivolve tetap Digimon yang sama, jadi dapat menyerang pada giliran ini.",
  "learn.lesson.tutorial-digivolve.step.attack-player":
    "Lawan tidak punya security lagi. Klik Biyomon, pilih Serang, lalu klik tumpukan security lawan untuk menang.",
  "learn.lesson.tutorial-digivolve.step.attack-player.hint":
    "Digivolve membuat Digimon Anda lebih kuat tanpa summoning sickness seperti kartu baru.",

  "learn.lesson.tutorial-block.title": "Block",
  "learn.lesson.tutorial-block.summary":
    "Gunakan <Blocker> untuk menghentikan serangan, lalu menang pada giliran Anda.",
  "learn.lesson.tutorial-block.goal1": "Cara Digimon dengan <Blocker> melindungi Anda",
  "learn.lesson.tutorial-block.goal2": "Cara kerja pertarungan antara dua Digimon",
  "learn.lesson.tutorial-block.done":
    "Anda memblok serangan bot dengan Monochromon dan menang pada giliran Anda berikutnya.",
  "learn.lesson.tutorial-block.step.intro":
    "Sekarang giliran bot. Monochromon Anda punya <Blocker>. Monochromon dapat menghadang saat Digimon lawan menyerang.",
  "learn.lesson.tutorial-block.step.intro.hint":
    "<Blocker> berlaku pada giliran lawan. Digimon harus dalam keadaan unsuspend untuk memblok.",
  "learn.lesson.tutorial-block.step.incoming-attack": "Gomamon milik bot akan menyerang Anda. Tunggu prompt block.",
  "learn.lesson.tutorial-block.step.incoming-attack.hint": "Tanpa block, Gomamon akan memeriksa 1 kartu security Anda.",
  "learn.lesson.tutorial-block.step.block": "Block dengan Monochromon. Pilih Monochromon di prompt block.",
  "learn.lesson.tutorial-block.step.block.hint":
    "Monochromon punya 5000 DP dan Gomamon punya 3000 DP. Digimon dengan DP lebih rendah di-delete.",
  "learn.lesson.tutorial-block.step.your-turn":
    "Monochromon memenangkan pertarungan dan sekarang suspend. Tunggu bot mengakhiri gilirannya.",
  "learn.lesson.tutorial-block.step.your-turn.hint":
    "Block membuat Digimon Anda suspend. Digimon itu unsuspend di awal giliran Anda, jadi tetap dapat menyerang.",
  "learn.lesson.tutorial-block.step.attack-security":
    "Sekarang giliran Anda. Serang dengan Monochromon. Klik Monochromon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-block.step.attack-security.hint":
    "Monochromon punya 5000 DP, jadi Monochromon mengalahkan Bearmon 4000 DP di security.",
  "learn.lesson.tutorial-block.step.attack-player":
    "Lawan tidak punya security lagi. Klik Birdramon, pilih Serang, lalu klik tumpukan security lawan untuk menang.",
  "learn.lesson.tutorial-block.step.attack-player.hint":
    "Bot tidak punya Digimon lagi untuk memblok, jadi serangan Anda berhasil.",

  "learn.lesson.tutorial-tamers.title": "Tamer",
  "learn.lesson.tutorial-tamers.summary":
    "Mainkan Tamer untuk memperkuat Digimon Anda dan gunakan inherited effect untuk menang.",
  "learn.lesson.tutorial-tamers.goal1": "Cara Tamer tetap di field dan membantu Digimon Anda",
  "learn.lesson.tutorial-tamers.goal2": "Cara inherited effect membuat Anda memeriksa lebih banyak security",
  "learn.lesson.tutorial-tamers.done":
    "Anda memainkan Tai Kamiya, memeriksa 2 kartu security dengan Garudamon, dan menang dengan Dracomon.",
  "learn.lesson.tutorial-tamers.step.intro":
    "Lawan punya 2 kartu security. Garudamon dapat menembus keduanya dalam 1 serangan jika DP-nya cukup.",
  "learn.lesson.tutorial-tamers.step.intro.hint":
    "Tamer adalah kartu yang tetap di field. Tamer tidak menyerang, tetapi efeknya membantu Digimon Anda.",
  "learn.lesson.tutorial-tamers.step.play-tamer":
    "Mainkan Tai Kamiya. Seret Tai Kamiya dari tangan ke field. Biayanya 2 memory.",
  "learn.lesson.tutorial-tamers.step.play-tamer.hint":
    "Tai Kamiya memberi semua Digimon Anda +1000 DP pada giliran Anda. Garudamon sekarang punya 8000 DP.",
  "learn.lesson.tutorial-tamers.step.inherited":
    "Greymon ada di bawah Garudamon. Inherited effect-nya memberi Garudamon <Security Attack +1>, jadi Garudamon memeriksa 2 kartu security.",
  "learn.lesson.tutorial-tamers.step.inherited.hint":
    "Buka Garudamon untuk melihat kartu digivolution-nya. Setiap kartu dapat memberikan inherited effect.",
  "learn.lesson.tutorial-tamers.step.attack-security":
    "Serang dengan Garudamon. Klik Garudamon, pilih Serang, lalu klik tumpukan security lawan.",
  "learn.lesson.tutorial-tamers.step.attack-security.hint":
    "Kartu security kedua adalah WereGarurumon 7000 DP. Tanpa Tai Kamiya, pertarungan akan seri dan kedua Digimon akan di-delete.",
  "learn.lesson.tutorial-tamers.step.attack-player":
    "Lawan tidak punya security lagi. Klik Dracomon, pilih Serang, lalu klik tumpukan security lawan untuk menang.",
  "learn.lesson.tutorial-tamers.step.attack-player.hint": "Efek Tamer terus berlaku selama Tamer tetap di field.",
} satisfies Record<keyof typeof learnEn | keyof typeof learnLessonsEn, string>;
