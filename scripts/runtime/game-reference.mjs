/** Frozen gameplay comparison consumed by the existing studio gate command.
 * Trusted local capture boundary, not authentication of arbitrary caller JSON.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const hash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);

export function judgeGameStudio({contract,reference,candidate,currentBuild}={}){
 const unverified=reason=>({schema:'game-reference-result/v1',status:'UNVERIFIED',reasons:[reason]});
 if(contract?.requireGameplayEventTrace===true)return unverified('intra_step_gameplay_event_trace_not_implemented');
 if(!contract || contract.schema!=='game-reference-contract/v1' || !hash(contract.referenceBuild)
   || !Array.isArray(contract.inputs) || !contract.inputs.length || contract.inputs.length>256
   || !Array.isArray(contract.expected) || !Array.isArray(contract.fields) || !contract.fields.length
   || !contract.tolerances || !Array.isArray(contract.approvedPolish))return unverified('invalid_contract');
 const ids=contract.inputs.map(x=>x?.id);
 if(ids.some(id=>typeof id!=='string'||!id) || new Set(ids).size!==ids.length
   || contract.expected.length!==ids.length || contract.expected.some((x,i)=>x?.id!==ids[i])
   || Object.values(contract.tolerances).some(x=>!Number.isFinite(x)||x<0))return unverified('invalid_alignment_or_tolerance');
 if(!hash(currentBuild))return unverified('current_build_required');
 if(contract.equalTicks && (!Array.isArray(contract.equalTicks) || contract.equalTicks.length>256
   || contract.equalTicks.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(id=>!ids.includes(id)))))return unverified('invalid_timing_invariant');
 const contractSha256=digest(contract), inputSha256=digest(contract.inputs), differences=[];
 for(const [arm,capture,build] of [['reference',reference,contract.referenceBuild],['candidate',candidate,currentBuild]]){
  if(!capture || capture.schema!=='game-reference-capture/v1' || capture.build!==build
    || capture.contractSha256!==contractSha256 || capture.inputSha256!==inputSha256
    || capture.seed!==contract.seed || !capture.environment || typeof capture.environment!=='object'
    || digest(capture.environment)!==digest(contract.environment)
    || capture.quiescence!=='confirmed' || capture.engineCapability!=='observed'
    || capture.playtest?.kind!=='automated-public-input' || capture.playtest.build!==build || capture.playtest.completed!==true
    || !Array.isArray(capture.observations) || capture.observations.length!==ids.length
    || capture.observations.some((x,i)=>x?.id!==ids[i]))return unverified(`${arm}_missing_stale_or_incomplete_evidence`);
  for(let i=0;i<ids.length;i++)for(const field of contract.fields){
   const expected=contract.expected[i].state?.[field], actual=capture.observations[i].state?.[field];
   if(!['number','string','boolean'].includes(typeof expected) || typeof actual!==typeof expected
     || (typeof actual==='number' && (!Number.isFinite(actual)||!Number.isFinite(expected))))return unverified(`${arm}_missing_observation:${ids[i]}:${field}`);
   const equal=typeof actual==='number'?Math.abs(actual-expected)<=(contract.tolerances[field]??0):actual===expected;
   if(!equal)differences.push({arm,step:ids[i],field,expected,actual});
  }
  for(const [before,after] of contract.equalTicks??[]){
   const left=capture.observations[ids.indexOf(before)].state?.ticks;
   const right=capture.observations[ids.indexOf(after)].state?.ticks;
   if(!Number.isFinite(left)||!Number.isFinite(right))return unverified(`${arm}_missing_pause_ticks`);
   if(left!==right)differences.push({arm,step:after,field:'pause_ticks_invariant',expected:left,actual:right});
  }
 }
 return {schema:'game-reference-result/v1',status:differences.length?'FAIL':'PASS',contractSha256,inputSha256,
  referenceBuild:reference.build,candidateBuild:candidate.build,referenceCaptureSha256:digest(reference),candidateCaptureSha256:digest(candidate),
  differences,limits:['automated mechanics snapshots and frozen input/snapshot order only','intra-step gameplay event order unverified','human game feel, native engines and real mobile performance unverified']};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const [contractPath,referencePath,candidatePath,currentBuild]=process.argv.slice(2);
  const read=path=>{if(!path)throw new Error('contract reference candidate and current-build arguments required');
   const data=readFileSync(path);if(data.length>2*1024*1024)throw new Error('bounded capture required');return JSON.parse(data);};
  const result=judgeGameStudio({contract:read(contractPath),reference:read(referencePath),candidate:read(candidatePath),currentBuild});
  console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
 }catch(error){console.log(JSON.stringify({status:'UNVERIFIED',reason:error.message}));process.exitCode=2;}
}
