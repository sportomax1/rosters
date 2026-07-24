# NCAA Basketball Roster Lab

A local-only research and editing project for NCAA Basketball 10 PS3 roster saves.

The current version is a browser-based binary analysis tool. It is designed to help reverse-engineer the internal structure of decrypted `SYS-DATA` roster files by comparing controlled roster saves.

## Current features

- Load one or two extensionless `SYS-DATA` files
- Process files entirely inside the browser
- Compare every byte between an original and modified roster
- Group adjacent byte changes into regions
- Inspect both files in a synchronized hex viewer
- Search for ASCII strings, raw hex, and integer encodings
- Record the exact in-game experiment used to create the modified save
- Export a JSON difference report
- Responsive desktop and mobile interface

## Important limitations

This first version does **not**:

- Decrypt encrypted PS3 saved data
- Re-sign saves for a PS3 profile
- Know the NCAA Basketball 10 player-record schema yet
- Safely write roster changes back to `SYS-DATA`
- Validate a modified save in NCAA Basketball 10

Those features depend on successfully documenting the file format first.

## Recommended experiment process

1. Back up the complete PS3 save folder.
2. Create roster A and do not modify it.
3. Change exactly one known field in the game, such as one player's three-point rating from 70 to 71.
4. Save roster B immediately.
5. Obtain the decrypted `SYS-DATA` files from both saves.
6. Load A and B into this app.
7. Enter clear experiment notes.
8. Export the generated JSON report.
9. Repeat using the same player and nearby values.
10. Compare reports to identify stable offsets and encodings.

## Run locally

No build step is required.

Open `index.html` directly, or serve the directory with any static web server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The included workflow deploys the static application to GitHub Pages after pushes to `main`. Pages may need to be enabled in the repository settings with **Source: GitHub Actions**.

## Planned phases

### Phase 1 — Binary research

- Controlled save comparison
- Offset mapping
- Repeating-record detection
- Text and integer encoding research
- Research report catalog

### Phase 2 — Read-only roster parser

- Detect supported roster versions
- Decode team and player records
- Display searchable player and team tables
- Export CSV and JSON

### Phase 3 — Safe roster writer

- Edit known fields only
- Preserve unknown bytes exactly
- Validate all values and record lengths
- Generate backups and before/after reports

### Phase 4 — Bulk editor

- Spreadsheet-style editing
- Multi-player selection
- Add, subtract, set, clamp, and formula operations
- Team and position filters
- CSV import/export
- Undo history

### Phase 5 — PS3 workflow helpers

- Document Apollo Save Tool workflow
- Package edited `SYS-DATA` into the expected save-folder structure
- Validate required companion files

## Repository safety

Do not commit commercial game files, copyrighted roster saves, account-bound save metadata, or personal PS3 profile data. The `.gitignore` blocks common research and save-file folders by default.

## Disclaimer

This is an independent preservation and research project. It is not affiliated with Electronic Arts, Sony, the NCAA, or RPCS3.
