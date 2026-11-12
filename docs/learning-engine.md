# Learning engine and spaced repetition

French Daily uses a deterministic TypeScript implementation of the published
FSRS-4.5 day-based memory formulas, with the 17 default weights. It runs in the
browser; review state and history are saved to IndexedDB. There is no learning
backend or cloud sync. This is a limited day-based scheduler, not full modern
Anki parity.

Each recall task has an independent ID: English→French, French→English,
definite/indefinite gender, recognition, sentence direction, and verb subject
are separate cards. A lemma ID identifies content; an exercise ID identifies
its memory state. Knowing an English meaning does not advance French production.

After recall, the four ratings mean:

| Rating | Meaning | First review at 90% target |
|---|---|---|
| Again | Forgot | Tomorrow |
| Hard | Recalled with effort | Tomorrow |
| Good | Normal recall | In about 4 days |
| Easy | Effortless recall | In about 14 days |

Later intervals depend on stability, difficulty, elapsed time and the rating.
Stability is the number of days at which predicted recall reaches 90%; difficulty
models how hard this particular card is. Higher requested retention means shorter
intervals. Estimates are model predictions, not measured guarantees of retention.
The reference mean reversion for FSRS-4.5 is D0(Good), not D0(Easy).

Typed grading and self-assessed difficulty are separate. Typed answers normally
map correct→Good, accent/typo→Hard, wrong article/wrong→Again. Swipe self-assessment
records Again/Hard/Good/Easy directly. Hard is successful recall, not an incorrect
spelling answer. Easy is never awarded automatically for a correct typed answer.

Due reviews precede new material. Review mode contains existing due cards only;
practice can introduce new cards but excludes already-reviewed cards whose due
dates are in the future. Due-only sessions can end below their nominal size.
Failed typed exercises are retried at most twice during the session. A failed
swipe card is scheduled for the next local day. There are no minute-based
learning/relearning steps, same-day stability updates, parameter optimization,
fuzz, Anki synchronization or cross-device synchronization.

Every review atomically saves its attempt and memory state. Undo restores both.
Repeated taps are ignored while a save is in flight. Completed swipe drills and
focused sessions count toward the streak and goals; partial sessions do not.
Session duration is wall time and may include idle time; no active-time inference
is made. Mastery is tracked per recall card (at least four correct attempts over
three days plus an interval of at least seven days), not CEFR proficiency.

The version-2 upgrade keeps a raw safety snapshot. Legacy lemma-level state is
assigned to one deterministic task compatible with its last exercise kind, since
old logs did not record direction/subject. It is never cloned across all tasks.
Settings → Export safety snapshot downloads the pre-upgrade/pre-restore state.
Backup restore validates records before writes and atomically restores settings
and progress. Exported backup version 1 remains importable.

Reference: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
