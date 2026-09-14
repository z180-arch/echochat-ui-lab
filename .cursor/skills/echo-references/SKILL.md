---
name: echo-references
description: At the start of EchoChat work, consult Hallmark (UI, component-scope) and awesome-llm-apps (LLM app patterns). Never import those agent stacks into Product Core.
---

# EchoChat agent references

Check these before UI or companion-loop work:

1. [Hallmark](https://github.com/Nutlope/hallmark) — anti-AI-slop design. EchoChat already has Morning Mint. New in-app UI is **component-scope**: reuse existing tokens, fields, chips. Do not pick a Hallmark catalog theme for `/app/`. Landing `/` may use Hallmark if the task is a landing redesign.

2. [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) — study companion/chat UX. Do not add CrewAI, AutoGen, LangGraph, or similar as the host.

Product Core stays: `assembleTurnContext` is the only context door. No GPL/AGPL copies.
