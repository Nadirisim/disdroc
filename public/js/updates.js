(function () {
  'use strict';

  var STR = {
    en: {
      latestLabel: 'Latest release',
      backToApp: '← Back to disdroc',
      newFeatures: 'New Features',
      fixes: 'Fixes',
      highlights: 'Highlights',
      latest: 'Latest',
      stable: 'Stable',
      legacy: 'Legacy',
    },
    tr: {
      latestLabel: 'Son sürüm',
      backToApp: '← disdroc\'e dön',
      newFeatures: 'Yeni Özellikler',
      fixes: 'Düzeltmeler',
      highlights: 'Öne Çıkanlar',
      latest: 'Güncel',
      stable: 'Kararlı',
      legacy: 'Eski',
    },
  };

  var RELEASES = [
    {
      ver: 'v1.5.9', badge: 'latest',
      dates: { en: 'August 29, 2026', tr: '29 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: 'A fullscreen call now shows an unread-message badge on the minimize button, so a message arriving elsewhere in disdroc while you\'re in a call no longer goes unnoticed until you leave the call view.',
              tr: 'Artık tam ekran bir arama sırasında disdroc\'un başka bir yerine mesaj gelirse küçültme düğmesinde okunmamış mesaj rozeti görünüyor — aramadan çıkana kadar fark edilmeden kalmıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.7', badge: 'stable',
      dates: { en: 'August 11, 2026', tr: '11 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Automatic bans for extreme-confidence AI flags</strong> — reports the AI moderation model is very confident about (measured ≥93% precision on held-out data) now trigger an automatic account + IP ban instead of waiting for manual review, on top of the advisory signal added in v1.5.6.',
              tr: '<strong>Aşırı yüksek güvenli AI işaretlemelerinde otomatik yasaklama</strong> — AI moderasyon modelinin çok emin olduğu şikâyetler (test verisinde ölçülen ≥%93 kesinlik) artık manuel incelemeyi beklemeden otomatik hesap + IP yasağı tetikliyor, v1.5.6 sürümünde eklenen tavsiye niteliğindeki sinyale ek olarak.',
            },
            {
              en: '<strong>Ban appeals</strong> — banned users can now submit an in-app appeal from the ban notice page; moderators review and resolve appeals (including AI-triggered ones) from a new Appeals tab.',
              tr: '<strong>Yasak itirazları</strong> — yasaklı kullanıcılar artık yasak bildirim sayfasından uygulama içinden itiraz gönderebiliyor; moderatörler itirazları (AI kaynaklı olanlar dahil) yeni İtirazlar sekmesinden inceleyip karara bağlıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.6', badge: 'stable',
      dates: { en: 'August 11, 2026', tr: '11 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Anime/drawn-content NSFW detection</strong> — the upload filter now also runs a rating model trained specifically on anime-style art, catching explicit drawn content the old photo-only filter missed.',
              tr: '<strong>Anime/çizim içerik NSFW tespiti</strong> — yükleme filtresi artık özellikle anime tarzı görseller için eğitilmiş bir derecelendirme modeli de çalıştırıyor, eski yalnızca-fotoğraf filtresinin kaçırdığı açık çizim içerikleri de yakalıyor.',
            },
            {
              en: '<strong>AI-assisted report review</strong> — reported messages are now scored by an in-house text classifier (threats, harassment, hate speech, sexual content, severe toxicity) and shown to moderators as a signal in the reports panel — purely advisory, it never bans anyone on its own.',
              tr: '<strong>AI destekli şikâyet incelemesi</strong> — şikâyet edilen mesajlar artık kendi metin sınıflandırıcımızla (tehdit, taciz, nefret söylemi, cinsel içerik, ağır toksisite) puanlanıp yöneticilere şikâyetler panelinde bir sinyal olarak gösteriliyor — tamamen tavsiye niteliğinde, kendi başına kimseyi yasaklamaz.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.5', badge: 'stable',
      dates: { en: 'August 6, 2026', tr: '6 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Turkish typos on the invite page</strong> — the join-server page had a couple of garbled Turkish strings ("katğl" instead of "katıl", and similar). Fixed.',
              tr: '<strong>Davet sayfasındaki Türkçe yazım hataları</strong> — sunucuya katılma sayfasında birkaç bozuk Türkçe metin vardı ("katıl" yerine "katğl" gibi). Düzeltildi.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.4', badge: 'stable',
      dates: { en: 'August 6, 2026', tr: '6 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Invites that never expire</strong> — the invite creation dialog now has a "Never expires" option alongside the hours field, for a permanent server invite link.',
              tr: '<strong>Süresi hiç dolmayan davetler</strong> — davet oluşturma penceresinde artık saat alanının yanında "Süresi hiç dolmasın" seçeneği var, kalıcı bir sunucu davet bağlantısı için.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.3', badge: 'stable',
      dates: { en: 'August 6, 2026', tr: '6 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Switching channels flipped to the DMs bar</strong> — the v1.5.2 sidebar fix used a field server channels don\'t actually carry, so every plain channel switch inside a server misread as leaving it and swapped the sidebar to the DM list. Channel switches now correctly stay on the server\'s channel list.',
              tr: '<strong>Kanal değiştirmek DM\'ler çubuğuna geçiyordu</strong> — v1.5.2\'deki kenar çubuğu düzeltmesi, sunucu kanallarının aslında taşımadığı bir alanı kullanıyordu, bu yüzden bir sunucu içindeki her sıradan kanal değişimi sunucudan ayrılmış gibi yanlış anlaşılıp kenar çubuğunu DM listesine çeviriyordu. Kanal değişimleri artık doğru şekilde sunucunun kanal listesinde kalıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.2', badge: 'stable',
      dates: { en: 'August 6, 2026', tr: '6 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Left sidebar getting stuck on the wrong panel</strong> — opening a DM from a profile card while inside a server, accepting an incoming call, or jumping in from a notification could leave the server channel list (or the DM list) showing on screen instead of switching, until an unrelated new message forced it to refresh. It now switches immediately.',
              tr: '<strong>Sol kenar çubuğu yanlış panelde takılı kalıyordu</strong> — bir sunucudayken profil kartından DM açmak, gelen bir aramayı kabul etmek veya bir bildirimden atlamak, ilgisiz yeni bir mesaj onu yenilemeye zorlayana kadar sunucu kanal listesinin (veya DM listesinin) ekranda yanlışlıkla kalmasına neden olabiliyordu. Artık hemen değişiyor.',
            },
            {
              en: '<strong>Member list closing on every channel switch</strong> — on phones, browsing a different text channel inside the same server used to also close the member list drawer if it was open. It now stays open across channel switches and only closes when you actually leave the server.',
              tr: '<strong>Üye listesi her kanal değişiminde kapanıyordu</strong> — telefonlarda, aynı sunucu içinde farklı bir metin kanalına geçmek, açıksa üye listesi panelini de kapatıyordu. Artık kanal değişimlerinde açık kalıyor ve yalnızca sunucudan gerçekten ayrıldığınızda kapanıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.1', badge: 'stable',
      dates: { en: 'August 5, 2026', tr: '5 Ağustos 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Compact consecutive messages</strong> — when you (or anyone) send several messages in a row within a few minutes, they now stack tightly under a single avatar/name/time instead of repeating it for every line. Hover a compact message to bring back its timestamp and the reply/more actions.',
              tr: '<strong>Ardışık mesajlar artık daha kompakt</strong> — siz (veya başka biri) birkaç dakika içinde art arda birden fazla mesaj gönderdiğinizde, artık her satırda avatar/isim/saat tekrarlanmak yerine tek bir başlığın altında sıkıca toplanıyor. Kompakt bir mesajın üzerine gelmek saatini ve yanıtla/diğer işlemlerini geri getirir.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Chat header icons</strong> — the call, threads, pins and profile buttons above a conversation now get the same visible outline as the inbox/mentions button next to search, instead of only showing a border on hover.',
              tr: '<strong>Sohbet başlığı simgeleri</strong> — bir konuşmanın üzerindeki arama, konular, sabitlenenler ve profil düğmeleri artık aramanın yanındaki gelen kutusu/bahsetmeler düğmesiyle aynı görünür kenarlığa sahip; artık yalnızca üzerine gelindiğinde kenarlık göstermiyorlar.',
            },
            {
              en: '<strong>In-call menus getting stuck open</strong> — Voice FX, soundboard, people volume, screen-share options and the ••• menu could get stuck open after clicking anything inside them, so an outside click no longer closed them. They now close properly every time.',
              tr: '<strong>Görüşme içi menüler açık takılıyordu</strong> — Ses Efektleri, ses tahtası, kişi ses seviyesi, ekran paylaşımı seçenekleri ve ••• menüsü, içlerindeki bir şeye tıklandıktan sonra açık takılıp dışarı tıklamayla kapanmıyordu. Artık her zaman düzgün kapanıyorlar.',
            },
            {
              en: '<strong>Friends panel</strong> — removed the subtitle under the "Friends" header that just repeated what the heading already said.',
              tr: '<strong>Arkadaşlar paneli</strong> — "Arkadaşlar" başlığının altında, başlığın zaten söylediğini tekrarlayan alt yazı kaldırıldı.',
            },
          ],
        },
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Visual polish</strong> — primary buttons, dialogs, the quick switcher and a few other key surfaces now cast a subtly branded shadow instead of a flat gray one.',
              tr: '<strong>Görsel iyileştirme</strong> — birincil düğmeler, iletişim kutuları, hızlı geçiş paneli ve birkaç önemli yüzey artık düz gri yerine hafif markalı bir gölge kullanıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.5.0', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Server folders</strong> — drag one server onto another in the rail to group them into a collapsible folder. Rename, recolor, or ungroup from the right-click menu; your layout is personal and syncs across devices.',
              tr: '<strong>Sunucu klasörleri</strong> — rayde bir sunucuyu diğerinin üzerine sürükleyerek onları katlanabilir bir klasörde gruplayın. Sağ tık menüsünden yeniden adlandırın, renklendirin veya gruptan çıkarın; düzeniniz kişiseldir ve cihazlar arasında senkronize olur.',
            },
            {
              en: '<strong>Favorites for DMs and groups</strong> — pin the conversations you actually use to a Favorites section above the rest of your DM list.',
              tr: '<strong>DM ve gruplar için Favoriler</strong> — gerçekten kullandığınız sohbetleri, DM listenizin geri kalanının üzerindeki bir Favoriler bölümüne sabitleyin.',
            },
            {
              en: '<strong>Per-server avatar</strong> — set a different profile picture for one specific server, same idea as the per-server nickname you could already set. Your normal avatar is unaffected everywhere else.',
              tr: '<strong>Sunucuya özel avatar</strong> — belirli bir sunucu için farklı bir profil resmi ayarlayın, halihazırda ayarlayabildiğiniz sunucuya özel takma adla aynı mantık. Normal avatarınız başka hiçbir yerde etkilenmez.',
            },
            {
              en: '<strong>Bots can now manage channels and join voice</strong> — the Developer Portal API can create/rename/delete channels, and (once the optional voice component is installed) join a voice channel to play audio, like a music bot. See the bot docs for the new endpoints.',
              tr: '<strong>Botlar artık kanalları yönetebilir ve sesli sohbete katılabilir</strong> — Geliştirici Portalı API\'si kanal oluşturabilir/yeniden adlandırabilir/silebilir ve (isteğe bağlı ses bileşeni kurulduğunda) bir müzik botu gibi ses çalmak için sesli kanala katılabilir. Yeni uç noktalar için bot belgelerine bakın.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Moderators can now spot likely alt accounts of a banned user</strong> — a new "Linked accounts" panel cross-references shared devices, browser fingerprints, and IP addresses to flag probable ban evasion. Detection-only — nothing is ever auto-banned.',
              tr: '<strong>Moderatörler artık yasaklı bir kullanıcının olası alt hesaplarını tespit edebilir</strong> — yeni bir "Bağlı hesaplar" paneli, muhtemel yasak ihlalini işaretlemek için paylaşılan cihazları, tarayıcı parmak izlerini ve IP adreslerini karşılaştırır. Yalnızca tespit amaçlıdır — hiçbir şey otomatik olarak yasaklanmaz.',
            },
            {
              en: '<strong>General performance pass</strong> — added missing database indexes and batched a number of per-item queries into single lookups (chat lists, thread summaries, channel permissions, offline notifications, soundboard) so the app stays snappy as servers and message history grow. No visible changes, just less work per request.',
              tr: '<strong>Genel performans iyileştirmesi</strong> — eksik veritabanı indeksleri eklendi ve bir dizi öğe başına sorgu tek seferlik aramalarda toplu hale getirildi (sohbet listeleri, konu özetleri, kanal izinleri, çevrimdışı bildirimler, ses tahtası); böylece sunucular ve mesaj geçmişi büyüdükçe uygulama hızlı kalır. Görünür bir değişiklik yok, sadece istek başına daha az iş.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.4.2', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Fixed: opening a call popover flashed your video for a moment</strong> — Voice, Sounds, Screen, Activities and People each briefly reloaded every camera and screen-share tile just to light up their own button; now only the button changes, so your video never flickers when you open or close one.',
              tr: '<strong>Düzeltildi: bir arama açılır penceresini açmak videonuzu bir an için titretiyordu</strong> — Ses, Sesler, Ekran, Etkinlikler ve Kişiler, sadece kendi düğmelerini yakmak için her kamera ve ekran paylaşımı karosunu kısaca yeniden yüklüyordu; artık yalnızca düğme değişiyor, yani birini açıp kapatırken videonuz asla titremiyor.',
            },
          ],
        },
        {
          type: 'feature',
          items: [
            {
              en: '<strong>60fps screen sharing</strong> — the Screen popover now has a frame-rate choice next to Quality. 30fps stays the default; pick 60fps for smoother motion (games, video) when you’ve got the upload bandwidth for it. If the network can’t keep up, it automatically falls back to 30fps rather than starving your voice.',
              tr: '<strong>60 fps ekran paylaşımı</strong> — Ekran açılır penceresinde artık Kalite’nin yanında bir kare hızı seçeneği var. Varsayılan 30 fps olarak kalıyor; yükleme bant genişliğiniz yeterliyse daha akıcı hareket için (oyunlar, video) 60 fps’yi seçin. Ağ yetişemezse, sesinizi aç bırakmak yerine otomatik olarak 30 fps’ye geri döner.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.4.1', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Fixed: the Voice popover could get stuck open</strong> — after clicking around inside it (trying a preset, dragging a slider), clicking anywhere outside stopped closing it, and the button that opened it could stay lit even after it was actually gone. Both are fixed; this also quietly fixes the same class of bug in every other popover menu in the app.',
              tr: '<strong>Düzeltildi: Ses açılır penceresi bazen açık takılı kalıyordu</strong> — içinde bir şeylere tıkladıktan sonra (bir efekt denemek, bir kaydırıcıyı sürüklemek), dışarıya tıklamak artık kapatmıyordu ve onu açan düğme, pencere aslında kapandıktan sonra bile yanık kalabiliyordu. İkisi de düzeltildi; bu aynı zamanda uygulamadaki diğer tüm açılır menülerde de aynı hata sınıfını sessizce düzeltiyor.',
            },
          ],
        },
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Voice filter tiles get a real border</strong> — a dozen near-identical small tiles in a tight grid needed more definition between them than a shadow alone gave.',
              tr: '<strong>Ses filtresi karoları artık gerçek bir kenarlığa sahip</strong> — sıkı bir düzende neredeyse birbirinin aynı bir düzine küçük karo, sadece bir gölgenin sağladığından daha fazla ayrıma ihtiyaç duyuyordu.',
            },
            {
              en: '<strong>Hear yourself / Noise gate moved to Settings → Voice</strong> — next to the rest of the mic chain (echo cancellation, noise suppression, AGC) they actually belong with, instead of cluttering the quick voice-filter popover.',
              tr: '<strong>Kendini duy / Gürültü kapısı, Ayarlar → Ses\'e taşındı</strong> — aslında ait oldukları mikrofon zincirinin geri kalanının (yankı giderme, gürültü bastırma, otomatik kazanç kontrolü) yanına, hızlı ses filtresi açılır penceresini doldurmak yerine.',
            },
            {
              en: '<strong>Screen share button now opens a small menu</strong> — pick entire screen / a window / a browser tab and set audio + quality right there, instead of jumping straight into the browser\'s picker with no way to change those without a right-click nobody would find.',
              tr: '<strong>Ekran paylaşımı düğmesi artık küçük bir menü açıyor</strong> — tüm ekranı / bir pencereyi / bir tarayıcı sekmesini seçin ve sesi + kaliteyi tam orada ayarlayın; kimsenin bulamayacağı bir sağ tık olmadan bunları değiştirmenin bir yolu olmadan doğrudan tarayıcının seçiciye atlaması yerine.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.4.0', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>The shared call panel is gone — Voice, Sounds, Screen, Activities and People are direct buttons now</strong>. Each opens its own small popover right where you clicked instead of a panel that took over part of the screen. Same content, same actions, just no menu to open first. On phones, everything not in the main row lives in More, same as before.',
              tr: '<strong>Paylaşılan arama paneli kalktı — Ses, Sesler, Ekran, Etkinlikler ve Kişiler artık doğrudan birer düğme</strong>. Her biri, ekranın bir kısmını kaplayan bir panel yerine tıkladığınız yerde küçük bir açılır pencere açıyor. İçerik ve işlemler aynı, sadece önce açılması gereken bir menü yok. Telefonlarda ana sıraya sığmayan her şey yine Daha Fazla\'da.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.3.3', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>The call panel no longer eats your video</strong> — on desktop, Voice/Sounds/Screen/Activities/People used to be a permanent side rail (fullscreen) or a bar that grew to fill most of the screen (inline), squeezing the actual call into a strip. It now floats over the top-left corner instead, so the video/tiles get the full width back. Opens and closes the same way as before — just doesn\'t reserve space for itself anymore. Phones are unchanged, still a bottom panel.',
              tr: '<strong>Arama paneli artık videonuzu yemiyor</strong> — masaüstünde Ses/Sesler/Ekran/Etkinlikler/Kişiler paneli, tam ekranda kalıcı bir yan şerit ya da satır içi görünümde ekranın çoğunu kaplayan bir çubuktu ve aramayı dar bir şeride sıkıştırıyordu. Artık sol üst köşede yüzen bir panel — video/kutucuklar tam genişliğine kavuşuyor. Açılıp kapanma şekli aynı, sadece artık kendine kalıcı yer ayırmıyor. Telefonlarda değişiklik yok, orada hâlâ alttan açılan panel var.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.3.2', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>The whole in-call panel redesigned</strong> — Voice, Sounds, Screen, Activities and People all shared the same flat, boxed-in look; every tile and row now has real depth (soft gradients, tinted shadows on the icons) instead of a plain gray fill, and the active tab gets a visible highlight instead of a bare underline. Same layout, same buttons, just a lot less flat.',
              tr: '<strong>Arama içi panelin tamamı yeniden tasarlandı</strong> — Ses, Sesler, Ekran, Etkinlikler ve Kişiler sekmelerinin hepsi aynı düz, kutu içinde kutu gibi görünüyordu; artık her karo ve satırda düz gri bir dolgu yerine gerçek bir derinlik var (yumuşak gradyanlar, ikonlarda renkli gölgeler) ve aktif sekme çıplak bir alt çizgi yerine görünür bir vurguyla öne çıkıyor. Yerleşim ve düğmeler aynı, sadece çok daha az düz.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.3.1', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>YouTube Music: shuffle play and Next</strong> — open a playlist and hit Shuffle Play to start it in random order, or click any track in a playlist to queue up the rest of it. A Next button appears in the player whenever there\'s a queue to skip through.',
              tr: '<strong>YouTube Music: karışık çal ve Sonraki</strong> — bir çalma listesini açıp Karışık Çal\'a basarak rastgele sırayla başlatın, ya da bir çalma listesindeki herhangi bir parçaya tıklayarak listenin geri kalanını sıraya alın. Sırada geçilecek bir şey olduğunda çalarda bir Sonraki düğmesi belirir.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>YouTube Music: fixed the seek bar and track length</strong> — some tracks (notably anything played from a Google-linked playlist) reported no duration at all, which showed the length as "--:--" forever and made the seek bar look stuck at the very end within a second of playing. It now waits for the real length instead of guessing, and shows an empty bar rather than a broken-looking one in the meantime.',
              tr: '<strong>YouTube Music: ilerleme çubuğu ve parça süresi düzeltildi</strong> — bazı parçalar (özellikle Google ile bağlanmış bir çalma listesinden çalınanlar) hiç süre bilgisi bildirmiyordu, bu yüzden süre sonsuza dek "--:--" görünüyor ve ilerleme çubuğu çalmaya başladıktan bir saniye sonra sona yapışmış gibi görünüyordu. Artık tahmin etmek yerine gerçek süreyi bekliyor ve bu sırada bozuk görünen bir çubuk yerine boş bir çubuk gösteriyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.3.0', badge: 'stable',
      dates: { en: 'August 1, 2026', tr: '1 Ağustos 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>YouTube Music: sign in with Google, and a real player</strong> — link your account with a one-click Google sign-in instead of copy-pasting headers (the extension and manual-paste options are still there if you\'d rather use those). The in-call player is redesigned too: bigger cover art, a proper ±10s/play transport, a real seek bar with a visible thumb, and a row showing everyone currently listening in sync.',
              tr: '<strong>YouTube Music: Google ile giriş yapın, ve gerçek bir çalar</strong> — hesabınızı başlık kopyala-yapıştır yerine tek tıkla Google girişiyle bağlayın (uzantı ve elle yapıştırma seçenekleri hâlâ duruyor, isterseniz onları kullanabilirsiniz). Arama içi çalar da yeniden tasarlandı: daha büyük kapak görseli, gerçek bir ±10sn/oynat kontrol grubu, görünür bir tutamağa sahip gerçek bir ilerleme çubuğu ve o an senkronize dinleyen herkesi gösteren bir satır.',
            },
            {
              en: '<strong>Watch Together: control who can drive the timeline</strong> — the person who starts a video can now lock playback so only they control it, or leave it open for everyone like before. Also fixed a bug where seeking could silently fail to reach everyone else while the video was buffering.',
              tr: '<strong>Birlikte İzle: zaman çizelgesini kimin kontrol edebileceğini belirleyin</strong> — bir videoyu başlatan kişi artık oynatmayı kilitleyip yalnızca kendisinin kontrol etmesini sağlayabilir, ya da eskisi gibi herkese açık bırakabilir. Video arabelleğe alınırken ileri-geri sarmanın diğer herkese sessizce ulaşmayabildiği bir hata da giderildi.',
            },
            {
              en: '<strong>Call controls, reorganized</strong> — Screen Share and Activities are direct buttons again instead of being buried in a panel. The overflow "•••" menu is now a proper slide-up sheet on phones, same gesture as the rest of the app.',
              tr: '<strong>Arama kontrolleri yeniden düzenlendi</strong> — Ekran Paylaşımı ve Etkinlikler, bir panelin içinde gizlenmek yerine yeniden doğrudan birer düğme. Taşma "•••" menüsü artık telefonlarda uygulamanın geri kalanıyla aynı hareketi kullanan, gerçek bir aşağıdan yukarı kayan sayfa.',
            },
            {
              en: 'You can no longer run a shared YouTube video and YouTube Music at the same time in the same call — starting one now stops the other, so there\'s always exactly one shared activity.',
              tr: 'Artık aynı aramada paylaşılan bir YouTube videosu ile YouTube Music\'i aynı anda çalıştıramazsınız — birini başlatmak diğerini durdurur, böylece her zaman tam olarak tek bir paylaşılan etkinlik olur.',
            },
            {
              en: 'The landing page now explains what disdroc actually is on the very first screen, without needing to scroll.',
              tr: 'Açılış sayfası artık disdroc\'un ne olduğunu, kaydırmaya gerek kalmadan ilk ekranda açıklıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.7', badge: 'stable',
      dates: { en: 'July 28, 2026', tr: '28 Temmuz 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>YouTube Music, right in a call</strong> — A new activity next to Watch Together: search for a song or artist and listen together, in sync, with everyone in the call.',
              tr: '<strong>Aramanın içinde YouTube Music</strong> — Birlikte İzle\'nin yanında yeni bir etkinlik: bir şarkı veya sanatçı arayın, aramadaki herkesle senkronize şekilde birlikte dinleyin.',
            },
            {
              en: '<strong>Whiteboard: twice the colors, a random-color button, and four pencil textures</strong> — Pencil, Marker, Chalk and Spray each draw differently, there are now 16 colors to choose from (was 8), and a shuffle button picks one for you. Bigger and smaller size options too, better for erasing large areas.',
              tr: '<strong>Beyaz tahta: iki kat renk, rastgele renk düğmesi ve dört farklı kalem dokusu</strong> — Kalem, Marker, Tebeşir ve Sprey her biri farklı çiziyor, artık 16 renk arasından seçim yapabilirsiniz (8 yerine) ve bir karıştırma düğmesi sizin için birini seçiyor. Büyük alanları silmek için daha büyük ve daha küçük boyut seçenekleri de eklendi.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.6', badge: 'stable',
      dates: { en: 'July 28, 2026', tr: '28 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Call panel fully translated</strong> — the tab strip, voice changer, screen share, activities, people list and voice settings inside a call were still showing English even with Turkish selected. All of it is translated now.',
              tr: '<strong>Arama paneli artık tamamen Türkçe</strong> — sekme şeridi, ses değiştirici, ekran paylaşımı, etkinlikler, kişi listesi ve ses ayarları Türkçe seçiliyken bile İngilizce görünüyordu. Artık hepsi Türkçe.',
            },
            {
              en: '<strong>Removed the in-call Chat tab</strong> — it duplicated the call\'s own text channel/DM and cluttered the panel.',
              tr: '<strong>Arama içi Sohbet sekmesi kaldırıldı</strong> — aramanın kendi metin kanalı/DM\'siyle aynı işi yapıyor ve paneli dolduruyordu.',
            },
            {
              en: '<strong>Cleaner call panel on phones</strong> — the tab strip was seven unlabeled icons crammed edge to edge, unreadable without a hover tooltip a phone doesn\'t have. Every tab now has its own short label, same shape as the buttons below it.',
              tr: '<strong>Telefonda daha sade arama paneli</strong> — sekme şeridi, telefonda bulunmayan bir üzerine gelme ipucu olmadan okunamayan, yan yana sıkışmış yedi etiketsiz simgeden oluşuyordu. Artık her sekmenin, altındaki düğmelerle aynı biçimde kendi kısa etiketi var.',
            },
            {
              en: '<strong>Removed a redundant button on the full-screen call view</strong> — phones already had a minimize button at the top right; the bottom row had a second one doing the same thing.',
              tr: '<strong>Tam ekran arama görünümünde tekrar eden bir düğme kaldırıldı</strong> — telefonlarda zaten sağ üstte bir küçültme düğmesi vardı; alt sırada aynı işi yapan ikinci bir düğme daha bulunuyordu.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.5', badge: 'stable',
      dates: { en: 'July 27, 2026', tr: '27 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Minimizing a call on phones no longer breaks the screen</strong> — Calls open full-screen on phones by default; closing that view used to fall back to a broken layout with the call buttons stranded in the middle of the screen, on top of the message list. There\'s now a green "On a call" bar at the top instead — tap it to jump back into the full-screen view.',
              tr: '<strong>Telefonda aramayı küçültmek artık ekranı bozmuyor</strong> — Aramalar telefonlarda varsayılan olarak tam ekran açılır; bu görünümü kapatmak, arama düğmelerinin mesaj listesinin üzerinde, ekranın ortasında asılı kaldığı bozuk bir görünüme dönüyordu. Artık onun yerine üstte yeşil bir "Aramadasınız" çubuğu var — tam ekran görünüme dönmek için ona dokunun.',
            },
            {
              en: '<strong>Watch Together pause sync fixed again</strong> — Pausing the shared video sometimes didn\'t pause it for everyone else, because the app only ever listened for one specific signal from the YouTube player and that signal doesn\'t always arrive. It now also catches a plain play/pause change directly, so it can\'t be missed.',
              tr: '<strong>Birlikte İzle duraklatma senkronizasyonu yeniden düzeltildi</strong> — Paylaşılan videoyu duraklatmak bazen diğer herkes için duraklatmıyordu; çünkü uygulama YouTube oynatıcısından yalnızca tek bir sinyali dinliyordu ve bu sinyal her zaman gelmiyordu. Artık düz bir oynat/duraklat değişikliğini de doğrudan yakalıyor, bu yüzden kaçırılamıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.4', badge: 'stable',
      dates: { en: 'July 25, 2026', tr: '25 Temmuz 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>Voice changer</strong> — Sound like someone else while you talk. Twelve effects — Helium, Deep voice, Robot, Alien, Old radio, Megaphone, Cave, Underwater, Demon, Chipmunk and Whisper — each with sliders to push it further or dial it back. Pick one from the Voice panel in a call and everyone hears it instantly; there is nothing to install and no delay added to your voice. Turn on <em>Hear yourself</em> while you\'re choosing to preview an effect before anyone else hears it.',
              tr: '<strong>Ses değiştirici</strong> — Konuşurken başka biri gibi duyulun. On iki efekt — Helyum, Kalın ses, Robot, Uzaylı, Eski radyo, Megafon, Mağara, Su altı, Şeytan, Sincap ve Fısıltı — her biri daha ileri götürmek veya hafifletmek için kaydırıcılarla birlikte. Bir aramada Ses panelinden birini seçin, herkes anında duysun; kurulacak bir şey yok ve sesinize gecikme eklemiyor. Seçim yaparken <em>Kendini duy</em> seçeneğini açarak bir efekti başkaları duymadan önce dinleyebilirsiniz.',
            },
            {
              en: '<strong>Noise gate</strong> — Mutes you between sentences, so a mechanical keyboard, a fan or a noisy room doesn\'t sit in everyone\'s ears while you\'re not talking. It opens the instant you start speaking, so it never clips the start of a word. Toggle it in the same Voice panel.',
              tr: '<strong>Gürültü kapısı</strong> — Cümleleriniz arasında sizi susturur; böylece mekanik klavye, vantilatör veya gürültülü bir oda siz konuşmazken herkesin kulağında kalmaz. Konuşmaya başladığınız anda açılır, bu yüzden kelimenin başını asla kesmez. Aynı Ses panelinden açıp kapatabilirsiniz.',
            },
            {
              en: '<strong>Call controls no longer open pop-up menus</strong> — The soundboard, screen-share options and activities used to appear as floating menus over the call, and closed the moment you touched anything else. They\'re now one panel that opens <em>inside</em> the call: the video makes room for it instead of hiding behind it, and it stays open while you keep using it. On a computer it docks to the side in full-screen view; on a phone it opens under the tiles, above the buttons.',
              tr: '<strong>Arama kontrolleri artık açılır menü açmıyor</strong> — Ses tahtası, ekran paylaşımı seçenekleri ve etkinlikler eskiden aramanın üzerinde yüzen menüler olarak açılıyor ve başka bir yere dokunduğunuz anda kapanıyordu. Artık hepsi aramanın <em>içinde</em> açılan tek bir panel: video panelin arkasına saklanmak yerine ona yer açıyor ve siz kullandıkça açık kalıyor. Bilgisayarda tam ekran görünümde yana yerleşiyor, telefonda ise kutucukların altında, düğmelerin üstünde açılıyor.',
            },
            {
              en: '<strong>Per-person volume now works on phones</strong> — Turning one loud person down (or muting them just for you) used to need a right-click, which a phone doesn\'t have. There\'s now a People tab in the call panel listing everyone with their own volume slider and mute button.',
              tr: '<strong>Kişi başına ses seviyesi artık telefonlarda da çalışıyor</strong> — Yüksek sesli birinin sesini kısmak (veya yalnızca kendiniz için susturmak) daha önce sağ tık gerektiriyordu, telefonlarda ise sağ tık yok. Artık arama panelinde herkesi kendi ses kaydırıcısı ve susturma düğmesiyle listeleyen bir Kişiler sekmesi var.',
            },
            {
              en: '<strong>The voice changer is built into the phone layout properly</strong> — It has its own button in the main call bar rather than hiding behind "More", and the effects are laid out as a grid of tiles just like the soundboard, so both work the same way.',
              tr: '<strong>Ses değiştirici telefon düzenine düzgün şekilde yerleştirildi</strong> — "Daha fazla" arkasına saklanmak yerine ana arama çubuğunda kendi düğmesi var ve efektler tıpkı ses tahtası gibi kutucuk ızgarası olarak düzenlendi; böylece ikisi de aynı şekilde çalışıyor.',
            },
            {
              en: '<strong>Chat inside calls</strong> — The call panel has a new Chat tab: read and send messages without leaving the call or the full-screen view. Voice channels finally have their own text chat, too.',
              tr: '<strong>Arama içinde sohbet</strong> — Arama panelinde yeni bir Sohbet sekmesi var: aramadan veya tam ekran görünümden çıkmadan mesajları okuyun ve gönderin. Ses kanallarının da artık kendi yazılı sohbeti var.',
            },
            {
              en: '<strong>Sketch &amp; Guess</strong> — A drawing-and-guessing game right inside your call: one person draws, everyone else races to guess the word. Runs on our own servers, opens inside the app — no other tab, no account, no ads. Find it under Activities.',
              tr: '<strong>Çiz &amp; Bil</strong> — Aramanızın içinde çizme-bilme oyunu: biri çizer, herkes kelimeyi bilmeye çalışır. Kendi sunucularımızda çalışır, uygulamanın içinde açılır — başka sekme yok, hesap yok, reklam yok. Aktiviteler bölümünde.',
            },
            {
              en: '<strong>A tidier call bar</strong> — One button now opens the whole call panel (it remembers your last tab) instead of a separate button for every panel. Spatial audio, ringing people in and voice settings moved into the panel\'s More tab.',
              tr: '<strong>Daha derli toplu arama çubuğu</strong> — Her panel için ayrı düğme yerine artık tek düğme tüm arama panelini açıyor (son sekmenizi hatırlıyor). Uzamsal ses, kişileri arama ve ses ayarları panelin Daha Fazla sekmesine taşındı.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Twitch watch-together works now</strong> — Starting a Twitch stream from Activities silently did nothing. It now actually starts for everyone in the call.',
              tr: '<strong>Birlikte Twitch izleme artık çalışıyor</strong> — Aktivitelerden Twitch yayını başlatmak sessizce hiçbir şey yapmıyordu. Artık aramadaki herkes için gerçekten başlıyor.',
            },
            {
              en: '<strong>Switching call-panel tabs no longer shifts the page</strong> — The panel keeps one fixed size across tabs, so the chat under it stays put.',
              tr: '<strong>Arama paneli sekmeleri arasında geçiş artık sayfayı oynatmıyor</strong> — Panel tüm sekmelerde sabit boyutta kalıyor, altındaki sohbet yerinden kımıldamıyor.',
            },
            {
              en: '<strong>Gartic Phone removed</strong> — It never truly ran inside the app (garticphone.com forbids embedding), so its slot went to Sketch &amp; Guess, which does.',
              tr: '<strong>Gartic Phone kaldırıldı</strong> — Uygulamanın içinde hiçbir zaman gerçekten çalışmıyordu (garticphone.com gömülmeye izin vermiyor); yeri, gerçekten içeride çalışan Çiz &amp; Bil\'e verildi.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.3', badge: 'stable',
      dates: { en: 'July 25, 2026', tr: '25 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Back didn\'t work on the What\'s New page</strong> — This page is separate from the app, so in the Android app the back button minimised disdroc instead of returning, and in a browser it opened in a new tab with nothing to go back to. Back now returns you to the app, and disdroc\'s own pages (What\'s New, Support, Developers) open in place on phones instead of a new tab.',
              tr: '<strong>Yenilikler sayfasında geri çalışmıyordu</strong> — Bu sayfa uygulamadan ayrı olduğu için Android uygulamasında geri düğmesi geri dönmek yerine disdroc\'u küçültüyordu, tarayıcıda ise geri dönecek bir şey olmayan yeni bir sekmede açılıyordu. Geri artık sizi uygulamaya döndürüyor ve disdroc\'un kendi sayfaları (Yenilikler, Destek, Geliştiriciler) telefonlarda yeni sekme yerine aynı yerde açılıyor.',
            },
            {
              en: '<strong>Opening a conversation is smoother</strong> — The loading placeholders were being drawn into the middle of the slide-in animation and then immediately replaced, which made the phone repaint the whole screen over and over (measured: 107 repaint tasks per chat open, now 19). The conversation now slides in cleanly and the messages land in it.',
              tr: '<strong>Sohbet açmak daha akıcı</strong> — Yükleme yer tutucuları içeri kayma animasyonunun ortasında çiziliyor ve hemen sonra değiştiriliyordu; bu da telefonun tüm ekranı defalarca yeniden çizmesine yol açıyordu (ölçüm: sohbet başına 107 yeniden çizim işi, şimdi 19). Sohbet artık temiz bir şekilde kayarak giriyor ve mesajlar onun içine yerleşiyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.2', badge: 'stable',
      dates: { en: 'July 25, 2026', tr: '25 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Animations were stuttering on phones</strong> — Every green "online" dot on screen was running a permanent glow animation that repainted 60 times a second, forever, even with the app sitting idle. With a normal friends list on screen that was constant background work for your phone, and every other animation — opening a chat, menus, settings — had to fight it for the same frame budget. The dot is now static, and the app does no rendering work at all when nothing is happening.',
              tr: '<strong>Animasyonlar telefonlarda takılıyordu</strong> — Ekrandaki her yeşil "çevrimiçi" noktası, uygulama boştayken bile saniyede 60 kez yeniden çizilen kalıcı bir parlama animasyonu çalıştırıyordu. Normal bir arkadaş listesinde bu, telefonunuz için sürekli bir arka plan yükü demekti ve diğer tüm animasyonlar — sohbet açma, menüler, ayarlar — aynı kare bütçesi için onunla yarışmak zorunda kalıyordu. Nokta artık sabit ve hiçbir şey olmadığında uygulama hiç render işi yapmıyor.',
            },
            {
              en: '<strong>Smoother screens and dialogs on mobile</strong> — Opening a conversation no longer runs two animations on top of each other, dialogs dropped an expensive full-screen blur that phones struggle with, loading placeholders stopped shimmering while a screen slides in, and the conversation view no longer holds a full-screen layer open for the whole session.',
              tr: '<strong>Mobilde daha akıcı ekranlar ve pencereler</strong> — Bir sohbeti açmak artık üst üste iki animasyon çalıştırmıyor, iletişim kutuları telefonları zorlayan pahalı tam ekran bulanıklığı bıraktı, yükleme yer tutucuları bir ekran kayarken parlamayı bıraktı ve sohbet görünümü artık tüm oturum boyunca tam ekran bir katman tutmuyor.',
            },
            {
              en: '<strong>Tapped items no longer stay stuck highlighted</strong> — On touch screens a tap left hover effects (cards lifting, swatches growing) latched on until you tapped something else. Those effects are now off on touch devices.',
              tr: '<strong>Dokunulan öğeler artık vurgulu kalmıyor</strong> — Dokunmatik ekranlarda bir dokunuş, üzerine gelme efektlerini (kartların kalkması, renk dairelerinin büyümesi) siz başka bir yere dokunana kadar takılı bırakıyordu. Bu efektler artık dokunmatik cihazlarda kapalı.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.1', badge: 'stable',
      dates: { en: 'July 25, 2026', tr: '25 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Tapping the tab you\'re already on now takes you back</strong> — Opening "You" or Notifications used to be a one-way trip: tapping the same tab again did nothing. Now it steps back out — a settings section returns to the You list, and the You / Friends / Notifications screens return to whatever you were looking at before, including the server channel list you came from.',
              tr: '<strong>Zaten açık olan sekmeye dokunmak artık geri götürüyor</strong> — "Sen" veya Bildirimler ekranını açmak tek yönlü bir yolculuktu: aynı sekmeye tekrar dokunmak hiçbir şey yapmıyordu. Artık bir adım geri gidiyor — bir ayar bölümü Sen listesine, Sen / Arkadaşlar / Bildirimler ekranları da geldiğiniz yere (sunucu kanal listeniz dahil) dönüyor.',
            },
            {
              en: '<strong>The members and profile buttons ignored your first tap</strong> — On phones the member list / profile panel needed two taps to appear, and its button could stay highlighted after you closed the panel. Both fixed.',
              tr: '<strong>Üyeler ve profil düğmeleri ilk dokunuşu yok sayıyordu</strong> — Telefonlarda üye listesi / profil paneli için iki kez dokunmak gerekiyordu ve paneli kapattıktan sonra düğme vurgulu kalabiliyordu. İkisi de düzeltildi.',
            },
            {
              en: '<strong>Message search is back on phones</strong> — Searching inside a conversation (and "search all chats") had no entry point at all on mobile. There\'s now a search button in the chat header that opens a full-width search bar.',
              tr: '<strong>Mesaj arama telefonlarda geri döndü</strong> — Bir sohbetin içinde arama (ve "tüm sohbetlerde ara") mobilde hiçbir yerden erişilemiyordu. Artık sohbet başlığında tam genişlikte bir arama çubuğu açan bir arama düğmesi var.',
            },
            {
              en: '<strong>Unread badges on the mobile tab bar</strong> — Unread messages and incoming friend requests now show as counters on the Home and Friends tabs, so you can see them without leaving the screen you\'re on.',
              tr: '<strong>Mobil sekme çubuğunda okunmamış rozetleri</strong> — Okunmamış mesajlar ve gelen arkadaşlık istekleri artık Ana Sayfa ve Arkadaşlar sekmelerinde sayaç olarak görünüyor; bulunduğunuz ekrandan ayrılmadan görebilirsiniz.',
            },
            {
              en: '<strong>Mobile screen headers were laid out wrong</strong> — Screen titles like "My Account" and "Notifications" were pushed to the far right of the bar, away from their own back arrow, and the colour swatches in settings were squashed into ovals. Both fixed, and the swipe-from-the-edge gesture now backs out of settings and side panels too — not just conversations.',
              tr: '<strong>Mobil ekran başlıkları yanlış hizalanıyordu</strong> — "Hesabım" ve "Bildirimler" gibi ekran başlıkları kendi geri okundan uzağa, çubuğun en sağına itiliyordu ve ayarlardaki renk seçenekleri oval şekilde eziliyordu. İkisi de düzeltildi; kenardan kaydırma hareketi artık yalnızca sohbetlerden değil, ayarlardan ve yan panellerden de geri çıkıyor.',
            },
            {
              en: '<strong>Easier to tap on touch screens</strong> — The send and attachment buttons, friend request accept/decline buttons, the message and conversation "⋯" menus and the header actions all got bigger touch targets, and the per-person voice volume menu — previously right-click only — now has a visible button.',
              tr: '<strong>Dokunmatik ekranlarda daha kolay dokunma</strong> — Gönder ve dosya ekleme düğmeleri, arkadaşlık isteği kabul/reddet düğmeleri, mesaj ve sohbet "⋯" menüleri ve başlık işlemleri daha büyük dokunma alanlarına kavuştu; daha önce yalnızca sağ tıkla açılan kişi bazlı ses düzeyi menüsünün artık görünür bir düğmesi var.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.2.0', badge: 'stable',
      dates: { en: 'July 19, 2026', tr: '19 Temmuz 2026' },
      groups: [
        {
          type: 'feature',
          items: [
            {
              en: '<strong>A brand-new mobile app layout</strong> — On phones, disdroc no longer hides everything behind a hamburger menu. Your servers and conversations are now the home screen, a bottom tab bar gives one-tap access to Home, Friends, Notifications and your profile, and conversations slide in as full screens with a back arrow (or a swipe from the left edge) to return.',
              tr: '<strong>Yepyeni mobil uygulama düzeni</strong> — Telefonlarda disdroc artık her şeyi hamburger menünün arkasına saklamıyor. Sunucularınız ve konuşmalarınız artık ana ekran; alttaki sekme çubuğu Ana Sayfa, Arkadaşlar, Bildirimler ve profilinize tek dokunuşla erişim sağlıyor. Konuşmalar tam ekran olarak açılıyor; geri okuyla veya ekranın sol kenarından kaydırarak geri dönebilirsiniz.',
            },
            {
              en: '<strong>A cleaner mobile composer</strong> — Rounded message box and a circular send button that lights up when you\'ve typed something.',
              tr: '<strong>Daha temiz mobil mesaj kutusu</strong> — Yuvarlatılmış mesaj kutusu ve bir şey yazdığınızda beliren yuvarlak gönder düğmesi.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>The Add Friend button could sit off-screen on phones</strong> — It\'s now always reachable next to the friends tabs.',
              tr: '<strong>Arkadaş Ekle düğmesi telefonlarda ekran dışında kalabiliyordu</strong> — Artık arkadaş sekmelerinin yanında her zaman erişilebilir.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.6', badge: 'stable',
      dates: { en: 'July 17, 2026', tr: '17 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Watch Together didn\'t stay in sync</strong> — Pausing or dragging the timeline on one screen could silently fail to update everyone else\'s, and a video reaching its end could get stuck replaying its first few seconds in a loop. Fixed.',
              tr: '<strong>Birlikte İzle senkronize kalmıyordu</strong> — Bir ekranda videoyu durdurmak veya zaman çizelgesini sürüklemek diğerlerine yansımayabiliyordu; video sona erdiğinde de ilk birkaç saniyeyi tekrar tekrar oynatarak takılabiliyordu. Düzeltildi.',
            },
            {
              en: '<strong>Friend requests and new DMs needed a refresh</strong> — Incoming friend requests, and the DM that appears after accepting one, now show up live instead of waiting for a page reload.',
              tr: '<strong>Arkadaşlık istekleri ve yeni DM\'ler yenileme gerektiriyordu</strong> — Gelen arkadaşlık istekleri ve bir isteği kabul ettikten sonra beliren DM artık sayfa yenilemesi beklemeden anında görünüyor.',
            },
            {
              en: '<strong>Getting Started checklist on mobile</strong> — Checklist rows with longer labels crowded their action button on narrow screens. Labels and buttons now stack cleanly on phone widths.',
              tr: '<strong>Mobilde Başlarken kontrol listesi</strong> — Daha uzun etiketli satırlar, dar ekranlarda eylem düğmesini sıkıştırıyordu. Etiketler ve düğmeler artık telefon genişliklerinde düzgünce alt alta sıralanıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.5', badge: 'stable',
      dates: { en: 'July 16, 2026', tr: '16 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Everything where you expect it</strong> — A layout pass to match muscle memory: the server name is now a dropdown holding Invite, Server Settings, Create Channel, Nickname and Leave (the old icon row and the Invite section are gone); category headers grew a hover "+" to create channels; Threads and Pinned messages moved into the chat header, with pins in a popout instead of a bar above the chat; GIF and emoji now sit to the right of the message box; the support button left the account panel (it lives in Settings); group chats merged into one Direct Messages list.',
              tr: '<strong>Her şey beklediğin yerde</strong> — Kas hafızasına uyan bir yerleşim düzenlemesi: sunucu adı artık Davet, Sunucu Ayarları, Kanal Oluştur, Takma Ad ve Ayrıl seçeneklerini içeren bir menü (eski simge satırı ve Davet bölümü kaldırıldı); kategori başlıklarına kanal oluşturan bir "+" eklendi; Konular ve Sabitlenmiş mesajlar sohbet başlığına taşındı, sabitler artık sohbetin üstünde bir şerit yerine açılır panelde; GIF ve emoji mesaj kutusunun sağında; destek düğmesi hesap panelinden çıktı (Ayarlar\'da); grup sohbetleri tek Direkt Mesajlar listesinde birleşti.',
            },
            {
              en: '<strong>More channel management at hand</strong> — Right-click any channel (voice too) for Edit, Delete and Channel access; servers with a banner now show it above the channel list.',
              tr: '<strong>Elinin altında daha çok kanal yönetimi</strong> — Herhangi bir kanala (ses dahil) sağ tıklayarak Düzenle, Sil ve Kanal erişimi; banner\'ı olan sunucular artık kanal listesinin üstünde gösteriyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.4', badge: 'stable',
      dates: { en: 'July 16, 2026', tr: '16 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Welcome messages</strong> — Servers can pick a welcome channel where "joined the server" messages get posted when someone new arrives. New servers use #general by default; change or turn it off in Server Settings → Overview.',
              tr: '<strong>Hoş geldin mesajları</strong> — Sunucular, yeni biri katıldığında "sunucuya katıldı" mesajlarının gönderileceği bir hoş geldin kanalı seçebilir. Yeni sunucularda varsayılan #general\'dır; Sunucu Ayarları → Genel Bakış\'tan değiştirilebilir veya kapatılabilir.',
            },
            {
              en: '<strong>Channel locks</strong> — Right-click a channel → "Channel access" to lock it per role: give @everyone "Read only" or "No access", then grant full access to the roles that should keep it. Restricted channels show a lock icon in the sidebar.',
              tr: '<strong>Kanal kilitleri</strong> — Bir kanala sağ tıklayıp "Kanal erişimi" ile rol bazında kilitle: @everyone\'a "Salt okunur" veya "Erişim yok" ver, ardından erişimi koruyacak rollere tam erişim tanı. Kısıtlı kanallar kenar çubuğunda kilit simgesiyle gösterilir.',
            },
            {
              en: '<strong>Denser chat text</strong> — Message text is slightly smaller and tighter, matching the rest of the interface for a cleaner, denser reading rhythm.',
              tr: '<strong>Daha yoğun sohbet metni</strong> — Mesaj metni biraz daha küçük ve sıkı; daha temiz ve yoğun bir okuma ritmi için arayüzün geri kalanıyla uyumlu.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.3', badge: 'stable',
      dates: { en: 'July 15, 2026', tr: '15 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Smoother everything</strong> — A polish pass across the whole app: modals, menus and image viewers now fade out instead of vanishing, drawers and their backdrops glide on mobile, channel categories collapse with an animation, the jump-to-present button fades in and out, and the loading screen eases away. Motion timing is unified app-wide, so everything moves with the same feel.',
              tr: '<strong>Her şey daha akıcı</strong> — Uygulama genelinde bir cila geçişi: pencereler, menüler ve görsel görüntüleyiciler artık aniden kaybolmak yerine kararak kapanıyor, mobilde çekmeceler ve arka planları kayarak açılıyor, kanal kategorileri animasyonla daralıyor, "şimdiye atla" düğmesi yumuşakça belirip kayboluyor ve yükleme ekranı akıcı biçimde çekiliyor. Hareket zamanlaması uygulama genelinde birleştirildi; her şey aynı hisle hareket ediyor.',
            },
            {
              en: '<strong>Loading skeletons</strong> — Slow channel loads now show shimmering message placeholders instead of a blank pane.',
              tr: '<strong>Yükleme iskeletleri</strong> — Yavaş yüklenen kanallar artık boş bir alan yerine parıldayan mesaj yer tutucuları gösteriyor.',
            },
            {
              en: '<strong>Sharper look</strong> — More depth across the app: the composer, chat header, menus, modals and user panel got refined edges, soft shadows and better hover feedback; text selection matches the theme; badges and chips were restyled; menus and dialogs now blur the background behind them.',
              tr: '<strong>Daha keskin görünüm</strong> — Uygulama genelinde daha fazla derinlik: mesaj kutusu, sohbet başlığı, menüler, pencereler ve kullanıcı paneli inceltilmiş kenarlar, yumuşak gölgeler ve daha iyi vurgu geri bildirimi aldı; metin seçimi temayla uyumlu; rozetler ve etiketler yeniden şekillendirildi; menüler ve pencereler artık arka planı bulanıklaştırıyor.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Fewer scroll jumps</strong> — Better off-screen message size estimates and layout-free progress meters reduce chat scroll jumping while content renders in.',
              tr: '<strong>Daha az kaydırma sıçraması</strong> — Ekran dışı mesajlar için daha iyi boyut tahminleri ve yerleşim tetiklemeyen ilerleme çubukları sayesinde içerik yüklenirken sohbet kaydırması daha az sıçrıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.2', badge: 'stable',
      dates: { en: 'July 11, 2026', tr: '11 Temmuz 2026' },
      groups: [
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Group chat → DM switch showed the wrong messages</strong> — Opening a DM right after a group chat could leave the old group\'s messages on screen instead of loading the DM (a JS error in the header actions silently aborted the switch). Fixed.',
              tr: '<strong>Grup sohbetinden DM\'e geçişte yanlış mesajlar görünüyordu</strong> — Bir grup sohbetinin hemen ardından bir DM açmak, DM yüklenmek yerine eski grubun mesajlarını ekranda bırakabiliyordu (üst bilgi eylemlerindeki bir JS hatası geçişi sessizce durduruyordu). Düzeltildi.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1.1', badge: 'stable',
      dates: { en: 'July 11, 2026', tr: '11 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Keyboard channel navigation</strong> — <code>Alt+↑/↓</code> jumps between channels/DMs in the sidebar; add <code>Shift</code> to jump only between chats with unread messages.',
              tr: '<strong>Klavyeyle kanal gezinme</strong> — <code>Alt+↑/↓</code> kenar çubuğundaki kanallar/DM\'ler arasında geçiş yapar; yalnızca okunmamış mesajlı sohbetler arasında geçmek için <code>Shift</code> ekle.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Voice call connection reliability</strong> — Fixed a bug where calls taking more than a few seconds to connect could get force-switched onto a relay-only path that doesn\'t exist without a TURN server configured, killing connections that would otherwise have succeeded directly. If your calls have been failing or dropping shortly after connecting, this should help.',
              tr: '<strong>Sesli arama bağlantı güvenilirliği</strong> — Bağlanması birkaç saniyeden uzun süren aramaların, TURN sunucusu tanımlı olmadığında var olmayan bir aktarım-yalnızca (relay-only) yola zorlanabilmesi hatası düzeltildi; bu durum, aslında doğrudan bağlanabilecek görüşmelerin kopmasına yol açıyordu. Aramaların bağlandıktan kısa süre sonra kesiliyor veya hiç bağlanamıyorsa bu düzeltme yardımcı olmalı.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.1', badge: 'stable',
      dates: { en: 'July 11, 2026', tr: '11 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Guided onboarding</strong> — New accounts get a short, dismissible checklist on the Friends page (profile, first server, first friend, first message) instead of an empty page and a wall of popups.',
              tr: '<strong>Rehberli başlangıç</strong> — Yeni hesaplar artık Arkadaşlar sayfasında boş bir sayfa ve açılır pencere yığını yerine kısa, kapatılabilir bir kontrol listesi görüyor (profil, ilk sunucu, ilk arkadaş, ilk mesaj).',
            },
            {
              en: '<strong>Advanced message search</strong> — Filter search with <code>from:</code>, <code>in:</code>, <code>has:file</code>, <code>has:link</code>, <code>before:</code> and <code>after:</code>, in both per-chat and global search.',
              tr: '<strong>Gelişmiş mesaj arama</strong> — Hem sohbet içi hem genel aramada <code>from:</code>, <code>in:</code>, <code>has:file</code>, <code>has:link</code>, <code>before:</code> ve <code>after:</code> ile filtrele.',
            },
            {
              en: '<strong>More notification control</strong> — A global "only notify me for @mentions" default (Settings → Notifications) that now also applies to push notifications when you\'re offline, plus a test-notification button.',
              tr: '<strong>Daha fazla bildirim kontrolü</strong> — Artık çevrimdışıyken push bildirimlerine de uygulanan, genel "yalnızca @bahsedilmelerde bildir" varsayılanı (Ayarlar → Bildirimler) ve bir test bildirimi düğmesi.',
            },
            {
              en: '<strong>Account recovery</strong> — Locked out with no password, 2FA device or email access? A new form on the <a href="/support">Support page</a> reaches an admin without needing to sign in.',
              tr: '<strong>Hesap kurtarma</strong> — Parolan, 2FA cihazın ve e-postan hiçbirine erişemiyor musun? <a href="/support">Destek sayfasındaki</a> yeni form, giriş yapmana gerek kalmadan bir yöneticiye ulaşır.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Turkish localization gaps closed</strong> — Discover Servers, profile ornament names, online/idle/dnd status labels, and several security dialogs now translate instead of falling back to English.',
              tr: '<strong>Türkçe yerelleştirme boşlukları kapatıldı</strong> — Sunucuları Keşfet, profil süsleme adları, çevrimiçi/boşta/rahatsız etmeyin durum etiketleri ve birkaç güvenlik penceresi artık İngilizce\'ye düşmek yerine çevriliyor.',
            },
            {
              en: '<strong>"Disdroc AI AI" fixed</strong> — The bot badge no longer doubles up when an account\'s name already ends in "AI".',
              tr: '<strong>"Disdroc AI AI" düzeltildi</strong> — Bir hesabın adı zaten "AI" ile bitiyorsa bot rozeti artık tekrarlanmıyor.',
            },
            {
              en: '<strong>2FA backup codes</strong> — Enabling two-factor authentication now requires confirming you\'ve saved your backup codes before the dialog can be closed.',
              tr: '<strong>2FA yedek kodları</strong> — İki adımlı doğrulamayı etkinleştirmek artık pencere kapatılmadan önce yedek kodları kaydettiğini onaylamanı gerektiriyor.',
            },
            {
              en: '<strong>Privacy policy accuracy</strong> — Now correctly discloses date-of-birth collection and the auth tokens/device ID stored in local storage, instead of describing only a session cookie.',
              tr: '<strong>Gizlilik politikası doğruluğu</strong> — Artık yalnızca bir oturum çerezini anlatmak yerine, doğum tarihi toplanmasını ve yerel depolamada saklanan kimlik doğrulama jetonlarını/cihaz kimliğini doğru şekilde açıklıyor.',
            },
            {
              en: '<strong>Developer Portal sessions</strong> — The Developer Portal, Bot Marketplace and Community Bot Hosting pages now silently refresh an expired session like the main app, instead of logging you out mid-task. Bot API docs now use the canonical disdroc.com domain throughout.',
              tr: '<strong>Geliştirici Portalı oturumları</strong> — Geliştirici Portalı, Bot Marketplace ve Topluluk Bot Barındırma sayfaları artık ana uygulama gibi süresi dolan bir oturumu sessizce yeniliyor, seni işlem ortasında çıkışa zorlamıyor. Bot API dokümanları artık her yerde asıl disdroc.com alan adını kullanıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.0.6', badge: 'stable',
      dates: { en: 'July 9, 2026', tr: '9 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Redesigned server settings</strong> — Now a full, Discord-style settings screen with a sidebar instead of a small tabbed popup. Safety (profanity filter, Discover Servers listing) and Danger Zone (delete server) are now their own sections instead of buried inside Overview.',
              tr: '<strong>Sunucu ayarları yeniden tasarlandı</strong> — Artık küçük sekmeli bir pencere yerine kenar çubuklu, Discord tarzı tam ekran bir ayarlar sayfası var. Güvenlik (küfür filtresi, Sunucuları Keşfet listesi) ve Tehlikeli Bölge (sunucuyu sil) artık Genel Bakış\'ın içine gömülü değil, kendi bölümleri.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Android back button, for real this time</strong> — Pressing back inside Server settings or Settings on the Android app now steps back to the previous screen (like tapping the on-screen back arrow), instead of closing the whole thing.',
              tr: '<strong>Android geri tuşu, bu kez gerçekten</strong> — Android uygulamasında Sunucu ayarları veya Ayarlar içindeyken geri tuşuna basmak artık (ekrandaki geri okuna basmak gibi) bir önceki ekrana dönüyor, her şeyi kapatmak yerine.',
            },
            {
              en: '<strong>Android call pop-up permission</strong> — The app now asks for "Display over other apps" so incoming calls pop up full-screen like a real phone call for everyone, instead of only working after enabling it manually.',
              tr: '<strong>Android arama açılır penceresi izni</strong> — Uygulama artık "Diğer uygulamaların üzerinde göster" iznini istiyor; böylece gelen aramalar sadece elle etkinleştirildikten sonra değil, herkes için gerçek bir telefon araması gibi tam ekran açılıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.0.5', badge: 'stable',
      dates: { en: 'July 7, 2026', tr: '7 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Community-hosted bots</strong> — Don\'t want to run your own bot 24/7? Paste your bot\'s token and your own JavaScript on the new <a href="/bot-hosting">Bot Hosting</a> page and disdroc runs it for you, sandboxed, for free — no server or laptop required.',
              tr: '<strong>Topluluk barındırmalı botlar</strong> — Botunu kendin 7/24 çalıştırmak istemiyor musun? Yeni <a href="/bot-hosting">Bot Barındırma</a> sayfasına bot token\'ını ve kendi JavaScript kodunu yapıştır, disdroc onu senin için korumalı bir ortamda ücretsiz çalıştırsın — sunucu ya da açık bilgisayar gerekmez.',
            },
            {
              en: '<strong>Expanded Bot API</strong> — Bots can now read roles and members and manage kicks/bans/timeouts, and get notified the moment someone joins a server. New <a href="/developers">Developer Portal</a> and API docs cover every endpoint.',
              tr: '<strong>Genişletilmiş Bot API\'si</strong> — Botlar artık rolleri ve üyeleri okuyabiliyor, atma/yasaklama/susturma işlemlerini yönetebiliyor ve birisi sunucuya katılır katılmaz haberdar olabiliyor. Yeni <a href="/developers">Geliştirici Portalı</a> ve API dokümanları tüm uç noktaları kapsıyor.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Safer bot apps</strong> — Creating a bot application now requires two-factor authentication on your account.',
              tr: '<strong>Daha güvenli bot uygulamaları</strong> — Bot uygulaması oluşturmak artık hesabında iki adımlı doğrulama gerektiriyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v1.0.0', badge: 'stable',
      dates: { en: 'July 6, 2026', tr: '6 Temmuz 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>We are disdroc now</strong> — disdroc grew up and got a new name. Same app, same servers, same friends — now living at disdroc.online.',
              tr: '<strong>Artık disdroc\'iz</strong> — disdroc büyüdü ve yeni bir isim aldı. Aynı uygulama, aynı sunucular, aynı arkadaşlar — artık disdroc.online adresinde.',
            },
            {
              en: '<strong>Soundboard</strong> — Play sound clips into any voice call. Every server gets its own soundboard: owners and admins add up to 12 sounds in Server settings → Soundboard, and a set of default sounds is available to everyone.',
              tr: '<strong>Ses panosu</strong> — Sesli aramalarda herkese ses efektleri çal. Her sunucunun kendi ses panosu var: sahipler ve yöneticiler Sunucu ayarları → Ses panosu bölümünden 12 adede kadar ses ekleyebilir; ayrıca herkese açık varsayılan sesler de mevcut.',
            },
            {
              en: '<strong>Activities in calls</strong> — Watch YouTube and Twitch together in perfect sync, draw on a shared whiteboard, or launch a round of Gartic Phone — all from the new Activities button.',
              tr: '<strong>Aramalarda Aktiviteler</strong> — Birlikte senkronize YouTube ve Twitch izleyin, ortak beyaz tahtaya çizin veya bir Gartic Phone turu başlatın — hepsi yeni Aktiviteler düğmesinden.',
            },
            {
              en: '<strong>Polls</strong> — Ask the room: create polls with up to 10 options right from the composer\'s + menu, with live results.',
              tr: '<strong>Anketler</strong> — Odaya sor: mesaj kutusundaki + menüsünden 10 seçeneğe kadar anket oluştur, sonuçları canlı izle.',
            },
            {
              en: '<strong>Trusted devices &amp; sessions</strong> — Your logins stick across devices and travel. Review and revoke every active session in Settings → Sessions.',
              tr: '<strong>Güvenilir cihazlar ve oturumlar</strong> — Girişlerin cihazlar arasında ve seyahatte korunuyor. Ayarlar → Oturumlar bölümünden tüm aktif oturumları görüntüle ve sonlandır.',
            },
            {
              en: '<strong>Safer by default</strong> — Automatic content protection: sensitive images are blocked or blurred with click-to-reveal, backed by an age-aware account system.',
              tr: '<strong>Varsayılan olarak daha güvenli</strong> — Otomatik içerik koruması: hassas görseller engelleniyor veya bulanıklaştırılıp tıklayınca gösteriliyor; yaşa duyarlı hesap sistemiyle destekleniyor.',
            },
            {
              en: '<strong>Channel topics &amp; slow mode</strong> — Give channels a topic shown in the header, and calm busy channels with per-channel slow mode.',
              tr: '<strong>Kanal konuları ve yavaş mod</strong> — Kanallara başlıkta görünen bir konu ver, yoğun kanalları kanal bazlı yavaş modla sakinleştir.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Android back button</strong> — The back button now closes menus and steps back to the previous screen instead of quitting the app.',
              tr: '<strong>Android geri tuşu</strong> — Geri tuşu artık uygulamayı kapatmak yerine menüleri kapatıyor ve bir önceki ekrana dönüyor.',
            },
            {
              en: '<strong>Rock-solid voice calls</strong> — Fixed ghost participants, duplicate tiles after rejoining, and dropped mic access when the Android app is in the background; calls now survive reconnects cleanly.',
              tr: '<strong>Kaya gibi sesli aramalar</strong> — Hayalet katılımcılar, yeniden katılınca oluşan çift kutucuklar ve Android uygulaması arka plandayken kesilen mikrofon erişimi düzeltildi; aramalar artık yeniden bağlanmayı sorunsuz atlatıyor.',
            },
            {
              en: '<strong>Speaking indicator</strong> — The green speaking ring finally lights up reliably and fades smoothly when you stop talking.',
              tr: '<strong>Konuşma göstergesi</strong> — Yeşil konuşma halkası artık güvenilir şekilde yanıyor ve konuşma bitince yumuşakça sönüyor.',
            },
            {
              en: '<strong>Better on phones</strong> — Bottom-sheet menus, a cleaner call bar, safer screen edges, and menus that no longer hide behind the full-screen call view.',
              tr: '<strong>Telefonda daha iyi</strong> — Alttan açılan menüler, daha derli toplu arama çubuğu, güvenli ekran kenarları ve tam ekran arama görünümünün arkasında kaybolmayan menüler.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.9.5', badge: 'stable',
      dates: { en: 'June 12, 2026', tr: '12 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Profile ornaments</strong> — Decorate your profile avatar with animated rings and glows. Choose one in Settings → Profile.',
              tr: '<strong>Profil süsleri</strong> — Profil avatarını animasyonlu halkalar ve parıltılarla süsle. Ayarlar → Profil bölümünden birini seç.',
            },
            {
              en: '<strong>Detailed status page</strong> — status.disdroc.com now tracks more services (messaging, voice, database, media and more) with Good / Slow / Down states, plus 30-day and 1-year response-time history.',
              tr: '<strong>Ayrıntılı durum sayfası</strong> — status.disdroc.com artık daha fazla servisi (mesajlaşma, sesli, veritabanı, medya ve dahası) İyi / Yavaş / Kapalı durumlarıyla izliyor; ayrıca 30 günlük ve 1 yıllık yanıt süresi geçmişi eklendi.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Voice calls fixed</strong> — Resolved connection problems and improved call stability and reliability.',
              tr: '<strong>Sesli aramalar düzeltildi</strong> — Bağlantı sorunları giderildi; arama kararlılığı ve güvenilirliği iyileştirildi.',
            },
            {
              en: '<strong>Faster everywhere</strong> — Tuned the server network stack for lower latency, so messages and pages load noticeably snappier.',
              tr: '<strong>Her yerde daha hızlı</strong> — Sunucu ağ katmanı daha düşük gecikme için ayarlandı; mesajlar ve sayfalar belirgin şekilde daha hızlı yükleniyor.',
            },
            {
              en: '<strong>Stronger abuse protection</strong> — Added platform-wide rate limiting to keep disdroc fast and resilient against spam and floods.',
              tr: '<strong>Daha güçlü kötüye kullanım koruması</strong> — Spam ve sel saldırılarına karşı disdroc\'i hızlı ve dayanıklı tutmak için platform genelinde hız sınırlaması eklendi.',
            },
            {
              en: '<strong>Seamless updates</strong> — Interface updates now roll out without interrupting your session.',
              tr: '<strong>Kesintisiz güncellemeler</strong> — Arayüz güncellemeleri artık oturumunu kesmeden uygulanıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.9.0', badge: 'stable',
      dates: { en: 'June 11, 2026', tr: '11 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Smarter session security</strong> — Sign-ins now use short-lived sessions that renew automatically in the background, you can sign out of every device at once, and sessions expire after a long stretch of inactivity. You stay logged in as normal — it just got safer.',
              tr: '<strong>Daha akıllı oturum güvenliği</strong> — Girişler artık arka planda otomatik yenilenen kısa ömürlü oturumlar kullanıyor, tek dokunuşla tüm cihazlardan çıkış yapabilir ve uzun süre kullanılmayan oturumlar otomatik sona eriyor. Normal şekilde girişte kalıyorsunuz — sadece daha güvenli.',
            },
            {
              en: '<strong>Suspicious-login protection</strong> — When a sign-in looks unusual (a new location, device or network), disdroc scores the risk and may ask you to verify it’s really you before continuing.',
              tr: '<strong>Şüpheli giriş koruması</strong> — Bir giriş alışılmadık görünürse (yeni konum, cihaz veya ağ), disdroc riski puanlar ve devam etmeden önce gerçekten siz olduğunuzu doğrulamanızı isteyebilir.',
            },
            {
              en: '<strong>Automatic abuse protection</strong> — Message spam bursts, rapid server-hopping and bot-like activity now get a friendly warning first, then a short cooldown if it continues — keeping channels clean for everyone.',
              tr: '<strong>Otomatik kötüye kullanım koruması</strong> — Mesaj spam’i, hızlı sunucu değiştirme ve bot benzeri etkinlik artık önce dostça bir uyarı, devam ederse kısa bir bekleme süresi alıyor — kanallar herkes için temiz kalıyor.',
            },
            {
              en: '<strong>Friendly error pages</strong> — If disdroc ever has a hiccup, you’ll now see a clean “we’ll be right back” page that retries on its own, instead of a confusing technical screen.',
              tr: '<strong>Anlaşılır hata sayfaları</strong> — disdroc bir aksaklık yaşarsa artık kafa karıştırıcı teknik bir ekran yerine kendi kendini yenileyen şık bir “hemen dönüyoruz” sayfası görüyorsunuz.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Hardened admin actions</strong> — Destructive admin operations now require re-confirming your identity (password + 2FA) and an explicit typed confirmation, and every action is written to the audit log.',
              tr: '<strong>Sertleştirilmiş yönetici işlemleri</strong> — Yıkıcı yönetici işlemleri artık kimliğin yeniden doğrulanmasını (parola + 2FA) ve açıkça yazılan bir onayı gerektiriyor; her işlem denetim günlüğüne kaydediliyor.',
            },
            {
              en: '<strong>Smoother voice under bad connections</strong> — Calls now automatically lower audio quality when your network is congested and recover when it clears, and rapid voice-channel rejoining is rate-limited.',
              tr: '<strong>Kötü bağlantıda daha akıcı ses</strong> — Aramalar ağ tıkanıkken ses kalitesini otomatik düşürüp düzeldiğinde geri yükseltiyor; sesli kanala hızlı tekrar katılma sınırlandırıldı.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.8.0', badge: 'stable',
      dates: { en: 'June 10, 2026', tr: '10 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Brand-new landing page</strong> — Complete redesign of disdroc.online: sharp editorial look, English/Turkish, FAQ, feature tour and comparison table.',
              tr: '<strong>Yepyeni a\u00e7\u0131l\u0131\u015f sayfas\u0131</strong> — disdroc.online ba\u015ftan tasarland\u0131: keskin edit\u00f6ryel g\u00f6r\u00fcn\u00fcm, \u0130ngilizce/T\u00fcrk\u00e7e, SSS, \u00f6zellik turu ve kar\u015f\u0131la\u015ft\u0131rma tablosu.',
            },
            {
              en: '<strong>Seamless reconnect</strong> — After a connection drop, your chat list and any missed messages now sync automatically. No more reloading the page.',
              tr: '<strong>Sorunsuz yeniden ba\u011flanma</strong> — Ba\u011flant\u0131 koptu\u011funda sohbet listesi ve ka\u00e7\u0131r\u0131lan mesajlar art\u0131k otomatik e\u015fitleniyor. Sayfay\u0131 yenilemek yok.',
            },
            {
              en: '<strong>Optimized avatars &amp; icons</strong> — Profile pictures and server icons are now auto-resized and converted to WebP on upload, and cached by the browser. Pages load lighter and faster.',
              tr: '<strong>Optimize avatarlar ve simgeler</strong> — Profil foto\u011fraflar\u0131 ve sunucu simgeleri art\u0131k y\u00fcklenirken otomatik k\u00fc\u00e7\u00fclt\u00fcl\u00fcp WebP\u0027ye \u00e7evriliyor ve taray\u0131c\u0131da \u00f6nbellekleniyor. Sayfalar daha hafif ve h\u0131zl\u0131 a\u00e7\u0131l\u0131yor.',
            },
            {
              en: '<strong>Automatic server maintenance</strong> — The database now cleans up expired codes, dead sessions and old logs every night, and compacts itself weekly.',
              tr: '<strong>Otomatik sunucu bak\u0131m\u0131</strong> — Veritaban\u0131 art\u0131k her gece s\u00fcresi dolan kodlar\u0131, \u00f6l\u00fc oturumlar\u0131 ve eski kay\u0131tlar\u0131 temizliyor, haftada bir kendini s\u0131k\u0131\u015ft\u0131r\u0131yor.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Stronger account security</strong> — Passwords now require 8+ characters and common passwords are rejected. You get an email when your password changes, and session cookies are hardened.',
              tr: '<strong>Daha g\u00fc\u00e7l\u00fc hesap g\u00fcvenli\u011fi</strong> — \u015eifreler art\u0131k en az 8 karakter ve yayg\u0131n \u015fifreler reddediliyor. \u015eifreniz de\u011fi\u015fti\u011finde e-posta al\u0131yorsunuz, oturum \u00e7erezleri sertle\u015ftirildi.',
            },
            {
              en: '<strong>Lower, steadier latency</strong> — Network path switched to HTTP/2 (eliminating random 1-second spikes), and the status page now reports realistic latency and monitors the real AI backend.',
              tr: '<strong>Daha d\u00fc\u015f\u00fck ve istikrarl\u0131 gecikme</strong> — A\u011f yolu HTTP/2\u0027ye ge\u00e7irildi (rastgele 1 saniyelik s\u0131\u00e7ramalar bitti), durum sayfas\u0131 art\u0131k ger\u00e7ek\u00e7i gecikme g\u00f6steriyor ve ger\u00e7ek YZ arka ucunu izliyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.7.0', badge: 'stable',
      dates: { en: 'June 9, 2026', tr: '9 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>AI assistant (Disdroc AI)</strong> — A built-in AI bot powered by llama3.2:1b running locally on the server. Streams responses token-by-token, remembers conversation context, and has full knowledge of Disdroc\'s features.',
              tr: '<strong>Yapay zeka asistanı (Disdroc AI)</strong> — Sunucuda yerel olarak çalışan llama3.2:1b destekli yerleşik yapay zeka botu. Yanıtları token token akıtır, konuşma bağlamını hatırlar ve Disdroc\'in özelliklerini tam olarak bilir.',
            },
            {
              en: '<strong>AI chat controls</strong> — Clear conversation history and set a custom persona/system prompt per user via the sliders button in AI DMs.',
              tr: '<strong>Yapay zeka sohbet kontrolleri</strong> — Yapay zeka DM\'lerindeki kaydırıcı düğmesiyle konuşma geçmişini temizle ve kullanıcı başına özel persona/sistem istemi ayarla.',
            },
            {
              en: '<strong>Saved messages</strong> — Bookmark any message for later. Right-click → Save message, then access all saved messages from the sidebar.',
              tr: '<strong>Kaydedilen mesajlar</strong> — Herhangi bir mesajı sonrası için yer işareti olarak kaydet. Sağ tıkla → Mesajı kaydet, ardından kenar çubuğundan tüm kaydedilen mesajlara eriş.',
            },
            {
              en: '<strong>Status page</strong> — Public uptime monitor at <a href="https://status.disdroc.com" target="_blank">status.disdroc.com</a> showing live service health, response time graph, and incident history.',
              tr: '<strong>Durum sayfası</strong> — <a href="https://status.disdroc.com" target="_blank">status.disdroc.com</a> adresinde canlı servis durumu, yanıt süresi grafiği ve olay geçmişini gösteren herkese açık çalışma süresi monitörü.',
            },
            {
              en: '<strong>Admin Pi 2 stats</strong> — The server stats panel now shows both Pi 1 (main server) and Pi 2 (status server) CPU, memory, disk, and uptime side by side.',
              tr: '<strong>Yönetici Pi 2 istatistikleri</strong> — Sunucu istatistikleri paneli artık Pi 1 (ana sunucu) ve Pi 2 (durum sunucusu) CPU, bellek, disk ve çalışma süresini yan yana gösteriyor.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>Migrated to Raspberry Pi OS</strong> — Switched from Ubuntu Server to Raspberry Pi OS (Debian Trixie) for improved hardware stability and USB reliability on Pi 5.',
              tr: '<strong>Raspberry Pi OS\'e geçildi</strong> — Pi 5\'te geliştirilmiş donanım kararlılığı ve USB güvenilirliği için Ubuntu Server\'dan Raspberry Pi OS\'e (Debian Trixie) geçildi.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.6.0', badge: 'stable',
      dates: { en: 'June 8, 2026', tr: '8 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            {
              en: '<strong>Message search</strong> — The header search box now searches your full message history server-side. Results appear in a dropdown with author, timestamp, and highlighted matches.',
              tr: '<strong>Mesaj arama</strong> — Başlıktaki arama kutusu artık tüm mesaj geçmişini sunucu tarafında arar. Sonuçlar yazar, zaman damgası ve vurgulu eşleşmelerle birlikte açılır listede görünür.',
            },
            {
              en: '<strong>Markdown blockquotes &amp; lists</strong> — Use <code>&gt; text</code> for blockquotes, <code>- item</code> or <code>* item</code> for bullet lists, and <code>1. item</code> for numbered lists. Inline formatting works inside all block types.',
              tr: '<strong>Markdown alıntı ve listeler</strong> — Alıntı için <code>&gt; metin</code>, madde işaretli liste için <code>- öğe</code> veya <code>* öğe</code>, numaralı liste için <code>1. öğe</code> kullan. Satır içi biçimlendirme tüm blok türleri içinde çalışır.',
            },
            {
              en: '<strong>Keyboard channel navigation</strong> — Press <kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd> to jump between channels in a server, or between DM conversations.',
              tr: '<strong>Klavye ile kanal gezintisi</strong> — Sunucudaki kanallar veya DM konuşmaları arasında geçmek için <kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd> tuşlarına bas.',
            },
            {
              en: '<strong>User avatars in DM list</strong> — The sidebar now shows each person\'s profile picture instead of a generic icon.',
              tr: '<strong>DM listesinde kullanıcı avatarları</strong> — Kenar çubuğu artık genel bir ikon yerine her kişinin profil resmini gösteriyor.',
            },
            {
              en: '<strong>Updates page &amp; version in Settings</strong> — A new changelog at <a href="/updates">/updates</a> and the server version is shown in Settings → Updates.',
              tr: '<strong>Güncellemeler sayfası ve Ayarlar\'da sürüm</strong> — <a href="/updates">/updates</a> adresinde yeni bir değişiklik günlüğü ve sunucu sürümü artık Ayarlar → Güncellemeler\'de gösteriliyor.',
            },
          ],
        },
        {
          type: 'fix',
          items: [
            {
              en: '<strong>DM list order updates live</strong> — Conversations now bubble to the top the moment a new message arrives, without requiring a page reload.',
              tr: '<strong>DM listesi sırası anlık güncelleniyor</strong> — Yeni mesaj geldiğinde konuşmalar artık sayfa yenilemeye gerek kalmadan otomatik olarak en üste taşınıyor.',
            },
          ],
        },
      ],
    },
    {
      ver: 'v0.5.5', badge: 'stable',
      dates: { en: 'June 8, 2026', tr: '8 Haziran 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            { en: '<strong>Tab title unread count</strong> — The browser tab shows unread messages and the favicon gets a red dot badge.', tr: '<strong>Sekme başlığında okunmamış sayıcı</strong> — Tarayıcı sekmesi okunmamış mesaj sayısını gösteriyor ve favicon kırmızı nokta rozeti alıyor.' },
            { en: '<strong>Date separators</strong> — A date divider appears between messages from different days.', tr: '<strong>Tarih ayırıcılar</strong> — Farklı günlere ait mesajlar arasında tarih bölücü görünüyor.' },
            { en: '<strong>Draft messages</strong> — Unfinished messages are saved per conversation and restored when you return.', tr: '<strong>Taslak mesajlar</strong> — Yarım kalan mesajlar konuşma başına otomatik kaydedilip geri dönünce yükleniyor.' },
            { en: '<strong>Character counter</strong> — A counter appears near the composer at 400 chars remaining, turning red under 100.', tr: '<strong>Karakter sayıcı</strong> — 400 karakter kaldığında composer\'da sayıcı belirir, 100\'ün altında kırmızıya döner.' },
            { en: '<strong>Format shortcuts</strong> — Ctrl+B bold, Ctrl+I italic, Ctrl+` inline code — wraps selected text instantly.', tr: '<strong>Biçimlendirme kısayolları</strong> — Ctrl+B kalın, Ctrl+I italik, Ctrl+` satır içi kod — seçili metni anlık sarar.' },
            { en: '<strong>Quick reply button</strong> — Hover any message to reveal a one-click reply arrow.', tr: '<strong>Hızlı yanıt düğmesi</strong> — Herhangi bir mesajın üzerine gelince tek tıkla yanıt oku belirir.' },
            { en: '<strong>Screen share improvements</strong> — Frame rate raised to 30 fps; system audio can now be shared.', tr: '<strong>Ekran paylaşımı iyileştirmeleri</strong> — Kare hızı 30 fps\'e yükseltildi; sistem sesi ekranla birlikte paylaşılabiliyor.' },
            { en: '<strong>File upload progress</strong> — A chip with a live progress bar appears while attachments upload.', tr: '<strong>Dosya yükleme ilerleme çubuğu</strong> — Ekler yüklenirken canlı ilerleme çubuğu olan bir chip görünüyor.' },
            { en: '<strong>Settings redesign</strong> — Security, Sessions, and Blocked tabs rebuilt with cleaner cards and device detection.', tr: '<strong>Ayarlar yeniden tasarımı</strong> — Güvenlik, Oturumlar ve Engellenenler sekmeleri daha temiz kartlar ve cihaz algılamayla yeniden inşa edildi.' },
            { en: '<strong>Smooth animations</strong> — Panels, channel transitions, badges, and the settings modal all have polished animations.', tr: '<strong>Akıcı animasyonlar</strong> — Paneller, kanal geçişleri, rozetler ve ayarlar modalı cilalı animasyonlara kavuştu.' },
            { en: '<strong>Pi 5 overclock</strong> — The server now runs at 3 GHz for snappier responses.', tr: '<strong>Pi 5 hız aşırtma</strong> — Sunucu artık daha hızlı yanıtlar için 3 GHz\'de çalışıyor.' },
          ],
        },
        {
          type: 'fix',
          items: [
            { en: '<strong>Auth error flash</strong> — A spurious "Something went wrong" on successful login has been fixed.', tr: '<strong>Giriş hatası yanıp sönmesi</strong> — Başarılı girişte yanlışlıkla görünen "Bir şeyler ters gitti" mesajı düzeltildi.' },
            { en: '<strong>Mobile landing page overflow</strong> — The hero glow was spilling outside the viewport on phones; now hidden at narrow widths.', tr: '<strong>Mobil açılış sayfası taşması</strong> — Hero glow telefonda görünüm alanının dışına taşıyordu; artık dar genişlikte gizleniyor.' },
          ],
        },
      ],
    },
    {
      ver: 'v0.5.0', badge: 'legacy',
      dates: { en: 'May 30, 2026', tr: '30 Mayıs 2026' },
      groups: [
        {
          type: 'feat',
          items: [
            { en: '<strong>Roles &amp; permissions</strong> — Named roles with colors, permission bitfields, <code>@role</code> and <code>@everyone</code> mentions, and per-channel overrides.', tr: '<strong>Roller ve izinler</strong> — Renkli adlandırılmış roller, izin bit alanları, <code>@rol</code> ve <code>@everyone</code> etiketleri ve kanal bazlı geçersiz kılma.' },
            { en: '<strong>Multi-language UI</strong> — Full English and Turkish translations with geo-IP auto-detection.', tr: '<strong>Çok dilli arayüz</strong> — Geo-IP otomatik algılamayla tam İngilizce ve Türkçe çeviri.' },
            { en: '<strong>Optimistic message send</strong> — Messages appear immediately; failed sends show a retry button.', tr: '<strong>İyimser mesaj gönderme</strong> — Mesajlar hemen görünür; başarısız gönderimlerde yeniden dene düğmesi çıkar.' },
            { en: '<strong>Per-server nicknames</strong> — Set a different display name for yourself in each server.', tr: '<strong>Sunucu bazlı takma adlar</strong> — Her sunucuda kendin için farklı bir görünen ad belirle.' },
            { en: '<strong>Desktop app v0.5.0</strong> — Self-updating installer for Windows.', tr: '<strong>Masaüstü uygulaması v0.5.0</strong> — Windows için kendi kendini güncelleyen yükleyici.' },
            { en: '<strong>Reply-with-ping toggle</strong> — Choose whether a reply pings the original author.', tr: '<strong>Ping\'li yanıt geçişi</strong> — Yanıtın orijinal yazarı ping\'leyip ping\'lemeyeceğini seç.' },
            { en: '<strong>Spatial audio</strong> — Voice channels with a 2-D spatial layout and draggable pucks.', tr: '<strong>Uzamsal ses</strong> — 2 boyutlu uzamsal ses düzeniyle sesli kanallar ve sürüklenebilir diskler.' },
          ],
        },
      ],
    },
    {
      ver: 'v0.4.x', badge: 'legacy',
      dates: { en: 'May 2026', tr: 'Mayıs 2026' },
      groups: [
        {
          type: 'highlights',
          items: [
            { en: 'Voice, video, and screen share with device pickers and mic/cam test', tr: 'Cihaz seçicili ve mikrofon/kamera testiyle sesli görüşme, video ve ekran paylaşımı' },
            { en: 'Custom emoji, GIF picker (Tenor + Giphy), reaction emoji picker', tr: 'Özel emoji, GIF seçici (Tenor + Giphy), tepki emoji seçici' },
            { en: 'Message reactions, replies, edits, pins, and forwards', tr: 'Mesaj tepkileri, yanıtlar, düzenlemeler, sabitlemeler ve iletmeler' },
            { en: 'Rich markdown — bold, italic, underline, strikethrough, spoilers, code blocks', tr: 'Zengin markdown — kalın, italik, altı çizili, üstü çizili, spoiler, kod blokları' },
            { en: 'YouTube click-to-play embeds and disdroc invite cards in chat', tr: 'Sohbette YouTube tıkla-oynat gömüleri ve disdroc davet kartları' },
            { en: 'Image lightbox, drag-and-drop upload, jump-to-bottom button', tr: 'Görsel lightbox, sürükle-bırak yükleme, en alta atla düğmesi' },
            { en: 'Collapsible channel categories, quick switcher (Ctrl+K), mentions inbox', tr: 'Daraltılabilir kanal kategorileri, hızlı geçiş (Ctrl+K), etiket gelen kutusu' },
            { en: '5 themes (Dark / Light / Midnight / Crimson / Aurora), custom accent colour', tr: '5 tema (Koyu / Açık / Gece Yarısı / Kızıl / Aurora), özel vurgu rengi' },
            { en: 'Desktop push notifications, per-chat mute, 2FA, admin panel', tr: 'Masaüstü anlık bildirimler, konuşma bazlı sessize alma, 2FA, yönetici paneli' },
            { en: 'Slash commands: /shrug /tableflip /me /spoiler /giphy', tr: 'Eğik çizgi komutları: /shrug /tableflip /me /spoiler /giphy' },
          ],
        },
      ],
    },
  ];

  function curLang() {
    var stored = localStorage.getItem('disdroc_lang');
    if (STR[stored]) return stored;
    // No explicit choice yet — match the rest of disdroc and guess from the
    // browser locale (start() refines this with /api/geo).
    return (navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';
  }

  function render(lang) {
    var s = STR[lang] || STR.en;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      var k = node.getAttribute('data-i18n');
      if (s[k] != null) node.textContent = s[k];
    });

    var titleEl = document.querySelector('title[data-' + lang + ']');
    if (titleEl) document.title = titleEl.getAttribute('data-' + lang);

    document.querySelectorAll('#langToggle button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });

    // Derive the "current version" header from RELEASES[0] instead of a
    // second hand-maintained copy — that's exactly how this page ended up
    // stuck on "v1.0.5" for two releases in a row while the changelog below
    // it had already moved on.
    var latest = RELEASES[0];
    var verEl = document.querySelector('.up-current-ver');
    if (verEl && latest) verEl.textContent = 'disdroc ' + latest.ver;
    var dateEl = document.querySelector('.up-current-date');
    if (dateEl && latest) dateEl.textContent = latest.dates[lang] || latest.dates.en;

    var log = document.getElementById('changelog');
    if (!log) return;
    log.innerHTML = '';

    RELEASES.forEach(function (rel) {
      var section = document.createElement('div');
      section.className = 'release';

      var header = document.createElement('div');
      header.className = 'rel-header';
      header.innerHTML =
        '<span class="rel-ver">' + rel.ver + '</span>' +
        '<span class="rel-badge ' + rel.badge + '">' + s[rel.badge] + '</span>' +
        '<span class="rel-date">' + (rel.dates[lang] || rel.dates.en) + '</span>';
      section.appendChild(header);

      rel.groups.forEach(function (g) {
        var grpLabel = g.type === 'feat' ? s.newFeatures : g.type === 'fix' ? s.fixes : s.highlights;
        var grp = document.createElement('div');
        grp.className = 'rel-group';
        var labelDiv = document.createElement('div');
        labelDiv.className = 'rel-group-label';
        labelDiv.textContent = grpLabel;
        grp.appendChild(labelDiv);
        var ul = document.createElement('ul');
        ul.className = 'rel-items';
        g.items.forEach(function (item) {
          var li = document.createElement('li');
          li.className = 'rel-item';
          var iconSpan = document.createElement('span');
          iconSpan.className = 'ri-icon ' + (g.type === 'fix' ? 'fix' : 'feat');
          iconSpan.textContent = g.type === 'fix' ? '✓' : '✶';
          var textSpan = document.createElement('span');
          textSpan.innerHTML = item[lang] || item.en;
          li.appendChild(iconSpan);
          li.appendChild(textSpan);
          ul.appendChild(li);
        });
        grp.appendChild(ul);
        section.appendChild(grp);
      });

      log.appendChild(section);
    });
  }

  // The Android shell dispatches the hardware/gesture back button by asking the
  // page for `window.disdrocBack()` and backgrounding the whole app when that
  // is missing or returns false (MainActivity.dispatchBackToWebApp). This page
  // is standalone — it never loads app.js — so back used to minimise disdroc
  // instead of returning to it. Answer the same contract: step back through
  // real history when there is any, otherwise go to the app.
  window.disdrocBack = function () {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/app';
    return true;
  };

  document.getElementById('langToggle').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var lang = b.getAttribute('data-lang');
    localStorage.setItem('disdroc_lang', lang);
    localStorage.setItem('disdroc_lang_userset', '1');
    render(lang);
  });

  render(curLang());

  // First visit with no stored choice: refine the guess via geo-IP, the same
  // way /js/lang.js and the SPA do.
  if (!localStorage.getItem('disdroc_lang')) {
    fetch('/api/geo').then(function (r) { return r.json(); }).then(function (d) {
      var c = (d && d.country) || '';
      if ((c === 'TR' || c === 'CY') && !localStorage.getItem('disdroc_lang')) render('tr');
    }).catch(function () {});
  }
})();
