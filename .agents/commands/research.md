---
name: research
description: Research a topic based on a query prompt and collect findings, sources, and recommended next steps
input: Query prompt
output: Research summary with cited sources and actionable insights
---

Use sub-agents judiciously to research the query prompt. Each sub-agent should be given a research topic, questions to answer, and clear stop criteria. Based on the results of the sub-agents, prepare questions and next research topics for things that are unclear from the existing research.

IMPORTANT: If needed, use web search agent for external documentation. This is very important if the user's query specifically mentions external libraries or resources.

INFO: Use the `Directory` section in AGENT.md files to help guide your research. The directory section contains a list of important files and folders as well a description of their purpose.
