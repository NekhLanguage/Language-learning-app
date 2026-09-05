# Changelog — Zero to Hero app

Ship notes for the app. Each entry names what changed and what it means for the learner. The public `/changelog` page on nekhslanguageblueprint.com reads from this file.

Written on 2026-07-29. Backfilled to 2026-06-29; earlier history lives in git.

---

## 2026-08-31

### Chinese colours, locations, and "with X" now read like Chinese
Three shipped bugs held Mandarin back in the last review. Colour sentences were reading as bare statives — "书很红" for "the book is red" — instead of the natural 是 X色的 shape a native writes: «这本书是红色的» ("this book is a red one"). Now every «PHONE IS BLUE», «SHIRT IS GREEN», «PANTS ARE BLACK» card renders «X 是 Y色的». Locations were using 是 (identity) where Chinese uses 在 (location) and putting the position word before the ground noun in English order: «书是在上面桌子» read as "the book is at-on-the table". Both flip together — the copula becomes 在, the position glue lands after the noun, and the noun renders bare/definite: «书在桌子上面». Non-colour predicate adjectives (LONG, HEAVY, EASY) keep the 很 pattern they were already right about. And "he eats dinner with his mom" ships «他和他的妈妈一起吃晚餐» — the comitative phrase precedes the verb with 一起 linking them — instead of the English-order «他吃晚餐和他的妈妈».

---

## 2026-09-05

### Turkish: seven grammar fixes from its first full read
"A white book" is now «beyaz bir kitap», with the article between adjective and noun, across every sentence. Possessed objects carry their suffixes: «onun tavasını görürüm», «senin kitabını okursun», and "Is that your phone?" is «Şu senin telefonun mu?». "The book is next to the phone" reads «Kitap telefonun yanında», and "between this and that" «bununla şunun arasında». "He eats breakfast but not lunch" negates the verb properly: «ama öğle yemeği yemez». "From" and "to" are suffixes now («evden», «masaya», «menüden»), "home" is «ev», and sons and mouths drop their vowel when possessed («oğlum»). Words starting with i capitalise as İ.

## 2026-09-05

### No more invisible tiles in the sentence builder
A few sentence-building exercises, notably the Turkish "the book is on this" and "between this and that", showed an empty slot and an invisible tile that could only be placed by luck. Those empty pieces are gone.

### Turkish: "this is my hand and that is your head"
The two-clause sentence now keeps both possessives («Bu benim elim ve bu senin kafandır») instead of dropping the first one and adding a stray «bir». "Water" takes its proper form after a possessive («suyunu»).

### Korean: "thing"
"This is a thing" now says «물건» rather than the bound word «것» on its own.

## 2026-09-05

### Korean: positions, counters, and two adverbs
"In front of" and "inside" now carry their 에 («책 앞에», «이것 안에»), so "the shoes are inside this" no longer reads like "the shoes are not here". Houses, shoes, clothes and phones count with their own counters («집 여덟 채», «신발 열아홉 켤레», «셔츠 스무 벌», «전화 열두 대»), and twenty drops to 스무 before a counter. "I go around" and "I eat first" read «주변에 가요» and «먼저 먹어요».

### A damaged language record no longer hides every language
If one language's saved record is malformed, the language picker used to come up empty and the start button could fail. Now that language still shows, opens onto its setup screens, and rebuilds itself, while the other languages are untouched. Your saved "why this language" answer also survives a content reset.

## 2026-09-05

### Greek and Spanish leave beta
Both languages have now been read end to end on fresh accounts with every reported issue verified fixed in the live exercises, so the BETA tag comes off their picker cards. Nothing else changes.

## 2026-09-05

### Korean: four sentence patterns now read like Korean
"He eats breakfast but not lunch" now comes out as «그는 아침식사를 먹지만 점심식사는 안 먹어요», with the connector on the verb and a proper negation, instead of a raw dictionary word in the middle of the sentence. "The book is next to the phone" is now «책은 전화 옆에 있어요», with the particle and the verb the old version dropped. "We stop eating" and "they start sleeping" use the right nominalised form («먹는 것을 멈춰요», «자기 시작해요»). "I eat and drink" joins the verbs with -고 («먹고 마셔요»), and "this is my hand and this is your head" joins the clauses with 이고. Verbs that carry their own object, like peeling and photographing, no longer double up the object particle («감자 껍질을 벗겨요»). The dictionary copula no longer appears as a wrong-answer tile.

## 2026-09-05

### A language can no longer get stuck at "0 of 40 stops"
In rare cases, switching languages quickly could save a language before its setup had finished. That language then opened straight onto an empty roadmap, and Continue did nothing, forever. The app now takes you back to the step you had not finished, the pack choice or the "why this language" screen, and it no longer lets a leftover exercise from the previous language write over the new one. Anyone already stuck is rescued the next time they tap that language. The "reload the page" notice also now disappears once a second tap succeeds.

## 2026-09-03

### Anna now counts the words she brings back in any form
A word Anna introduces joins your app vocabulary once she has used it with you in three separate sessions. Until now a repeat only counted when she used the word in exactly its dictionary form, so in Ukrainian and other languages that change word endings, an adjective or a verb she recycled naturally could sit at one sighting forever. At the end of each session Anna now records which of her words she actually used, whatever form they took, and those count.

## 2026-09-03

### Words Anna teaches you now run the whole ladder
A word that Anna, the conversation tutor, has introduced across three separate sessions enters your app vocabulary with a "from Anna" card. Until now that word stopped after the level-2 recognition quiz. It now continues like any pack word: at level 5 it joins the matching round alongside your other words, at level 6 you rebuild the sentence Anna actually used when she taught it to you from word tiles, and at level 7 you type that sentence from its translation, with the same accent-forgiving grading as everywhere else. Levels 3 and 4 are skipped on purpose, since those exercises need the app's own sentence templates and Anna's words have her sentence instead. A word Anna introduced before the app started saving her example sentence is practised as a single word at levels 6 and 7.

## 2026-09-03

### Two-clause sentences keep both halves, in every language
"This is my hand and this is your head" and "She is my mom and he is my dad" were losing their second subject and verb in every language except Japanese: «Esta es mi mano y tu cabeza», «She is my mom and he a dad». Both halves now render everywhere («Esta es mi mano y esta es tu cabeza», «Αυτή είναι η μαμά μου και αυτός είναι ο μπαμπάς μου»). Also in this batch: Spanish «voy a la mesa» (a bare destination is definite), Greek two-word nouns decline as a unit («έναν καθεδρικό ναό», «δύο καθεδρικούς ναούς»), the French «frire» uses «faire frire» in the plural, and Arabic fill-in-the-blank cards for "my mom" and "my dad" now exist: the blank holds the fused «أمي / أبي» the sentence shows.

## 2026-09-03

### A bad connection can no longer lock you out until you reload
Emi found that one failed server call on a slow connection could leave the app in a state where tapping a language did nothing, "Continue" on the journey map ended a session instead of starting one, and if a session did start it showed raw word codes instead of words. The cause was the word list being emptied before a reload of it had finished. The list is now replaced only once it has fully loaded, a language tap that gets superseded by another tap stands down cleanly, and if the app ever finds itself without a word list it reloads it before showing you anything. Loading your progress is also faster: the server now sends it compressed, which is roughly a tenth of the size for a full account.

## 2026-09-03

### French and Japanese leave beta
Both languages have now had two consecutive full reviews at 19 of 20 sentences grammatical, with every named fix verified live in drills, so the "beta" tag comes off in the language picker. Nothing changes in what they teach; the tag was a promise about quality, and it is kept.

## 2026-09-03

### Turkish yes/no questions get their «mu»
"Is that your phone?" was rendering as «Şu senin telefon?» in Turkish — grammatical enough to be understood, but missing the yes/no particle a native writer would put at the end: «Şu senin telefonun mu?». The particle harmonizes with the last vowel of the preceding word — mu after o/u, mü after ö/ü, mı after a/ı, mi after e/i — the same four-way lookup Turkish possessive suffixes already use. Declared preemptively across the eight untested question-particle rows (pt / tr / es / uk / no / pl / it / de) after Emi's cross-language sweep found the same shared default silently wrong in fi / zh / ja / ar / fr; only Turkish among the eight needed a new rule — the other seven were already covered by an existing declaration or by the default verb-fronting matching the authored form.

---

## 2026-09-02

### Mandarin puts "from the menu" and "only" where Chinese puts them
Chinese places prepositional phrases and adverbs like 只 before the verb; the app was placing them after it, in English order: «你点菜从菜单», «我读只一本书», «我做这由一只手». Those now read «你从菜单点菜», «我只读一本书», «我用手做这». The nominal inside such a phrase is bare («从菜单», never «从一个菜单»). Destinations («我去到…») and the earlier "with his mom … 一起" shape are unchanged.

### Greek objects finally take the accusative
The most frequent Greek defect in the first review was that every direct object stayed in the nominative: «Εγώ χαιρετώ ένας παλιός σερβιτόρος», «Εγώ έχω ένας αδερφός», «Αυτός έχει η κατσαρόλα του». Greek marks the object on the article and, for masculine nouns, on the ending, and now the app does: «Εγώ χαιρετώ έναν παλιό σερβιτόρο», «Εγώ έχω έναν αδερφό», «Αυτός έχει την κατσαρόλα του», «Εμείς τρώμε τη σούπα μου», «δύο σερβιτόρους». The same case follows prepositions: «με τη μαμά του», «με την κόρη του». The article keeps its «ν» only where Greek does («την κόρη» but «τη μαμά»). Fill-in-the-blank tiles show the same form the sentence shows.

### Spanish «está», neuter «esto», and «del»; Greek «στο» and «τηλέφωνό σου»
Every Spanish location sentence used «ser»: «El libro es sobre la mesa», «Si él es un hogar». Spanish says where things are with «estar», and now the app does too: «El libro está sobre la mesa», «Los zapatos están debajo de esto», «Si él está en casa». The compound prepositions carry their «de» and fuse with the article: «debajo de la mesa», «al lado del teléfono», «detrás del teléfono». A demonstrative standing on its own is neuter, as in Spanish: «Esto es mío», «sobre esto», «entre esto y eso», while «Esta es mi mano» and «Este es un buen libro» still agree. In Greek, «σε» fuses with the article («στο τραπέζι», «στο δωμάτιό της»), the compound prepositions carry their «σε» or «από» («δίπλα στο τηλέφωνο», «πίσω από το τηλέφωνο», «μέσα σε αυτό»), a word stressed on its third-last syllable gets the second accent before «μου / σου / της» («το τηλέφωνό σου», «το δωμάτιό της»), and a generated question ends in the Greek «;».

### Spanish and Greek: the first review, and the quick fixes
Both languages had their first full review today, and a handful of things were wrong in ways a reader notices at once. Spanish counted with «uno» before a noun («uno libro», «uno cena»); it now says «un libro», «una cena». Meals took an indefinite article where Spanish uses the definite: «como el desayuno», «pero no el almuerzo». "Home" was «un hogar»; it is «casa» now, «voy a casa». The generated yes/no question lacked its opening «¿». "I greet a waiter" gets the personal «a» («saludo a un camarero»), «dejamos de de comer» lost its doubled «de», "by hand" is «a mano», and «La mañana es buena» agrees. Greek meals and "home" no longer carry an article («τρώω πρωινό», «πηγαίνω σπίτι»), the indefinite article is the unaccented «μια», "but not lunch" is «αλλά όχι μεσημεριανό», "hand" is «χέρι» (it was «παλάμη», the palm) and "arm" is «μπράτσο», and «Το πρωί είναι καλό» agrees. French "but not lunch" was «mais n'un déjeuner»; it is «mais pas de déjeuner». Japanese counts people with 人 («三人の息子», never «三つ»), and Mandarin two-character adjectives take 的 inside counted phrases too («十四本容易的书»).

### Mandarin 的 on longer adjectives; Japanese な-adjectives and counters
In Mandarin, adjectives of two or more characters now take 的 before their noun — «一本容易的书», «一本黑暗的书» — while one-character adjectives stay bare as before («好书», «大手»). "Correct" and "wrong" no longer get paired with body parts in any language («一只正确眼睛», "a correct eye"); the directional "right" («右眼») still does. In Japanese, な-adjectives now keep their な in front of a noun («簡単な本», «便利な薬局») and drop it before です («本は簡単です») — "easy" had been shipping without its な, and the pack adjectives were shipping «便利なです». Counting rooms no longer doubles the word: «五つの部屋», not «五部屋の部屋».

### French: possessives, partitives, «Est-ce que», and «nouvel»
The first French review found four things a French reader trips on at once. Possessive determiners were stuck in the masculine — «mon main», «ton tête», «son femme» — even where the adjective beside them agreed («mon bonne main»). They now agree with the noun they own: «ma main», «ta tête», «sa femme», «ma grande maman», and still «mon eau» before a vowel. Mass and plural objects went bare — «Tu bois eau», «Nous avons bagages», «J'ai mauvais vêtements» — where French demands an article; they now take the partitive: «Tu bois de l'eau», «Nous avons des bagages», «J'ai de mauvais vêtements», «Elle a des chaussures noires». The yes/no question used English inversion («Est cela ton téléphone?»); it now fronts «Est-ce que …» and, like the wh-questions already did, puts the French space before the question mark. The elision pass was reaching inside verbs («J'achèt'un souvenir»); it now only ever shortens the closed set of little words it is meant to. Before a vowel, «nouveau» and «vieux» become «nouvel» and «vieil» («un nouvel itinéraire», «un vieil évier»). Professions after «être» drop the article («Il est serveur», «Elle est guide» — with an adjective the article returns: «Il est un bon serveur»), and "home" is now «maison» with «à la maison» for "he is home" / "I go home" instead of «un foyer». Shoes and clothes are plural throughout («Les chaussures sont …», never «La chaussures est»), and the feminine plurals of the common adjectives («noires», «vieilles», «bonnes») are in the data.

### An empty answer from the server can no longer erase your progress
If the server replied "no account" for someone who did have progress on this device (a momentary read miss, a lagging replica), the app started a blank record on the spot — and the next save would have pushed that blank copy up. Now a device with progress always keeps it and re-sends it; only a genuinely fresh device starts from nothing. The save-then-reload loop that could hammer the server when its copy lagged behind is also capped, and a failure in the audio warm-up can no longer blank an exercise.

### Japanese: two-clause sentences finally hold together
The last broken Japanese shape was any sentence with two clauses. "This is my hand and this is your head" was coming out as «これは私のです手そしてあなたの頭»; it now chains the way Japanese does, on the で form of the copula: «これは私の手で、これはあなたの頭です». "He eats dinner with his mom because he is home" and "If he is home, he eats with his daughter" were word salad; they now lead with the subordinate clause and its own linker («彼は家にいますので、彼の母と夕ご飯を食べます», «もし彼が家にいたら、彼の娘と食べます»), with "he is home" rendered as the existence sentence Japanese actually uses.

### Japanese: where things are, who you have, and purple shirts
Four more Japanese constructions now read as Japanese. "The book is on the table" was coming out as «本ですテーブル上に» — it's now the real existence sentence «本はテーブルの上にあります», with the topic marker, the の link and あります all in place. Having a person uses the animate verb («息子がいます», never «息子を持っています»). Colours that are nouns in Japanese link with の («紫のシャツ»), while true adjectives stay bare («白いシャツ»). Going to someone's room keeps に after the whole phrase («彼女の部屋に行きます»). Clause commas are now the Japanese 、 and Chinese ，.

### Arabic: the last three named gaps
Three tourism verbs pick up their own prepositions («أؤمن على أمتعتي», «أوصي بـ مطعم», «أتنقل في مسار»); "she is a guide" is «هي مرشدة», not the masculine; and the old dative possessive words (له / لها / لك) no longer appear as fill-in-the-blank distractors — a learner was being offered words that never occur in any sentence.

### Your progress can no longer be rolled back by a stale sync
If a save to the server failed silently (a slow connection, a timeout), the app used to read the server's older copy straight back and replace what you'd just done — so a reload on a flaky connection could quietly lose everything since your last good sync. Now the newer copy always wins: the app compares timestamps before adopting anything from the server, keeps your local progress when it's newer, and pushes it back up so the server catches up. A failed save is also treated as failed, not as synced.

## 2026-08-30

### Arabic possessives, demonstratives, and verb prepositions are real Arabic
Three constructions that read as word-for-word English are now the genuine article. "My hand" was rendering as the dative «لي يد» ("to me, a hand") — possessives now fuse onto the noun the way Arabic does it: «يدي», «رأسك», «غرفتها». Demonstratives finally agree with what they point at — «هذه يدي» for a feminine noun, not a masculine «هذا» everywhere. And verbs that govern their own preposition get it from the Arabic verb, not the English source: «أحصل على كتاب», «نتوقف عن الأكل», «أذهب إلى المنزل». These were three of the four constructions holding Arabic back in review; the fourth (the هل question) shipped earlier today.

### Japanese sentences read like Japanese now
Japanese drills had been assembling sentences in English word order with dictionary-form verbs — "is" in the middle of the sentence, "he starts sleep", one verb meaning "hold" doing duty for every "have". Six structural fixes landed together: the copula now ends the sentence (これは私の手です), two-verb chains compound the way Japanese compounds them (寝始めます), "and" between verbs becomes the て-form (食べて飲みます), "have" splits correctly between owning things (持っています) and having meetings, deadlines or headaches (があります), going somewhere marks the destination with に instead of treating it like an object (家に帰ります), and "but not" builds the real contrastive clause (朝ご飯を食べますが、昼ご飯は食べません). Every verb in the course also now teaches the polite ます form — the form every Japanese course teaches first and the one our own reference translations always used — and counting uses the right counter word per noun (二冊の本 for books, 十七台の電話 for phones). Mandarin gets the same "but not" fix (但是不吃午餐).

### Chinese and Japanese ask yes/no questions the way they're actually asked
"Is that your phone?" was rendering as «是那你的电话？» in Mandarin and «ですそれあなたの電話？» in Japanese — English inversion applied, question particle dropped. Both were the same underlying gap and both are now fixed. Mandarin keeps the declarative clause and closes with 吗？ («那是你的电话吗？»). Japanese keeps its own SOV order, marks the subject with は, ends on the copula, and closes with か. Thai's tag particle ใช่ไหม, which had been hardcoded in the engine, is now declared the same way so future languages that append a final question particle can inherit the rule instead of getting another one-off branch.

### "This is my hand" in Mandarin says 是, not 很
Chinese uses the degree adverb 很 in place of the copula before a predicate adjective («他很强») — but not before a possessive-headed noun predicate. The engine had been sending «这是我的手» down the adjective path because possessives are grammatically typed as adjectives, producing the ungrammatical «这很我的手». Predicate nouns keep 是 across the whole course now, mirroring the guard Thai already carries.

## 2026-08-29

### Chinese counts the way Chinese counts
Mandarin never emitted measure words: "He reads a book" came out «他读书» and "two pairs of pants" as «二紫裤子» — and worse, the free-writing grader marked the CORRECT sentence («他看一个博物馆») wrong because the reference lacked the classifier. Every countable noun in the core course and the packs now carries its measure word: «他读一本书», «我是一个男人», «两条裤子», «六份工作» — with 两 replacing 二 before a classifier, the way Chinese counts. Word-tile and fill-in-the-blank exercises carry the classifier with the phrase, and typing the classifier the way a Chinese speaker would is now graded as what it is: correct. Nouns that take no measure word (水, 早餐, 衣服 as a mass) stay bare, matching the native-speaker reference corpus.

### Korean counts with counters
Numbers in Korean stacked up English-style: «넷 나쁜 책» for "four bad books". Korean counts by putting the number and a counter after the noun, with the number in its counting form — the app now renders «나쁜 책 네 권을 읽어요», choosing the counter per noun (권 for books, 마리 for animals, 명 for people, 개 otherwise) and inflecting the numeral (하나→한, 둘→두, 셋→세, 넷→네, 열둘→열두). The object particle rides on the counter, exactly as Korean is taught.

### Sentences without an "I" or "you" get their particles right
Korean and Japanese sentences whose subject is a noun («포켓몬은 기술이 있어요») previously put the object particle on the SUBJECT. The subject now takes the topic marker and the actual object takes its particle, in generated sentences and in the word tiles alike.

## 2026-08-28

### Korean now speaks Korean
Korean was the worst-shape language in the product: the very first card read «나 음식 먹다» — a bare dictionary stack no Korean speaker would say. Three things were missing at once, and all three are now in. Verbs conjugate into the polite present a beginner should learn first: «먹어요», «마셔요», «읽어요», «봐요» — across the whole course, packs included. Particles mark who does what: the topic marker on the subject («저는», «그는», «그들은»), the object marker on the thing acted on («음식을», «책을», «물을»), each choosing its correct form by the sound of the word it follows. And "to be" works the way Korean actually does it — as an ending fused onto the word («저는 남자예요», «그는 소년이에요»), with adjectives conjugating as the verbs they really are («책은 빨개요», «가을은 오래됐어요»). Possession reads naturally too: «저는 셔츠가 있어요», not a word-for-word "I have shirt". The generated sentences now match the native-speaker reference corpus word-for-word across most of the core course, and the polite register (저/당신) is consistent throughout. Fill-in-the-blank and word-tile exercises carry the particles with the words, the way Korean is actually taught.

### Arabic verbs agree with "she"
Every sentence about «هي» (she) was using the masculine verb — «هي يرى هاتف» instead of «هي ترى هاتف». Feminine third-person forms are now in place for every verb in the app, core and packs alike, so "she sees", "she reads", "she cooks" all carry the ت- prefix Arabic requires. Everything already correct — أنا، أنت، هو، نحن، هم — stays exactly as it was.

### Your saved progress got a third smaller
The app was saving a bookkeeping row for every sentence pattern it had ever considered showing you — even the hundreds it never had. Those empty rows were most of the saved record and were pushing big accounts past the server's loading limit. The app now saves only rows that carry real progress and rebuilds the empty ones on demand; nothing about your progress changes, loading just gets faster and safer the longer you study.

### Greek possessives go where Greek puts them
Every Greek possessive sentence was built backwards — «μου βιβλίο» instead of «το βιβλίο μου». Fixed structurally: the noun keeps its definite article and the possessive follows it, the way Greek actually works — «Αυτή διαβάζει το βιβλίο μου», «Εμείς έχουμε το τηγάνι του», «η παλάμη μου». Thai's same-shaped rule (possessor after the noun) now runs through the same declared machinery instead of a special case, with identical output. Also in this batch: Polish no longer writes «To myje warzywo» — an inanimate "it" can't be the subject of an ordinary Polish verb, so the pronoun is dropped the way a Pole would («Mży» for "it drizzles"), while personal pronouns stay explicit for learning; and "They are our girls" now agrees in both halves in Ukrainian («Вони наші дівчата»).

### Ukrainian and Greek numbers now agree the way the languages demand
Ukrainian counting was the single worst construction in testing — 27 of 30 sampled sentences wrong. Fixed across the board: five and above now govern the genitive plural on the noun AND its adjective («шість книг», «дев’ять телефонів», «десять поганих паспортів»), two to four take the proper plural («два паспорти»), «два» becomes «дві» before feminine nouns («дві сорочки»), and «один» agrees in gender and case («Я маю одну роботу»). Greek numerals now inflect for gender too — «δεκατέσσερις κρατήσεις», never «δεκατέσσερα κρατήσεις» — and nouns pluralize after numbers («δεκαπέντε διαβατήρια»). Behind it all sits a new engine-wide guard: a number can no longer land on a word whose plural the app doesn't know — the sentence is simply never generated, instead of shipping a singular where a plural belongs, in every language at once.

### Turkish possession and "to be" now agree with the person
Two systematic Turkish fixes from testing. Saying what you have now carries the required possessive suffix on the thing owned: «Benim yiyeceğim var», «Onun pasaportu var», «Bizim bagajımız var» — never the bare «Benim yiyecek var». The engine generates the suffix by the regular rules (vowel harmony, the k→ğ softening in «yiyeceğim»), with hand-authored forms still winning where the paradigm is irregular; fill-in-the-blank tiles offer the suffixed forms too. And "to be" sentences now agree with their subject: «Ben adamım», «Sen kızsın», «Biz adamız», «Onlar kızlar» — the «-dır» ending that was wrongly stamped on every person now appears only where it belongs, in the third person singular («O kadındır»).

### Answer tiles always show real words, and never the same word twice
Two exercise fixes found in Greek and Polish testing that protect every language. The matching level's tiles could show an internal data code instead of the word itself — Greek learners saw «f» and «n» where «αποσκευές» and «φαγητό» belonged — because one screen resolved words through its own shortcut instead of the shared engine path; all option tiles now render through one resolver. And multiple-choice can no longer offer the same written word twice: Polish «dom» translates both "home" and "a house", and the option picker used to treat them as different answers — only one of which counted as correct. Options are now unique by the word you actually see, everywhere.
Words like "big", "five" and "my" used to stop at Level 5 — the sentence-building and free-translation levels never tested them, which quietly removed a third of the grammar from the top of the course. They now progress through Level 6 and Level 7 like every other word: drilling "big" at Level 7 gives you a sentence that actually contains it («Ty masz dużego brata»), and the prompt and the graded answer are guaranteed to carry the word together — the old failure where the English sentence asked for an adjective the answer didn't contain (or the other way around) is fenced out by construction. Words you had already mastered stay mastered.

## 2026-08-27

### Small fixes across the app
A batch of quality fixes from Polish testing. The Polish alphabet guide now explains its letters in English (the panel was written in Polish — unreadable to the learner it exists for), and the round alphabet button shows «Ą» uppercased so it can't be misread as «q». If your progress can't be loaded from the server, the app now says so on the language hub instead of silently showing an older local copy. The translation box on the free-production level tells you what to do with it. Plurals of words like knife are now «knives», never «knifes» (roofs and chiefs stay regular). Double punctuation after "Incorrect.." is gone, and fill-in-the-blank subject options no longer offer "This" for sentences where it reads absurdly ("This has a reservation").

### French and Spanish adjectives now go where native speakers put them
French and Spanish were placing every adjective in front of the noun, English-style («un nouveau livre» was right by luck, but «un noir livre» was not). Adjectives now follow the noun by default («un livre noir», «un libro rojo») while the classes that genuinely go in front — good, bad, big, small, new, old, young — stay there («un bon livre», «un buen libro»). Spanish and Italian also apocopate where the language demands it: «un buen libro» and «un mal libro», never «un bueno libro», with the full form kept where it belongs («una buena camisa», «un libro bueno» stays valid in grading). Italian and Portuguese picked up the same role-aware placement, fixing the few cases where the old all-or-nothing rule put quality words on the wrong side. French colour and shape adjectives also gained their feminine forms («une chemise verte»).

### German grammar: cases and adjective endings now correct
German was shipping without its case system: every attributive adjective appeared without its ending («ein neu Buch») and masculine direct objects went unmarked («Wir haben ein Job»). Both are fixed everywhere sentences are generated: adjectives take their declined endings («ein neues Buch», «einen alten Flughafen», «eine schlechte Pfanne» — while predicative stays correctly bare: «Das Buch ist rot»), masculine objects take «einen», prepositions govern the dative on the article («auf dem Tisch», «unter dem Tisch», «auf diesem»), possessives agree and decline («meine Hand», «mit seiner Mutter»), and «zu dem»/«in dem» contract to «zum»/«im». Fourteen sentences that previously diverged from what a German speaker would write now match exactly.

### Exercises now match the grammar the app already knows
Four fixes to how exercises are assembled, found in Polish testing but benefiting every language. Fill-in-the-blank tiles now carry the form the sentence actually needs — «Ona jest _____.» offers «kobietą», never the dictionary form «kobieta», and every wrong option is declined to fit the same slot. Blanks always hold a whole word — no more «Ja idę do _____u.» with half the word stranded in the frame. The translation prompt can no longer ask for words the graded answer doesn't contain ("They see three new airports." will never again stand over an answer of «Oni widzą lotnisko.»). And adjectives now agree with their noun everywhere the noun changes form: «Ja mam dużego syna», «osiem dużych twarzy», Italian «pantaloni grandi». Saying what someone is also works across all the topic packs now — «On jest kelnerem», «Oni są mistrzami».

### New language: Polish (beta)
Polish joins as the 16th language, in beta while it gets its final review. The full 250-word core method and all twelve topic packs are covered, and the engine handles the grammar that makes Polish tricky: noun endings change when a word is the object of the sentence («Czytam książkę»), after "to be" when you say what someone is («Jestem mężczyzną»), after prepositions («na stole», «z domu»), and after the numbers five and up («pięć książek»). If you spot a sentence that reads oddly, that's what beta means — tell us and it gets fixed.

### Small fixes: phantom ABC button, log out, reset guard
The round "ABC" script-guide button no longer appears for languages written in the Latin alphabet (it opened an empty screen). "Log out and reset local data" now clears all of it, including the backup copy of your progress — what the confirmation promises is what happens. And the "reset all progress" button now looks like the destructive action it is and asks twice before erasing every language.

### Italian grammar corrected across four exercise surfaces
Four Italian generator defects found in testing are fixed. Possessives now carry their definite article everywhere («il suo taxi», not «suo taxi»). Fill-in-the-blank frames no longer double the article — the blank takes the article with it, so you assemble «Loro vedono [un aeroporto]», never «un un aeroporto». Numbers no longer count mass nouns in any language (no more «Io bevo quattro acqua» / "I drink eight waters"). And the free-translation grader now accepts standard Italian you'd actually say: dropping the subject pronoun («Leggiamo un libro») and either adjective order («un libro piccolo» or «un piccolo libro») both count as correct, while the app keeps teaching the fuller beginner-friendly form. Also: "landmark" now translates as «monumento», translation exercises never show a prompt whose reference answer is missing words from it, and answer options never contain two words that are spelled identically in Italian (like «suo» for both "his" and "her") so a right answer can't be marked wrong.



### The engine now infers copular structure inside the franchise packs
The 250-word method learns nouns and verbs through short sentences the engine generates on the fly. Inside the franchise packs (Pokemon, Harry Potter, and so on) 63 sentences were rendering ungrammatically because the template didn't declare its structure and the engine defaulted to the wrong shape. The engine now infers the copular structure from the concept sequence, and those 63 sentences read correctly. Fitness pack's generic readings are preserved.

## 2026-07-15

### Feminine and neuter plural adjective agreement (Spanish and Greek)
Adjectives now agree with the noun they modify across all four gender-number combinations in Spanish and Greek. Before this, plural feminine and plural neuter forms were falling back to masculine plural and reading wrong. Pack authors can now write the plural feminine and plural neuter forms alongside the singular ones and the engine picks the right one.

## 2026-07-11

### Visual refresh across the app
New design tokens, gradient CTAs, SVG icons in place of emoji, and language cards on the language picker. The purple ground stays, but the accent colour on progress bars and buttons is now the violet-to-rose gradient that reads clearly against the background. The language picker now shows each language on its own card instead of a dropdown.

## 2026-07-09

### Level 7 grading no longer marks the learner wrong for words the prompt never showed
Level 7 is the free-production level. If the prompt asked you to translate "I eat", the engine used to expect "I eat quickly" if the underlying template had an adjective slot filled in behind the scenes. It now grades against what was actually shown.

### Modifier-injection sentences (random adjectives and numbers) are grammar-checked
The engine sometimes injects a random adjective or number into a sentence to add variety. A new validator runs those injected forms through the same grammar checks as the base sentences so mass-noun and plural-agreement bugs cannot slip through.

### Thai is now the 15th supported language
Thai works as both a support language (learn any other language through Thai) and a target language (learn Thai from any of the other 14). Thai stress-tested the language pipeline itself, and any grammar gaps found while adding it were fixed generally.

### Italian is now the 14th supported language
Italian works as both support and target. Adding Italian exercised the full new-language pipeline from vocab pack authoring through grammar validators to launch.

### Systematic grammar fixes across all 13 languages
A new divergence ratchet compares every generated sentence against the human-authored ground truth and fails CI on any new grammar defect. The initial run closed several classes of long-standing bugs (article handling, gender agreement, case marking) across all 13 pre-existing languages.

## 2026-07-08

### Ukrainian direct objects now use the accusative case
Ukrainian direct objects (the noun the verb acts on) now decline into the accusative case. Before this the engine was rendering nominatives in that slot and producing sentences like "Я п'ю вода" instead of the correct "Я п'ю воду". Every Ukrainian sentence with a direct object now reads correctly.

## 2026-07-03

### Mastered words stay usable as sentence ingredients
Words you have mastered used to freeze — they wouldn't reappear in new sentences, which meant later templates couldn't compose them and progress stalled. Mastered words are now free to appear as ingredients inside new sentences. The mastery status still gates whether you drill the word, but it no longer removes the word from your working vocabulary.

### Every core concept now has at least one sentence
A batch of core_extra templates fills in the gaps where a core concept (a common word or grammar rule) had no example sentence. Before this some Level 3 concepts had no way to reach mastery.

### Level 3+ progression gate opened; end-game review mode; Level 5 quorum rule
Three fixes to progression that were causing learners to stall late in a language. The Level 3+ gate now opens once the earlier levels are complete, an end-game review mode kicks in once the core concept catalogue is exhausted, and the Level 5 quorum rule stops the level from waiting on a single template that never fires.

## 2026-07-02

### Blankless fill-in-the-blank exercises fixed; trait-adjective pairings corrected
A rendering bug was sometimes producing fill-in-the-blank cards with the blank missing. Fixed. Trait adjectives (words like "kind" or "brave") were sometimes pairing with nonsense subjects. That is now constrained to combinations that make sense.

### Speaking practice on exposure cards using Web Speech
The exposure card (where you first see a new word or sentence) now has a speak button that uses the browser's Web Speech API to grade your pronunciation. Runs on-device where the browser supports it.

### Level 7 semantic grading runs on-device
Level 7 free-production answers are now graded semantically rather than by exact string match, and the grading model runs in the browser rather than calling out to a server. Same-meaning-different-words answers now pass.

### Fitness resource pack
The first pack shipped from the new pack factory. 250 fitness-domain words with example sentences, wired into the engine like the earlier packs (Pokemon, Harry Potter, Cooking).

### 137 Portuguese mnemonic word notes; word notes on the exposure card
Optional mnemonic notes now appear on the exposure card in your support language. Portuguese ships with 137 notes covering the common tricky words. Other languages can be filled in the same way through the new `word_notes.json` schema.

### Grammar "why?" chips on the exposure card
A why? chip on the exposure card explains the grammar rule that produced the sentence. Chips are backed by grammar_notes in the support language, and every rule the engine uses now has a note in all 13 support languages.

### Coaching lines: 273 milestone lines plus 52 session lines
The in-app coach line now varies per milestone and per session. 273 milestone lines and 52 session lines mean the same event doesn't produce the same coach message every time.

## 2026-07-01

### On-device semantic grading model for Level 7
The grader that runs Level 7 answers ships as part of the app and runs in the browser. No network round-trip during a lesson.
