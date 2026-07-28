import { chromium } from '@playwright/test';
const B='https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io', M='/management/', e=encodeURIComponent;
const routes=[
 '/','/audits',
 ...['cockpit','control-room','one-ring','persona-fleet','human-inbox','trading-pulse','evolution-journal','evidence','persona-intent','broker-live','capital-live','readiness/ep5','readiness/broker-live','readiness/capital-binding-live','readiness/bff-ha','readiness/strict-publish','data-sources','system/bff-ha','system/strict-publish','ask','portfolio-book','persona-league','quarterly-ranking','performance-attribution','control-room-legacy','loops','loops/execution','loops/optimization','loops/research','sentinel','interventions','overview','overview-legacy','command-center','risk-center','risk','strategies','personas','capital','capital-pools','ranking','ranking/formulas','ranking-formulas','rebalance','rebalances','evolution','experiments','research','artifacts','governance','governance/policies','governance/permissions','governance/memory','governance/consult','knowledge','postmortems','lineage','settings','alpha-factory','workflows','hooks','deployments','deployment','runtimes','jobs','alerts','incidents','audit','approvals','tools','mcp','skills','channels','studios/formula','studios/skill-sandbox','agent'].map(p=>M+p),
 ...['','daily','markets','watchlist','signals','triage','notebook','ask','committee','journal','insights','trainer','memory','skill-coaching','persona-lab','evaluations','channels'].map(p=>'/agora'+(p?'/'+p:'')),
 // detail pages with real ids
 M+'personas/persona-20260613-95eb3e7d', M+'personas/persona-20260613-95eb3e7d/onboarding',
 M+'capital/'+e('pool-rescue-0260513-06627c91'), M+'capital-pools/'+e('pool-rescue-0260513-06627c91'),
 M+'deployments/'+e('plan-rescue-0260513-06627c91'), M+'deployment/'+e('plan-rescue-0260513-06627c91'),
 M+'channels/approval', M+'persona-intent/'+e('persona_trace:sess-rescue-0260513-d611ddc2'),
];
const br=await chromium.launch(); const out=[];
for(const r of routes){ const c=await br.newContext({viewport:{width:1400,height:900}}); const p=await c.newPage(); const er=[];
 p.on('pageerror',x=>er.push('pageerror: '+x.message)); p.on('console',m=>{if(m.type()==='error')er.push('console: '+m.text().slice(0,140));});
 try{ await p.goto(B+r,{waitUntil:'domcontentloaded',timeout:30000}); await p.waitForTimeout(2600);
  const t=(await p.locator('body').innerText().catch(()=>''))||''; const crash=t.includes('畫面渲染失敗'); const blank=t.trim().length<15;
  out.push({r,st:crash?'CRASH':blank?'BLANK':er.length?'ERR':'OK',e:er.slice(0,2)});
 }catch(x){out.push({r,st:'NAVFAIL',e:[String(x).slice(0,120)]});} await c.close(); }
await br.close();
console.log('=== FINAL SUMMARY ===',JSON.stringify(out.reduce((a,o)=>{a[o.st]=(a[o.st]||0)+1;return a;},{})),'total',out.length);
for(const o of out.filter(o=>o.st!=='OK')) console.log(o.st, o.r, '|', (o.e||[]).join(' || '));
