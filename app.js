const $=(s,e=document)=>e.querySelector(s);
const SCOPES='https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly';
const API='https://classroom.googleapis.com/v1';
let tasks=[],tokenClient=null,accessToken=null,deferredInstall=null;
const F={q:'',subject:'all',status:'all',files:'all',sort:'due-asc'};
const COLORS=['#e1ebe6','#efe6d3','#e2e7ef','#efe1e4','#e7e2ee','#e5ecd6'];
const hue=s=>COLORS[[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%COLORS.length];
const dayMs=864e5;

/* ---------- ข้อมูลตัวอย่าง ---------- */
function demo(){
  const d=n=>new Date(Date.now()+n*dayMs);
  const f=(t,k,u='https://drive.google.com')=>({title:t,kind:k,url:u});
  const mk=(id,subject,title,due,state,files)=>({id,subject,title,due:due&&d(due),state,files,link:'https://classroom.google.com'});
  return [
    mk(1,'คณิตศาสตร์','แบบฝึกหัดอนุพันธ์ บทที่ 4',2,'NEW',[f('แบบฝึกหัด_บท4.pdf','PDF'),f('เฉลยตัวอย่าง.docx','DOC')]),
    mk(2,'ฟิสิกส์','รายงานการทดลองแรงเสียดทาน',5,'CREATED',[f('ใบงานทดลอง.docx','DOC')]),
    mk(3,'ภาษาอังกฤษ','Essay: My Dream Job',1,'NEW',[f('Essay rubric','SLIDE')]),
    mk(4,'เคมี','สรุปตารางธาตุ',-3,'NEW',[f('ตารางธาตุ.pdf','PDF')]),
    mk(5,'ประวัติศาสตร์','ทำคลิปสั้นเรื่องอยุธยา',-8,'NEW',[f('ตัวอย่างคลิป','YT'),f('เกณฑ์ให้คะแนน.pdf','PDF')]),
    mk(6,'ชีววิทยา','แบบทดสอบเซลล์',-1,'NEW',[f('Google Form','FORM')]),
    mk(7,'คอมพิวเตอร์','โปรเจกต์ Python เกมทายเลข',-12,'TURNED_IN',[]),
    mk(8,'ภาษาไทย','เรียงความวันแม่',-5,'RETURNED',[f('หัวข้อเรียงความ.docx','DOC')]),
    mk(9,'คณิตศาสตร์','ใบงานเมทริกซ์',12,'NEW',[]),
  ];
}

/* ---------- Google Classroom ---------- */
async function api(path){
  const r=await fetch(API+path,{headers:{Authorization:'Bearer '+accessToken}});
  if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error?.message||r.status);
  return r.json();
}
async function all(path,key){
  let out=[],t='';
  do{const j=await api(path+(t?(path.includes('?')?'&':'?')+'pageToken='+t:''));out.push(...(j[key]||[]));t=j.nextPageToken}while(t);
  return out;
}
function material(m){
  if(m.driveFile){const x=m.driveFile.driveFile;return{title:x.title,kind:ext(x.title,'DRIVE'),url:x.alternateLink}}
  if(m.youTubeVideo)return{title:m.youTubeVideo.title,kind:'YT',url:m.youTubeVideo.alternateLink};
  if(m.link)return{title:m.link.title||m.link.url,kind:'LINK',url:m.link.url};
  if(m.form)return{title:m.form.title,kind:'FORM',url:m.form.formUrl};
  return null;
}
const ext=(t,d)=>{const m=/\.(\w{2,4})$/.exec(t||'');return m?m[1].toUpperCase():d};
function dueOf(cw){
  const d=cw.dueDate;if(!d)return null;
  const t=cw.dueTime||{};
  return cw.dueTime?new Date(Date.UTC(d.year,d.month-1,d.day,t.hours||0,t.minutes||0)):new Date(d.year,d.month-1,d.day,23,59);
}
async function loadClassroom(){
  setStatus('กำลังโหลดงานจาก Classroom…');
  const courses=await all('/courses?courseStates=ACTIVE&studentId=me','courses');
  const lists=await Promise.all(courses.map(async c=>{
    const [cws,subs]=await Promise.all([
      all(`/courses/${c.id}/courseWork?courseWorkStates=PUBLISHED`,'courseWork'),
      all(`/courses/${c.id}/courseWork/-/studentSubmissions?userId=me`,'studentSubmissions').catch(()=>[])]);
    const sm=Object.fromEntries(subs.map(s=>[s.courseWorkId,s]));
    return cws.map(w=>({id:c.id+w.id,subject:c.name,title:w.title,due:dueOf(w),link:w.alternateLink,
      state:(sm[w.id]||{}).state||'NEW',late:(sm[w.id]||{}).late,files:(w.materials||[]).map(material).filter(Boolean)}));
  }));
  tasks=lists.flat();
  setStatus(`เชื่อมต่อแล้ว · พบ ${courses.length} วิชา ${tasks.length} งาน`);
  fillSubjects();render();
}
function connect(){
  const id=localStorage.getItem('clientId');
  if(!id){$('#dlg').showModal();return}
  if(!window.google){setStatus('โหลด Google Sign-In ไม่ได้ ตรวจสอบอินเทอร์เน็ต');return}
  tokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPES,callback:async r=>{
    if(r.error){setStatus('เชื่อมต่อไม่สำเร็จ: '+r.error);return}
    accessToken=r.access_token;
    try{await loadClassroom()}catch(e){setStatus('โหลดข้อมูลไม่สำเร็จ: '+e.message)}
  }});
  tokenClient.requestAccessToken();
}

/* ---------- logic ---------- */
function statusOf(t){
  if(t.state==='TURNED_IN'||t.state==='RETURNED')return'done';
  return t.due&&t.due<new Date()?'overdue':'open';
}
const fmt=d=>d?d.toLocaleString('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' น.':'ไม่มีกำหนดส่ง';
function rel(d){
  if(!d)return'';
  const m=Math.round((d-Date.now())/6e4),a=Math.abs(m);
  const s=a<60?a+' นาที':a<1440?Math.round(a/60)+' ชั่วโมง':Math.round(a/1440)+' วัน';
  return m>=0?'อีก '+s:'เลยมา '+s;
}
const LABEL={open:'ยังไม่ส่ง',overdue:'หมดเวลา',done:'ส่งแล้ว'};
function filtered(){
  const q=F.q.trim().toLowerCase();
  const r=tasks.filter(t=>{
    const s=statusOf(t);
    if(F.subject!=='all'&&t.subject!==F.subject)return false;
    if(F.status!=='all'&&s!==F.status)return false;
    if(F.files==='yes'&&!t.files.length)return false;
    if(F.files==='no'&&t.files.length)return false;
    return !q||(t.title+t.subject+t.files.map(f=>f.title).join(' ')).toLowerCase().includes(q);
  });
  const far=1e15,dv=t=>t.due?+t.due:far;
  const cmp={'due-asc':(a,b)=>dv(a)-dv(b),'due-desc':(a,b)=>(b.due?+b.due:-far)-(a.due?+a.due:-far),
    subject:(a,b)=>a.subject.localeCompare(b.subject,'th'),title:(a,b)=>a.title.localeCompare(b.title,'th')}[F.sort];
  return r.sort(cmp);
}

/* ---------- render ---------- */
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function card(t){
  const s=statusOf(t),c=el('article','card');
  const top=el('div','row');
  const sj=el('span','subj',t.subject);sj.style.setProperty('--c',hue(t.subject));
  top.append(sj,el('span','badge '+s,LABEL[s]+(t.late&&s==='done'?' (ช้า)':'')));
  const due=el('p','due');due.append(el('b',null,fmt(t.due)));if(s!=='done')due.append(el('small',null,rel(t.due)));
  c.append(top,el('h3',null,t.title),due);
  if(t.files.length){
    const box=el('div','files');
    t.files.forEach(f=>{const a=el('a');a.href=f.url;a.target='_blank';a.rel='noopener';a.title=f.title;
      a.append(el('i',null,f.kind),el('span',null,f.title));box.append(a)});
    c.append(box);
  }
  const o=el('a','open','เปิดงานใน Classroom');o.href=t.link;o.target='_blank';o.rel='noopener';c.append(o);
  return c;
}
let io;
function render(){
  const list=filtered(),groups={open:[],overdue:[],done:[]};
  list.forEach(t=>groups[statusOf(t)].push(t));
  io&&io.disconnect();
  io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.1});
  document.querySelectorAll('.box').forEach(b=>{
    const g=groups[b.dataset.box],grid=$('.grid',b);
    $('[data-count]',b).textContent=g.length;grid.replaceChildren();
    if(!g.length)grid.append(el('p','empty','ไม่มีงานในกล่องนี้'));
    g.forEach(t=>{const c=card(t);grid.append(c);io.observe(c)});
    if(!g.length)$('.empty',grid).style.opacity=1;
  });
  filterBadge();
  $('#result').textContent=`แสดง ${list.length} จาก ${tasks.length} งาน`;
  $('#heroCount').textContent=tasks.filter(t=>statusOf(t)!=='done').length;
  const subs=[...new Set(tasks.map(t=>t.subject))];
  $('#marquee').textContent=(subs.join('    —    ')+'    —    ').repeat(4);
}
function fillSubjects(){
  const sel=$('#fSubject');sel.replaceChildren(new Option('ทั้งหมด','all'));
  [...new Set(tasks.map(t=>t.subject))].sort((a,b)=>a.localeCompare(b,'th')).forEach(s=>sel.add(new Option(s,s)));
  F.subject='all';
}
const setStatus=m=>$('#status').textContent=m;

/* ---------- events ---------- */
$('#q').oninput=e=>{F.q=e.target.value;render()};
[['fSubject','subject'],['fStatus','status'],['fFiles','files'],['fSort','sort']].forEach(([id,k])=>$('#'+id).onchange=e=>{F[k]=e.target.value;render()});
$('#btnReset').onclick=()=>{Object.assign(F,{q:'',subject:'all',status:'all',files:'all',sort:'due-asc'});$('#q').value='';['fSubject','fStatus','fFiles'].forEach(i=>$('#'+i).value='all');$('#fSort').value='due-asc';render()};
$('#btnDemo').onclick=()=>{tasks=demo();fillSubjects();render();setStatus('กำลังใช้ข้อมูลตัวอย่าง')};
$('#btnConnect').onclick=connect;
$('#btnSettings').onclick=()=>{$('#clientId').value=localStorage.getItem('clientId')||'';$('#dlg').showModal()};
$('#dlg').onclose=()=>{const v=$('#clientId').value.trim();if($('#dlg').returnValue==='ok'&&v){localStorage.setItem('clientId',v);connect()}};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#btnInstall').hidden=false});
$('#btnInstall').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#btnInstall').hidden=true};

/* ---------- มือถือ / แท็บเล็ต ---------- */
function setFilters(o){$('#filters').classList.toggle('show',o);$('#backdrop').classList.toggle('show',o);document.body.classList.toggle('lock',o&&innerWidth<=900);$('#btnFilters').setAttribute('aria-expanded',o)}
$('#btnFilters').onclick=()=>setFilters(!$('#filters').classList.contains('show'));
$('#btnDone').onclick=$('#backdrop').onclick=()=>setFilters(false);
addEventListener('keydown',e=>{if(e.key==='Escape')setFilters(false)});
addEventListener('resize',()=>{if(innerWidth>900)setFilters(false)});
function filterBadge(){const n=['subject','status','files'].filter(k=>F[k]!=='all').length+(F.sort!=='due-asc'?1:0);$('#btnFilters').textContent=n?`ตัวกรอง (${n})`:'ตัวกรอง'}
const tb=$('#toolbar');
new ResizeObserver(()=>document.documentElement.style.setProperty('--tb',tb.offsetHeight+'px')).observe(tb);
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if(isIOS&&!navigator.standalone)$('#iosHint').hidden=false;

/* ---------- scroll effects ---------- */
const hero=$('#hero'),bar=$('#progress');
function onScroll(){
  const y=scrollY,max=document.documentElement.scrollHeight-innerHeight;
  bar.style.transform=`scaleX(${max?y/max:0})`;
  hero.style.setProperty('--p',Math.min(1,Math.max(0,y/(hero.offsetHeight-innerHeight))).toFixed(3));
}
addEventListener('scroll',onScroll,{passive:true});onScroll();

/* ---------- start ---------- */
tasks=demo();fillSubjects();render();
if(localStorage.getItem('clientId')&&false)connect();
const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;document.head.append(s);
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});