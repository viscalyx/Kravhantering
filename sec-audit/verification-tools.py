from pathlib import Path
import json,sys,os,stat,subprocess,re,hashlib
O=Path('/workspace/tmp/sec-audit'); S=Path('/home/vscode/.codex/skills/security-audit')
def load(n): return json.loads((O/n).read_text())
def save(n,x): (O/n).write_text(json.dumps(x,indent=2)+'\n')
def read_result(aid):
 fd=os.open(O/'agents'/aid/'scratch'/'result.json',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 st=os.fstat(fd); assert stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<2_000_000
 raw=os.read(fd,st.st_size+1); st2=os.fstat(fd);os.close(fd)
 assert len(raw)==st.st_size and (st.st_dev,st.st_ino,st.st_size)==(st2.st_dev,st2.st_ino,st2.st_size)
 return json.loads(raw)
def validate(n,kind):subprocess.run(['node',str(S/('validate-'+kind+'.cjs')),str(O/n)],check=True)
def source_locations(rec):
 allowed={x['path'] for x in load('source-manifest.json')}|{x['path'] for x in load('run-metadata.json').get('local_dependency_evidence',[])}
 for item in rec['trace']+rec['evidence']:
  assert item['file'] in allowed,('unrecorded source path',item['file'])
  p=Path('/workspace')/item['file'];assert p.is_file() and item['line']<=len(p.read_text().splitlines()),item
def roots(aid):
 for leaf in ['scratch','artifacts']:(O/'agents'/aid/leaf).mkdir(parents=True,exist_ok=False)
def spend(phase):
 m=load('run-metadata.json');m['agents_spent']+=1;m['phase']=phase;save('run-metadata.json',m)
def append_check(aid,rec,phase):
 units=load('coverage-ledger.json');fp=rec['fingerprint'];paths=sorted({p['file'] for p in rec['trace']+rec['evidence']})
 for u in units:
  if fp not in u['result_fingerprints']:continue
  c={'agent_id':aid,'reviewed_paths':paths,'invariant':'Independent '+phase+' review of '+fp,'method':'source','artifact':None,'result':rec['verdict']+': '+rec.get('reason',rec.get('claimed_root_cause',rec.get('root_cause','')))}
  u['local_checks'].append(c);u['reviewed_paths']=sorted(set(u['reviewed_paths'])|set(paths))
  u.setdefault('candidate_decisions',{})[fp]={'verdict':rec['verdict'],'phase':phase,'agent_id':aid}
 save('coverage-ledger.json',units);validate('coverage-ledger.json','coverage-ledger')
cmd=sys.argv[1]
if cmd=='prompt':
 phase,idx,aid=sys.argv[2:];idx=int(idx);r=load('candidates.json' if phase=='3' else 'findings.json')[idx];fp=r['fingerprint'];roots(aid)
 units=[u for u in load('coverage-ledger.json') if fp in u['result_fingerprints']]
 B=load('block-text.json'); refs=sorted({b for u in units for b in u['selected_companion_blocks'] if b.endswith('#Validation rules')})
 guide=(S/'VALIDATION-AND-REPORTING.md').read_text();blocks=re.findall(r'```text\n(.*?)\n```',guide,re.S)
 common='Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only '+str(O/'agents'/aid/'scratch')+'. Parent owns artifacts; promotion allowlist empty; all byte limits zero.\n'
 prompt=common+'\n## Architecture\n'+(O/'architecture.md').read_text()+'\n## Record\n'+json.dumps(r,indent=2)
 if phase=='3':
  # Include linked checks but never another verifier conclusion.
  unique_checks=[]; check_index={}; linked=[]
  for u in units:
   ids=[]
   for c in u['local_checks']:
    if not c['agent_id'].startswith('hunt-'):continue
    key=json.dumps(c,sort_keys=True)
    if key not in check_index:check_index[key]=len(unique_checks);unique_checks.append(c)
    ids.append(check_index[key])
   linked.append({'coverage_id':u['coverage_id'],'check_indices':ids})
  prompt+='\n## Linked source checks (deduplicated without omission)\n'+json.dumps({'units':linked,'checks':unique_checks},indent=2)+'\n## Candidate verifier instructions\n'+blocks[0]
 else:
  prompt+='\n## Final record verification\n'+guide[guide.index('### Phase 5:'):guide.index('### Phase 6:')]
 prompt+='\n## Relevant companion validation blocks\n'+'\n\n'.join(B[b] for b in refs)+'\n## Promotion procedure\n'+blocks[1]+'\n## Schema verbatim\n'+(S/'report-schema.json').read_text()
 prompt+='\nNo compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: '+aid
 (O/('prompt-'+aid+'.md')).write_text(prompt);spend('candidate_validation' if phase=='3' else 'final_record_verification');print(aid,fp)
 assignments=load('verification-assignments.json') if (O/'verification-assignments.json').exists() else {}
 assert aid not in assignments
 assignments[aid]={'phase':phase,'fingerprint':fp};save('verification-assignments.json',assignments)
elif cmd=='ingest3':
 aid=sys.argv[2];r=read_result(aid);assert set(r)=={'decision','record'} and r['decision']==r['record']['verdict']
 rec=r['record'];assert rec['fingerprint'] in {c['fingerprint'] for c in load('candidates.json')}
 assert load('verification-assignments.json')[aid]=={'phase':'3','fingerprint':rec['fingerprint']}
 save('record-check.json',[rec]);validate('record-check.json','findings')
 source_locations(rec)
 records=load('validated-records.json') if (O/'validated-records.json').exists() else []
 assert rec['fingerprint'] not in {x['fingerprint'] for x in records};records.append(rec);save('validated-records.json',sorted(records,key=lambda x:x['fingerprint']))
 append_check(aid,rec,'candidate_validation');print(json.dumps(r,indent=2))
elif cmd=='ingest5':
 aid=sys.argv[2];r=read_result(aid);records=load('findings.json');assert r['decision'] in ['verified','replace']
 expected=load('verification-assignments.json')[aid];assert expected['phase']=='5'
 assert (r['record']['fingerprint'] if r['decision']=='replace' else r['fingerprint'])==expected['fingerprint']
 if r['decision']=='replace':
  assert set(r)=={'decision','reason','record'};save('record-check.json',[r['record']]);validate('record-check.json','findings');source_locations(r['record']);print(json.dumps(r,indent=2));sys.exit(0)
 assert set(r)=={'decision','fingerprint'};rec=next(x for x in records if x['fingerprint']==r['fingerprint'])
 done=load('final-verification.json') if (O/'final-verification.json').exists() else [];done.append({'agent_id':aid,**r,'record_sha256':hashlib.sha256(json.dumps(rec,sort_keys=True).encode()).hexdigest()});save('final-verification.json',done);append_check(aid,rec,'final_record_verification')
 if (O/'pending-replacements.json').exists():
  pending=load('pending-replacements.json')
  for item in pending:
   if item['status']=='awaiting_fresh_verification' and item['replacement']==rec:
    assert item['proposer']!=aid;item.update(status='verified',verifier=aid)
  save('pending-replacements.json',pending)
 print(json.dumps(r))
elif cmd=='stage-replacement':
 aid=sys.argv[2];r=read_result(aid);assert r['decision']=='replace'
 rec=r['record'];save('record-check.json',[rec]);validate('record-check.json','findings')
 records=load('findings.json');idx=next(i for i,x in enumerate(records) if x['fingerprint']==rec['fingerprint'])
 pending=load('pending-replacements.json') if (O/'pending-replacements.json').exists() else []
 for item in pending:
  if item['replacement']['fingerprint']==rec['fingerprint'] and item['status']=='awaiting_fresh_verification':item['status']='superseded_by_later_replacement'
 pending.append({'proposer':aid,'old':records[idx],'replacement':rec,'reason':r['reason'],'status':'awaiting_fresh_verification'})
 save('pending-replacements.json',pending)
 # This is staging only, never a final applied replacement. Report writer must require independent acceptance.
 records[idx]=rec;save('findings.json',records);append_check(aid,rec,'replacement_pending_verification')
 print('Staged index',idx,rec['fingerprint'],'requires fresh independent Phase 5 verification')
