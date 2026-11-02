import type { newDrillsEn } from "@/i18n/learn/newDrills.en";
import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnId } from "@/i18n/learn/learn.id";

export const battleLessonsId = {
  ...buildRulePracticeTranslations({ dictionary: learnId }),
  "learn.lesson.drill-retaliation.title": "Retaliation: kalahkan Digimon yang lebih kuat",
  "learn.lesson.drill-retaliation.summary":
    "Kalahkan Blocker yang lebih kuat dengan kalah dalam pertempuran dengan Retaliation, lalu menang.",
  "learn.lesson.drill-retaliation.goal1": "Bagaimana Retaliation men-delete Digimon yang memenangkan pertempuran",
  "learn.lesson.drill-retaliation.goal2":
    "Mengapa penyerang kecil bisa menyingkirkan pemain bertahan yang jauh lebih kuat",
  "learn.lesson.drill-retaliation.done":
    "Candlemon kalah dalam pertempuran, men-delete Monochromon dengan Retaliation, dan membuka serangan kemenangan.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon memiliki 1000 DP dan Retaliation. Monochromon milik bot memiliki 5000 DP, Blocker, dan sedang suspend. Kalah dalam battle ini dapat menyingkirkan Blocker tersebut.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation terpicu ketika Digimon ini di-delete setelah kalah dalam pertarungan melawan Digimon lain.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Klik Candlemon, pilih Attack, lalu pilih suspend Monochromon. Biarkan pertempuran dan Retaliation terselesaikan.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon kalah DP. Retaliation lalu men-delete Monochromon; ini adalah proses delete efek, bukan pertarungan kedua.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon hilang dan bot tidak memiliki security. Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Pertahankan Birdramon untuk serangan terakhir ini daripada mengorbankannya di pertempuran pertama.",
  "learn.lesson.drill-blitz.title": "Blitz: serangan setelah memory melewati nol",
  "learn.lesson.drill-blitz.summary":
    "Digivolve melewati memory nol dan menggunakan Blitz sebelum giliran Anda berakhir.",
  "learn.lesson.drill-blitz.goal1": "Mengapa membayar lebih dari nol masih memungkinkan efek digivolve",
  "learn.lesson.drill-blitz.goal2": "Bagaimana Blitz memberikan serangan sementara lawan memiliki memory",
  "learn.lesson.drill-blitz.done": "BetelGammamon berevolusi menjadi nol dan menang melalui serangan Blitz-nya.",
  "learn.lesson.drill-blitz.step.intro":
    "Anda memiliki 1 memory dan Biyomon di field. BetelGammamon memiliki biaya digivolve 2 dan [When Digivolving] Blitz.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "Bot tidak memiliki security. Anda harus menggunakan perintah Blitz setelah membayar; tindakan fase utama baru yang biasa akan terlambat.",
  "learn.lesson.drill-blitz.step.digivolve":
    "Digivolve Biyomon menjadi BetelGammamon dari tangan Anda. Pembayaran memberikan bot 1 memory.",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "Digivolve mengubah Digimon yang ada dan tidak mereset izin untuk menyerang.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Terima efek Blitz. Kemudian serang pemain dengan BetelGammamon untuk menang sebelum giliran berlalu.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz mengizinkan serangan ini saat bot memiliki memory. Itu sendiri tidak memberikan Rush atau unsuspend kepada penyerang.",
  "learn.lesson.drill-raid.title": "Raid: tantang Digimon siap terkuat",
  "learn.lesson.drill-raid.summary": "Mengarahkan serangan ke unsuspend Blocker menggunakan Raid.",
  "learn.lesson.drill-raid.goal1": "Bagaimana Raid mengubah target serangan yang dinyatakan",
  "learn.lesson.drill-raid.goal2": "Mengapa targetnya harus unsuspend lawan Digimon dengan DP tertinggi",
  "learn.lesson.drill-raid.done":
    "Grizzlymon menggunakan Raid untuk men-delete Monochromon, dan Birdramon memberikan serangan kemenangan.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon memiliki Raid dan mendapat +1000 DP dari Agumon di bawahnya. Bot memiliki unsuspend 5000 DP Monochromon.",
  "learn.lesson.drill-raid.step.intro.hint":
    "Biasanya Anda tidak dapat mendeklarasikan serangan terhadap Digimon unsuspend. Raid mengubah target setelah deklarasi.",
  "learn.lesson.drill-raid.step.raid":
    "Serang pemain dengan Grizzlymon. Pada pilihan Raid, pilih Monochromon sebagai target baru.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon memiliki 6000 DP, sehingga memenangkan pertarungan ini. Monochromon adalah target DP unsuspend tertinggi yang memenuhi syarat.",
  "learn.lesson.drill-raid.step.win": "Digimon dengan Blockernya hilang. Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-raid.step.win.hint":
    "Mengubah target melalui Raid tidak menghasilkan pemeriksaan security; Birdramon melakukan serangan terpisah.",
  "learn.lesson.drill-collision.title": "Collision: membuat blok bot",
  "learn.lesson.drill-collision.summary":
    "Memaksa Digimon tanpa mencetak Blocker untuk bertahan, lalu menembus security-nya.",
  "learn.lesson.drill-collision.goal1": "Bagaimana Collision memberikan Blocker kepada Digimon lawan saat menyerang",
  "learn.lesson.drill-collision.goal2": "Mengapa bek harus memblok jika mampu",
  "learn.lesson.drill-collision.done":
    "Proganomon memaksa Gomamon untuk memblokir, menembus kartu security terakhir, dan Birdramon menang.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon memiliki Collision dan Piercing. Bot memiliki Gomamon, yang tidak mencetak Blocker, dan 1 kartu security.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision memberikan Digimon lawan Blocker selama serangan ini dan membuat bot memblokir jika bisa.",
  "learn.lesson.drill-collision.step.collision":
    "Serang pemain dengan Proganomon. Bot harus block dengan Gomamon, yang kalah dalam battle. Proganomon lalu memeriksa security berkat Piercing.",
  "learn.lesson.drill-collision.step.collision.hint":
    "Bot tidak dapat menolak blok yang tersedia. Proganomon memiliki 7000 DP dibandingkan Gomamon yang memiliki 3000 DP.",
  "learn.lesson.drill-collision.step.win":
    "Bot tidak memiliki security dan tidak ada pembela. Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision memaksakan pertempuran; Piercing memberikan cek security setelah Proganomon menang.",
  "learn.lesson.drill-vortex.title": "Vortex: pertarungan terakhir di akhir giliran",
  "learn.lesson.drill-vortex.summary":
    "Mainkan Galemon dan gunakan Vortex untuk menyerang Digimon di giliran yang sama.",
  "learn.lesson.drill-vortex.goal1": "Bagaimana Vortex menciptakan serangan end-of-turn",
  "learn.lesson.drill-vortex.goal2":
    "Mengapa Vortex dapat menyerang pada giliran Digimon dimainkan tetapi biasanya hanya menargetkan Digimon saja",
  "learn.lesson.drill-vortex.done":
    "Galemon menggunakan Vortex untuk menyelesaikan Monochromon pada giliran pertama dalam permainan, lalu menang pada giliran berikutnya.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon memiliki Vortex. Bot memiliki suspend Monochromon dan tidak ada security. Galemon dapat men-delete Digimon dengan Blocker itu di akhir giliran Anda.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "Digimon normal yang baru dimainkan tidak dapat menyerang pada giliran ini. Vortex memberikan pengecualian khusus di akhir giliran.",
  "learn.lesson.drill-vortex.step.play": "Mainkan Galemon dari tangan Anda untuk 6 memory.",
  "learn.lesson.drill-vortex.step.play.hint":
    "Memory Anda menjadi 0. Jangan mencoba serangan normal; Galemon baru dimainkan pada giliran ini.",
  "learn.lesson.drill-vortex.step.vortex":
    "Klik Akhiri giliran, terima Vortex, dan pilih suspend Monochromon sebagai target serangan.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex biasanya tidak memungkinkan Anda menargetkan pemain. 6000 DP Galemon mengalahkan 5000 DP Monochromon.",
  "learn.lesson.drill-vortex.step.opponent-turn": "Biarkan pemrosesan akhir giliran selesai dan giliran bot dimulai.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "Serangan kata kunci terjadi sebelum giliran benar-benar berubah. Bot kemudian akan lewat.",
  "learn.lesson.drill-vortex.step.your-turn":
    "Tunggu hingga bot melewatkan gilirannya dan fase utama Anda berikutnya dimulai.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon di-unsuspend pada awal giliran Anda dan tidak lagi termasuk Digimon yang dimainkan pada giliran ini.",
  "learn.lesson.drill-vortex.step.win": "Serang pemain secara normal dengan Galemon untuk menang.",
  "learn.lesson.drill-vortex.step.win.hint":
    "Ini adalah serangan fase utama yang normal. Itu tidak menggunakan batasan Vortex khusus Digimon.",
  "learn.lesson.drill-overclock.title": "Overclock: menyerang lagi tanpa berdiri",
  "learn.lesson.drill-overclock.summary":
    "Korbankan 1 Puppet agar ShoeShoemon yang sudah suspend dapat menyerang lagi di akhir giliran.",
  "learn.lesson.drill-overclock.goal1": "Bagaimana Overclock membayar dengan men-delete Digimon lain yang ditentukan",
  "learn.lesson.drill-overclock.goal2": "Mengapa serangan tanpa suspend bisa datang dari Digimon suspend",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon memeriksa security, men-delete Shoemon untuk Overclock, dan menyerang lagi tanpa unsuspend.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon memiliki Overclock untuk sifat Puppet. Shoemon adalah Puppet lainnya dan dimainkan pada giliran ini, jadi simpanlah sebagai pembayaran.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock menyerang pemain tanpa suspend, meskipun ShoeShoemon sudah menjadi suspend.",
  "learn.lesson.drill-overclock.step.clear-security":
    "Serang pemain dengan ShoeShoemon untuk mengeluarkan kartu security terakhir.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon tetap suspend setelah serangan ini. Jangan lewatkan permintaan kata kunci berikutnya.",
  "learn.lesson.drill-overclock.step.overclock":
    "Klik Akhiri giliran dan terima Overclock. Satu-satunya Puppet Anda yang memenuhi syarat, Shoemon, di-delete sebagai pembayaran. Kemudian pilih pemain sebagai target serangan untuk menang.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "Bayar dengan Shoemon, bukan ShoeShoemon. Setelah pembayaran, serangan pemain Overclock bersifat wajib dan tidak memerlukan unsuspend.",
  "learn.lesson.drill-iceclad.title": "Iceclad: menang dengan lebih banyak sumber",
  "learn.lesson.drill-iceclad.summary": "Kalahkan Digimon 12000 DP dengan membandingkan jumlah kartu digivolve.",
  "learn.lesson.drill-iceclad.goal1": "Bagaimana Iceclad menggantikan perbandingan DP dalam pertarungan Digimon",
  "learn.lesson.drill-iceclad.goal2": "Mengapa pertarungan security masih membandingkan DP",
  "learn.lesson.drill-iceclad.done":
    "Dua sumber PolarBearmon mengalahkan nol WarGreymon meskipun DP lebih rendah, dan Birdramon menang.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon mempunyai 7000 DP, Iceclad, dan 2 kartu digivolve. suspend WarGreymon memiliki 12000 DP tetapi tidak ada kartu digivolve.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad membandingkan sumber dan bukan DP dalam pertempuran selain pertempuran security. Lebih banyak sumber yang menang; jumlah yang sama membuat keduanya kalah.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "Serang suspend WarGreymon dengan PolarBearmon. Biarkan pertempuran Iceclad terselesaikan.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "Bandingkan 2 sumber dengan 0, bukan 7000 DP dengan 12000 DP. PolarBearmon selamat dari pertarungan kemenangan.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon hilang dan bot tidak memiliki security. Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "Digimon security masih akan bertarung menggunakan DP; Perbandingan sumber Iceclad tidak berlaku untuk itu.",
  "learn.lesson.drill-execute.title": "Execute: habiskan penyerang Anda untuk menyingkirkan pertahanan",
  "learn.lesson.drill-execute.summary":
    "Serang unsuspend Blocker di akhir giliran, lalu terima proses delete penyerang Anda.",
  "learn.lesson.drill-execute.goal1": "Bagaimana Execute mengizinkan serangan end-of-turn pada Digimon unsuspend",
  "learn.lesson.drill-execute.goal2": "Mengapa penyerang di-delete pada akhir serangan itu",
  "learn.lesson.drill-execute.done":
    "Phantomon mengalahkan Monochromon dengan Execute dan telah di-delete; Birdramon kemudian menang pada giliran Anda berikutnya.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon memiliki Execute dan 7000 DP. unsuspend Monochromon bot memiliki 5000 DP dan akan memblokir Birdramon.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute memungkinkan Phantomon menyerang di akhir giliran Anda, termasuk menargetkan Digimon lawan yang tidak suspend. Phantomon akan di-delete pada akhir serangan itu.",
  "learn.lesson.drill-execute.step.execute":
    "Klik Akhiri giliran, terima Execute, dan pilih Monochromon sebagai target. Biarkan pertempuran dan proses delete Phantomon selesai.",
  "learn.lesson.drill-execute.step.execute.hint":
    "Jangan memilih pemain: menghilangkan Digimon dengan Blocker adalah tujuannya. Proses delete tertunda Execute masih terjadi setelah Phantomon memenangkan pertarungan.",
  "learn.lesson.drill-execute.step.opponent-turn": "Biarkan pemrosesan akhir giliran selesai dan giliran bot dimulai.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "Serangan kata kunci terjadi sebelum giliran benar-benar berubah. Bot kemudian akan lewat.",
  "learn.lesson.drill-execute.step.your-turn": "Tunggu bot lewat dan giliran Anda selanjutnya mencapai fase utama.",
  "learn.lesson.drill-execute.step.your-turn.hint":
    "Birdramon tetap siap, dan tidak ada Digimon dengan Blocker yang tersisa.",
  "learn.lesson.drill-execute.step.win": "Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-execute.step.win.hint":
    "Bot tidak memiliki security. Pengorbanan Phantomon menghilangkan pertahanan yang melindunginya.",
  "learn.lesson.drill-progress.title": "Progress: menahan efek security saat menyerang",
  "learn.lesson.drill-progress.summary": "Serang melalui Cocytus Breath dan pertahankan Digimon Anda dengan Progress.",
  "learn.lesson.drill-progress.goal1": "Bagaimana Progress mencegah efek lawan mempengaruhi penyerang",
  "learn.lesson.drill-progress.goal2": "Mengapa Progress tidak mencegah setiap kekalahan pertempuran",
  "learn.lesson.drill-progress.done":
    "Dimetromon mengabaikan efek security saat menyerang dan kembali pada giliran berikutnya untuk menang.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon memiliki Progress: efek lawan tidak mempengaruhinya saat menyerang. Kartu security terakhir bot adalah Cocytus Breath.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath biasanya mengembalikan Digimon lawan ke tangan. Progress melindungi penyerang ini selama efek tersebut.",
  "learn.lesson.drill-progress.step.progress":
    "Serang pemain dengan Dimetromon. Tonton penyelesaian Cocytus Breath tanpa mengembalikan penyerang Anda ke tangan.",
  "learn.lesson.drill-progress.step.progress.hint":
    "Perlindungan berlaku untuk efek lawan saat menyerang. Itu tidak menghentikan proses delete pertempuran normal dari Digimon security yang lebih kuat.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon tetap di lapangan. Klik Akhiri giliran.",
  "learn.lesson.drill-progress.step.end-turn.hint": "Bot tidak memiliki Digimon untuk menyerang Anda.",
  "learn.lesson.drill-progress.step.your-turn": "Tunggu fase utama Anda selanjutnya.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon unsuspend di awal giliran Anda.",
  "learn.lesson.drill-progress.step.win": "Serang pemain dengan Dimetromon untuk menang.",
  "learn.lesson.drill-progress.step.win.hint":
    "Tanpa perlindungan Progress, satu-satunya penyerang Anda akan kembali ke tangan Anda.",
  "learn.lesson.drill-engage.title": "Engage: serangan selama pemrosesan turn-end",
  "learn.lesson.drill-engage.summary": "Siapkan Digimon Anda dan terima serangan Engage setelah lewat.",
  "learn.lesson.drill-engage.goal1": "Bagaimana Engage terpicu di akhir giliran Anda",
  "learn.lesson.drill-engage.goal2": "Mengapa serangan selesai sebelum lawan memulai gilirannya",
  "learn.lesson.drill-engage.done":
    "WarGrowlmon menggunakan Engage untuk menyerang selama pemrosesan akhir giliran dan menang.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon memiliki Engage dan bot tidak memiliki security. Anda akan menang menggunakan kata kunci akhir giliran alih-alih serangan fase utama yang normal.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage bersifat opsional. Serangannya harus legal saat efek diselesaikan.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Pertahankan WarGrowlmon dalam kondisi unsuspend agar dapat menggunakan Engage. Lanjutkan ketika Anda siap mengakhiri giliran.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage tidak meng-unsuspend Digimon dan tidak mengizinkan Digimon yang baru dimainkan untuk mengabaikan batasan menyerang pada giliran itu.",
  "learn.lesson.drill-engage.step.engage":
    "Klik Akhiri giliran, terima Engage, dan pilih pemain sebagai target serangan untuk menang.",
  "learn.lesson.drill-engage.step.engage.hint":
    "Passing memberikan bot 3 memory, tetapi Engage dan serangannya terselesaikan sebelum giliran bot dimulai.",
  "learn.lesson.drill-barrier.title": "Barrier: membayar security untuk menjaga Digimon Anda",
  "learn.lesson.drill-barrier.summary":
    "Lindungi Angemon dari kekalahan pertempuran security, lalu gunakan untuk menang.",
  "learn.lesson.drill-barrier.goal1": "Bagaimana Barrier menggantikan proses delete pertempuran",
  "learn.lesson.drill-barrier.goal2": "Mengapa membayar kartu security berbeda dengan memeriksanya",
  "learn.lesson.drill-barrier.done":
    "Angemon membayar satu security untuk Barrier, selamat dari pertempuran, dan menang pada giliran berikutnya.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon memiliki 4000 DP dan Barrier. Kartu security terakhir bot adalah 5000 DP Ikkakumon, jadi Angemon akan kalah dalam pertempuran itu.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Anda memiliki 1 kartu security yang tersedia untuk membayar Barrier dan mencegah proses delete pertempuran Angemon.",
  "learn.lesson.drill-barrier.step.barrier":
    "Serang pemain dengan Angemon. Saat pilihan Barrier muncul, terima untuk mengirim kartu security teratas Anda ke trash dan menyelamatkan Angemon.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier mencegah proses delete pertempuran ini. Kartu security Anda yang dibuang adalah pembayaran dan tidak mengaktifkan efek security-nya.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon selamat dan kedua pemain tidak memiliki security. Klik Akhiri giliran.",
  "learn.lesson.drill-barrier.step.end-turn.hint": "Bot tidak memiliki Digimon di lapangan, jadi passing aman di sini.",
  "learn.lesson.drill-barrier.step.your-turn": "Tunggu fase utama Anda selanjutnya.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon unsuspend di awal giliran Anda.",
  "learn.lesson.drill-barrier.step.win": "Serang pemain dengan Angemon untuk menang.",
  "learn.lesson.drill-barrier.step.win.hint":
    "Barrier mempertahankan satu-satunya penyerang yang Anda butuhkan untuk serangan terakhir ini.",
  "learn.lesson.drill-training.title": "Training: membangun sumber yang memenangkan pertempuran",
  "learn.lesson.drill-training.summary":
    "Latih Greymon agar serangan berikutnya memperoleh DP yang cukup untuk mengalahkan Blocker.",
  "learn.lesson.drill-training.goal1":
    "Bagaimana Training menjadi suspend Digimon dan menempatkan bagian atas deck menghadap ke bawah di bawahnya",
  "learn.lesson.drill-training.goal2":
    "Bagaimana sumber tambahan yang menghadap ke bawah dapat memperkuat efek kartu lainnya",
  "learn.lesson.drill-training.done":
    "Greymon melatih satu sumber menghadap ke bawah, menambahkan sumber lain saat menyerang, dan mengalahkan Digimon dengan Blocker dengan 7000 DP. Dracomon menang.",
  "learn.lesson.drill-training.step.intro":
    "Greymon memiliki Training dan 5000 DP. Grizzlymon bot memiliki 6000 DP dan Blocker. Training dapat membangun sumber tambahan yang dibutuhkan Greymon untuk memenangkan pertempuran itu.",
  "learn.lesson.drill-training.step.intro.hint":
    "Efek serangan Greymon memberikan +1000 DP untuk setiap sumber menghadap ke bawah. Kartu tertutup yang dilatih tidak memberikan efek warisan yang dicetak.",
  "learn.lesson.drill-training.step.train":
    "Klik Greymon dan aktifkan Training. Greymon menjadi suspend dan menempatkan kartu teratas deck Anda menghadap ke bawah di bagian paling bawah sumber digivolve-nya.",
  "learn.lesson.drill-training.step.train.hint":
    "Training tidak memerlukan memory. Jaga agar kartu yang ditambahkan tetap menghadap ke bawah; nama cetakan, warna, dan efeknya tidak dapat dirujuk.",
  "learn.lesson.drill-training.step.end-turn": "Klik Akhiri giliran agar Greymon dapat siap pada giliran berikutnya.",
  "learn.lesson.drill-training.step.end-turn.hint": "Bot akan lewat tanpa menyerang dalam latihan ini.",
  "learn.lesson.drill-training.step.your-turn":
    "Tunggu fase utama Anda. Greymon unsuspend dan menyimpan sumber terlatihnya.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "Sumber dari Training tetap berada di tumpukan pada giliran-giliran berikutnya; ini bukan bonus DP sementara.",
  "learn.lesson.drill-training.step.battle":
    "Serang pemain dengan Greymon. Terima efek [Saat Menyerang] untuk menempatkan kartu deck lainnya menghadap ke bawah dan mendapatkan DP. Bot akan memblokir dengan Grizzlymon.",
  "learn.lesson.drill-training.step.battle.hint":
    "Dua sumber menghadap ke bawah memberi +2000 DP, sehingga 7000 mengalahkan 6000. Tanpa Training sebelumnya, satu sumber hanya menghasilkan 6000 DP dan kedua Digimon akan kalah.",
  "learn.lesson.drill-training.step.win":
    "Serang pemain dengan Dracomon untuk menang setelah Digimon dengan Blocker dihilangkan.",
  "learn.lesson.drill-training.step.win.hint":
    "Pertahankan Dracomon untuk serangan terakhir. Training membangun sumber tambahan yang memungkinkan Greymon membersihkan pertahanan.",
  "learn.lesson.drill-decoy.title": "Decoy: menyelamatkan rekan satu tim",
  "learn.lesson.drill-decoy.summary": "Korbankan Machmon untuk melindungi BigMamemon dari bot Gaia Force.",
  "learn.lesson.drill-decoy.goal1": "Digimon Decoy mana yang dapat dilindungi",
  "learn.lesson.drill-decoy.goal2": "Bayar dengan pemegang Decoy, lalu lakukan serangan balik",
  "learn.lesson.drill-decoy.done":
    "Machmon dikorbankan untuk membayar Decoy. BigMamemon bertahan dan memenangkan permainan.",
  "learn.lesson.drill-decoy.step.intro":
    "Decoy (Hitam) memungkinkan Machmon men-delete dirinya sendiri ketika Digimon hitam Anda yang lain akan di-delete oleh efek yang berlawanan. Bot akan menargetkan satu-satunya Digimon Anda yang lain, BigMamemon, dengan Gaia Force.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "Aturan 16-18. Kata kunci melindungi Digimon lain yang cocok; Machmon tidak dapat menggunakannya untuk menyimpan dirinya sendiri.",
  "learn.lesson.drill-decoy.step.react":
    "Saat penawaran Decoy muncul, terima perlindungan Machmon. Jika pilihan perlindungan ditampilkan, pilih Decoy Machmon.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon masuk ke trash sebagai pembayaran. BigMamemon tetap dalam pertempuran alih-alih di-delete.",
  "learn.lesson.drill-decoy.step.your-turn":
    "Tunggu hingga bot menyelesaikan gilirannya. BigMamemon Anda yang masih hidup akan siap menyerang.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "Agumon lawannya hanyalah sumber warna untuk Gaia Force; bot dengan skrip ini sekarang akan lolos.",
  "learn.lesson.drill-decoy.step.attack-player":
    "Klik BigMamemon, pilih Attack, dan targetkan tumpukan kosong security lawan untuk menang.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Ini adalah BigMamemon yang sama yang dilindungi Decoy.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge : kehilangan kartu teratas",
  "learn.lesson.drill-armor-purge.summary":
    "Pertahankan Gabumon dengan membuang Quetzalmon alih-alih kehilangan seluruh Digimon.",
  "learn.lesson.drill-armor-purge.goal1": "Trash kartu teratas untuk mencegah proses delete",
  "learn.lesson.drill-armor-purge.goal2": "Serang dengan Digimon yang tersisa di bawahnya",
  "learn.lesson.drill-armor-purge.done":
    "Quetzalmon dibersihkan, Gabumon selamat dari proses delete, dan Gabumon menang.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon memiliki Armor Purge dan Gabumon di bawahnya. Ketika Gaia Force akan men-deletenya, Armor Purge dapat trash hanya kartu teratas untuk mencegah proses delete tersebut.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "Aturan 16-19. Ini menyingkirkan kartu armor; itu tidak men-delete kedua kartu di tumpukan.",
  "learn.lesson.drill-armor-purge.step.react": "Terima Armor Purge ketika Gaia Force bot mengancam Quetzalmon.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon menuju ke trash. Gabumon yang terekspos tetap merupakan Digimon yang sama di lapangan.",
  "learn.lesson.drill-armor-purge.step.your-turn": "Tunggu fase utama Anda. Gabumon selamat dan akan mampu menyerang.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge mencegah proses delete ini; itu tidak memberikan perlindungan permanen dari efek selanjutnya.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Klik Gabumon, pilih Attack, dan targetkan tumpukan security lawan yang kosong.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint":
    "Kartu yang bertahan di bawahnya memberikan serangan kemenangan Anda.",
  "learn.lesson.drill-save.title": "Save: simpan sumber daya di bawah Tamer",
  "learn.lesson.drill-save.summary":
    "Save Shoutmon, lalu gunakan kembali kartu yang sama untuk membuat Digimon Rush pemenang.",
  "learn.lesson.drill-save.goal1": "Simpan kartu yang di-delete di bawah Tamer dengan Save",
  "learn.lesson.drill-save.goal2": "Gunakan kembali kartu yang disimpan sebagai materi DigiXros",
  "learn.lesson.drill-save.done":
    "Shoutmon yang disimpan menjadi sumber King Version dan memberinya Rush yang dibutuhkan untuk menang.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force akan men-delete Shoutmon. Efek On Deletion dengan Save dapat menaruh kartu itu di bawah Taiki, bukan membiarkannya di trash. Shoutmon (King Version) di tangan Anda dapat memakainya untuk DigiXros.",
  "learn.lesson.drill-save.step.intro.hint":
    "Aturan 16-20. Save mempertahankan kartu sebagai sumber daya; itu tidak mencegah proses delete Shoutmon.",
  "learn.lesson.drill-save.step.react":
    "Selesaikan efek On Deletion Shoutmon dan terima Save. Pilih Taiki Kudo sebagai Tamer penerima jika diminta.",
  "learn.lesson.drill-save.step.react.hint":
    "Shoutmon sekarang seharusnya berada di bawah Taiki, tanpa ada Digimon yang tersisa di area pertempuran Anda.",
  "learn.lesson.drill-save.step.your-turn":
    "Tunggu hingga fase utama Anda. Anda akan memiliki 3 memory untuk menggunakan kembali Shoutmon yang disimpan.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki dapat suspend untuk membiarkan DigiXros menggunakan kartu dari bawah Tamers Anda.",
  "learn.lesson.drill-save.step.reuse":
    "Pilih Shoutmon (King Version) di tangan, lalu pilih DigiXros. Pilih Taiki sebagai Tamer yang akan suspend dan Shoutmon yang disimpan di bawahnya sebagai material, lalu konfirmasikan.",
  "learn.lesson.drill-save.step.reuse.hint":
    "Satu material mengurangi biaya dari 5 menjadi 3. Efek warisan Shoutmon memberikan Rush ke Digimon ini dengan Shoutmon di namanya.",
  "learn.lesson.drill-save.step.attack-player":
    "Menyerang tumpukan kosong security lawan dengan Shoutmon (King Version).",
  "learn.lesson.drill-save.step.attack-player.hint":
    "Tanpa sumber yang disimpan, Digimon yang baru dimainkan ini tidak akan memiliki Rush warisan yang diperlukan untuk menyerang sekarang.",
  "learn.lesson.drill-material-save.title": "Material Save: selamatkan sumbernya",
  "learn.lesson.drill-material-save.summary":
    "Save keduanya material DigiXros, lalu membangun kembali MetalGreymon untuk serangan Rush yang menang.",
  "learn.lesson.drill-material-save.goal1": "Menyelamatkan material tertentu dari tumpukan yang di-delete",
  "learn.lesson.drill-material-save.goal2": "Bayar lebih sedikit dengan menggunakan kembali kedua kartu yang disimpan",
  "learn.lesson.drill-material-save.done":
    "Kedua material yang diselamatkan membangun kembali MetalGreymon untuk 3 memory dan serangan Rush menang.",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon memiliki Greymon dan MailBirdramon di bawahnya. Gaia Force akan men-deletenya. Material Save 2 dapat menempatkan material DigiXros yang ditentukan di bawah Kiriha.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "Aturan 16-21. Ini menyimpan sumber yang memenuhi syarat, bukan MetalGreymon yang di-delete itu sendiri.",
  "learn.lesson.drill-material-save.step.react":
    "Terima Material Save 2. Pilih Greymon dan MailBirdramon dan letakkan di bawah Kiriha Aonuma ketika ditanya.",
  "learn.lesson.drill-material-save.step.react.hint":
    "Gunakan kedua sumber yang memenuhi syarat. MetalGreymon masuk ke trash sementara materialnya bertahan di bawah Kiriha.",
  "learn.lesson.drill-material-save.step.your-turn":
    "Tunggu fase utama Anda. Anda memiliki MetalGreymon pengganti di tangan dan 3 memory.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha dapat suspend untuk mengizinkan material dari bawah Tamers Anda selama DigiXros.",
  "learn.lesson.drill-material-save.step.reuse":
    "Pilih MetalGreymon di tangan, lalu DigiXros. Pilih Kiriha sebagai Tamer yang akan suspend dan kedua material yang disimpan di bawahnya, lalu konfirmasikan. Selesaikan pilihan On Play.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "Dua material mengurangi 7 menjadi 3 memory. On Play-nya memberikan Rush, sehingga Digimon yang dibangun kembali dapat menyerang dengan segera.",
  "learn.lesson.drill-material-save.step.attack-player":
    "Serang tumpukan security lawan yang kosong dengan MetalGreymon Anda yang telah dibangun kembali.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "Dua kartu yang Anda selamatkan menjadikannya terjangkau. Rush memungkinkan Digimon baru ini menyelesaikan permainannya.",
  "learn.lesson.drill-evade.title": "Evade: suspend untuk bertahan hidup",
  "learn.lesson.drill-evade.summary":
    "Gunakan Evade melawan Gaia Force, lalu unsuspend dan menangkan pada giliran Anda.",
  "learn.lesson.drill-evade.goal1": "Bayar dengan suspend Digimon yang terancam",
  "learn.lesson.drill-evade.goal2": "Jauhkan penyerang Anda dari proses delete lawan",
  "learn.lesson.drill-evade.done": "Syakomon suspend untuk menghindari proses delete, lalu berdiri dan menang.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon memiliki Evade. Ketika Gaia Force akan men-deletenya, Anda dapat suspend Syakomon untuk mencegah proses delete tersebut. Harus bisa suspend untuk pembayaran ini.",
  "learn.lesson.drill-evade.step.intro.hint":
    "Aturan 16-22. Syakomon saat ini adalah unsuspend dan merupakan satu-satunya penyerang Anda.",
  "learn.lesson.drill-evade.step.react":
    "Saat pilihan Evade muncul, terima. Syakomon menjadi suspend dan bertahan dari Gaia Force.",
  "learn.lesson.drill-evade.step.react.hint":
    "Digimon suspend tidak dapat membayar kondisi ini lagi. Ini adalah pencegahan terhadap proses delete ini, bukan kekebalan.",
  "learn.lesson.drill-evade.step.your-turn":
    "Tunggu hingga bot melewatkan gilirannya. Syakomon unsuspend selama fase unsuspend berikutnya.",
  "learn.lesson.drill-evade.step.your-turn.hint":
    "Gaia Force kini berada di lawan trash dan Syakomon masih berada di lapangan.",
  "learn.lesson.drill-evade.step.attack-player":
    "Klik Syakomon, pilih Attack, dan targetkan tumpukan security lawan yang kosong.",
  "learn.lesson.drill-evade.step.attack-player.hint":
    "Digimon yang menghindari proses delete adalah penyerang pemenang Anda.",
  "learn.lesson.drill-fortitude.title": "Fortitude: kembali setelah proses delete",
  "learn.lesson.drill-fortitude.summary":
    "Putar ulang Aquilamon setelah Gaia Force dan menangkan dengan kehidupan barunya.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude memerlukan sumber saat proses delete",
  "learn.lesson.drill-fortitude.goal2": "Digimon yang dimainkan kembali adalah Digimon baru",
  "learn.lesson.drill-fortitude.done": "Aquilamon kembali tanpa sumbernya dan menang pada giliran berikutnya.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon memiliki Fortitude dan Kunemon sebagai sumber di bawahnya. Saat Aquilamon di-delete dengan sumber tersebut, Fortitude memainkannya kembali tanpa membayar biaya.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "Aturan 16-27. Fortitude tidak mencegah delete. Digimon yang dimainkan kembali adalah Digimon baru; sumber lamanya tetap di trash.",
  "learn.lesson.drill-fortitude.step.react":
    "Biarkan Gaia Force men-delete Aquilamon. Selesaikan pemicu Fortitude-nya; konfirmasikan efek wajib jika panel pemicu bertanya.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon kembali tanpa sumber dan identitas bidang baru. Kunemon tetap berada di trash.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "Tunggu giliran Anda. Aquilamon dimainkan kembali pada giliran bot, sehingga dapat menyerang pada giliran Anda.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "Tanpa sumber, proses delete selanjutnya tidak akan memicu Fortitude ini lagi.",
  "learn.lesson.drill-fortitude.step.attack-player":
    "Serang tumpukan security lawan yang kosong dengan Aquilamon yang dimainkan kembali.",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "Anda menang dengan kartu Fortitude yang dibawa kembali, bukan permanen aslinya.",
  "learn.lesson.drill-partition.title": "Partition: dipecah menjadi dua Digimon",
  "learn.lesson.drill-partition.summary":
    "Mengubah proses delete lawan menjadi dua Digimon level 4 yang dapat dimainkan.",
  "learn.lesson.drill-partition.goal1": "Kedua sumber tertentu diperlukan",
  "learn.lesson.drill-partition.goal2": "Mainkan kedua bagian sebelum kartu teratas keluar",
  "learn.lesson.drill-partition.done": "Paildramon dibagi menjadi Ikkakumon dan Togemon, dan Ikkakumon menang.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon memiliki Partition (Lv.4 biru dan Lv.4 hijau). Ikkakumon dan Togemon memenuhi persyaratan di bawahnya. Gaia Force akan mencoba men-delete Paildramon.",
  "learn.lesson.drill-partition.step.intro.hint":
    "Aturan 16-29. Partition berfungsi untuk efek lawan, bukan proses delete pertempuran atau efek Anda sendiri.",
  "learn.lesson.drill-partition.step.react":
    "Terima Partition. Pilih Ikkakumon biru dan Togemon hijau untuk memainkan keduanya tanpa membayar biayanya.",
  "learn.lesson.drill-partition.step.react.hint":
    "Anda harus memainkan satu kartu dari setiap kategori yang diperlukan. Paildramon tetap meninggalkan area battle; Partition tidak mencegah proses delete itu.",
  "learn.lesson.drill-partition.step.your-turn":
    "Tunggu fase utama Anda. Kedua kartu sumber kini menjadi Digimon terpisah.",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "Mereka masuk saat giliran lawan dan mungkin menyerang saat giliran Anda tiba.",
  "learn.lesson.drill-partition.step.attack-player": "Menyerang tumpukan kosong security lawan dengan Ikkakumon.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Anda juga dapat memeriksa Togemon: kedua sumber yang ditentukan telah dimainkan oleh Partition yang sama.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat: mengorbankan rekan satu tim",
  "learn.lesson.drill-scapegoat.summary": "Delete Agumon untuk menyimpan Bastemon melalui Gaia Force bot.",
  "learn.lesson.drill-scapegoat.goal1": "Pilih Digimon lain sebagai pembayaran",
  "learn.lesson.drill-scapegoat.goal2": "Mencegah proses delete Digimon yang terancam",
  "learn.lesson.drill-scapegoat.done":
    "Agumon dikorbankan untuk membayar Scapegoat, lalu Bastemon yang bertahan memenangkan permainan.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon memiliki Scapegoat. Saat akan di-delete bukan oleh efek Anda sendiri, Anda dapat men-delete Digimon Anda yang lain untuk mencegahnya. Agumon tersedia sebagai pembayaran.",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "Aturan 16-32. Anda menyelamatkan Bastemon dengan mengorbankan Digimon yang berbeda, bukan mengorbankan Bastemon.",
  "learn.lesson.drill-scapegoat.step.react":
    "Terima Scapegoat dan pilih Agumon Anda sebagai Digimon yang akan di-delete.",
  "learn.lesson.drill-scapegoat.step.react.hint":
    "Agumon masuk ke trash dan Bastemon tetap. Jangan tolak perlindungannya.",
  "learn.lesson.drill-scapegoat.step.your-turn":
    "Tunggu giliran Anda setelah bot menyelesaikan Gaia Force dan melewatkan gilirannya.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon tetap Digimon yang sama dan akan dapat menyerang.",
  "learn.lesson.drill-scapegoat.step.attack-player": "Menyerang tumpukan kosong security lawan dengan Bastemon.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint":
    "Pengorbanan membuat Digimon Anda yang lebih kuat tetap tersedia untuk menang.",
  "learn.lesson.drill-decode.title": "Decode: mainkan sumber sebelum berangkat",
  "learn.lesson.drill-decode.summary": "Save Sistermon Blanc dari tumpukan ketika bentuk kebangkitannya dipantulkan.",
  "learn.lesson.drill-decode.goal1": "Decode dapat merespons keberangkatan non-pertempuran",
  "learn.lesson.drill-decode.goal2": "Mainkan sumber yang ditentukan tanpa membayar",
  "learn.lesson.drill-decode.done":
    "Sistermon Blanc meninggalkan tumpukan melalui Decode dan melakukan serangan kemenangan.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened) memiliki Decode (Sistermon Blanc), dengan kartu bernama persis di bawahnya. Cocytus Breath bot akan mengembalikan kartu yang dibangkitkan ke tangan Anda.",
  "learn.lesson.drill-decode.step.intro.hint":
    "Aturan 16-36. Decode dapat merespons pengembalian ini karena ini bukan proses delete pertempuran.",
  "learn.lesson.drill-decode.step.react":
    "Terima Decode dan pilih Sistermon Blanc dari sumbernya. Selesaikan On Play Draw 1 Blanc jika diminta.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc dimainkan sebagai Digimon terpisah. Kartu yang terbangun masih kembali ke tangan Anda; Decode tidak menghentikan keberangkatan itu.",
  "learn.lesson.drill-decode.step.your-turn":
    "Tunggu fase utama Anda. Sistermon Blanc yang didekodekan kini menjadi satu-satunya Digimon Anda.",
  "learn.lesson.drill-decode.step.your-turn.hint":
    "Ini dimainkan saat giliran bot, jadi mungkin akan menyerang saat giliran Anda.",
  "learn.lesson.drill-decode.step.attack-player": "Menyerang tumpukan kosong security lawan dengan Sistermon Blanc.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Tanpa Decode, sumber akan dibuang bersama tumpukan yang berangkat.",
  "learn.lesson.drill-fragment.title": "Fragment: bayar dengan sumber Anda",
  "learn.lesson.drill-fragment.summary": "Trash dua sumber untuk menjaga Giromon melalui Gaia Force.",
  "learn.lesson.drill-fragment.goal1": "Fragment memerlukan jumlah sumber yang dinyatakan secara lengkap",
  "learn.lesson.drill-fragment.goal2": "Cegah proses delete dengan membayar tepat dua kartu",
  "learn.lesson.drill-fragment.done": "Giromon membayar Fragment 2 dengan kedua sumber, selamat, dan menang.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon memiliki Fragment (2), dengan Jazamon dan Jazardmon di bawahnya. Ketika Gaia Force akan men-deletenya, Fragment dapat trash dua sumbernya untuk mencegah proses delete tersebut.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "Aturan 16-37. Membayar satu sumber saja tidak cukup; Giromon memiliki dua hal yang dibutuhkan.",
  "learn.lesson.drill-fragment.step.react": "Terima Fragment dan pilih Jazamon dan Jazardmon sebagai sumber ke trash.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon tetap dimainkan tanpa sumber. Dua kartu yang dipilih masuk ke trash.",
  "learn.lesson.drill-fragment.step.your-turn": "Tunggu fase utama Anda setelah bot lewat.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon selamat dari proses delete ini, namun tidak ada sumber tersisa untuk membayar Fragment lagi.",
  "learn.lesson.drill-fragment.step.attack-player": "Menyerang tumpukan kosong security lawan dengan Giromon.",
  "learn.lesson.drill-fragment.step.attack-player.hint":
    "Giromon yang sama yang membayar Fragment memberikan serangan yang menang.",
  "learn.lesson.drill-guard.title": "Guard: melindungi dari pengembalian",
  "learn.lesson.drill-guard.summary":
    "Mengorbankan Gladimon sehingga Cocytus Breath tidak dapat mengembalikan BigMamemon ke tangan.",
  "learn.lesson.drill-guard.goal1":
    "Guard melindungi Digimon lain dari efek lawan yang mengeluarkannya dari area battle",
  "learn.lesson.drill-guard.goal2": "Pengembalian ke tangan juga dapat dicegah",
  "learn.lesson.drill-guard.done":
    "Gladimon membayar Guard untuk menghentikan pengembalian, dan BigMamemon tetap bertahan untuk menang.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon memiliki Guard. Saat Digimon Anda yang lain akan meninggalkan area battle karena efek lawan, Gladimon dapat men-delete dirinya untuk mencegahnya. Bot akan menargetkan BigMamemon dengan Cocytus Breath.",
  "learn.lesson.drill-guard.step.intro.hint":
    "Aturan 16-45. Tidak seperti perlindungan yang terbatas pada proses delete, Guard juga dapat menghentikan pengembalian ini.",
  "learn.lesson.drill-guard.step.react":
    "Terima Gladimon Guard saat perlindungan ditawarkan. Jika diminta orde reaksi, pilih Guard.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon di-delete sebagai pembayaran. BigMamemon tetap dalam pertempuran alih-alih masuk ke tangan Anda.",
  "learn.lesson.drill-guard.step.your-turn":
    "Tunggu giliran Anda setelah bot lewat. Selesaikan perintah Gladimon Saat Di-delete jika muncul.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "Gabumon milik bot sudah level 3 dan tidak memiliki sumber. Gladimon tidak dapat mengirim kartu teratasnya ke trash dengan De-Digivolve.",
  "learn.lesson.drill-guard.step.attack-player": "Menyerang tumpukan kosong security lawan dengan BigMamemon.",
  "learn.lesson.drill-guard.step.attack-player.hint":
    "Guard mempertahankan satu-satunya penyerang Anda yang tersisa di lapangan.",
  "learn.lesson.drill-digisorption.title": "Digisorption: suspend untuk menghemat memory",
  "learn.lesson.drill-digisorption.summary":
    "Digivolve Pistmon untuk 1 memory dengan suspend Kunemon, lalu serang dengan Pistmon.",
  "learn.lesson.drill-digisorption.goal1": "Membayar suspend yang diwajibkan oleh Digisorption",
  "learn.lesson.drill-digisorption.goal2": "Jaga agar Digimon yang berevolusi siap menyerang",
  "learn.lesson.drill-digisorption.done": "Anda membayar biaya Digisorption dan menang dengan unsuspend Pistmon.",
  "learn.lesson.drill-digisorption.step.intro":
    "Anda hanya memiliki 1 memory. Pistmon memiliki Digisorption -2: digivolve normalnya berharga 3, tetapi suspend Digimon lain menguranginya menjadi 1 dan memungkinkan Anda mempertahankan giliran Anda.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Suspend Kunemon daripada Lighdramon sehingga penyerang Anda tetap siap.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Digivolve Pistmon ke Lighdramon. Terima Digisorption dan pilih Kunemon sebagai Digimon ke suspend.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "Bayar 1 memory Anda untuk mencapai 0 dan pertahankan Pistmon unsuspend. Tanpa pengurangan, membayar 3 akan memberikan memory kepada lawan sebelum serangan Anda.",
  "learn.lesson.drill-digisorption.step.attack-player": "Serang pemain dengan Pistmon untuk menang.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "Lawan tidak memiliki security dan Pistmon sudah dimainkan sebagai Lighdramon.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst: belanjakan sumber Anda",
  "learn.lesson.drill-digi-burst.summary":
    "Kirim 2 sumber ke trash untuk membuat Blocker suspend sebelum serangan Anda.",
  "learn.lesson.drill-digi-burst.goal1": "Mengaktifkan efek Digi-Burst Utama",
  "learn.lesson.drill-digi-burst.goal2": "Bayar dengan tepat dua kartu digivolve",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon menghabiskan dua sumber, menonaktifkan Digimon dengan Blocker, dan membuka serangan kemenangan.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon memiliki efek Main dengan Digi-Burst 2. Kirim dua sumbernya ke trash untuk membuat satu Digimon lawan menjadi suspend.",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromon dapat memblokir sementara unsuspend. Buatlah suspend terlebih dahulu.",
  "learn.lesson.drill-digi-burst.step.burst":
    "Pilih HerculesKabuterimon dan aktifkan efek Digi-Burst-nya. Pilih Kunemon dan Kabuterimon sebagai dua sumber ke trash, lalu pilih Monochromon ke suspend.",
  "learn.lesson.drill-digi-burst.step.burst.hint":
    "HerculesKabuterimon teratas bukanlah sumber yang dapat Anda belanjakan.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "Serang pemain dengan HerculesKabuterimon untuk memeriksa kartu security terakhir.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "Suspend Monochromon tidak dapat memblokir.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint":
    "Mengeluarkan kartu security terakhir tidak menang dengan sendirinya.",
  "learn.lesson.drill-delay.title": "Delay: uang tunai dalam Opsi yang telah disiapkan",
  "learn.lesson.drill-delay.summary":
    "Gunakan Reinforcing Memory Boost! untuk mendapatkan memory yang dibutuhkan untuk memenangkan serangan Rush.",
  "learn.lesson.drill-delay.goal1": "Aktifkan Delay setelah giliran penempatan",
  "learn.lesson.drill-delay.goal2": "Ubah Opsi yang disimpan menjadi tiga memory",
  "learn.lesson.drill-delay.done": "Memory dari Delay membayar BushiAgumon, yang memenangkan permainan dengan Rush.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost! ditempatkan di area pertempuran pada giliran sebelumnya. Delay-nya sudah siap sekarang. Anda hanya memiliki 2 memory.",
  "learn.lesson.drill-delay.step.intro.hint":
    "Anda tidak dapat menggunakan Delay pada giliran yang sama ketika kartunya ditempatkan.",
  "learn.lesson.drill-delay.step.delay":
    "Pilih Reinforcing Memory Boost! dan aktifkan Delay. Kirim kartu itu ke trash untuk memperoleh 3 memory.",
  "learn.lesson.drill-delay.step.delay.hint": "Memory Anda naik dari 2 menjadi 5.",
  "learn.lesson.drill-delay.step.play-rush": "Mainkan BushiAgumon dari tangan Anda untuk 5 memory.",
  "learn.lesson.drill-delay.step.play-rush.hint":
    "Keuntungan Delay memungkinkan Anda membayar sambil menjaga memory pada 0.",
  "learn.lesson.drill-delay.step.attack-player": "Serang pemain dengan BushiAgumon untuk menang.",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush memungkinkan Digimon yang baru dimainkan ini menyerang.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve: berevolusi selama serangan",
  "learn.lesson.drill-blast-digivolve.summary":
    "Lawan serangan bot dengan WarGreymon, blokir, lalu menangkan giliran berikutnya.",
  "learn.lesson.drill-blast-digivolve.goal1": "Gunakan Counter timing ke digivolve secara gratis",
  "learn.lesson.drill-blast-digivolve.goal2": "Dapatkan Blocker sebelum waktu blok",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve membuat WarGreymon tepat waktu untuk memblokir serangan mematikan dan menang sesudahnya.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "Bot akan menyerang saat Anda memiliki 0 security. MetalGreymon Anda tidak memiliki Blocker, tetapi WarGreymon di tangan dapat Blast Digivolve menjadi Digimon dengan Blocker.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "Timing Counter terjadi sebelum timing block.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "Pada prompt Counter, pilih WarGreymon di tangan dan gunakan Blast Digivolve di MetalGreymon.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "Digivolve legal tidak memerlukan memory dan masih menarik kartu.",
  "learn.lesson.drill-blast-digivolve.step.block": "Blokir Ikkakumon yang masuk dengan WarGreymon baru Anda.",
  "learn.lesson.drill-blast-digivolve.step.block.hint":
    "WarGreymon memiliki 11000 DP melawan Ikkakumon dengan 5000 DP.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "Anda selamat. Tunggu bot mengakhiri giliran; Digimon Anda akan unsuspend di awal giliran Anda.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "Counter tidak memulai giliran Anda.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "Serang pemain dengan WarGreymon untuk menang.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint":
    "Bot tidak memiliki security atau Digimon dengan Blocker yang tersisa.",
  "learn.lesson.drill-mind-link.title": "Mind Link: mengubah Tamer menjadi sumber",
  "learn.lesson.drill-mind-link.summary":
    "Gunakan Mind Link untuk menempatkan Eiji di bawah Loogarmon, gunakan Alliance yang diberikan, lalu menangkan permainan.",
  "learn.lesson.drill-mind-link.goal1": "Tempatkan Tamer yang cocok ke dalam kartu digivolve",
  "learn.lesson.drill-mind-link.goal2": "Gunakan efek warisan yang diperoleh melalui Mind Link",
  "learn.lesson.drill-mind-link.done":
    "Eiji menjadi sumber, memberikan Alliance, dan membantu Loogarmon memeriksa kedua kartu security.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi dapat Mind Link dengan Digimon Dark Animal atau SoC yang tidak memiliki sumber Tamer. Loogarmon memenuhi syarat.",
  "learn.lesson.drill-mind-link.step.intro.hint":
    "Eiji memberikan Alliance dan Blocker dari kotak warisannya setelah ditautkan.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Pilih Eiji dan aktifkan efek Main Mind Link. Pilih Loogarmon sebagai tujuan.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji bergerak di bawah Loogarmon; itu bukan lagi Tamer yang terpisah dalam pertempuran.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Serang pemain dengan Loogarmon. Selesaikan pemicu serangannya dalam urutan mana pun. Untuk Alliance, terima dan suspend Birdramon sebagai pendukung. Anda boleh menolak efek opsional Loogarmon yang meminta kartu dari tangan, atau mengirim 1 kartu dari tangan ke trash untuk menyelesaikannya. Selesaikan kedua pemicu sebelum memeriksa 2 kartu security.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Pilih Birdramon untuk Alliance dan pertahankan Dracomon unsuspend untuk serangan terakhir.",
  "learn.lesson.drill-mind-link.step.attack-player": "Serang pemain dengan Dracomon untuk menang.",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "Dracomon masih siap karena Birdramon digunakan untuk membayar Alliance.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve: gabungkan field dan tangan",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "Buat RagnaLoardmon pada timing Counter menggunakan satu Digimon di field dan satu material dari tangan.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Sediakan kedua material DNA yang ditentukan saat Counter",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "Selesaikan proses delete khusus DNA sebelum serangan berlanjut",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon menggabungkan kedua material tanpa biaya, menyingkirkan penyerang, lalu memenangkan permainan pada giliran berikutnya.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "Bot menyerang saat Anda memiliki 0 security. Durandamon berada di area battle, sedangkan BryweLudramon dan RagnaLoardmon ada di tangan Anda.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve membutuhkan Digimon yang ditentukan di field dan kartu lain yang ditentukan di tangan.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "Pada Counter, gunakan RagnaLoardmon. Pilih Durandamon di area battle dan BryweLudramon di tangan Anda untuk Blast DNA Digivolve. Selesaikan efeknya dan pilih Plesiomon yang menyerang untuk di-delete.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "Efek digivolve mengirim kartu security lawan terakhir ke trash. Efek khusus DNA lalu men-delete penyerang sebelum serangannya mengenai Anda.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "Tunggu hingga bot melewatkan gilirannya. RagnaLoardmon baru Anda siap untuk giliran Anda.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA menciptakan Digimon baru dan menggabungkan dua material dalam sumbernya.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "Serang pemain dengan RagnaLoardmon untuk menang.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "Penyerang telah di-delete saat Counter, jadi Anda selamat tanpa security.",
  "learn.lesson.drill-link.title": "Link +: simpan tautan tambahan",
  "learn.lesson.drill-link.summary": "Berikan Deusmon tautan kedua tanpa mengganti tautan pertama.",
  "learn.lesson.drill-link.goal1": "Tautkan kartu tangan dengan membayar biaya tautannya",
  "learn.lesson.drill-link.goal2": "Gunakan Link +1 untuk menyimpan dua kartu tautan",
  "learn.lesson.drill-link.done":
    "Deusmon menyimpan kedua tautan Navimon, memeriksa security, dan meninggalkan Birdramon sebagai serangan pemenang.",
  "learn.lesson.drill-link.step.intro":
    "Digimon biasanya hanya menyimpan 1 kartu tautan. Deusmon punya Link +1, jadi limitnya adalah 2. Navimon sudah tertaut.",
  "learn.lesson.drill-link.step.intro.hint": "Kartu tautan berada di samping dan bukan merupakan sumber digivolve.",
  "learn.lesson.drill-link.step.link":
    "Pilih Navimon di tangan Anda, pilih Tautan, dan pilih Deusmon. Bayar biaya tautan 1 memorinya.",
  "learn.lesson.drill-link.step.link.hint":
    "Kedua kartu Navimon tetap terhubung karena Deusmon memiliki ruang untuk 2.",
  "learn.lesson.drill-link.step.attack-security":
    "Serang pemain dengan Deusmon untuk memeriksa kartu security terakhir.",
  "learn.lesson.drill-link.step.attack-security.hint": "Bonus DP link-nya tetap aktif selama kedua link terpasang.",
  "learn.lesson.drill-link.step.attack-player": "Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-link.step.attack-player.hint": "Serangan terakhir terpisah dari pemeriksaan security.",
  "learn.lesson.drill-use-req.title": "Use Req.: memenuhi suatu sifat, bukan warna",
  "learn.lesson.drill-use-req.summary": "Gunakan e-Pulse putih sedangkan bidang Anda hanya menyediakan warna kuning.",
  "learn.lesson.drill-use-req.goal1": "Membaca kondisi Use Req. yang ditentukan",
  "learn.lesson.drill-use-req.goal2": "Membayar biaya Opsi sambil mengabaikan persyaratan warna saja",
  "learn.lesson.drill-use-req.done":
    "Liollmon memenuhi Use Req., e-Pulse merekrut Digimon lain, dan Liollmon asli Anda menang.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse berwarna putih, tetapi Anda hanya memiliki Liollmon kuning di area battle. Use Req.-nya menerima kartu BEATBREAK di field Anda.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon memiliki BEATBREAK, sehingga Anda dapat mengabaikan persyaratan warna putih.",
  "learn.lesson.drill-use-req.step.use-option":
    "Gunakan e-Pulse dari tangan Anda untuk 3 memory. Terima efeknya dan mainkan Liollmon lainnya dari tangan Anda tanpa membayar biaya permainannya.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req. hanya mengabaikan persyaratan warna. Anda tetap membayar biaya penggunaan 3 memory. Setelah efek selesai, e-Pulse tetap berada di area battle.",
  "learn.lesson.drill-use-req.step.attack-player": "Serang pemain dengan Liollmon yang sudah bertarung untuk menang.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "Liollmon yang baru dimainkan tidak dapat menyerang giliran ini; pilih yang asli.",
  "learn.lesson.drill-ascension.title": "Ascension: mengubah proses delete menjadi security",
  "learn.lesson.drill-ascension.summary":
    "Biarkan ScourgeChiropmon menjadi security sehingga Anda dapat bertahan dari bot dan menang sesudahnya.",
  "learn.lesson.drill-ascension.goal1": "Selesaikan Ascension setelah proses delete pertempuran sesungguhnya",
  "learn.lesson.drill-ascension.goal2": "Gunakan security yang ditambahkan untuk bertahan dalam giliran",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon naik ke security, menyerap serangan bot, dan membiarkan Birdramon menang.",
  "learn.lesson.drill-ascension.step.intro":
    "Anda memiliki 0 security. Birdramon dimainkan pada giliran ini dan harus menunggu. ScourgeChiropmon memiliki Ascension dan dapat menjadi security Anda setelah di-delete.",
  "learn.lesson.drill-ascension.step.intro.hint":
    "Bot akan menyerang pada gilirannya, jadi Anda memerlukan kartu security sebelum mengoper.",
  "learn.lesson.drill-ascension.step.ascend":
    "Serang Plesiomon yang suspend dengan ScourgeChiropmon. ScourgeChiropmon kalah dalam battle. Terima Ascension dan letakkan ScourgeChiropmon di atas tumpukan security Anda.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon memiliki 8000 DP melawan Plesiomon dengan 12000 DP. Tidak ada pembayaran Tamer yang tersedia untuk efek proses delete lainnya.",
  "learn.lesson.drill-ascension.step.end-turn": "Kartu security baru Anda sudah siap. Akhiri giliran Anda.",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramon masih belum bisa menyerang pada giliran dimainkan.",
  "learn.lesson.drill-ascension.step.your-turn":
    "Biarkan bot menyerang kartu security baru Anda, lalu tunggu giliran Anda.",
  "learn.lesson.drill-ascension.step.your-turn.hint":
    "Tanpa Ascension, serangan itu akan mengalahkan Anda di 0 security.",
  "learn.lesson.drill-ascension.step.attack-player": "Serang pemain dengan Birdramon untuk menang.",
  "learn.lesson.drill-ascension.step.attack-player.hint":
    "Birdramon dapat menyerang sekarang, dan bot tidak memiliki security.",
  "learn.lesson.drill-detach.title": "Detach: gunakan tautan untuk tetap bermain",
  "learn.lesson.drill-detach.summary": "Cegah Cocytus Breath dengan melepaskan tautan Seven Code yang cocok.",
  "learn.lesson.drill-detach.goal1": "Gunakan Detach saat efek lawan akan mengeluarkan Digimon Anda dari area battle",
  "learn.lesson.drill-detach.goal2": "Bayar dengan tautan yang cocok, bukan sumber",
  "learn.lesson.drill-detach.done":
    "Weatherdramon kehilangan tautannya tetapi tetap bertahan dalam pertempuran dan menang pada giliran Anda.",
  "learn.lesson.drill-detach.step.intro":
    "Bot akan menggunakan Cocytus Breath untuk mengembalikan Weatherdramon ke tangan Anda. Weatherdramon memiliki Detach untuk tautan Seven Code.",
  "learn.lesson.drill-detach.step.intro.hint": "Tautan Roleplaymon-nya memiliki sifat Seven Code yang diperlukan.",
  "learn.lesson.drill-detach.step.detach":
    "Saat pilihan perlindungan muncul, terima Detach dan kirim Roleplaymon yang menjadi link ke trash. Weatherdramon tetap berada di area battle.",
  "learn.lesson.drill-detach.step.detach.hint":
    "Tautan menuju ke trash. Weatherdramon kehilangan DP linknya, namun tidak kembali ke tangan Anda.",
  "learn.lesson.drill-detach.step.your-turn": "Bot telah menghabiskan Opsinya. Tunggu sampai itu berlalu.",
  "learn.lesson.drill-detach.step.your-turn.hint":
    "Detach mencegah Digimon meninggalkan area battle; Weatherdramon tidak dimainkan kembali.",
  "learn.lesson.drill-detach.step.attack-player": "Serang pemain dengan Weatherdramon untuk menang.",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "Kehadirannya di lapangan memungkinkannya menyerang pada giliran Anda.",
  "learn.lesson.drill-succession.title": "Succession: gunakan efek normal kartu sumber",
  "learn.lesson.drill-succession.summary":
    "Gunakan teks sumber normal Ceresmon melalui Succession untuk men-delete Digimon dengan Blocker selama serangan Palmon.",
  "learn.lesson.drill-succession.goal1": "Membaca sumber pencocokan paling atas yang dipilih oleh Succession",
  "learn.lesson.drill-succession.goal2": "Mengatasi efek normal yang disalin daripada kotak yang diwarisi",
  "learn.lesson.drill-succession.done":
    "Succession menyalin reaksi suspend normal Ceresmon, men-delete Monmon, dan membiarkan Palmon men-delete security sebelum Dracomon menang.",
  "learn.lesson.drill-succession.step.intro":
    "Ceresmon teratas Anda memiliki Succession (Ceresmon). Kartu sumber Ceresmon memiliki efek normal All Turns: saat Digimon menjadi suspend, berikan -3000 DP kepada satu Digimon lawan untuk setiap Digimon yang menjadi suspend saat itu. Succession memperoleh efek normal tersebut.",
  "learn.lesson.drill-succession.step.intro.hint":
    "Teks ini ada di kotak efek normal sumber, bukan kotak warisannya. Monmon hanya memiliki 1000 DP. DP 2000 Palmon juga mengalahkan Digimon 1000 DP security.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Serang pemain dengan Palmon. Saat Palmon suspend, efek yang diperoleh Ceresmon melalui Succession terpicu. Pilih Monmon untuk menerima -3000 DP; ia di-delete sebelum dapat block. Palmon lalu memeriksa kartu security terakhir dan bertahan.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "Selesaikan reaksi Ceresmon yang disalin sebelum berpindah ke waktu blok.",
  "learn.lesson.drill-succession.step.attack-player":
    "Setelah Palmon menyelesaikan pemeriksaan security-nya, serang pemain dengan Dracomon untuk menang.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "Cek security terakhir tidak menang dengan sendirinya. Dracomon membuat serangan kemenangan terpisah.",
  "learn.lesson.practice-game-preparation.title": "Dari tangan pembuka hingga pertarungan yang menang",
  "learn.lesson.practice-game-preparation.summary":
    "Mulailah dengan 0 memory, deck legal, 5 kartu di setiap tangan, dan 5 kartu security. Besarkan penyerang Anda, lalu menangkan permainan.",
  "learn.lesson.practice-game-preparation.goal1":
    "Kenali tangan awal, tumpukan security, Digi-Egg deck, dan pengecualian penarikan kartu pada giliran pertama",
  "learn.lesson.practice-game-preparation.goal2":
    "Besarkan Digimon dan kosongkan lima kartu security dalam beberapa giliran sebelum serangan langsung terakhir",
  "learn.lesson.practice-game-preparation.done":
    "Anda bermain dari posisi pembukaan normal yang disiapkan melalui raise, digivolve, penyerahan memory dan serangan terakhir.",
  "learn.lesson.practice-game-preparation.step.intro":
    "Pertandingan ini dimulai dengan deck berisi 50 kartu, 5 kartu di setiap tangan, 5 kartu security, dan 0 memory. Anda bermain lebih dahulu dan tidak menarik kartu pada draw phase normal pertama. Bot melewatkan gilirannya agar Anda dapat melatih seluruh urutan.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Ada empat puluh kartu tersisa di setiap deck utama setelah menyisihkan lima untuk tangan dan lima untuk security. Digi-Egg deck Anda terpisah.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Tetaskan Koromon dari Digi-Egg deck Anda ke dalam area breeding yang kosong.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Hatch tidak memerlukan memory dan tidak menarik kartu. Ini menghabiskan tindakan breeding pada giliran ini.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digivolve Koromon menjadi Agumon di area breeding. Jalur ini membutuhkan 0 memory dan menarik 1 kartu.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Gunakan Agumon ST1-03 dari tangan Anda dan pilih Koromon sebagai alasnya.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digivolve Agumon yang Anda besarkan menjadi Greymon. Bayar 2 memory; setelah semua proses selesai, giliran berpindah ke bot.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Digivolve tetap menarik kartu di area breeding, bahkan pada giliran pertama. Memory berpindah dari 0 ke 2 di sisi lawan.",
  "learn.lesson.practice-game-preparation.step.move":
    "Tunggu hingga bot melewatkan gilirannya. Pada breeding phase berikutnya, pindahkan Greymon ke area battle.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Bergerak bukan memainkan Digimon baru. Greymon dapat menyerang giliran ini setelah bergerak.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digivolve Greymon menjadi Garudamon untuk tiga memory. Security Attack +1 yang diwarisi Greymon akan memberikan dua cek kepada Garudamon.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "Efek normal kartu sumber berbeda dengan efek bawaannya. Baca kotak efek bawah Greymon.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Serang pemain dengan Garudamon. Ia memeriksa dua dari lima kartu security bot satu per satu.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "DP Garudamon cukup tinggi untuk bertahan dalam pertempuran security ini. Bot akan memiliki tiga kartu security tersisa.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Mainkan Biyomon untuk dua memory. Ini menyerahkan giliran ke bot; simpan Biyomon untuk serangan yang akhirnya menang.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Digimon yang baru dimainkan biasanya tidak dapat menyerang pada giliran ini. Biyomon akan siap setelah bot lewat.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "Pada giliran Anda, serang dengan Garudamon dan oper saat suspend. Ulangi sampai bot memiliki nol security; tetap siapkan Biyomon untuk serangan terakhir.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Lewati breeding jika Anda tidak memiliki tindakan yang tersedia. Garudamon memeriksa dua kartu per serangan. Cek yang tidak terpakai tidak pernah menjadi pukulan langsung tambahan setelah kartu security terakhir.",
  "learn.lesson.practice-game-preparation.step.win":
    "Bot tidak memiliki security. Serang pemain dengan Biyomon untuk memenangkan pertandingan.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Anda masih memerlukan serangan sukses terpisah ini setelah menyelesaikan security. Biyomon dimainkan pada giliran sebelumnya dan dapat menyerang sekarang.",
  "learn.lesson.practice-rule-checks.title": "Pemeriksaan aturan: delete Digimon dengan DP nol",
  "learn.lesson.practice-rule-checks.summary":
    "Gunakan Opsi kuning untuk mengurangi DP Blocker di bawah nol, amati proses delete aturan, lalu menangkan dengan Salamon.",
  "learn.lesson.practice-rule-checks.goal1": "Memenuhi persyaratan warna Opsi dan menyelesaikan pengurangan DP-nya",
  "learn.lesson.practice-rule-checks.goal2":
    "Membedakan proses delete dengan pemeriksaan aturan dari proses delete yang diinstruksikan langsung oleh suatu efek",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens mengurangi DP Monochromon; pemeriksaan aturan men-deletenya, memungkinkan Salamon memberikan serangan pemenang.",
  "learn.lesson.practice-rule-checks.step.intro":
    "Bot tidak memiliki security, tetapi Monochromon dapat memblokir Salamon. Seven Heavens memberikan -10000 DP; peraturan men-delete Digimon area pertempuran dengan DP nol atau kurang.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon memasok warna kuning untuk kebutuhan warna Opsi. Anda memiliki sembilan memory dan Opsi berharga tujuh.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Gunakan Seven Heavens dari tangan Anda dan pilih Monochromon bot. Konfirmasikan target dan lihat targetnya menuju ke trash setelah efeknya teratasi.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "Option hanya memberikan pengurangan DP. Aturan 17-1-3-1-1 melakukan proses delete ketika DP yang dihasilkan nol atau kurang.",
  "learn.lesson.practice-rule-checks.step.win": "Blocker hilang. Serang pemain dengan Salamon untuk menang.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon sudah berada di area battle sebelum giliran ini. Setelah membayar biaya Option, Anda masih memiliki 2 memory, sehingga giliran tetap milik Anda.",
} satisfies Record<keyof typeof newDrillsEn, string>;
