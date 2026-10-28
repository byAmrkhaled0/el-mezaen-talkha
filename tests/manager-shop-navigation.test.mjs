import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
const socialSections=new Set(['packages','offers','campaigns','websiteContent','gallery','adminAssistant']);
const managementSections=new Set(['pos','bookings','calendar','services','cash','tasks']);
function context(role='manager'){
 const state={role,permissions:new Set(['packages','services','pos','bookings','offers','campaigns','siteMedia'])},app={dataset:{}},calls=[];
 const value={state,socialSections,managementSections,document:{getElementById:()=>({classList:{contains:()=>true}})},sectionPermission:id=>id,hasContentWorkspace:()=>true,cashierSections:new Set(),cashierOptionalMarketing:new Set(),$:()=>app,closeScanner(){},applyAccess(){calls.push('access');},showSection(id,options){calls.push([id,options]);}};
 vm.createContext(value);vm.runInContext(source.slice(source.indexOf('function canOpenSection('),source.indexOf('function refreshSidebarGroups(')),value);
 return Object.assign(value,{calls,app});
}
test('manager packages stay in shop with original transaction and booking links visible',()=>{
 const c=context();assert.equal(c.canOpenSection('packages'),true);assert.equal(c.sectionHub('packages'),'management');assert.ok(c.availableHubSections('management').includes('packages'));
 for(const id of ['pos','bookings','services'])assert.equal(c.sectionHub(id),'management');
 for(const id of ['offers','campaigns','websiteContent','mobileContent','gallery'])assert.equal(c.canOpenSection(id),false,id);
 assert.equal(c.availableHubSections('social').length,0);
});
test('manager workspace-home route goes directly to POS without displaying role-choice gates',()=>{
 const c=context();vm.runInContext(source.slice(source.indexOf('function showWorkspaceHome('),source.indexOf('async function openHub(')),c);
 c.showWorkspaceHome({historyMode:'none'});assert.equal(c.state.hub,'management');assert.equal(c.app.dataset.hub,'management');assert.equal(c.calls[1][0],'pos');
});
test('owner and media retain their existing package workspace classification',()=>{for(const role of ['admin','media'])assert.equal(context(role).sectionHub('packages'),'social');});
