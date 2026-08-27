# Changelog — Zero to Hero app

Ship notes for the app. Each entry names what changed and what it means for the learner. The public `/changelog` page on nekhslanguageblueprint.com reads from this file.

Written on 2026-07-29. Backfilled to 2026-06-29; earlier history lives in git.

---

## 2026-08-27

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
