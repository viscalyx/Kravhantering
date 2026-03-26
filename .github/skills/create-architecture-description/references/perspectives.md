# Architecture Perspectives

Use the supplied template's perspective names and ordering first. Use this file
when the prompt needs help choosing or framing perspectives.

Choose only perspectives that materially help stakeholders understand the
solution.

## Output Labels

- Current state: `Nuläge`
- Target state: `Målläge`
- Transition: `Förflyttning` - use only in `Implementation and Transition Perspective`
- Forward look: `Framåtblick`

## Overview Perspective

- Swedish heading: `Översiktsperspektiv`
- Stakeholders: architecture leads, solution owners, project leads
- Use when: the reader needs a concise map of the solution, scope, and main
  dependencies
- Cover: an overview of the solution, how its parts relate, and, when needed,
  pointers to other perspectives that explain specific aspects

## Business Process Perspective

- Swedish heading: `Verksamhetsprocessperspektiv`
- Stakeholders: business architects, process owners, service managers
- Use when: the solution changes or supports a business workflow
- Cover: the overall structure of one or more business processes, the business
  services they realize, the actors and roles in them, and the information they
  handle or produce

## Application Usage Perspective

- Swedish heading: `Applikationsanvändningsperspektiv`
- Stakeholders: solution architects, software architects, operations
- Use when: people or upstream or downstream systems use the application to
  perform work
- Cover: how applications or systems support one or more business processes,
  how other applications use them, and how the business uses the application

## Application Interaction Perspective

- Swedish heading: `Applikationssambandsperspektiv`
- Stakeholders: solution architects, software architects, integrations teams
- Use when: data or service interactions between systems are important
- Cover: how information flows between applications or systems and which
  services they provide and consume

## Application Structure Perspective

- Swedish heading: `Applikationsstrukturperspektiv`
- Stakeholders: software architects, development teams
- Use when: internal composition and dependencies matter for understanding the
  solution
- Cover: how an application is built and its dependencies on application
  components and data

## Infrastructure Usage Perspective

- Swedish heading: `Infrastrukturanvändningsperspektiv`
- Stakeholders: solution architects, infrastructure architects, operations
- Use when: runtime environments or platform services shape the solution
- Cover: how applications use supporting infrastructure and where application
  artifacts such as data files and program files are deployed

## Infrastructure and Network Perspective

- Swedish heading: `Infrastruktur- och nätperspektiv`
- Stakeholders: infrastructure architects, operations, security reviewers
- Use when: environment topology, network placement, or infrastructure change is
  a decision driver
- Cover: solution-specific infrastructure and network elements, plus changes
  required in shared infrastructure

## Identity and Access Perspective

- Swedish heading: `Identitets- och behörighetshanteringsperspektiv`
- Stakeholders: solution architects, security, operations
- Use when: sign-in, service identity, authorization, or access governance is
  relevant
- Cover: how identities are assured and managed and how permissions are handled
  in the solution

## Development and Test Perspective

- Swedish heading: `Utvecklings- och testperspektiv`
- Stakeholders: architects, developers, suppliers, QA
- Use when: delivery flow, environments, or test strategy is important
- Cover: development and test environments, and how source code,
  configuration, and test data are managed

## Information Security Perspective

- Swedish heading: `Informationssäkerhetsperspektiv`
- Stakeholders: solution architects, security, operations
- Use when: the solution handles protected information or introduces security
  risks
- Cover: how the solution meets information-security requirements through
  information classification and risk analysis; keep detailed control
  fulfillment in appendices

## Implementation and Transition Perspective

- Swedish heading: `Implementering- och förflyttningsperspektiv`
- Stakeholders: project leads, operations, architects
- Use when: the document should explain transition from current to target state
- Cover: the transition from current to target architecture through phased
  steps and timelines
- Emphasize: how the change will be implemented, including phased retirement,
  new components, installation work, and technology shifts when relevant
