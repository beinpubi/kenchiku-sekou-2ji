# UI refactor 8.0

Applied to the latest uploaded source set.

- 72 lesson HTML files retained with lesson content unchanged.
- Common lesson CSS moved to `study-common.css`.
- Common lesson JS split into reusable files:
  - `study-bootstrap.js`
  - `study-common.js`
  - `study-cloud.js`
  - `study-sync.js`
  - `study-chapter-nav.js`
  - `study-tts.js`
  - `study-nav-data.js`
  - existing `study-selection-tools.js`
- Added toolbar `2列` toggle. State persists in `localStorage`.
- Index drawer now highlights the section currently being read.
- Index drawer has two levels: current-page TOC and whole-site TOC.
- Whole-site TOC highlights the current lesson and jumps directly to any lesson.
- `index.html` remembers its scroll position and highlights the most recently read lesson.
- `index.html` CSS/JS moved to external files for maintainability.
- Existing TTS/Furigana/auth endpoints were preserved in this package. Security endpoint migration is a separate deployment step.

No image files were present in the uploaded ZIP, so this package does not add image binaries.
