---
name: codebase-to-infographic-prompt
description: Helps an AI analyze a complete software codebase and produce a high-quality prompt for another AI system that will generate a professional infographic.
---

# Codebase to Infographic Prompt

## Purpose

This skill helps an AI analyze a complete software codebase and produce a high-quality prompt for another AI system that will generate a professional infographic.

The skill has two phases:

1. Analyze the codebase and extract the right information.
2. Convert the analysis into a clear infographic-generation prompt.

The AI using this skill should not generate the infographic image itself. It should only produce the analysis and the final prompt.

## When to Use This Skill

Use this skill when the user wants to create an infographic, visual summary, architecture overview, technical project explanation, or stakeholder-friendly visual based on a software codebase.

Examples:

- “Create an infographic prompt for this codebase.”
- “Analyze this project and help me make a visual overview.”
- “Turn this software project into an infographic concept.”
- “Create a prompt for an AI image generator based on this codebase.”
- “Explain this codebase visually for stakeholders.”

## Assumed Access

Assume the AI has access to the entire codebase, including source files, configuration files, documentation, tests, scripts, build files, deployment files, and project metadata.

The AI should use the available codebase evidence directly rather than relying on guesses.

Relevant sources may include:

- Source code
- README files
- Documentation
- Architecture notes
- Configuration files
- Dependency manifests
- Test files
- CI/CD workflows
- Docker or infrastructure files
- Scripts
- Changelogs
- Roadmaps
- Comments and TODOs
- Commit, issue, or release metadata if available

## Inputs Needed

Use the following input when available:

- Full codebase access
- Intended audience
- Preferred infographic format
- Preferred visual style
- Language for the infographic
- Any specific focus area, such as architecture, onboarding, business value, user flow, or technical stack

If the user does not provide audience, format, style, language, or emphasis, make reasonable assumptions and state them clearly.

Default assumptions:

- Audience: product owners, developers, and technical stakeholders
- Format: vertical infographic, 1080x1920
- Style: modern, clean, technical SaaS-style infographic
- Language: English for the image prompt, unless the user requests another language
- Emphasis: balanced overview of purpose, architecture, features, technology stack, and main flow

## Phase 1: Codebase Analysis

Analyze the codebase and extract the following information.

### 1. Project Purpose

Identify:

- What the project does
- What problem it solves
- Who it is for
- Why it exists

Use evidence from documentation, source code, configuration files, examples, tests, project metadata, or comments.

### 2. Main Features

Identify the most important user-facing or system-facing features.

Prioritize features that can be explained visually.

### 3. Technical Architecture

Identify the major components, such as:

- Frontend
- Backend
- API
- Database
- Authentication
- Authorization
- External services
- AI/ML models
- Data pipelines
- Workers or background jobs
- Message queues
- Caches
- Infrastructure
- Deployment setup
- Observability or logging
- Admin or internal tools

Describe how the components interact.

### 4. Technology Stack

Extract:

- Programming languages
- Frameworks
- Libraries
- Databases
- Cloud or infrastructure tools
- CI/CD tools
- Testing tools
- Package managers
- Containerization tools
- Build tools
- Monitoring or observability tools

Look especially at files and directories such as:

- README.md
- docs/
- src/
- app/
- lib/
- services/
- packages/
- modules/
- tests/
- scripts/
- package.json
- pyproject.toml
- requirements.txt
- go.mod
- Cargo.toml
- pom.xml
- build.gradle
- composer.json
- Gemfile
- Dockerfile
- docker-compose.yml
- .github/workflows/
- .gitlab-ci.yml
- terraform/
- infra/
- helm/
- k8s/

### 5. Data Flow or User Flow

Describe the main flow through the system.

Examples:

- User action → frontend → API → database → response
- Input data → processing pipeline → model/service → output
- Developer workflow → build → test → deploy
- Event trigger → queue → worker → external service → database update

Identify which flow is most suitable for a visual diagram.

### 6. Project Status

Estimate the maturity of the project:

- Concept
- Prototype
- Proof of concept
- MVP
- Beta
- Production-ready
- Actively maintained
- Experimental
- Archived or inactive

Base this on available evidence such as:

- Documentation quality
- Test coverage or test structure
- CI/CD setup
- Deployment configuration
- Release tags or changelog
- Roadmap
- Code organization
- Error handling
- Security practices
- Observability
- Configuration management
- TODOs or FIXME comments
- Issue, commit, or release metadata if available

If uncertain, state the uncertainty.

### 7. Visual Key Messages

Extract 5–8 key messages that should appear in the infographic.

Each key message should be short, concrete, and visually representable.

### 8. Risks, Gaps, and Limitations

Identify:

- Missing documentation
- Unclear architecture
- TODOs or FIXME comments
- Open issues if available
- Lack of tests
- Security concerns
- Deployment gaps
- Hardcoded configuration
- Experimental dependencies
- Inconsistent structure
- Scalability concerns
- Any uncertainty in the analysis

Do not invent problems. Only mention risks that are supported by the codebase or clearly marked as assumptions.

## Phase 1 Output Format

Return the codebase analysis using this structure:

### Codebase Analysis

#### Short Summary

Briefly explain the project in 3–5 sentences.

#### Project Purpose

Explain what the project does, who it is for, and what problem it solves.

#### Target Audience

Identify likely users or stakeholders.

#### Main Features

List the most important features.

#### Technical Architecture

Describe the main system components and how they interact.

#### Technology Stack

Group technologies by category:

- Languages
- Frameworks
- Libraries
- Database
- Infrastructure
- Testing
- CI/CD
- Build tools
- Observability
- Other tools

#### Main Flow

Describe the most important user flow or data flow step by step.

#### Project Status

Estimate the project’s maturity and explain the reasoning.

#### Visual Key Messages

List 5–8 short messages suitable for an infographic.

#### Risks, Gaps, or Uncertainties

List any limitations or uncertainties.

#### Recommended Infographic Structure

Suggest a visual structure, such as:

- Title and tagline
- Problem
- Solution
- Core features
- Architecture diagram
- Technology stack
- Workflow
- Project status
- Next steps

#### Reusable Infographic Text Blocks

Write short text snippets that can be placed directly in the infographic.

Important:
Do not create the final AI image prompt in Phase 1 unless the user explicitly asks to skip Phase 2.

## Phase 2: Create the Infographic Prompt

Using the Phase 1 analysis, create a final prompt for an AI image generator.

The prompt should be clear, detailed, and visually specific.

It should include:

- Infographic title
- Subtitle or tagline
- Intended audience
- Format and aspect ratio
- Visual style
- Color palette
- Layout structure
- Sections to include
- Icons or visual metaphors
- Architecture diagram instructions
- Technology stack presentation
- Flow diagram instructions
- Text density guidance
- Typography guidance
- Constraints and things to avoid

The final prompt should usually be written in English because many image-generation models respond best to English prompts.

## Phase 2 Output Format

Return the result using this structure:

### Final Infographic Prompt

```text
Create a professional [format] infographic about [project name].

Audience:
[Audience]

Visual style:
[Style]

Format:
[Format and aspect ratio]

Title:
[Title]

Subtitle:
[Subtitle]

The infographic should contain the following sections:

1. [Section name]
[Description]

2. [Section name]
[Description]

3. [Section name]
[Description]

Architecture diagram:
[Describe components and arrows]

Technology stack:
[Describe grouped badges or icons]

Main flow:
[Describe flow steps]

Visual direction:
[Describe colors, typography, icons, layout, spacing, hierarchy]

Text guidance:
Use concise labels and short explanations. Avoid long paragraphs.

Avoid:
- Inventing unsupported claims
- Too much small text
- Overly complex diagrams
- Fake metrics unless explicitly provided
- Misrepresenting project maturity
```

### Optional Negative Prompt

```text
Avoid cluttered layouts, unreadable small text, random code snippets, inaccurate architecture, fake statistics, excessive decoration, low contrast, inconsistent icon styles, and generic stock visuals.
```

## Quality Rules

The AI must:

- Separate codebase analysis from image prompt creation.
- Avoid inventing unsupported facts.
- Clearly mark assumptions.
- Prefer codebase evidence over guesses.
- Keep infographic text short, concrete, and visual.
- Prioritize clarity over decoration.
- Make the final prompt directly usable in an image-generation AI.
- Include uncertainties when codebase information is incomplete or ambiguous.
- Ensure the output is useful for both technical and non-technical stakeholders.
- Avoid unnecessary back-and-forth with the user.
- If key details are missing, make reasonable assumptions and state them clearly.
- Do not claim the project has features, maturity, users, metrics, integrations, or architecture that are not supported by the codebase.
- Do not include fake statistics unless the codebase or project metadata provides real metrics.
- Do not overstate production readiness.
- Keep diagrams simple enough to understand quickly.
- Prefer concrete component names from the codebase when available.
- Mention uncertainty when architecture or intent must be inferred from code structure.

## Recommended Workflow

1. Use the available full codebase access.
2. Inspect documentation, source code, configuration, tests, scripts, and deployment files.
3. Analyze the codebase content.
4. Produce the structured Phase 1 analysis.
5. If audience, style, format, language, or emphasis are missing, make reasonable assumptions and clearly state them.
6. Produce the Phase 2 final infographic prompt.
7. Optionally produce variants for different audiences if requested:
   - technical
   - executive
   - investor
   - customer-facing
   - developer onboarding

## Optional Variants

If the user asks for variants, create separate final prompts optimized for different audiences.

### Technical Variant

Emphasize:

- Architecture
- Components
- APIs
- Data flow
- Technology stack
- Deployment
- Testing and CI/CD
- Observability
- Developer workflow

### Executive Variant

Emphasize:

- Problem
- Solution
- Business value
- Project maturity
- Key capabilities
- Roadmap or next steps
- Risks and dependencies

### Investor Variant

Emphasize:

- Market problem
- Differentiation
- Scalability
- Technical defensibility
- Product maturity
- Growth potential
- Risks and assumptions

### Customer-Facing Variant

Emphasize:

- User problem
- Benefits
- Ease of use
- Main features
- Outcomes
- Trust and reliability

### Developer Onboarding Variant

Emphasize:

- Codebase structure
- Setup flow
- Architecture
- Main modules
- Development workflow
- Testing workflow
- Contribution path
