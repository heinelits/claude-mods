# roadmap

A Claude Code mod. It shows a progress bar above the prompt for the project roadmap that this session works one item of: how many items are done, the session's own item with its status and next step, and the items still open, in order.

**It shows by itself.** When the session title starts with an item number, such as `T.2: Mapping`, and a roadmap holds that number, the bar appears without a command. The mod looks for the number in the Markdown files under `docs/roadmap/` (and `ROADMAP.md`), in the newest committed version across all branches, so a roadmap kept on another session's branch is found too; a changed or new file in the working copy counts as well. Where several files hold the number, the one sharing the most words with the session title wins, then the newest.

**A session without a number**, such as a planning session over a whole roadmap, names the file once: `/roadmap docs/roadmap/plan.md` shows an overview of it. Whatever `/roadmap` sets is kept for the session, also when it is resumed.

**What counts as an item.** A table row whose first cell starts with a number (`S.5`, `**T.1**`, `**R.1 Rundgang**`, or several: `D.11 Status · D.13 Kunde`), a heading that starts with one (`### S.4 — Title`), or a checklist line (`- [x] A.1 ...`); a range (`R.2–R.4`) is skipped. A row with ✅, `[x]`, gemergt, erledigt, abgeschlossen or done is done; 🔵, 🔄 or "in Arbeit" is in work (shown with 🔵 among the open items); ⏸, zurückgestellt or abgelöst is set aside and not counted; ⏳, ❓ and ❌ are open. A table's "Stand" and "Nächster Schritt" columns are shown for the session's own item. The first mention of a number sets its status.

**Commands.**

| Command | Does |
| --- | --- |
| `/roadmap` | hides the bar, or shows it again; where no bar is drawn, reports the roadmap |
| `/roadmap an` / `/roadmap aus` | shows / hides it |
| `/roadmap T.2` | sets the item, where the title has no number |
| `/roadmap docs/roadmap/plan.md` | reads only this file; an overview where it lacks the item |
| `/roadmap auto` | forgets all of the above: back to the session title |

The arguments combine in one line, in any order: `/roadmap an T.2 docs/roadmap/plan.md`. A path may not hold spaces. A line with an unknown word changes nothing. Except when it hides the bar, `/roadmap` also answers with the roadmap as text: bar, the session's item with its status and next step, and the open items.

The mod reads the roadmap again when the session title changes and every two minutes. It needs `git` for the branch search; without it, it reads the working copy. A branch only counts as far as the local repository has fetched it.

**Cloud sessions.** There the mod draws no bar: no surface asks it to draw. The session title does not reach it either, so nothing shows by itself. `/roadmap` is the way in: name the item and, where needed, the file once (`/roadmap T.2` or `/roadmap docs/roadmap/plan.md T.2`), and each later `/roadmap` reports the roadmap as text.

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
