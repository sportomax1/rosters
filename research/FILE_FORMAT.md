# NCAA Basketball 10 PS3 Roster File Research

This document is the living field map for the NCAA Basketball 10 roster format.

## Known save-folder shape

A typical PS3 save contains files similar to:

```text
PS3/
└── SAVEDATA/
    └── <roster-save-folder>/
        ├── ICON0.PNG
        ├── PARAM.PFD
        ├── PARAM.SFO
        └── SYS-DATA
```

`SYS-DATA` is the expected roster payload. It commonly has no extension.

## Current confidence

| Area | Status | Notes |
|---|---|---|
| Save payload file | Probable | Community transfer processes point to `SYS-DATA`. |
| Encryption/signing | External | Must be handled before/after editing with appropriate PS3 save tooling. |
| Internal database format | Unknown | Do not assume NCAA Football field maps apply. |
| Player record length | Unknown | Requires controlled experiments. |
| Team record length | Unknown | Requires controlled experiments. |
| String encoding | Unknown | Test ASCII, UTF-8, UTF-16LE, and indexed-name possibilities. |
| Checksums | Unknown | Compare in-game saves and test emulator loading. |

## Experiment naming

Use a stable naming pattern outside Git:

```text
YYYY-MM-DD_team_player_field_old-new_run.sys-data
```

Example:

```text
2026-07-24_colorado_player12_threepoint_70-71_run01.sys-data
```

## Required experiment metadata

Each experiment should record:

- Game region and title ID
- Platform: physical PS3 or RPCS3
- Source roster name/version
- Team
- Player identity and jersey number
- Exact field changed
- Old value
- New value
- Whether any menus were opened afterward
- Whether the game auto-saved
- File size
- SHA-256 hash
- Difference report filename

## Candidate field table

Only add a field after repeatable evidence exists.

| Entity | Field | Offset / pattern | Width | Encoding | Confidence | Evidence |
|---|---|---:|---:|---|---|---|
| — | — | — | — | — | — | — |

## Validation rule

A candidate field should not be marked confirmed until:

1. The same offset or record-relative location changes across at least three controlled values.
2. A second player produces the same record-relative behavior.
3. Writing a value back changes only the intended in-game field.
4. The roster loads successfully after editing.
5. Saving again in-game does not corrupt or erase the field.
