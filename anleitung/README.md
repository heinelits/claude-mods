# anleitung

A Claude Code mod. `/Anleitung` turns what happened in the running session into a PDF handout for the people who use the software — not for developers. It filters the session for what a user would notice, offers those points as a numbered list, and explains the ones you pick in plain German, with no code, paths or ticket numbers in the text.

**Three steps, and it stops in the middle.** First it collects the user-visible changes of the session and leaves out the refactorings, tests, migrations and deploys. Then it lists them, numbered, and waits — `1, 3`, `5-7`, `alle` or `alle außer 4`. Only then does it write the explanations and render the PDF.

**What a point looks like in the PDF.** Each one gets up to four blocks: what is new, why it is better than before, the click path step by step, and what to watch out for. A block it cannot fill honestly is left out rather than padded. Terms that cannot be avoided go into a glossary at the end instead of being explained mid-sentence.

**The renderer has no dependencies.** It writes the PDF itself, using the standard fonts every PDF reader carries, so the mod works in any project without `npm install`, a PHP toolchain or a headless browser. The cost is Helvetica instead of a house font, and the WinAnsi character set: German umlauts, quotation marks, dashes and the euro sign are there, emoji and non-Latin scripts are not.

**Commands.**

| Command | Does |
| --- | --- |
| `/Anleitung` | collects the points and offers them for selection |
| `/Anleitung Neuerungen im Lager` | the same, with that title on the PDF |
| `/Anleitung --transcript` | also reads the session transcript, for a session whose early part was summarised away |

**Branding.** The JSON the mod writes takes an optional `akzentfarbe` (a hex colour for rules and headings) and `logo` (an absolute path to a **JPEG**, placed top right). Where the project has a house colour or a logo, the mod uses it; otherwise the handout is red on white.

**Where the PDF lands.** Next to the working directory in `anleitungen/`, unless the mod is told otherwise. In a repository it picks a path outside version control, so a handout is never committed by accident.

**Local and cloud.** The mod behaves the same in both: it has no hooks and draws nothing above the prompt, it only answers in the conversation. It needs `node`, which Claude Code brings along.

## Install

At the prompt of a terminal session:

```
/plugin install anleitung --marketplace heinelits/claude-mods
```

From a shell:

```bash
claude plugin install anleitung --marketplace heinelits/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `heinelits/claude-mods`, then Add plugin.

For cloud sessions, see the [repository README](../README.md#cloud-sessions).

## Tests

```bash
node --test anleitung/tests/render.test.mjs
```

No test framework, for the same reason the renderer has no PDF library.
