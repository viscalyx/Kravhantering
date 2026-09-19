from pathlib import Path
import json,collections,hashlib,subprocess,datetime,re
O=Path('/workspace/tmp/sec-audit');R=Path('/workspace');S=Path('/home/vscode/.codex/skills/security-audit')
def load(n):return json.loads((O/n).read_text())
def save(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
records=load('findings.json');units=load('coverage-ledger.json');meta=load('run-metadata.json');verified=load('final-verification.json')
assert all(r['verdict']=='rejected' or (r['fingerprint'],hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()) in {(v['fingerprint'],v['record_sha256']) for v in verified if v['decision']=='verified'} for r in records)
if (O/'pending-replacements.json').exists():assert not any(x['status']=='awaiting_fresh_verification' for x in load('pending-replacements.json'))
assert {fp for u in units for fp in u['result_fingerprints']}<={r['fingerprint'] for r in records}
assert not any(u['status'] in ['planned','in_progress'] for u in units)
assert not any(r['verdict']=='confirmed' for r in records),'Extend report builder for independently confirmed records'
for kind,n in [('findings','findings.json'),('coverage-ledger','coverage-ledger.json')]:subprocess.run(['node',str(S/('validate-'+kind+'.cjs')),str(O/n)],check=True)
changed=[]
for f in load('source-manifest.json'):
 p=R/f['path']
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:changed.append(f['path'])
accepted={x['path']:x for x in meta.get('source_changes_during_audit',[])}
assert all(f in accepted and hashlib.sha256((R/f).read_bytes()).hexdigest()==accepted[f]['reviewed_sha256'] for f in changed),changed
assert all((R/f).is_file() and hashlib.sha256((R/f).read_bytes()).hexdigest()==x['reviewed_sha256'] for f,x in accepted.items()),'Concurrent source changed again after supplemental review'
assert all(hashlib.sha256((R/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in meta.get('local_dependency_evidence',[])),'Reviewed local dependency changed'
save('source-integrity.json',{'manifest_files':len(load('source-manifest.json')),'changed':changed,'reviewed_concurrent_changes':meta.get('source_changes_during_audit',[]),'result':'All source hashes unchanged except explicitly reviewed concurrent changes.'})
def validation_order(r):
 fp=r['fingerprint']
 return (0 if 'projection' in fp or fp.startswith('specification-preload/') else 1 if 'lcs' in fp else 2 if 'requirement-' in fp else 3 if 'retention' in fp or 'forensic' in fp else 4,fp)
needs=sorted([r for r in records if r['verdict']=='needs_validation'],key=validation_order);counts=collections.Counter(u['status'] for u in units)
def loc(x):return '`'+x['file']+':'+str(x['line'])+'`'
def esc(s):return s.replace('|','\\|').replace('\n',' ')
lines=['# Repository security audit','',f"Standard profile; whole repository review starting at `{meta['source_ref']['commit']}`. Concurrent changes through `{meta['concurrent_head_observed']}` were separately reviewed and hashed ({len(meta.get('source_changes_during_audit', []))} paths). Existing untracked `.github/skills/security-audit/` was included. The audit made no application source changes.",'',
 '## Scope and evidence limits','',
 f"This is a source-only review under the skill's sandboxed source-and-local-only execution policy. The required OS sandbox could not be created (`bwrap: No permissions to create new namespace`). No target builds, tests, services, live endpoints, dependency installations, vulnerability-database refreshes, or shared infrastructure were used. Runtime-dependent leads remain unconfirmed.",'',
 f"No prior compatible ledger was found. There are no carried confirmations or changed-source revalidations. No strict agent budget was set. The initial plan contained 87 units in 10 hunter assignments, four reconnaissance assignments, at least two critics, and two independent reviews per candidate; {meta['agents_spent']} delegated assignments were spent. Parent source hunts are counted separately in metadata.",'',
 'All repository subsystems were in scope. External deployment facts, provider policies and branch protections could only be assessed where represented in source. Dependency supply-chain controls were reviewed; this was not a refreshed dependency CVE scan. Native application parsers, mobile applications and message brokers were not identified as implemented surfaces. The ledger records class-specific selections and exclusions. One pass does not exhaust the repository.','',
 '## Result','',
 f"No vulnerabilities met the skill's runtime-confirmed evidence bar. {len(needs)} independently reviewed source-grounded leads need validation. This does not establish that the repository is free of vulnerabilities. Authorization is generally centralized and explicit; the retained leads identify specific possible exceptions and lifecycle/resource-control failures.",'',
 '## Confirmed findings','', '| Severity | Title | Boundary | Observed result |','| --- | --- | --- | --- |','| — | None | — | No target execution was permitted |','',
 '## NEEDS VALIDATION','',
 'These are leads, without severity assignments. Validation starts with direct visibility and bounded computation checks, then state-dependent and deployment-dependent paths. Full verified traces, blockers and bounded plans are in [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).','',
 '| Lead | Source entry / sink | Validation blocker | Bounded next step | Owner observation |','| --- | --- | --- | --- | --- |']
for i,r in enumerate(needs,1):
 local=r['validation_plan'].get('local','Not applicable.');dep=r['validation_plan'].get('deployment','Not needed to resolve this source/runtime hypothesis; no deployment probing.')
 lines.append('| '+ ' | '.join([esc(r['title']),loc(r['trace'][0])+' → '+loc(r['trace'][-1]),esc(' '.join(r['blockers'])),esc(local),esc(dep)])+' |')
lines+=['', 'Concurrent workspace changes: '+ str(len(meta.get('source_changes_during_audit',[])))+' UI, component, test and documentation paths changed during the audit. Parent reviewed their source diffs and preserved them. Exact paths and supplemental hashes are recorded in run-metadata.json; the initial manifest is retained. No audit finding trace changed.']
lines+=['','## Hardening notes','', 'These are separate from security findings.']
for h in sorted({str(h) for u in units for h in u.get('hardening',[])}):lines+=['','- '+h]
lines+=['','## Positive source patterns','',
 '- OIDC callback binding, sealed session cookies, stripped identity headers, same-origin mutation checks and centralized route policies establish explicit identity boundaries.',
 '- Requirement/specification primary reads and mutations use assignment-aware services; many stateful writes bind parents, use locks and enforce revision or status predicates.',
 '- MCP validates bearer identity and reuses application authorization; AI provider destinations and model output pass dedicated trust checks.',
 '- HSA lookup uses layered certificate identity checks and binds signed verification evidence to actor, person, purpose, scope and expiry.',
 '- Browser Markdown is rendered through constrained components; reviewed external links isolate openers and page responses establish CSP/frame controls.',
 '- Release/deployment paths contain provenance checks, pinned images, separated runtime/jobs and bounded shared quota mechanisms. Source controls do not prove deployed configuration.','',
 '## Coverage','',
 f"Ledger: {len(units)} units; "+', '.join(f'{counts.get(s,0)} {s}' for s in ['covered','candidate','blocked','deferred','out_of_scope','not_applicable'])+'.',
 '',f"Source checks name {len({p for u in units for p in u['reviewed_paths']})} distinct repository paths. A covered unit means its recorded source boundary was traced; it does not mean every file or runtime condition was proven safe. Candidate units may share one deduplicated record.",'',
 '| Assignment group | Units | Covered | Candidate | Blocked / deferred |','| --- | ---: | ---: | ---: | ---: |']
for group in sorted({u['assignment_group'] for u in units}):
 c=collections.Counter(u['status'] for u in units if u['assignment_group']==group)
 lines.append(f"| {group} | {sum(c.values())} | {c['covered']} | {c['candidate']} | {c['blocked']+c['deferred']} |")
lines+=['',meta.get('coverage_conclusion','Coverage critic conclusion is recorded in run metadata.')]
for u in units:
 if u['status'] in ['blocked','deferred','out_of_scope']:
  lines+=['',f"**{u['status']}: {u['surface']}** — "+' '.join(u['unresolved'])]
for limitation in meta.get('delegation_limitations',[]):lines+=['',limitation['result']]
lines+=['',
 '## Audit artifacts','',
 '- [Structured records](findings.json), with one final disposition per candidate.',
 '- [Coverage ledger](coverage-ledger.json), with source checks and candidate dispositions.',
 '- [Architecture](architecture.md), [run metadata](run-metadata.json), and [source integrity](source-integrity.json).',
 '- [Confirmed finding detail](FINDINGS-DETAIL.md) and [validation handoff](NEEDS-VALIDATION.md).','']
(O/'REPORT.md').write_text('\n'.join(lines))
(O/'FINDINGS-DETAIL.md').write_text('# Confirmed finding details\n\nNo independently demonstrated medium, high or critical findings are retained. Target execution was unavailable. This is not a clean bill of security. See [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md) for the independently reviewed unresolved leads and [REPORT.md](REPORT.md) for coverage limits.\n')
lines=['# Needs validation','',f'{len(needs)} independently reviewed source-grounded leads remain unconfirmed. No severity is assigned. No live or shared service should be probed to resolve them.','',
 'All future local checks require an OS-enforced sandbox with no external network, an empty allowlisted environment, read-only source/tools, scratch-only writes, dummy identities/data and low CPU, memory, process, file-size, disk and wall-clock limits. Follow the bounded plan for each lead and stop at the minimum observable result. Source-only review cannot substitute for that observation.','']
for i,r in enumerate(needs,1):
 lines+=['## '+str(i)+'. '+r['title'],'','Fingerprint: `'+r['fingerprint']+'`','',r['description'],'','Claimed root cause: '+r['claimed_root_cause'],'','### Source trace','']
 for t in r['trace']:lines+=['- **'+t['kind']+'** '+loc(t)+' — '+t['scope']+': '+t['description']]
 lines+=['','### Verified source evidence','']
 for e in r['evidence']:lines+=['- '+loc(e)+' — '+e['description']]
 lines+=['','### Exact blockers','']
 for b in r['blockers']:lines+=['- '+b]
 for context,plan in r['validation_plan'].items():lines+=['','### '+('Bounded local validation' if context=='local' else 'Owner-observed configuration check'),'',plan]
 lines+=['']
(O/'NEEDS-VALIDATION.md').write_text('\n'.join(lines))
def format_markdown(path):
 out=[]; in_table=False
 for line in path.read_text().splitlines():
  table=line.startswith('|')
  if table and not in_table:out.extend(['<!-- markdownlint-disable MD013 -->',''])
  if in_table and not table:out.extend(['','<!-- markdownlint-enable MD013 -->'])
  in_table=table
  if table or not line or line.startswith('#') or line.startswith('<!--'):
   out.append(line);continue
  tokens=re.findall(r'[^\s`]*`[^`]+`[^\s]*|\[[^\]]+\]\([^\)]+\)[^\s]*|\S+',line)
  continuation='  ' if line.startswith('- ') else ''
  current=''
  for token in tokens:
   if current and len(current)+1+len(token)>80:
    out.append(current);current=continuation+token
   else:current+=(' ' if current else '')+token
  if current:out.append(current)
 if in_table:out.extend(['','<!-- markdownlint-enable MD013 -->'])
 path.write_text('\n'.join(out)+'\n')
for name in ['REPORT.md','FINDINGS-DETAIL.md','NEEDS-VALIDATION.md']:format_markdown(O/name)
meta['run_status']='complete';meta['phase']='reports_complete';meta['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();meta['final_counts']={'records':dict(collections.Counter(r['verdict'] for r in records)),'coverage':dict(counts)};save('run-metadata.json',meta)
print(json.dumps(meta['final_counts'],indent=2))
