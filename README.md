# Research wiki

A starting point for a personal, agent-supported research wiki in plain Markdown.

## Why I use this wiki

I use this wiki to stay oriented in my research: to record thoughts while they are fresh, connect them to earlier work, and recover the context when I return to a question. It is a personal collection of knowledge and recollections, including uncertainties, unfinished ideas, and changes of mind.

As AI agents become more capable, I don't want to lose my own involvement in the research. Putting an idea into my own words is part of understanding it, not just a documentation task. I want the wiki to reflect that understanding rather than become a growing collection of text I have not really thought through.

The agent helps make this practical. I can drop a rough thought into a conversation without first choosing a filename, finding every relevant page, or polishing the wording. The agent can handle that maintenance and later help me find what I meant, where an idea came from, or why I made a decision. The accumulated notes also give it context for research, brainstorming, and criticism.

This borrows from the appeal of bullet journaling and personal knowledge management: capture briefly, keep track of what matters, and return to it when needed. The aim is less effort spent maintaining the system and less effort spent reconstructing my own train of thought.

This is how I intend to use the template, not a restriction on what someone else can build with it.

## A conversation with the wiki

For example, using the fictional sensor project included in this template:

- **A quick thought:** "I keep calling this drift, but temperature and time changed together. Note that uncertainty for the sensor project."
- **Returning later:** "Where did I leave this, and what was bothering me about the explanation?"
- **Using the agent actively:** "Given those notes, what alternative explanations should I consider?"
- **Recording my developing view:** "The warm-up issue seems important. Here's how I now understand the problem..."

The point is not that the agent stays passive. It is that the conversation helps me continue my research, while the notes preserve a thread I recognize as my own. These are examples of how I use the same context, not stages every note needs to pass through.

## Zotero, Obsidian, and the agent

I read papers, organize collections, and annotate PDFs in Zotero. The wiki records what I make of that material and how it connects to my research. Obsidian lets me browse and edit those notes directly; the agent works with the same Markdown files.

With Zotero access configured, the conversation can draw on both places. I can ask about a paper, revisit my highlights and comments, find material in a collection, or connect something I read to an earlier thought in the wiki. I don't have to copy an entire paper or its annotations into the wiki before discussing it.

The applications retain their roles: Zotero holds the literature and annotations, while the wiki holds my evolving understanding. The agent helps me move between them.

For example:

- "What did I highlight in this paper about calibration, and what comments did I leave?"
- "Which papers in my sensor-modeling collection might help me revisit this question?"
- "How does this relate to my earlier notes about drift?"
- "Here's how I now understand the distinction. Save that interpretation and link it to the paper and project."

For agent access to Zotero, I use [zotgo](https://github.com/heibench/zotgo). Its documentation covers setup; the agent can inspect the available commands when needed. Obsidian opens the wiki directly as a vault. The optional [Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title) plugin displays the titles from your notes instead of their filenames.

## How the pages fit together

The template starts with five kinds of pages:

- **`sources/`** - Source-specific evidence, interpretations, and personal observations.
  - Examples: [Changing-temperature observation](sources/example-temperature-observation.md), [fixed-temperature observation](sources/example-fixed-temperature-observation.md).
- **`entities/`** - Named projects, people, organizations, systems, and tools.
  - Example: [Sensor comparison project](entities/example-project.md).
- **`concepts/`** - Ideas and working definitions that recur across pages.
  - Example: [Sensor drift](concepts/example-concept.md).
- **`analyses/`** - Reasoned answers to focused questions.
  - Example: [What explains the changing difference?](analyses/example-analysis.md).
- **`syntheses/`** - Interpretations integrating multiple sources or projects.
  - Example: [What the observations jointly support](syntheses/example-synthesis.md).

The fictional example follows an observation through competing explanations to a proposed experiment. It keeps the proposal separate from the invented observations and avoids presenting a causal conclusion as established.

## Make it your own

The folders and example pages are a starting point, not a fixed model for your research. Adapt the organization and page format to your own workflow. You do not need to fill every category or turn a rough thought into a polished project page before recording it.

The notes are ordinary Markdown. Use YAML frontmatter at the top of a page for metadata you find helpful. The examples show an initial set of conventions; adapt those with your agent as your needs develop rather than treating them as a permanent schema.

Tell the agent how you want to work and let it help with the corresponding formatting, links, and maintenance. The goal is to make your notes useful to you, not to spend your research time tending the template.

## Start your own workspace

1. On GitHub, choose **Use this template** and create a **private repository** for your research. Work in your own copy, not the template repository.
2. Open the workspace folder as an existing vault in Obsidian, or use another Markdown editor.
3. Start your preferred file-and-shell agent in that folder and ask it to read [AGENTS.md](AGENTS.md). Review those operating instructions with it and adjust them to fit how you want to work and what you want to delegate.
4. Bring a thought, question, or recollection of your own. Explore the example pages if helpful, then ask the agent to help replace them with your own material and tidy up the example links.

Give the agent access only to material you are permitted to share with its provider. If you want Zotero access, ask it to help you follow zotgo's setup guidance.

## Contributing

Ideas and improvements from using the template are welcome. See [Contributing](CONTRIBUTING.md).
