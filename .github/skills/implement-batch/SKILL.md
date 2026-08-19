---
name: implement-batch
description: "Implement a spec and its set of tickets."
disable-model-invocation: true
---

You are given a **Spec**. The **Spec** can contain sub-issues, some blocked by others. You must orchestrate the resolution of the **Spec**.

If the **Spec** contain sub-issues, you must resolve them in the correct order. For each unblocked sub-issue of the **Spec** start a background agent. The background agent should call the Skill tool with "implement" and tell the background agent to do its work on its own worktree. Make sure the background agent does its thing and complete their work. If a background agent asks a question you can't answer, bring the question to the user to respond.

When a background agent finishes, you bring their work to you local branch. You are responsible for stitching all the background agents work together in the local branch. When finished work unblock a sub-issue you repeat the process until all sub-issues has been resolved.

When all sub-issues has been resolved and you have stiched all the work into the local branch, stage all changes. Then call the Skill tool with "code-review" using **diff** as the staged changes, and compare against the **Spec** you were given. If any issues arises you resolve them by running a new background agent, when it finish you bring it into the local branch and repeat the process with code review. Repeat until there are no issues in the code review against the **Spec**.
