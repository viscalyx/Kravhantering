from pathlib import Path
import json,sys,subprocess,urllib.parse
O=Path('/workspace/tmp/sec-audit'); S=Path('/home/vscode/.codex/skills/security-audit')
def load(n):return json.loads((O/n).read_text())
def save(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
cmd=sys.argv[1]
if cmd=='critic':
 aid=sys.argv[2]
 for d in ['scratch','artifacts']:(O/'agents'/aid/d).mkdir(parents=True,exist_ok=False)
 prompt=(O/'critic-prompt.md').read_text()
 prompt+='\nWrite only the identical final result to '+str(O/'agents'/aid/'scratch'/'result.json')+'. No other writes. Do not spawn agents. This is a fresh independent review; do not read prior critic outputs. Agent ID: '+aid+'\n'
 (O/('prompt-'+aid+'.md')).write_text(prompt)
 m=load('run-metadata.json');m['agents_spent']+=1;m['phase']=aid;save('run-metadata.json',m)
 print(O/('prompt-'+aid+'.md'))
elif cmd=='add':
 critic,wave=sys.argv[2:];wave=int(wave);r=load('agents/'+critic+'/scratch/result.json');units=load('coverage-ledger.json');B=load('block-text.json')
 assert set(r)=={'missing_units','reassign_ids','resolved_prior_leads','stop'};assert not r['reassign_ids'],'Archive manually with source-backed reasons';assert not r['resolved_prior_leads']
 for i,g in enumerate(r['missing_units']):
  ref=g['attack_class']
  if ref not in B:
   matches=[k for k in B if k.endswith('#'+ref)];assert len(matches)==1,matches;ref=matches[0]
  assert ref in B,ref
  refs={k:g[k] for k in ['surface','boundary','subsystem','attack_class']};refs['attack_class']=ref;cid='::'.join(urllib.parse.quote(refs[k],safe='') for k in refs)
  assert cid not in {u['coverage_id'] for u in units},'canonical collision'
  ordinary=ref if ref.startswith('ATTACK-CLASSES.md#') else None
  companions=list(g['selected_companion_blocks'])
  if ordinary is None:
   prefix=ref.split('#')[0];companions=list(set(companions+[ref]+[prefix+'#'+x for x in ['Core discipline','Universal moves','Validation rules'] if prefix+'#'+x in B]))
  assert all(b in B for b in companions)
  unit={'coverage_id':cid,'canonical_refs':refs,**{k:g[k] for k in ['surface','boundary','subsystem']},'attack_class':ref.split('#',1)[1],'starting_paths':g['starting_paths'],'ordinary_attack_class_block':ordinary,'selected_companion_blocks':sorted(companions),'excluded_blocks':g['excluded_blocks'],'prior_status':'none','attempts':[],'wave':wave,'status':'planned','agent_id':None,'reviewed_paths':[],'local_checks':[],'result_fingerprints':[],'unresolved':[],'assignment_group':'wave'+str(wave)+'-'+str(i+1),'critic_reason':g['reason']}
  units.append(unit)
 save('coverage-ledger.json',sorted(units,key=lambda u:u['coverage_id']))
 subprocess.run(['node',str(S/'validate-coverage-ledger.cjs'),str(O/'coverage-ledger.json')],check=True)
 print([(u['assignment_group'],u['starting_paths']) for u in units if u['status']=='planned'])
