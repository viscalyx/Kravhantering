from pathlib import Path
import json,copy
O=Path('/workspace/tmp/sec-audit')
proposals=json.loads((O/'candidate-proposals.json').read_text());groups={}
for p in proposals:groups.setdefault(p['record']['fingerprint'],[]).append(p)
records=[]
for fp,ps in sorted(groups.items()):
 base=copy.deepcopy(ps[0]['record']);base['verdict']=base.pop('proposed_verdict')
 if fp=='archiving/confirmation-candidate-keys/stale-child-content-deletion':
  base['evidence'].append({'file':'typeorm/runtime-permission-manifest.mjs','line':173,'description':'Managed runtime permissions for needs references are SELECT/INSERT/DELETE, with no UPDATE. The proposed edit sequence must be checked against this preventing SQL layer; creation of child content is a distinct reachable operation to evaluate under the same snapshot-binding invariant.'})
 if len(ps)>1:
  assert fp=='norm-reference-linked-requirements-nonpublic-projection',('Review duplicate manually',fp)
  base=copy.deepcopy(next(p['record'] for p in ps if p['hunter']=='hunt-requirements'));base['verdict']=base.pop('proposed_verdict')
  base['title']='Taxonomy details may expose nonpublic library and specification-local requirement descriptions'
  base['description']+=' The priority-level endpoint also returns local requirement descriptions from specifications outside the caller\'s assignments, including retained historical bindings. Primary specification child APIs enforce assignment-scoped read authority.'
  base['claimed_root_cause']+=' The priority query\'s local-requirement UNION similarly filters only priority, without specification assignment or current-content filtering.'
  for p in ps:
   for e in p['record']['evidence']:
    if e not in base['evidence']:base['evidence'].append(e)
   if p['hunter']=='hunt-specifications':base['validation_plan']['local']+=' Specification-local variant: '+p['record']['validation_plan']['local']
 records.append(base)
(O/'candidates.json').write_text(json.dumps(records,indent=2)+'\n')
print([(i,r['fingerprint']) for i,r in enumerate(records)])
