# roadmap

A Claude Code mod. `/roadmap` shows a progress bar above the prompt for the project roadmap that this session works one item of: how many items are done, the session's own item with its status and next step, and the items still open, in order.

**Which roadmap.** The session title starts with the item's number, such as `T.2: Mapping`. The mod looks for that number in the Markdown files under `docs/roadmap/` (and `ROADMAP.md`), in the newest committed version across all branches, so a roadmap kept on another session's branch is found too; a changed or new file in the working copy counts as well. Where several files hold the number, the one sharing the most words with the session title wins, then the newest.

**What counts as an item.** A table row whose first cell is a number (`S.5`, `**T.1**`, `S.9b`), a heading that starts with one (`### S.4 — Title`), or a checklist line (`- [x] A.1 ...`). A row with ✅, `[x]`, gemergt, erledigt, abgeschlossen or done is done; 🔵 or "in Arbeit" is in work (shown with 🔵 among the open items); ⏸, zurückgestellt or abgelöst is set aside and not counted. A table's "Stand" and "Nächster Schritt" columns are shown for the session's own item.

**Commands.**

| Command | Does |
| --- | --- |
| `/roadmap` | shows or hides the bar |
| `/roadmap an` / `/roadmap aus` | shows / hides it |
| `/roadmap T.2` | sets the item for this session, where the title has no number |
| `/roadmap docs/roadmap/plan.md` | reads only this file |
| `/roadmap auto` | back to the session title and the search |

The bar reads the roadmap again when shown, when the session title changes, and every two minutes while shown. It needs `git` for the branch search; without it, it reads the working copy.

## Install

At the prompt of a terminal session:

```
/plugin install roadmap --marketplace heinelits/claude-mods
```

From a shell:

```bash
claude plugin install roadmap --marketplace heinelits/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `heinelits/claude-mods`, then Add plugin.

For cloud sessions, see the [repository README](../README.md#cloud-sessions).
