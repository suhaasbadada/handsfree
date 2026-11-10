import test from 'node:test';
import assert from 'node:assert/strict';
import {Workflow} from '../src/workflow.ts';
const initial=()=>({paused:false,excluded_bundle_ids:['com.absent.app'],login:{status:'not_registered',error:null}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture(){const calls=[],responses={};let allowed=true;const workflow=new Workflow(async(command,args)=>{calls.push({command,args});if(command in responses)return await responses[command];return initial();},()=>{},()=>allowed);return {workflow,calls,responses,block:()=>allowed=false};}
test('pause roundtrip and login approval are observed, not assumed enabled',async()=>{
 const {workflow:w,responses:r,calls}=fixture();await w.refresh();r.set_paused={...initial(),paused:true};await w.pause(true);assert.equal(w.status.paused,true);r.set_paused=initial();await w.pause(false);assert.equal(w.status.paused,false);
 r.set_launch_at_login={status:'approval_required',error:null};await w.login(true);assert.equal(w.status.login.status,'approval_required');r.set_launch_at_login={status:'enabled',error:null};await w.login(true);assert.equal(w.status.login.status,'enabled');assert.deepEqual(calls.filter(c=>c.command==='set_paused').map(c=>c.args),[{paused:true},{paused:false}]);
});
test('duplicates blocked, failure restores saved values, concurrent independent writes merge',async()=>{
 const {workflow:w,responses:r,calls}=fixture();await w.refresh();const pause=deferred(),login=deferred();r.set_paused=pause.promise;r.set_launch_at_login=login.promise;
 const a=w.pause(true),b=w.login(true);await w.pause(true);assert.equal(w.pending.pause,true);assert.equal(w.pending.login,true);assert.equal(calls.filter(c=>c.command==='set_paused').length,1);
 login.resolve({status:'enabled',error:null});await b;pause.resolve({...initial(),paused:true});await a;assert.equal(w.status.login.status,'enabled');assert.equal(w.status.paused,true);
 r.set_excluded_apps=Promise.reject('save failed');await w.exclusions([]);assert.deepEqual(w.status.excluded_bundle_ids,['com.absent.app']);assert.match(w.error,/save failed/);assert.equal(w.pending.exclusions,false);
});
test('coalesced stale polls cannot overwrite pending or completed edits; absent IDs survive app metadata',async()=>{
 const {workflow:w,responses:r,calls,block}=fixture();await w.refresh();const stale=deferred();r.workflow_status=stale.promise;const a=w.refresh(),b=w.refresh();assert.equal(a,b);
 r.set_excluded_apps={...initial(),excluded_bundle_ids:[]};await w.exclusions([]);stale.resolve(initial());await a;assert.deepEqual(w.status.excluded_bundle_ids,[]);
 r.running_apps=[];await w.runningApps();assert.deepEqual(w.apps,[]);assert.equal(calls.at(-1).command,'running_apps');block();await w.pause(true);assert.notEqual(calls.at(-1).command,'set_paused');
});
