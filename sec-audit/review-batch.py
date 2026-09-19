from pathlib import Path
import json,sys,subprocess
O=Path('/workspace/tmp/sec-audit')
def load(n,default=None):return json.loads((O/n).read_text()) if (O/n).exists() else default
cmd=sys.argv[1]
if cmd=='ready':
 done=load('ingested-reviews.json',[])+[x['agent_id'] for x in load('discarded-reviews.json',[])]
 for aid,a in load('verification-assignments.json',{}).items():
  p=O/'agents'/aid/'scratch/result.json'
  if p.exists() and aid not in done:
   try:r=json.loads(p.read_text());print(aid,a['phase'],r.get('decision'),a['fingerprint'])
   except Exception as e:print(aid,'MALFORMED',str(e))
elif cmd=='ingest':
 done=load('ingested-reviews.json',[])
 for aid in sys.argv[2:]:
  assert aid not in done
  a=load('verification-assignments.json')[aid]
  r=subprocess.run(['python3',str(O/'verification-tools.py'),'ingest'+a['phase'],aid],capture_output=True,text=True)
  if r.returncode:print(r.stdout,r.stderr);sys.exit(r.returncode)
  output=load('agents/'+aid+'/scratch/result.json'); print(aid,output['decision'],a['fingerprint'])
  if output['decision']=='replace':print('REPLACEMENT:',output['reason'])
  done.append(aid);(O/'ingested-reviews.json').write_text(json.dumps(done,indent=2)+'\n')
