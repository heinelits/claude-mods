# claude-mods

Claude Code mods, one per folder. This repository is a plugin marketplace.

| Mod | What it does |
| --- | --- |
| [roadmap](roadmap/) | `/roadmap` shows a progress bar of the session's task list above the prompt. |

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

## Cloud sessions

Cloud sessions do not load installed plugins. To load the mods there, configure the cloud environment:

- Setup script:

  ```bash
  git clone --depth 1 https://github.com/heinelits/claude-mods.git /opt/claude-mods
  ```

- Environment variable, one path per mod, separated by `:`:

  ```
  CLAUDE_CODE_PLUGIN_DIRS=/opt/claude-mods/roadmap
  ```
