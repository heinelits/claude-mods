# roadmap

A Claude Code mod. `/roadmap` shows a progress bar above the prompt for the session's current task list: how many items are done, which item is running now (with time and tool calls so far), and the items still open, in order.

It follows the task list Claude keeps in the session: `TodoWrite`, `TaskCreate`/`TaskUpdate` in the terminal, and the task list of the Claude desktop app. `/roadmap` toggles the bar; `/roadmap an` and `/roadmap aus` set it.

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
