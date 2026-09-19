from pathlib import Path
import json,re,sys,os,stat,subprocess
O=Path('/workspace/tmp/sec-audit');S=Path('/home/vscode/.codex/skills/security-audit')
def load(name):return json.loads((O/name).read_text())
def save(name,obj):(O/name).write_text(json.dumps(obj,indent=2)+'\n')
def validate():
 subprocess.run(['node',str(S/'validate-coverage-ledger.cjs'),str(O/'coverage-ledger.json')],check=True)
cmd=sys.argv[1]
if cmd=='assign':
 group=sys.argv[2]; aid=sys.argv[3];units=load('coverage-ledger.json');mine=[u for u in units if u['assignment_group']==group and u['status']=='planned'];assert mine
 for leaf in ['scratch','artifacts']:(O/'agents'/aid/leaf).mkdir(parents=True,exist_ok=False)
 for u in mine:u.update(status='in_progress',agent_id=aid)
 save('coverage-ledger.json',units);validate()
 B=load('block-text.json');h=(S/'HUNTING.md').read_text(); schema=(S/'report-schema.json').read_text()
 selected=sorted({x for u in mine for x in ([u['ordinary_attack_class_block']] if u['ordinary_attack_class_block'] else [])+u['selected_companion_blocks']})
 prompt='Find source-grounded security invariant failures in your assigned units. Return exactly one JSON object matching the structured-result contract at the end of this prompt.\n\n'+(O/'architecture.md').read_text()
 prompt+='\n## Assigned units and exact block map\n'+json.dumps(mine,indent=2)+'\n## Selected blocks verbatim\n'+'\n\n'.join(B[x] for x in selected)
 prompt+='\n## Exclusions\n'+json.dumps(mine[0]['excluded_blocks'],indent=2)
 prompt+='\n'+h[h.index('#### Core hunting method'):h.index('## Parent consolidation')]
 prompt+='\n## Prior exclusions and peer ownership\nNo prior findings. Other assignment groups are peer-owned: '+', '.join(sorted({u['assignment_group'] for u in units if u not in mine}))+'. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.\n'
 prompt+='\n## Assignment identity and execution\nAgent ID: '+aid+'\nWrite only to '+str(O/'agents'/aid/'scratch')+'. Retained artifacts path '+str(O/'agents'/aid/'artifacts')+' is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.\n'
 prompt+='Also save the identical final JSON object in your scratch/result.json for parent ingestion; this is source-review output, not target-produced evidence. Use one concise source check per unit with exact paths and source-line references in the result. Ensure reviewed_paths exactly equals the union of check paths. Do not call a unit covered without tracing its boundary. Return every assigned unit exactly once. Unexpected paths or insufficient depth go in uncovered/blocked, not guessed coverage.\n## Full schema verbatim\n'+schema
 (O/('prompt-'+aid+'.md')).write_text(prompt)
 m=load('run-metadata.json');m['agents_spent']+=1;save('run-metadata.json',m)
 print('Assignment',aid,len(mine),'units. Prompt',O/('prompt-'+aid+'.md'))
elif cmd=='ingest':
 aid=sys.argv[2]; path=O/'agents'/aid/'scratch'/'result.json'
 # No target code ran; nonetheless read source-agent JSON with no-follow regular-file bounds.
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);st=os.fstat(fd);assert stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size<=2_000_000
 raw=os.read(fd,st.st_size+1);st2=os.fstat(fd);os.close(fd);assert len(raw)==st.st_size and (st.st_ino,st.st_size)==(st2.st_ino,st2.st_size)
 r=json.loads(raw);units=load('coverage-ledger.json');assigned={u['coverage_id']:u for u in units if u['agent_id']==aid};assert set(assigned)=={u['coverage_id'] for u in r['units']};assert len(assigned)==len(r['units'])
 for x in r['units']:
  u=assigned[x['coverage_id']];assert x['disposition'] in ['covered','candidate','blocked'];assert x['checks']
  assert set(x['reviewed_paths'])=={p for c in x['checks'] for p in c['reviewed_paths']}
  for c in x['checks']:assert c['agent_id']==aid and c['method']=='source' and c['artifact'] is None
  u.update(status=x['disposition'],reviewed_paths=x['reviewed_paths'],local_checks=x['checks'],result_fingerprints=x['candidate_fingerprints'],unresolved=x['unresolved'],hardening=r.get('hardening',[]))
 save('coverage-ledger.json',units);validate()
 pp=O/'candidate-proposals.json';cands=[x for x in json.loads(pp.read_text()) if x['hunter'] != aid] if pp.exists() else []
 for c in r['candidates']:
  cands.append({'hunter':aid,'record':c})
 save('candidate-proposals.json',cands)
 gaps=[x for x in load('uncovered.json') if x['agent_id'] != aid] if (O/'uncovered.json').exists() else []
 gaps.extend({'agent_id':aid,**g} for g in r.get('uncovered',[]));save('uncovered.json',gaps)
 print(json.dumps({'agent':aid,'units':len(r['units']),'candidates':r['candidates'],'hardening':r.get('hardening',[]),'uncovered':r.get('uncovered',[])},indent=2))
