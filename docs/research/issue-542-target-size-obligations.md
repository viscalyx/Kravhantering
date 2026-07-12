# Target-size obligations for a Swedish regional deployment

<!-- cSpell:words Digg ETSI extranet harmonised MDFFS neighbouring -->

Research date: 12 July 2026

Question: Which normative WCAG 2.2 target-size requirements and Swedish or
EU legal and contractual accessibility obligations govern a web application
operated by a Swedish region, and which operator-specific facts must be
confirmed before approving any nonconforming exception?

This is a standards and legal-source analysis, not legal advice about a
particular region or contract. The conclusions deliberately separate:

- normative WCAG requirements from W3C's informative implementation guidance;
- statutory requirements from standards that provide a route to presumed
  conformity;
- universal rules from facts that only the operator and its contract documents
  can establish.

## Decision-ready conclusion

For a product commitment to **WCAG 2.2 Level AA**, the governing normative
target-size rule is Success Criterion (SC) 2.5.8: every pointer target must
contain at least a 24 by 24 CSS-pixel target area or satisfy one of the five
exceptions written into the criterion. A target that satisfies one of those
exceptions still conforms; it is not a "nonconforming exception." The 44 by 44
CSS-pixel rule in SC 2.5.5 is Level AAA and is therefore outside a general
WCAG 2.2 AA commitment unless a contract or operator policy separately adopts
it. [WCAG 2.2 SC 2.5.8][wcag-258]
[WCAG 2.2 SC 2.5.5][wcag-255]

For Swedish public-sector law, a region is expressly a public actor. Digital
service delivered through a website or mobile application under that actor's
control must meet the prescribed accessibility requirements. The binding
functional requirements are that the service be perceivable, operable,
understandable and robust. Conformity with Annex A of EN 301 549 V3.2.1 is the
specified route to satisfying those requirements, and it is the standard Digg
uses in supervision. [DOS Act §§1, 4 and 10][dos-act]
[MDFFS 2019:2 §§2, 4 and 5, as amended][mdffs-base]
[MDFFS 2021:2][mdffs-amendment] [Digg supervision guidance][digg-supervision]

That current statutory standards route is based on WCAG 2.1 Level AA, not
WCAG 2.2. EN 301 549 V3.2.1 makes WCAG 2.1's AAA target-size criterion
informative and contains no target-size requirement among its web requirements.
Consequently, neither 44 by 44 nor WCAG 2.2's 24 by 24 rule is, by itself, an
explicit web requirement in today's cited Annex A route. This does **not**
cancel a WCAG 2.2 AA contract, an operator policy, the DOS Act's functional
requirements, or the fact-specific duty to make reasonable accessibility
adjustments under discrimination law. [EN 301 549 V3.2.1 §§9.5-9.6][en-v321]
[Digg on EN 301 549 and WCAG][digg-en-wcag]
[Discrimination Act 1 ch. §4(3)][discrimination-act]

EN 301 549 V4.1.0 would move the standard to WCAG 2.2, but on the research
date it is a final draft in formal approval through August 2026. It is not yet
the version named by Digg's regulation or the EU Official Journal. It is a
foreseeable future baseline, not a present legal basis for approval.
[ETSI work-program status][etsi-v410-status]
[current EU harmonised-standard decision][eu-standard-decision]

A product owner may therefore replace a universal 44 CSS-pixel rule with the
normative WCAG 2.2 AA rule without weakening a **WCAG 2.2 AA** commitment,
provided each pointer target actually meets SC 2.5.8, including a correctly
proved exception where used. No target below 24 by 24 CSS pixels should be
approved merely as a density preference. The approving authority must first
identify the applicable WCAG exception or, if the target truly fails SC 2.5.8,
the exact legal and contractual authority for accepting nonconformance.

## 1. Normative WCAG 2.2 rules

### 1.1 What is normative

W3C states that WCAG's main content defines normative conformance requirements.
Material explicitly marked non-normative, together with diagrams, examples and
notes, is informative and cannot create a conformance requirement. The
Understanding and Techniques documents support interpretation but are not
additional normative rules. [WCAG 2.2 §5.1][wcag-normative]

For Level AA conformance, a full web page must satisfy every Level A and Level
AA success criterion or provide a Level AA conforming alternate version. A
page cannot exclude one component, and every responsive variation is part of
the full page. Every page in a complete process must also conform. Only
accessibility-supported uses of technology may be relied upon.
[WCAG 2.2 §§5.2.1-5.2.4][wcag-conformance]

Those conformance rules matter to local waivers: recording an accepted defect
does not make a page WCAG 2.2 AA conforming. A built-in SC 2.5.8 exception or a
conforming alternate version can preserve conformance; an organizational risk
acceptance cannot redefine it.

### 1.2 SC 2.5.8 Target Size (Minimum), Level AA

The target is the interactive region that accepts a pointer action, not merely
the visible icon or label. Overlapping regions are generally excluded from
target-size measurement unless the overlapping targets perform the same action
or open the same page. [WCAG 2.2 definition of target][wcag-target]

The normative rule requires a target for pointer input to be at least 24 by 24
CSS pixels unless one of these five alternatives applies:

1. **Spacing:** For every undersized target, a 24-CSS-pixel-diameter circle
   centred on its bounding box intersects neither another target nor the circle
   of another undersized target.
2. **Equivalent:** A different control on the same page performs the same
   function and itself meets SC 2.5.8.
3. **Inline:** The target is in a sentence, or its size is otherwise constrained
   by the line height of non-target text.
4. **User agent control:** The user agent determines the target size and the
   author has not modified it.
5. **Essential:** The particular target presentation is essential, or legally
   required, for the information conveyed.

The five alternatives are normative. The criterion's two accompanying notes
help interpret spatial-value targets and vertical writing, but WCAG classifies
notes as informative. [WCAG 2.2 SC 2.5.8][wcag-258]
[WCAG 2.2 §5.1][wcag-normative]

"Essential" is narrow: WCAG defines it as something whose removal would
fundamentally change the content's information or functionality, where the
information or functionality cannot be achieved in another conforming way.
A compact appearance, desktop-first use, convenience, consistency, development
cost or preference does not prove that definition. [WCAG 2.2 definition of
essential][wcag-essential]

### 1.3 SC 2.5.5 Target Size (Enhanced), Level AAA

SC 2.5.5 requires 44 by 44 CSS pixels, subject to four exceptions: a 44 by 44
equivalent control on the same page, an inline target in a sentence or block of
text, unmodified user-agent sizing, or an essential presentation. Unlike SC
2.5.8, it has no spacing exception. It is Level AAA, so Level AA conformance does
not require it. [WCAG 2.2 SC 2.5.5][wcag-255]

W3C also cautions against requiring Level AAA conformance as a general policy
for an entire site because some content cannot satisfy every AAA criterion.
That does not prevent a contract or policy from selectively requiring SC 2.5.5.
[WCAG 2.2 §5.2.1, note 2][wcag-conformance]

### 1.4 Informative guidance, useful but not an extra rule

The Understanding document explains that a target meets the 24 by 24 size path
when an axis-aligned 24 by 24 CSS-pixel square can fit wholly inside it. It also
illustrates that 20 by 20 targets separated by 4 CSS pixels can satisfy the
spacing exception. Those explanations are authoritative W3C guidance but remain
informative; the success criterion's actual circle-intersection wording governs.
[Understanding SC 2.5.8][understanding-258]

The same guidance recommends using targets at least 24 by 24 even when spacing
would permit smaller ones, and considering SC 2.5.5 for important controls.
That is a best practice, not part of Level AA conformance.
[Understanding SC 2.5.8, intent][understanding-258]

W3C advises adopting WCAG 2.2 even where a policy still names WCAG 2.1 and says
that WCAG 2.2 conformance also conforms to WCAG 2.1. This supports WCAG 2.2 as
a prudent product baseline, but W3C advice does not itself amend Swedish law or
a signed contract. [WCAG 2.2 status and comparison with WCAG 2.1][wcag-new]

## 2. Swedish and EU public-sector obligations

### 2.1 DOS Act coverage

The Act on Accessibility to Digital Public Service, lag (2018:1937), applies to
digital service provided by a public actor. Its definition expressly includes a
state or municipal authority and a decision-making assembly in a municipality
or region, as well as specified publicly governed bodies and other actors.
[DOS Act §§1, 4 and 5][dos-act]

Digg's regulation defines websites and mobile applications as the covered
technical solutions and defines a website broadly as one or more connected web
pages. A browser-delivered application is therefore ordinarily a website for
this purpose; calling it an internal "system" or "tool" does not alone remove
it from scope. [MDFFS 2019:2 §§2-3][mdffs-base]

Where the technical solution is under the public actor's control, §10 requires
compliance with the prescribed accessibility requirements. Where it is under a
third party's control, §11 requires compliance as far as possible. Third-party
procurement or hosting is not itself proof that the region lacks control.
[DOS Act §§10-11][dos-act]

Closed-group sites published before 23 September 2019 are excluded only until
they undergo an extensive review. Old documents, prerecorded time-based media
and genuine archives have separate, bounded exclusions. A modern or extensively
revised regional intranet is therefore not automatically exempt merely because
only staff can sign in. [Ordinance (2018:1938) §2][dos-ordinance]

### 2.2 The current technical standards chain

The Web Accessibility Directive requires public-sector websites and mobile
applications to be perceivable, operable, understandable and robust. Content
meeting a harmonised standard cited in the Official Journal receives a
presumption of conformity for the requirements the standard covers.
[Directive (EU) 2016/2102, Articles 4 and 6][wad]

Sweden implements this through the DOS Act and MDFFS 2019:2. Section 4 of the
regulation states the four functional requirements; §5 says digital service
conforming to Annex A of EN 301 549 V3.2.1 (2021-03) meets §4. The EU's current
consolidated implementing decision likewise lists V3.2.1.
[MDFFS 2019:2 and amendment][mdffs-base]
[MDFFS 2021:2][mdffs-amendment]
[Implementing Decision (EU) 2018/2048][eu-standard-decision]

EN 301 549 V3.2.1 §9 incorporates WCAG 2.1 Level A and AA for web pages and
requires the five WCAG 2.1 conformance requirements at Level AA. Its §9.5 only
lists WCAG 2.1 AAA criteria, including SC 2.5.5 Target Size, as informative and
encourages procurers to consider them. The conformance-assessment annex confirms
that §9.5 contains no requirement requiring a test. WCAG 2.2 SC 2.5.8 did not
exist in WCAG 2.1 and is absent. [EN 301 549 V3.2.1 §§9.5-9.6 and Annex C][en-v321]

This creates a legally important distinction:

- WCAG 2.2 SC 2.5.8 is normative when the product, policy or contract claims
  **WCAG 2.2 AA**.
- It is not yet a named criterion in Sweden's current EN 301 549 V3.2.1
  statutory route.
- The underlying DOS duty remains functional, Digg supervises against EN 301
  549, and other legal and contractual duties can still make an inaccessible
  control unacceptable.

The V4.1.0 draft would incorporate WCAG 2.2, but ETSI identifies it as "On
Approval," with formal voting continuing through August 2026. Until it is
adopted, cited in the Official Journal and reflected in the Swedish regulatory
chain, V3.2.1 remains the present standards route. The operator should monitor
this imminent change rather than freeze a long-lived policy to V3.2.1.
[ETSI V4.1.0 status][etsi-v410-status]
[ETSI EN 301 549 repository notice][etsi-v410-repository]

### 2.3 Disproportionate burden is a legal derogation, not WCAG conformance

DOS Act §12 permits a public actor not to fulfil §§10-11 where doing so would be
unreasonably burdensome. The assessment must consider the actor's size, nature
of tasks and resources, and estimated costs and benefits to the actor relative
to estimated benefits for persons with disabilities. The directive also names
frequency and duration of use of the specific site or application.
[DOS Act §12][dos-act] [Directive (EU) 2016/2102, Article 5][wad]

The actor must conduct the assessment. If it invokes the derogation, its
accessibility statement must identify the unmet parts and, where appropriate,
provide accessible alternatives. Swedish law requires the assessment to appear
in the accessibility statement and gives individuals a feedback and request
route; Digg can review the assessment and order remediation, ultimately with a
fine. [Directive (EU) 2016/2102, Articles 5 and 7][wad]
[DOS Act §§13, 15 and 18-19][dos-act]

Digg describes disproportionate burden as potentially postponing an
accessibility improvement where cost is unreasonable relative to benefits for
persons with disabilities or would seriously hinder the actor's ordinary
tasks. It is not a general permission to lower a design-system baseline.
[Digg guidance on unreasonable burden][digg-burden]

Even a valid DOS derogation changes the statutory enforcement analysis; it
does not turn a WCAG 2.2 failure into WCAG 2.2 conformance and does not waive a
stricter contract.

### 2.4 Accessibility statement and individual access

For digital service covered by §10, the operator must maintain an accessibility
statement, provide a way to report failures and request excluded content, and
respond as soon as possible. A justified and reasonable request to make
excluded service accessible must be met without unnecessary delay.
[DOS Act §§13 and 15][dos-act]

MDFFS 2019:2 requires the statement to identify inaccessible parts, reasons and
available accessible alternatives, record the assessment date and method, and
reflect current accessibility. A known target-size failure accepted under a
DOS derogation cannot simply remain an internal issue record.
[MDFFS 2019:2 §6][mdffs-base]

### 2.5 Discrimination law is an independent backstop

Swedish discrimination law defines inadequate accessibility as disadvantaging
a person with a disability by failing to take reasonable accessibility measures
that would put that person in a comparable situation. Reasonableness considers
other legal accessibility requirements, economic and practical conditions,
the duration and extent of the relationship, and other material circumstances.
[Discrimination Act 1 ch. §4(3)][discrimination-act]

The prohibition applies in employment and, among other areas especially
relevant to regions, services offered to the public, health care, medical
activity and social services. It is person- and context-specific rather than a
pixel standard. A control can therefore satisfy the current EN 301 549 route or
fall outside DOS while still requiring a reasonable adjustment for a worker,
patient or other individual. [Discrimination Act 2 ch. §§1, 12, 13 and 17][discrimination-act]

### 2.6 European Accessibility Act implementation is conditional

Since 28 June 2025, lag (2023:254) applies to a closed list of products and
consumer services, including electronic communications, access to audiovisual
media, specified passenger-transport features, consumer banking, e-books and
e-commerce. A general regional case-management or requirements application is
not brought into this Act merely because it is a web application; its actual
service and intended consumer use must match the statutory list.
[Act (2023:254) §§3-4 and commencement provisions][eaa-act]

If the region is a service provider for a covered consumer service, it must
continually ensure conformity. Its separate exceptions for fundamental
alteration or disproportionate burden require a documented, reasoned
assessment and notice to the regulator; external accessibility funding can
prevent reliance on the burden exception. These are not interchangeable with
the DOS Act assessment. [Act (2023:254) §§6-8 and 24-26][eaa-act]

## 3. Procurement and contractual obligations

### 3.1 What procurement law establishes

Under 9 ch. §2 of the Public Procurement Act, when the procured item will be
used by natural persons, technical specifications must account for all users'
needs, including accessibility for persons with disabilities. Departure
requires special reasons. If an EU act establishes mandatory accessibility
requirements, the specifications must refer to that act.
[Public Procurement Act 9 ch. §2][lou]

The Act permits performance or functional requirements and references to
standards, ordinarily accompanied by "or equivalent." It also permits the
contracting authority to demand conformity evidence. These rules explain why
the procurement documents must be inspected; they do not reveal which WCAG
edition or target size a particular region actually purchased.
[Public Procurement Act 9 ch. §§3-11][lou]

### 3.2 What only the actual contract can establish

A contract, call-off, statement of work, acceptance criterion, tender response,
regional policy or design system can adopt WCAG 2.2 AA, SC 2.5.5, a universal
44 CSS-pixel rule, EN 301 549 beyond Annex A, or stricter usability requirements.
WCAG itself explicitly anticipates use of success criteria in purchasing and
contractual agreements. [WCAG 2.2 layers of guidance][wcag-layers]

No general source can determine whether such a term exists here. The project's
Wayfinder map records WCAG 2.2 AA as its planning floor, but that issue is not a
signed operator contract and cannot prove authority to waive one.
[Map: Decide product-wide pointer-target sizing][map-540]

A contractual deviation is valid only under the actual contract's hierarchy,
change-control and authorization terms. It cannot waive mandatory law, and a
valid statutory derogation does not automatically waive the supplier's promise.
Accordingly, legal compliance and contractual acceptance require separate
approval findings.

## 4. Facts required before approving an exception

The following record should be complete before an intentional target below
24 by 24 CSS pixels is approved. If the target meets a built-in SC 2.5.8
exception, call the decision a **conforming exception**. Reserve
**nonconformance** for a target that fails every path in SC 2.5.8.

### 4.1 Operator, service and scope

- Identify the legal operator and service owner. Confirm whether it is the
  region itself, another public actor, a publicly governed body or a supplier.
- Record who finances, develops and controls the technical solution and the
  specific target. Distinguish supplier operation from legal control.
- Classify the surface as website, mobile application, native software or
  another form of ICT. Record whether it is public, authenticated, intranet or
  extranet.
- If relying on the closed-group legacy exclusion, prove publication before
  23 September 2019 and that no extensive review has occurred. Record whether
  the service is an active administrative process or an updated archive.
- Identify all user groups: staff, contractors, patients, residents or other
  members of the public, including known users who need accessibility measures.
- Determine whether the service is a covered consumer service under lag
  (2023:254), rather than assuming either inclusion or exclusion.

These facts select the relevant DOS, discrimination and European Accessibility
Act duties. [DOS Act §§4-11][dos-act]
[Ordinance (2018:1938) §2][dos-ordinance]
[Act (2023:254) §§3-5][eaa-act]

### 4.2 Exact normative target analysis

- Capture the target's actual clickable area in CSS pixels in every responsive
  variation and interaction state. Do not substitute visible icon dimensions.
- Identify every neighbouring target and measure the SC 2.5.8 spacing circles
  where either dimension is below 24 CSS pixels.
- Name exactly one or more applicable SC 2.5.8 paths: size, spacing,
  same-page equivalent, inline, unmodified user-agent control or essential.
- For an equivalent control, prove identical functionality, location on the
  same page and that the alternative itself meets SC 2.5.8.
- For user-agent control, prove the author has not modified the size.
- For essential presentation, state what information or functionality would
  fundamentally change and why no conforming presentation can preserve it.
  If relying on legal necessity, cite the exact rule requiring that
  presentation.
- Test mouse, touch and stylus where supported, at relevant viewport sizes.
  Record task frequency, duration, criticality and consequences of accidental
  activation.
- Check full-page and complete-process conformance. A compliant alternative in
  another part of a process does not automatically satisfy the criterion's
  same-page equivalent exception.

The normative bases are SC 2.5.8, the definitions of target and essential, and
WCAG's full-page and process requirements. [WCAG 2.2 SC 2.5.8][wcag-258]
[WCAG target and essential definitions][wcag-target]
[WCAG 2.2 conformance requirements][wcag-conformance]

### 4.3 Legal exception record

If no WCAG exception applies and the operator proposes a DOS disproportionate-
burden derogation, require an accountable legal decision containing:

- the exact unmet accessibility requirement and affected pages, states and
  processes;
- the operator's size, resources and nature of tasks;
- itemized remediation and maintenance costs, not an unsupported assertion of
  inconvenience;
- benefits and harms for people with disabilities, including affected user
  groups, usage frequency and duration, task importance and available evidence;
- alternative designs considered, why they fail, and any accessible alternative
  that will be provided;
- duration, review date, remediation owner and triggering events such as a
  redesign, contract renewal or EN 301 549 V4.1.0 becoming applicable;
- the required accessibility-statement disclosure and feedback/request route;
- confirmation that discrimination-law duties to particular people remain
  independently assessed.

These are the facts required by DOS Act §12, Directive Article 5 and the
statement duties; a component-level developer comment alone cannot support the
derogation. [DOS Act §§12-15][dos-act]
[Directive (EU) 2016/2102, Articles 5 and 7][wad]

If lag (2023:254) applies, use that Act's separate fundamental-alteration or
disproportionate-burden process, including external-funding, documentation,
retention, renewal and regulator-notification facts.
[Act (2023:254) §§7-9][eaa-act]

### 4.4 Contract and governance record

Obtain and cite the controlling first-party documents:

- procurement notice and technical specification;
- signed contract, call-off and statement of work;
- supplier tender response and accessibility conformance report;
- acceptance criteria, service levels, remediation duties and warranties;
- contract hierarchy, amendment/waiver procedure and authorized approvers;
- current regional accessibility policy, design system and architecture
  decisions;
- current accessibility statement and prior audit or complaint findings.

Then record:

- the named WCAG/EN editions, levels and whether later versions are incorporated;
- whether SC 2.5.5, 44 CSS pixels or touch-specific criteria are separately
  mandatory;
- whether exceptions or deviations are allowed, by whom and with what evidence;
- whether the proposed acceptance affects payment, warranty, remedies or
  regulatory representations;
- written approval by both the operator's accountable authority and any
  contract party whose obligation changes.

Absent those facts, the safe decision is to approve only a demonstrably
conforming SC 2.5.8 exception, not a nonconforming waiver.

## 5. Recommended policy boundary

An evidence-backed product policy can state:

> User-facing pointer targets conform to WCAG 2.2 SC 2.5.8: the target is at
> least 24 by 24 CSS pixels or an expressly documented normative exception
> applies. SC 2.5.5's 44 by 44 CSS pixels is encouraged for important or
> touch-oriented controls but is not the product-wide AA floor. Legal,
> contractual and operator-specific requirements override this default.

For each intentional custom target below 24 by 24 CSS pixels, require a nearby
code or test reference naming the SC 2.5.8 exception and recording the evidence
that makes it apply. Do not label such a target "nonconforming." If none of the
five exceptions applies, treat it as a defect unless the operator supplies the
separate legal and contractual approvals described above.

This boundary preserves WCAG 2.2 AA, removes an unsupported universal AAA rule,
and remains compatible with the current EN 301 549 V3.2.1 route while preparing
for the likely future WCAG 2.2-based standard.

## Primary sources

[digg-burden]: https://www.digg.se/om-oss/nyheter/digital-tillganglighet/nyheter/2022-12-12-oskaligt-betungande---vad-ar-det-och-nar-kan-det-vara-aktuellt
[digg-en-wcag]: https://www.digg.se/webbriktlinjer/lagar-och-krav/det-har-ar-en-301-549-och-wcag
[digg-supervision]: https://www.digg.se/kunskap-och-stod/digital-tillganglighet/rattslig-vagledning/10.-tillsynsarbete-och-overvakning
[discrimination-act]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/diskrimineringslag-2008567_sfs-2008-567%29/
[dos-act]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-20181937-om-tillganglighet-till-digital_sfs-2018-1937/
[dos-ordinance]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-20181938-om-tillganglighet-till_sfs-2018-1938/
[eaa-act]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023254-om-vissa-produkters-och-tjansters_sfs-2023-254/
[en-v321]: https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
[etsi-v410-repository]: https://labs.etsi.org/rep/HF/en301549
[etsi-v410-status]: https://www.etsi.org/technical-groups/hf/
[eu-standard-decision]: https://eur-lex.europa.eu/eli/dec_impl/2018/2048/2022-02-12/eng
[lou]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-20161145-om-offentlig-upphandling_sfs-2016-1145/
[map-540]: https://github.com/viscalyx/Kravhantering/issues/540
[mdffs-amendment]: https://www.digg.se/om-oss/forfattningssamling/foreskrifter-om-tillganglighet-till-digital-offentlig-service-mdffs-20192/andringsforfattning-mdffs-20212
[mdffs-base]: https://www.digg.se/om-oss/forfattningssamling/foreskrifter-om-tillganglighet-till-digital-offentlig-service-mdffs-20192/grundforfattning-mdffs-20192
[understanding-258]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
[wad]: https://eur-lex.europa.eu/eli/dir/2016/2102/oj/eng
[wcag-255]: https://www.w3.org/TR/WCAG22/#target-size-enhanced
[wcag-258]: https://www.w3.org/TR/WCAG22/#target-size-minimum
[wcag-conformance]: https://www.w3.org/TR/WCAG22/#conformance-reqs
[wcag-essential]: https://www.w3.org/TR/WCAG22/#dfn-essential
[wcag-layers]: https://www.w3.org/TR/WCAG22/#wcag-2-layers-of-guidance
[wcag-new]: https://www.w3.org/TR/WCAG22/#comparison-with-wcag-2-1
[wcag-normative]: https://www.w3.org/TR/WCAG22/#interpreting-normative-requirements
[wcag-target]: https://www.w3.org/TR/WCAG22/#dfn-targets
