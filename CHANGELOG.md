# Changelog — Zero to Hero app

Ship notes for the app. Each entry names what changed and what it means for the learner. The public `/changelog` page on nekhslanguageblueprint.com reads from this file.

Written on 2026-07-29. Backfilled to 2026-06-29; earlier history lives in git.

---

## 2026-10-08 (night)

### Leaderboard: a failed "This week" load no longer hides the board

If the weekly view can't load, the leaderboard now keeps the All time / This week switch and shows a short message in your language, so you can go back to All time or tap This week to try again. Before, the whole board was replaced by a "Failed to fetch" message.

---

## 2026-10-08 (evening)

### Leaderboard: a "This week" view

The leaderboard now has an All time / This week switch. This week shows the words each learner mastered and met with Anna since Monday, and it starts over every Monday.

### Adjectives and numbers finished at level 5 are back in practice

Some adjectives and numbers were marked finished at level 5, back when that was as far as they went. Since they can now go all the way to level 7, those words come back into your lessons where you left them. Once you pass level 7, they count as mastered on the leaderboard.

---

## 2026-10-08 (later)

### Words you already know move up faster

If you answer a word right twice in a row at a level, it goes on a fast track: from then on, one right answer moves it up a level instead of two. The first time you miss it, it goes back to needing two, until you get another level right twice in a row. The last step, marking a word as mastered, still takes two right answers. Learners who already know some of the language reach new words sooner, and words you're still learning get the same practice as before.

---

## 2026-10-08

### Six free lessons instead of three

A free account now gets the first six lessons before the paywall, up from three. Lessons 5 and 6 are the first words from the interest packs you picked (anime, football, cooking…), so the free start shows what learning with your own interests is like. If you'd already reached the old lesson-3 stop, open the app again and lesson 4 is waiting.

---

## 2026-10-07 (night)

### Arabic: «لأنه» and «إذا كان … فهو»

Arabic sentences with "because" and "if" now follow Arabic grammar instead of English word order. "Because he is at home" is «لأنه في المنزل» (the pronoun joins «لأن»), not «لأن هو في المنزل». "If he is at home, he eats…" is «إذا كان في المنزل، فهو يأكل…», with «كان» after «إذا» and «فـ» on the second half, not «إذا هو في المنزل، هو يأكل…».

---

## 2026-10-07 (evening)

### Start screen, language hub, leaderboard and referral card are ready for your language

The rest of the app's screens now come from the translation files: the start screen (LOG OUT, the Anna button and its tooltips, Refer a friend, Manage subscription, search), the language hub (search, RESET PROGRESS and its two confirmations, BETA badges), the whole leaderboard and the referral card. Counts on the leaderboard follow each language's plural rules ("1 word", "5 words"; Russian's three forms). Translations for the other 18 languages follow in a later update; until then these lines stay English.

---

## 2026-10-07 (fix)

### No more code names on the trial, paywall and exercise screens

Since this morning's update, learners whose support language isn't English saw internal names such as "trialKeepGoing", "paywallBuy" and "sayIt" instead of text on the "three lessons done" screen, the lesson-4 paywall and the exercise screen. The app now always loads English as the fallback, so those lines read in English until their translations arrive.

---

## 2026-10-07 (later)

### Anna's page is ready for your language

Everything Anna's page says now comes from the app's translation files: the settings panel and its choices, the memory panel, the topic picker, the buttons, every status line ("Session saved…", "Next focus:", "Not delivered…"), the delete confirmations and the "log in first" screen. The language you're learning is named in your own language (a German speaker learning Portuguese sees «Portugiesisch»), and Arabic reads right-to-left. Translations for the other 18 languages follow in a later update; until then these lines stay English. Anna's own replies are unchanged.

---

## 2026-10-07

### The exercise screen, the trial screens and the paywall are ready for your language

Text that was always in English now goes through the app's translation files: "Say it", "Proper form:", "Expected:", "Correct answer:", the "from Anna" badge, the level label on every level, the play-audio and script-guide labels, the "Full app" mark on the roadmap, the coaching line, the "three lessons done" screen, the lesson-4 paywall and its "Checking…" messages. The translations for the other 18 languages follow in the next update; until then these lines stay English.

German, Spanish, Norwegian, Portuguese and Turkish learners now see the reason picker, the roadmap and the milestone lines in their own language. Those 35 lines had shown in English.

Arabic: "he is at home" no longer reads «هو منزل» ("he is a house"); it is «في المنزل». «أنا أذهب من المنزل» keeps its article.

On the sign-in screen, a malformed email gets its own message, a typed password survives a language switch, and an expired set-password link no longer shows a dead form.

---

## 2026-10-06

### A cleaner sign-in screen, in your language

The sign-in screen now shows one form at a time. A new visitor sees "Try the first three lessons free": one Google button, one email box and the weekly-email box. An "Already have an account? Sign in" link swaps in the sign-in form. A device that has signed in before opens straight on the sign-in form. The two stacked email forms, the filler line and the large "Get the app" button are gone; the $19 offer is now a small link at the bottom.

A language picker sits in the top corner. Everything on the sign-in screen, its messages and the set-password page switches to the language you pick, and Arabic reads right-to-left. Your pick becomes your support language when you sign in, and this device remembers it after you log out. The app never guesses the language from your browser: until you pick, the screen is in English.

---

## 2026-10-05

### Opinions: a fresh discussion theme for Anna, every time (beta topics)

The topic picker ("What do you want to talk about?") now opens with a built-in subject, **Opinions**. Pick it and Anna rolls one of 19 discussion themes — phones in school, city or countryside, working from home, what makes a good life — and asks what you think and why, as a normal short-exchange conversation in your target language. Every theme comes up once before any repeats. The second time round, Anna reads her note from your last conversation on that theme, tells you what got better and pushes one step further. The picker row shows how many themes you have met; the memory panel lists them with Anna's last note on each. Theme labels are in your support language. Vocabulary from these conversations is added exactly as from any other session.

---

## 2026-10-04 (night)

### The app asks before it emails you

The free sign-up form has a new box under the email field: "Send me Nekh's weekly email on learning languages." It is unticked unless you tick it. A learner who signs in with Google for the first time sees the same question once, on the first screen after coming back from Google, and never again. Only a ticked answer puts an address on the weekly email; an unticked one is never sent anywhere, and the app keeps the time you ticked as the record of your choice. Nobody who signed up before today was added. The sign-in form for existing accounts is unchanged, and the "Get the app" line on that screen reads "Get the app for $19, first month of Anna included".

---

## 2026-10-04 (evening)

### Russian and Swedish are open to everyone, without the BETA tag

Both languages leave the hidden state and the BETA tag together (Nekh's call, after Emi's runs 30 to 32 and the fixed «два телефона» rule). Every learner sees «Русский» and «Svenska» in the picker; Finnish, Arabic and Mandarin keep BETA.

### Korean, Japanese, Mandarin and Turkish put adverbs and clauses where they belong

"We go later", "We work today" and "I just eat" put the adverb before the verb («私たちは後で行きます», «우리는 오늘 일해요», «我们今天工作», «Biz daha sonra gideriz»). "I eat while you read" leads with the "while" clause and ends it the way each language does («당신이 읽는 동안 저는 먹어요», «Sen okurken ben yerim», «你读的时候我吃», «あなたが読んでいる間に、私は食べます»). Mandarin no longer says «去到» for "go to". "He may sleep" is a real modal in Korean and Turkish now («그는 잘지도 몰라요», «O uyuyabilir», «Biz uyuyabiliriz»), takes «να» plus the conjugated verb in Greek («μπορούμε να κοιμόμαστε») and the present tense in Arabic («هو قد ينام»). Japanese "may" still needs the verbs' plain forms, which the data does not carry yet.

### "Any phone" in nine more languages

Swedish wraps the phrase («vilken svart telefon som helst»), Japanese and Korean do too («どの電話でも», «아무 전화나»), Thai puts it after the noun («โทรศัพท์ใดก็ได้»), Finnish takes the partitive («mitä tahansa mustaa puhelinta»), and Polish «używać» finally governs the genitive («używam dowolnego telefonu», «używam telefonu», «używam mikstury»). A Polish adjective in that slot is withheld until the adjectives carry case forms, the same rule Russian and Ukrainian already follow.

### Arabic sentences get their definite article

"The book is on top", "Winter is good" and "The book is on the table" carry ال on the subject and the landmark («الكتاب في الأعلى», «الشتاء جيد», «الكتاب على الطاولة»), and "we go to customs" is «إلى الجمارك». "She works as a waiter" is «كنادلة». Twenty-eight authored Arabic sentences that the engine used to get wrong now match the native text.

### Smaller fixes

"They work as guides" takes the instrumental plural in Russian and Ukrainian («гидами», «гідами»). French «bonne affaire» no longer takes a second «bonne». Polish «używam» objects carry their genitive in the Pokémon pack too.

### Still open

Japanese "may" (plain verb forms), the Japanese and Mandarin "we have a defeat" calque (the English template is the problem), and Korean "may" is not drilled at the fill-the-blank level because the modal lives inside the verb.

---

## 2026-10-04 (later)

### Russian counts «два телефона» the way a Russian teacher expects

After two, three and four, Russian puts the noun in a special form («два телефона», «четыре старых рецепта», «две книги»), and the app got it wrong in half of those sentences («два телефоны»). It is right now, with the adjective in the form each gender takes. This was the row between Russian and losing its BETA tag (Emi's run 32). A stray form, «двадцать бронированй», is «бронирований».

### Korean sentences a learner can read again

In Korean, "to" and "as" landed in front of the noun as separate words («에게 로비를 가요»); they now follow it and attach the way particles do («로비에 가요», «가이드로 일해요»), and "You are next", "Checkout is later" and "The book is on top" end with a proper predicate («다음이에요», «위에 있어요»). Nine of the eighteen broken Korean sentences in Emi's run 32 are fixed; the rest are the verb-before-adverb and "may" order, which is the same Korean/Japanese/Turkish/Mandarin word-order class as before and is still open.

### "She works as a waitress", in every language that has the word

The role after "as" now agrees with the subject: feminine in German, French, Spanish, Italian, Portuguese, Greek, Polish, Russian and Ukrainian («Elle travaille comme serveuse», «Sie arbeitet als Kellnerin», «Она работает официанткой», «Ona pracuje jako kelnerka»), and plural after "they" («De arbetar som guider», «Ils travaillent comme guides», «Oni pracują jako przewodnicy»). Finnish uses the essive («työskentelen oppaana») instead of «kuten opas». Arabic's «كـ» and «لـ» attach to their noun («كمرشد», «بمطعم») instead of standing apart.

### Going to customs, the lobby and the hotel

A bare destination is definite in German, French, Portuguese and Greek as it already was in Spanish and Italian: «zum Zoll», «zur Lobby», «à la douane», «à l'hôtel», «au hall», «para a alfândega», «στο τελωνείο». Russian says «на таможню», Ukrainian «на митницю». "We go to checkout" (which translated as "we go to departure") became "Checkout is later".

### Smaller fixes from Emi's run 32

"May" conjugates with its subject in German, French, Spanish, Portuguese, Finnish, Ukrainian, Russian and Greek («Wir dürfen schlafen», «Мы можем спать»). "You are next" takes its article where the language wants one («Du bist der Nächste», «Tu es le prochain», «Tú eres el siguiente», «Você é o próximo», «επόμενος», «คนต่อไป»). "Any" blocks a number («любой три телефоны» is gone) and Swedish says «valfri telefon». "Nice" follows the noun in Portuguese and Spanish («uma espátula legal») and shortens before it in Italian («un bel ristorante»). A comma sets off "while" in German, Polish, Finnish, Russian and Ukrainian. "Pilot" has its own verb in sixteen languages («piloter», «pilotar», «steuern», «조종하다», «操縦します»). "He transfigures" has an object («an owl»). Turkish "bargain" is «fırsat».

### Still open from run 32 (known classes, not fixed here)

Adverb and "while"/"may" order in Japanese, Korean, Mandarin and Turkish; the Greek and Arabic "may" complement («να κοιμηθούμε», «قد ينام»); the Arabic subject article in the new copular sentences; "any" in Polish, Thai, Japanese and Korean; Finnish partitive after "any"; the French «bonne bonne affaire» double adjective; the Japanese and Mandarin "defeat" calque.

---

## 2026-10-04

### "Work" joins the first 200 words, and "as" finally has a sentence

A new core verb, work, in all 19 languages («Ich arbeite», «Я работаю», «私は働きます»), with two sentences of its own. It exists so that "as" can be taught: eight packs now have a "works as a …" sentence (guide and waiter in tourism, coach in football, trainer in Pokémon, professor in Harry Potter, ninja in anime, model in fashion, astronaut in space). The engine renders the role the way each language does: bare after "as" in German, French, Spanish, Italian, Portuguese, Swedish, Norwegian and Greek («als Reiseführer», «comme guide»), as the bare instrumental with no "as" at all in Russian and Ukrainian («работаю гидом»), after the noun in Japanese and Turkish, and before the verb in Mandarin. Cooking, music, everyday life and gaming have no job word, so a learner with only one of those packs still meets "as" later than the others.

### Twenty-four roadmap words finally have sentences

Twenty-five words sat on the roadmap with no sentence to teach them in, in every language (Emi's run 31): lobby, checkout, bargain and customs in the tourism pack; spatula, glass, salad, banana and the five measures in the cooking pack; and the core words top, bottom, winter, any, next, later, while, may, just, it and its. Twenty-four of them now have one: the measures became ordinary countable nouns («Ich habe einen Liter», «У нас есть грамм»), "its" became the possessive it always was (it rides any noun like "his"), "it" agrees as neuter («Оно чёрное», «Ono jest czarne»), and "just" sits after the verb where the language wants it («Ich esse nur», «Je mange seulement»). The one left out is "as": no sentence can be built from the core words for it (it needs a verb like "work" or a role noun), so it stays on the roadmap untaught until Nekh decides. These sentences are generated by the engine without a native reader yet; Emi reads them next.

### Three pack words that meant two things get their own ids

"Navigate" in the space pack is now "pilot", "transform" in the Harry Potter pack is "transfigure", and the football "defeat" (the noun) is a separate word from the Pokémon "defeat" (the verb). Each is translated on its own in every language. The other words two packs share (potion, league, battle, …) mean the same thing in both and keep one id; since v1.2.88 each pack already shows its own translation.

### Ukrainian says «Це моя рука», like Russian

"That is my arm" and "Is that your phone?" now use «Це» in Ukrainian, the standard form, matching Russian's «Это»; «в тому» and the other case forms are unchanged.

### Numbers, colours and the other small words are taught again

Since 2 October the app picked words it could not show: every number from one to twenty, small, big, fast, slow, our, their, yellow, purple, orange and delicious were unlocked on the roadmap but never got their first card, in every language, so a learner could finish a course without learning to count. These words reach sentences by being added to a noun, so no sentence lists them by name, and the check added on 2 October to skip words that cannot render took that as "cannot render". They are exempt again, and a test now fails if a released number is ever skipped.

### A pack's own words stay in its own sentences

Fourteen words live in two packs with different translations (navigate in tourism and space, defeat in Pokémon and football, potion, transform …). Until now the pack loaded last won everywhere, which is how "navigate a route" in Russian and Ukrainian came out as "pilot" (Emi's -192 and -141). Each pack's sentences now read that pack's own words. Russian and Ukrainian "navigate" is «прокладывать маршрут» / «прокладати маршрут» with a route and «ориентироваться» / «орієнтуватися» on its own; the space pack keeps «пилотировать» for the spacecraft. Also from Emi's re-read: Swedish «Jag äter innan» (not «före») and Russian «У него есть бронирование» without a stray «своё».

## 2026-10-03

### Swedish and Russian: Emi's first read, eight fixes

Emi read both new languages and the engine now gets these right. Swedish: «min vänstra arm» and «ditt högra ben» (the weak form after a possessive, and these two words are never offered where «ett höger finger» would come out), «fel äventyr» and «rätt bok» without an article, and «Du går ombord.» without a stranded «på». Russian: «Это моя рука.» for every "that is …" sentence (Russian does not split this/that there), short answers that echo the verb («Да, делаю.» / «Нет, не делаю.»), «в» + accusative for a place you go into («в свою комнату», «в спортзал», «в лигу») with «к столу» kept for objects, «свой» whenever the subject owns the thing («Я страхую свой багаж»), and «прокладывать» / «пилотировать» in place of the IT-jargon «навигировать». The Russian intro card for "have" now shows «у меня есть», with a note on «иметь». Ukrainian picks up the two shared fixes: «Так, роблю.» / «Ні, не роблю.» and «прокладати» / «пілотувати».

### Swedish and Russian join the app as hidden beta languages

Two new target languages are wired through the whole pipeline — Swedish («Jag äter mat.», «Boken är röd.», «Hon går till sitt rum.») and Russian («Я ем еду.», «У меня есть книга.», «Книга рядом со столом.») — with all 128 core sentences, every resource pack, grammar notes, coaching lines and the interface strings. Both are hidden from the language pickers until a tester has read their generated sentences (Emi's run is next), so nothing changes for learners today; a tester reaches them with `?showHidden=1`. For the learner later: Swedish teaches the en/ett article and the suffixed definite, Russian teaches cases on objects and after prepositions and the natural «у меня есть» way of saying "I have".

### Yes, no, not, please, maybe and thanks can finally be tested

These six words were introduced once and then sat at level 2 for ever: the level-2 question only ever picked wrong answers of the same word type, and these types have one or two words each. They are now tested against the other small words you know (and, with, I, …) when there aren't enough of their own kind, so they climb the ladder like everything else.

### Anna's words come back after their intro card

Words Anna added to your app vocabulary were introduced once and then never seen again. Once a language's lessons are all unlocked, the app picks the words that have waited longest at each level, and six core words (not, please, maybe, thanks, yes, no) have no way to be tested at level 2, so they sat at the front of that queue for ever and everything behind them, including every word from Anna, never got a turn. The app now skips words that cannot be shown at their level when it picks, so Anna's words come up at level 2 and climb the ladder like any other word. Those six core words still need a proper level-2 exercise; until then they stay at level 2 without blocking anyone.

### Anna's words and the course words are now weighted the same

Course words used to get a small head start in the pick order while the course was unfinished. That is gone: a word from Anna and a word from the course have the same chance of coming up.

## 2026-10-02

### A leaderboard

There is a new Leaderboard button on the start screen. It ranks learners two ways: words mastered at level 7 (the top of the ladder, counted across every language you study) and words you've met with Anna, the tutor. You are not on the board until you choose a display name there; only that name is ever shown, never your email, and you can rename or leave at any time. Your own counts show the moment you open it, whether or not you've joined.

### Both counts on every row (later the same day)

Each row on the board now shows words mastered and words with Anna side by side; the two buttons at the top only change which one the list is sorted by. The first version showed one number at a time, so the Anna count looked missing. Accounts that hadn't saved since the board went live also had their counts computed the moment they opened it instead of after their next lesson.

### The app starts faster

The browser now fetches every part of the app at once instead of discovering them one after another, and the grammar notes, mnemonics and coaching lines, which are only needed inside a lesson, no longer compete with your progress download while the start screen is loading. Nothing about the leaderboard runs until you press its button.

## 2026-09-30

### Try the first three lessons free

You can now start the app with just an email, no card. Enter your email, set a password from the link we send (or continue with Google), and the first three lessons are yours. Lesson four onward and Anna, the AI tutor, stay visible so you can see what's ahead; they open with the full app, and your first $19 includes your first month with Anna. Everything you learned in the free lessons carries straight on.

### Lesson one teaches ten words, not five

Five words made exactly one sentence. Lesson one now brings in ten (I, you, he, she, eat, drink, read, food, water, book), so from the very first lesson you practise them in sentences, the way every later lesson works. The rest of the course is unchanged, one lesson shorter. If you were already partway through, nothing resets.

## 2026-09-26 (evening)

### Anna now counts the words you use, not just the ones she teaches

A word joins your app vocabulary after it has come up in three different conversations with Anna. Until now only the words *she* introduced were tracked, and only *her* replies were checked for repeats, so a word you produced yourself never counted, and the words one conversation away from joining sat there because nothing told her which ones they were. Now: words you use that are outside your profile are captured just like hers; your own messages count toward the three; Anna sees how far along each word is and reaches for the ones one use from joining when they fit; and she'll bring in a new word when the conversation actually needs one, even on the comfort setting, instead of steering around it. Nothing is forced into a short chat.

## 2026-09-26 (later)

### Anna no longer re-teaches words you already know

Anna only ever saw the 60 most recently drilled words you can produce and the 80 most recently drilled words you're practising, so a learner with a full 250-word vocabulary had over a hundred known words hidden from her, and she would gloss or "teach" one of them as if it were new. She now sees your whole vocabulary, words you can produce are listed without translations (so there's nothing to copy into a gloss), the words she taught you herself show up as words rather than internal ids, and her instructions now say plainly: no translations on words you already know. Glosses are for genuinely new words only.

## 2026-09-26

### Anna's memory now survives switching devices

Anna's settings, session memory, learner facts, tutor vocabulary and topics used to travel with the whole progress record, and the record from whichever device saved last won outright. Do a lesson on your phone after talking to Anna on your computer, and the phone's older copy of Anna's state quietly replaced the newer one everywhere. Anna's state now carries its own clock and merges by it, so a lesson on one device can no longer erase a conversation on another. Anna's page also pulls the latest copy from the server when it opens, instead of waiting for the app to do it.

## 2026-09-21

### Anna answers as she types, and End session no longer makes you wait

Anna's replies now appear word by word, with a typing indicator while she starts, instead of landing all at once after a pause. And pressing End session saves your conversation at once and hands the screen back: Anna writes her notes for next time in the background, and the "Next focus" and new-word lines appear when they're ready. If you close the tab before that, she finishes the notes the next time you open the tutor, as before. The notes themselves are also written faster.

## 2026-09-17 (evening)

### Anna's first-visit intro: register fixes in six languages

The intro the setup panel opens with now matches the register the rest of each language's UI already uses: Ukrainian and Turkish were on the informal you where every other string in the file is formal (now ви / siz); Korean was on 합쇼체 with «당신» where the file is 해요체 without a pronoun (now the file's own register). Polish drops a mid-sentence capital on «Twoją»; French swaps «montré connaître» for «montré maîtriser» and matches the file's «l'app»; Japanese drops two of the three «あなた» a Japanese UI would omit. Emi's review, six languages.

## 2026-09-17 (later)

### Refer a friend, and your subscription gets cheaper

Subscribers now have a "Refer a friend" button on the start screen. Accept the referral terms once and you get a personal code and link. When a friend subscribes with it, 20% of every payment they make comes off your own subscription, $3.80 a month per friend at today's price, for as long as you both subscribe. Five friends and your month costs nothing. On the 1st of each month the earnings become a discount line on your next invoice, up to the price of one month; what does not fit waits for a later month, and the discount is capped at $190 per calendar year. The card shows your active referrals, what is waiting, what has already come off, and this year's total. It is only ever a discount on your subscription.

## 2026-09-17

### Under the hood: groundwork for the referral program

Nothing to see yet. The app can now hand a subscriber a personal referral code and keep track of who joined through it and what that earns; the checkout page has an optional "Referral code" field and the referral link fills it in automatically. The "Refer a friend" card, the terms and the payouts follow in the next updates.

## 2026-09-16 (evening)

### Anna is open to every subscriber

Anna no longer sits behind an invite list. Everyone with an active subscription window sees her unlocked on the start screen, automatically, the moment their payment lands. Nothing to switch on per person.

## 2026-09-16 (later)

### Manage your subscription from the start screen

Subscribers now see a "Manage subscription" link under the start-screen buttons. It opens your Stripe page, where you can cancel, change your card or see past invoices; it asks for the email you paid with. Cancelling keeps the app and lets Anna run to the end of the paid month.

## 2026-09-16

### $19 gets you the app and your first month with Anna

Zero to Hero now costs $19, and that includes your first month with Anna, the AI tutor. Keeping Anna is $19/month. The "Get the app" button on the sign-in screen goes to the new checkout. If the subscription ends, the app stays yours and Anna is greyed out on the start screen until you renew; every word Anna taught you stays in your vocabulary.

## 2026-09-15 (later)

### Sign in with a password or with Google

The app now has real accounts. Instead of typing an email, you sign in with your email and a password, or with "Continue with Google" if that is the address you bought access with. Everyone signs in once more after this update; your progress is waiting on the server and comes back the moment you do. First time here, or bought access before passwords existed? Tap "Set or reset your password" on the sign-in screen and follow the email. Your progress is now saved only to your own account, and Anna (the AI tutor) shows as greyed out on the start screen unless your subscription is active.

## 2026-09-15

### Under the hood: the app's database key now lives only in the server configuration

Every server function that reads or writes learner accounts, the tutor's access list, or the usage beacon now takes its Supabase key from the hosting environment instead of a value baked into the code. Nothing changes for learners, but it lets the old keys be switched off for good. If the key is ever missing, the functions say so plainly instead of quietly running on a stale credential.

## 2026-09-13 (later)

### Norwegian now teaches «hånden min»

Norwegian possessives are taught the way most Norwegians say them: after the noun, with the noun in its definite form — «hånden min», «rommet sitt», «klærne mine», and with an adjective the double-definite «den hvite hånden min». Counted nouns keep the possessive in front («våre sju føtter»). Typed translations still accept «min hånd». Exercise blanks and word tiles follow the new form.

## 2026-09-13

### Anna follows your settings and never loses a message

Anna's coaching dials and the new free-text "Instructions for Anna" box (up to 1000 characters) now steer every reply: they sit at the top of what Anna reads, spelled out as rules, and are restated to her on every turn so they hold through a long conversation. Your settings live in your synced account record, so a new version of the app, a cleared browser or another device no longer forgets them. Sending a message and ending a session are now retried automatically; a message Anna could not receive stays in the box with a Retry button instead of asking you to type it again, an unfinished conversation comes back after a reload, and End session always saves — if Anna's notes could not be written she finishes them the next time you open the tutor.

### Norwegian accepts both possessive placements; Finnish possessed nouns carry their suffix

Norwegian keeps teaching «min hånd» and now also accepts «hånden min» (and «rommet sitt», «telefonen din») as a correct translation. Finnish possessed nouns take the person suffix for every person — «minun käteni», «sinun pääsi», «meidän hotellimme», with «hänen kirjansa»-type forms derived where no data existed — while the colloquial «minun käsi» is still accepted. "I go for food" renders as each language's real construction («menen hakemaan ruokaa», «йду по їжу», «gehe Essen holen», «음식을 가지러 가요») instead of the dictionary "for".


## 2026-08-31

### Chinese colours, locations, and "with X" now read like Chinese
Three shipped bugs held Mandarin back in the last review. Colour sentences were reading as bare statives — "书很红" for "the book is red" — instead of the natural 是 X色的 shape a native writes: «这本书是红色的» ("this book is a red one"). Now every «PHONE IS BLUE», «SHIRT IS GREEN», «PANTS ARE BLACK» card renders «X 是 Y色的». Locations were using 是 (identity) where Chinese uses 在 (location) and putting the position word before the ground noun in English order: «书是在上面桌子» read as "the book is at-on-the table". Both flip together — the copula becomes 在, the position glue lands after the noun, and the noun renders bare/definite: «书在桌子上面». Non-colour predicate adjectives (LONG, HEAVY, EASY) keep the 很 pattern they were already right about. And "he eats dinner with his mom" ships «他和他的妈妈一起吃晚餐» — the comitative phrase precedes the verb with 一起 linking them — instead of the English-order «他吃晚餐和他的妈妈».

---

## 2026-09-10

### Thai leaves beta; German plural adjectives; Ukrainian "afterwards"
Thai has been read end to end twice on fresh accounts (19/20 and 20/20, then 20/20 and 20/20) with every reported issue verified fixed in the live exercises, so the BETA tag comes off its picker card. German adjectives before a bare plural now take the plural ending on the stem — «Sie hat neue Schuhe», «falsche Schuhe» — instead of stacking a singular ending onto the plural («neueen Schuhe»); counted plurals get the same treatment, so «zwölf falsche Schuhe» works for adjectives that never had an authored plural. Ukrainian "we go after" is «Ми йдемо потім» (the adverb), not «після» (a preposition with nothing after it).

## 2026-09-10

### Norwegian, Ukrainian, Finnish and Thai: six small grammar fixes from the latest review
Norwegian "if" sentences now put the verb second the way Norwegian does — «Hvis han er hjemme, spiser han med sin datter», not «…, han spiser» — and "he is home" reads «er hjemme» (the state) instead of «er hjem» (the direction). «liten» gained its neuter form, so it is «et lite hus», never «et liten hus». German picked up the same verb-second inversion after a fronted «Wenn» clause. Ukrainian "board a flight" now carries its preposition («сідаю на рейс») and "ten blue phones" declines the soft-stem adjective correctly («синіх»). Finnish numerals follow the object's case: «luen yhtä kirjaa» for a partial object, «näen yhden puhelimen» for a whole one. Thai "exchange currency" no longer says "money" twice («แลกเงิน», not «แลกเงินสกุลเงิน»).


### Finnish is on the picker; Italian, Polish and Ukrainian leave beta; Thai counts properly
Finnish is now visible on the language picker, with a BETA tag while its review continues. Italian, Polish and Ukrainian have passed their reviews and lose the tag. Thai counts with the right classifier word for eyes, feet, hands, meals, jobs and more («เท้าหกข้าง», «งานสองงาน»), "you cook food" is «คุณทำอาหาร» without saying food twice, and "but not lunch" negates the verb («แต่ไม่กินอาหารกลางวัน»). Norwegian "This is my hand" is «Dette er min hånd» again (a definite ending had slipped in), «hennes blå rom» keeps blå unchanged, and a restaurant is «en restaurant». Ukrainian adjectives now follow an animate object into the accusative («доброго брата», «доброго офіціанта»), Polish "they" is «One» before a feminine predicate, and Finnish "one" declines with its object («yhden puhelimen»).

## 2026-09-06

### "Her own room": the reflexive possessive in Ukrainian, Polish and Norwegian
When someone does something with their own things, Ukrainian, Polish and Norwegian use a special word for "own" instead of his or her, and using his or her there means somebody else's. The app now does the same: «Вона йде до своєї кімнати», «Він їсть вечерю зі своєю мамою», «Він бачить свої три музеї»; «Ona idzie do swojego pokoju», «On je kolację ze swoją mamą»; «Hun går til sitt rom», «Han spiser med sin datter». Plain his and her stay where they belong («Він бачить її музей», «Вона її мама»). Also: German "start" is «beginnen» («Sie beginnen zu schlafen»), and a female guide in Polish is «Ona jest przewodniczką».

## 2026-09-06

### Korean, Turkish and German leave beta; German neuter possessives; Italian "one"
Korean, Turkish and German have passed their language reviews and lose the BETA tag on the picker. German possessives on a neuter object are back to the bare form («Du siehst mein Hotel», «Ich trinke ihr Wasser») while masculine objects keep their ending («Wir haben meinen Job»); "right" and "left" decline as adjectives («einen rechten Finger»); a drilled "one" is the article with its case («Wir haben einen Job»); and fruit is «Obst» without an article. Italian "one" now follows the article («un hotel», «una padella», «uno zaino»), and a possessive before a number keeps its article («i suoi dodici cucchiai», «le sue tre sorelle»). Spanish "bad" pluralises before trousers («malos pantalones») and sour fruit is «ácida».

## 2026-09-05

### German home, cases and colours; Norwegian, Turkish and Spanish rows
German "I go home" is «Ich gehe nach Hause», "from home" is «von zu Hause weg», and "he is home" reads «zu Hause». A drilled "my" or "her" on an object now takes the accusative («Sie hat meinen Job», «Sie sieht meinen Bahnhof»), an adjective after a possessive gets its weak ending («zu ihrem großen Zimmer»), the colour loans orange and lila stay undeclined («ein orange Gesicht»), and "she is a waiter" is «Sie ist eine Kellnerin». Norwegian pepper is masculine («en pepper»), greeting someone takes «på» («Jeg hilser på en servitør»), and a possessive now sits before a number in every language («våre sju føtter», "our seven feet"). Turkish "he stops eating" is «O yemeyi bırakır» and "I go for food" is «Ben yiyecek için giderim». Spanish possessives pluralise («mis mamás», «sus chicas») and agree with «ropa» («nuestra ropa»).

## 2026-09-05

### Norwegian: possessives and adjectives agree; Turkish and Portuguese follow-ups
Norwegian possessives now match their noun: «ditt hotell», «mitt rom», «mine klær», not «din hotell». An adjective after a possessive takes its definite form the way it does after "the" — «min gode mamma», «min lille pappa», «hennes hvite rom». Colours and sizes pluralise with counted nouns («åtte svarte telefoner», «grønne klær»), "a thing" is «en ting», a fresh kitchen is «et ferskt kjøkken», souvenirs lose their stray accent («suvenir»), "they start sleeping" is «De begynner å sove», and "I go from home" is the one word «hjemmefra». Turkish "we stop eating" and "they start sleeping" read as a Turk says them — «Biz yemeyi bırakırız», «Onlar uyumaya başlarlar» — and "his airport" is «havalimanını», not a double possessive. Portuguese "they" turns feminine before a feminine predicate («Elas são meninas», «Elas são as meninas dela»; Spanish and French do the same), and "he starts sleeping" no longer fuses into «começà».

## 2026-09-05

### Turkish: seven grammar fixes from its first full read
"A white book" is now «beyaz bir kitap», with the article between adjective and noun, across every sentence. Possessed objects carry their suffixes: «onun tavasını görürüm», «senin kitabını okursun», and "Is that your phone?" is «Şu senin telefonun mu?». "The book is next to the phone" reads «Kitap telefonun yanında», and "between this and that" «bununla şunun arasında». "He eats breakfast but not lunch" negates the verb properly: «ama öğle yemeği yemez». "From" and "to" are suffixes now («evden», «masaya», «menüden»), "home" is «ev», and sons and mouths drop their vowel when possessed («oğlum»). Words starting with i capitalise as İ.

## 2026-09-05

### Portuguese: possessives, locations, home, and "ruim"
"His" and "her" now follow the noun the way Portuguese says it («o aeroporto dela», «o livro dele»), while "my", "your" and "our" stay in front. Where something is uses «estar» and joins up properly («O livro está ao lado do telefone», «Os sapatos estão embaixo disto», «atrás da mesa»). Home is «casa» with «para» and «de» («Eu vou para casa», «Eu vou de casa»), "bad" sits after the noun («um livro ruim»), "food" takes its feminine possessive («minha comida»), and you board «em um voo».

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
