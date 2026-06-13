const $=q=>document.querySelector(q);
const $$=q=>Array.from(document.querySelectorAll(q));
const uid=()=>crypto.randomUUID();
const pad=n=>String(n).padStart(2,"0");
const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>key(new Date());
const parse=k=>{const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)};
const add=(k,n)=>{const d=parse(k);d.setDate(d.getDate()+n);return key(d)};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const nice=k=>{const d=parse(k);return `${d.getMonth()+1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})`};

const defaults={
  subjects:["수1","수2","확통","영어","사문","생윤"],
  subjectGoals:{"수1":32,"수2":41,"확통":38,"영어":30,"사문":11,"생윤":20},
  subjectCovers:{},
  subjectCoverColors:{},
  books:[],
  bookCovers:{},
  bookCoverColors:{},
  subjectNotes:{},
  bookRecords:{},
  cycles:[1,3,7,14,28],
  ddays:[
    {id:uid(),name:"2027 수능",date:"2027-11-18",start:today()},
    {id:uid(),name:"경찰대 1차",date:"2026-07-30",start:today()},
    {id:uid(),name:"성균관대 논술",date:"2026-12-17",start:today()}
  ],
  studies:[],
  classes:[],
  events:[],
  completed:{},
  deletedReviews:{},
  scores:[],
  quote:{enabled:false,text:""},
  cover:"",
  appearance:{theme:"music",font:"pretendard",anim:"slow"},
  weekStart:"mon"
};

let state=JSON.parse(localStorage.getItem("juheonooV3")||"null")||defaults;
Object.keys(defaults).forEach(k=>{ if(state[k]===undefined) state[k]=defaults[k] });
state.classes ||= [];
state.subjectCovers ||= {};
state.subjectCoverColors ||= {};
state.events ||= [];
state.subjectGoals ||= defaults.subjectGoals;
state.deletedReviews ||= {};
state.books ||= [];
state.bookCovers ||= {};
state.bookCoverColors ||= {};
state.subjectNotes ||= {};
Object.keys(state.subjectNotes).forEach(k=>{
  if(typeof state.subjectNotes[k]==="string") state.subjectNotes[k]=state.subjectNotes[k].trim()? [{id:uid(),date:today(),text:state.subjectNotes[k].trim()}] : [];
});
state.bookRecords ||= {};
if(Array.isArray(state.books)){
  state.books=state.books.map(b=>{
    if(typeof b==="string") return {name:b,subject:""};
    return {name:b.name||"", subject:b.subject||""};
  }).filter(b=>b.name);
}
state.quote ||= defaults.quote;
state.appearance ||= defaults.appearance;
state.weekStart ||= "mon";

let currentSubject="전체", currentBook=null, selected=today(), viewDate=new Date(), taskIndex=0;
window.state=state;

function save(){localStorage.setItem("juheonooV3",JSON.stringify(state))}
function applyAppearance(){document.body.className=`theme-${state.appearance.theme} font-${state.appearance.font} anim-${state.appearance.anim}`}
function allSubjects(){return ["전체",...state.subjects]}
function reviewId(st,c){return `${st.id}:${c}`}
function reviewEnabledFor(st){return st?.reviewEnabled !== false}

function classOccurs(cls,date){
  if(date < cls.date) return false;
  if(cls.until && date > cls.until) return false;
  if(cls.repeat==="none") return date===cls.date;
  const start=parse(cls.date), target=parse(date);
  const diff=Math.round((target-start)/86400000);
  if(cls.repeat==="daily") return diff>=0;
  if(cls.repeat==="weekly") return diff>=0 && diff%7===0;
  if(cls.repeat==="monthly") return diff>=0 && start.getDate()===target.getDate();
  return false;
}
function eventOccurs(ev,date){
  if(date < ev.date) return false;
  if(ev.until && date > ev.until) return false;
  if(ev.repeat==="none") return date===ev.date;
  const start=parse(ev.date), target=parse(date);
  const diff=Math.round((target-start)/86400000);
  if(ev.repeat==="daily") return diff>=0;
  if(ev.repeat==="weekly") return diff>=0 && diff%7===0;
  if(ev.repeat==="monthly") return diff>=0 && start.getDate()===target.getDate();
  return false;
}

function getItems(date, forceAll=false){
  let arr=[];
  state.studies.forEach(st=>{
    if(st.date===date) arr.push({...st,kind:"study",date});
    if(reviewEnabledFor(st)) state.cycles.forEach(c=>{
      const rid=reviewId(st,c);
      if(!state.deletedReviews?.[rid] && add(st.date,c)===date) arr.push({...st,kind:"review",cycle:c,rid,done:!!state.completed[rid],date});
    });
  });
  state.classes.forEach(cls=>{
    if(classOccurs(cls,date)) arr.push({...cls,kind:"class",date});
  });
  state.events.forEach(ev=>{
    if(eventOccurs(ev,date)) arr.push({...ev,kind:"event",date});
  });
  return arr.filter(x=>forceAll||currentSubject==="전체"||x.subject===currentSubject);
}
function todayReviews(){return getItems(today(),true).filter(x=>x.kind==="review"&&!x.done)}
function overdueReviews(){
  const out=[];
  state.studies.forEach(st=>{ if(!reviewEnabledFor(st)) return; state.cycles.forEach(c=>{
    const d=add(st.date,c), rid=reviewId(st,c);
    if(d<today()&&!state.completed[rid]&&!state.deletedReviews?.[rid]) out.push({...st,kind:"review",cycle:c,rid,date:d});
  })});
  return out;
}
function monthClassCount(subject){
  const y=viewDate.getFullYear(), m=viewDate.getMonth(), last=new Date(y,m+1,0).getDate();
  let count=0;
  for(let d=1; d<=last; d++){
    const k=key(new Date(y,m,d));
    count += state.classes.filter(c=>(subject==="전체"||c.subject===subject)&&classOccurs(c,k)).length;
  }
  return count;
}


function updateNavPill(){
  const pill=$("#navPill");
  const active=document.querySelector(".nav-tab.active");
  const nav=document.querySelector(".nav");
  if(!pill||!active||!nav) return;
  pill.style.width=active.offsetWidth+"px";
  pill.style.transform=`translateX(${active.offsetLeft}px)`;
}
function toast(msg){
  let el=document.querySelector(".drag-toast");
  if(!el){
    el=document.createElement("div");
    el.className="drag-toast";
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>el.classList.remove("show"),1100);
}
let dragSubjectIndex=null;
function initSubjectDrag(){ initFinalSubjectDrag(); }
function moveSubjectDrag(from,insertAt){
  const arr=state.subjects;
  if(from<0||from>=arr.length) return;
  const [item]=arr.splice(from,1);
  if(insertAt>from) insertAt--;
  insertAt=Math.max(0,Math.min(arr.length,insertAt));
  arr.splice(insertAt,0,item);
  save();
  render();
  toast("과목 순서 저장됨");
}

function init(){applyAppearance(); bind(); render(); setTimeout(updateNavPill,60); window.addEventListener("resize",updateNavPill)}
function render(){renderSubjects(); renderDrawer(); renderHome(); renderCalendar(); renderSelected(); renderStats(); renderSettings(); renderPlayer(); renderCover(); renderQuote(); renderSubjectPage(); renderBookPage(); setTimeout(updateNavPill,30)}
function renderSubjects(){
  $("#calendarSubject").innerHTML="";
  allSubjects().forEach(s=>$("#calendarSubject").append(new Option(s,s)));
  $("#calendarSubject").value=currentSubject;
  for(const id of ["studySubject","classSubject"]){
    const sel=$("#"+id); sel.innerHTML="";
    state.subjects.forEach(s=>sel.append(new Option(s,s)));
  }
}
function renderDrawer(){
  $("#subjectDrawerList").innerHTML=state.subjects.map((s,i)=>{
    const cover=coverStyle("subject", s, state.subjectCovers?.[s]);
    return `<div class="playlist ${currentSubject===s?"active":""}" data-subject="${esc(s)}" data-index="${i}">
      <div class="play-art playlist-cover-preview" ${cover}></div>
      <button class="playlist-main" onclick="selectSubject('${esc(s)}')">
        <div><div class="play-title">${esc(s)}</div><div class="play-sub">${countStudies(s)}개 진도 · ${monthClassCount(s)}개 수업</div></div>
      </button>
      <button class="subject-drag-handle" title="순서 변경" aria-label="순서 변경">☰</button>
    </div>`;
  }).join("");

  const bookList=$("#bookDrawerList");
  if(bookList){
    const visibleBooks = booksForDrawer();
    bookList.innerHTML=visibleBooks.map((b,i)=>{
      const name=bookName(b), subj=bookSubject(b);
      const key=bookKey(subj,name);
      const cover=coverStyle("book", key, state.bookCovers?.[key] || state.bookCovers?.[name]);
      return `<div class="playlist ${currentBook===name&&currentSubject===subj?"active":""}" data-book="${esc(name)}" data-subject="${esc(subj)}" data-index="${i}">
        <div class="play-art playlist-cover-preview" ${cover}></div>
        <button class="playlist-main" onclick="selectBook('${esc(name)}','${esc(subj)}')">
          <div><div class="play-title">${esc(name)}</div><div class="play-sub">${esc(subj)} 교재</div></div>
        </button>
        <button class="subject-drag-handle" title="순서 변경" aria-label="순서 변경">☰</button>
      </div>`;
    }).join("");
  }
  initSubjectDrag();
  initBookDrawerDrag();
}
function countStudies(s){return state.studies.filter(x=>x.subject===s).length}
function renderCover(){if(state.cover) $("#coverPreview").style.backgroundImage=`url(${state.cover})`; else $("#coverPreview").style.backgroundImage=""}
function renderQuote(){const box=$("#quoteBox"); if(state.quote.enabled&&state.quote.text.trim()){box.textContent=state.quote.text.trim(); box.classList.remove("hidden")} else box.classList.add("hidden")}

function renderHome(){
  $("#ddayList").innerHTML=state.ddays.map(ddayRow).join("")||`<div class="empty">D-Day 없음</div>`;
  const tr=todayReviews(); $("#todayCount").textContent=tr.length; $("#todayReviewList").innerHTML=tr.map(row).join("")||`<div class="empty">오늘 복습 없음</div>`;
  const tc=getItems(today(),true).filter(x=>x.kind==="class"); $("#todayClassList").innerHTML=tc.map(row).join("")||`<div class="empty">오늘 수업 없음</div>`;
  const te=getItems(today(),true).filter(x=>x.kind==="event"); $("#todayEventList").innerHTML=te.map(row).join("")||`<div class="empty">오늘 일정 없음</div>`;
  const od=overdueReviews(); $("#overdueCount").textContent=od.length; $("#overdueList").innerHTML=od.slice(0,12).map(row).join("")||`<div class="empty">밀린 복습 없음</div>`;
}
function ddayRow(d){
  const remain=Math.ceil((parse(d.date)-parse(today()))/86400000);
  return `<div class="row">
    <div class="row-art"></div>
    <div><div class="row-title">${esc(d.name)}</div><div class="row-sub">${d.date}</div></div>
    <div class="row-right">${remain>=0?`D-${remain}`:`D+${Math.abs(remain)}`}</div>
    <button class="more" onclick="openDday('${d.id}')">⋯</button>
  </div>`;
}
function row(it){
  if(it.kind==="event"){
    const time = it.startTime ? `${it.startTime}${it.endTime?`-${it.endTime}`:""}` : "일정";
    return `<div class="row">
      <div class="row-art event"></div>
      <div><div class="row-title">${esc(it.name)}</div><div class="row-sub">${time}${it.repeat&&it.repeat!=="none"?` · ${repeatLabel(it.repeat)}`:""}${it.memo?` · ${esc(it.memo)}`:""}</div></div>
      <div class="row-right">일정</div>
      <button class="more" onclick="openEvent('${it.id}')">⋯</button>
    </div>`;
  }
  if(it.kind==="class"){
    const time = it.startTime ? `${it.startTime}${it.endTime?`-${it.endTime}`:""}` : "수업";
    return `<div class="row">
      <div class="row-art class"></div>
      <div><div class="row-title">${esc(it.subject)} · ${esc(it.name)}</div><div class="row-sub">${time}${it.repeat&&it.repeat!=="none"?` · ${repeatLabel(it.repeat)}`:""}${it.memo?` · ${esc(it.memo)}`:""}</div></div>
      <div class="row-right">수업</div>
      <button class="more" onclick="openClass('${it.id}')">⋯</button>
    </div>`;
  }
  const left=it.kind==="review"?`<button class="check" onclick="toggleDone('${it.rid}')">${it.done?"✓":""}</button>`:`<div class="row-art"></div>`;
  const actions=it.kind==="study"
    ? `<button onclick="openStudy('${it.id}')">수정</button><button onclick="deleteStudyFromCalendar('${it.id}')">삭제</button>`
    : `<button onclick="deleteReviewFromCalendar('${it.rid}')">삭제</button>`;
  const color=calendarColorForSubject(it.subject);
  return `<div class="row subject-color-row ${it.done?"done":""}"${color?` style="--subject-color:${color}"`:""}>
    ${left}
    <div><div class="row-title">${esc(it.subject)} · ${esc(it.name)}</div><div class="row-sub">${it.kind==="review"?`${it.cycle}일 복습`:"진도"}${it.book?` · ${esc(it.book)}`:""}${it.memo?` · ${esc(it.memo)}`:""}</div></div>
    <div class="row-right">${it.kind==="review"?`${it.cycle}일`:"진도"}</div>
    <div class="row-actions calendar-actions">${actions}</div>
  </div>`;
}
function repeatLabel(v){return {none:"반복 없음",daily:"매일",weekly:"매주",monthly:"매월"}[v]||v}

function renderCalendar(){
  $("#monthTitle").textContent=`${viewDate.getFullYear()}년 ${viewDate.getMonth()+1}월`;
  const days=state.weekStart==="mon"?["월","화","수","목","금","토","일"]:["일","월","화","수","목","금","토"];
  $("#weekRow").innerHTML=days.map(d=>`<span>${d}</span>`).join("");
  const first=new Date(viewDate.getFullYear(),viewDate.getMonth(),1);
  const offset=state.weekStart==="mon"?(first.getDay()+6)%7:first.getDay();
  const start=new Date(viewDate.getFullYear(),viewDate.getMonth(),1-offset);
  $("#calendarGrid").innerHTML="";
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const k=key(d); const its=getItems(k);
    const b=document.createElement("button");
    b.className=`day ${d.getMonth()!==viewDate.getMonth()?"out":""} ${k===today()?"today":""} ${k===selected?"selected":""} ${d.getDay()===6?"sat":""} ${d.getDay()===0?"sun":""}`;
    b.innerHTML=`<span class="date">${d.getDate()}</span><div class="marks">${its.slice(0,4).map(calendarMark).join("")}</div>`;
    b.onclick=()=>{selected=k; renderCalendar(); renderSelected()};
    $("#calendarGrid").appendChild(b);
  }
}
function renderSelected(){
  $("#selectedDateTitle").textContent=nice(selected);
  const its=getItems(selected);
  $("#selectedItems").innerHTML=its.map(row).join("")||`<div class="empty">일정 없음</div>`;
}
function renderStats(){
  $("#reviewStats").innerHTML=state.subjects.map(s=>{
    let total=0, done=0; state.studies.filter(x=>x.subject===s && reviewEnabledFor(x)).forEach(st=>state.cycles.forEach(c=>{total++; if(state.completed[reviewId(st,c)]) done++}));
    const pct=total?Math.round(done/total*100):0; return statRow(s,pct,`${done}/${total}`);
  }).join("")||`<div class="empty">복습 기록 없음</div>`;
  $("#progressStats").innerHTML=state.subjects.map(s=>{
    const done=countStudies(s), goal=state.subjectGoals[s]||0, pct=goal?Math.min(100,Math.round(done/goal*100)):0;
    return statRow(s,pct,goal?`${done}/${goal}`:`${done}개`);
  }).join("");
  $("#classStats").innerHTML=state.subjects.map(s=>{
    const count=monthClassCount(s); return statRow(s,Math.min(100,count*10),`${count}개`);
  }).join("")||`<div class="empty">수업 일정 없음</div>`;
  $("#ddayStats").innerHTML=state.ddays.map(d=>{
    const start=parse(d.start||today()), end=parse(d.date), now=parse(today());
    const total=Math.max(1,Math.ceil((end-start)/86400000)), passed=Math.max(0,Math.min(total,Math.ceil((now-start)/86400000)));
    const pct=Math.round(passed/total*100), remain=Math.ceil((end-now)/86400000);
    return statRow(d.name,pct,remain>=0?`D-${remain}`:`D+${Math.abs(remain)}`);
  }).join("")||`<div class="empty">D-Day 없음</div>`;
  const sevenStart=parse(today()); sevenStart.setDate(sevenStart.getDate()-6);
  let studyCount=0, classCount=0, reviewDone=0;
  for(let i=0;i<7;i++){
    const d=new Date(sevenStart); d.setDate(sevenStart.getDate()+i); const k=key(d);
    studyCount+=state.studies.filter(x=>x.date===k).length;
    classCount+=state.classes.filter(c=>classOccurs(c,k)).length;
  }
  Object.keys(state.completed).forEach(rid=>{ if(state.completed[rid]) reviewDone++ });
  $("#weekStats").innerHTML=`<div class="week-box"><strong>${studyCount}</strong><span>최근 7일 진도</span></div><div class="week-box"><strong>${classCount}</strong><span>최근 7일 수업</span></div><div class="week-box"><strong>${reviewDone}</strong><span>전체 완료 복습</span></div>`;
}
function statRow(name,pct,right){return `<div class="stat-row"><strong>${esc(name)}</strong><div class="bar"><span style="width:${pct}%"></span></div><span>${right}</span></div>`}
function themeLabel(id){const map={music:"Music",midnight:"Midnight",black:"Black",obsidian:"Obsidian",charcoal:"Charcoal",sky:"Sky",cream:"Cream",forest:"Forest",lilac:"Lilac",mono:"Mono",snow:"Snow",latte:"Latte",mint:"Mint",rose:"Rose"}; return map[id]||id}
function renderSettings(){
  $("#cycleText").textContent=state.cycles.join(" · ")+"일";
  $("#ddayText").textContent=state.ddays.length+"개";
  $("#scoreText").textContent=state.scores.length?state.scores[0].title:"없음";
  $("#quoteText").textContent=state.quote.enabled?"표시 중":"꺼짐";
  $("#themeText").textContent=themeLabel(state.appearance.theme);
  $("#fontText").textContent=state.appearance.font;
  $("#animText").textContent=state.appearance.anim;
  $("#weekStartText").textContent=state.weekStart==="mon"?"월요일":"일요일";
}
function renderPlayer(){
  const list=[...todayReviews(),...overdueReviews()];
  if(!list.length){$("#playerTitle").textContent="오늘 복습 없음";$("#playerSub").textContent="진도를 추가하면 자동으로 표시됨";return}
  taskIndex=(taskIndex+list.length)%list.length; const it=list[taskIndex];
  $("#playerTitle").textContent=`${it.subject} · ${it.name}`;
  $("#playerSub").textContent=`${it.cycle}일 복습 · ${taskIndex+1}/${list.length}`;
}
function currentPlayerItem(){const list=[...todayReviews(),...overdueReviews()]; return list.length?list[(taskIndex+list.length)%list.length]:null}

function bind(){
  $$(".nav-tab").forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
  $("#openDrawer").onclick=()=>toggleDrawer(true); $("#closeDrawer").onclick=()=>toggleDrawer(false); $("#drawerDim").onclick=()=>toggleDrawer(false);
  $("#newSubjectBtn").onclick=()=>subjectOptions(true);
  const newBookBtn=$("#newBookBtn"); if(newBookBtn) newBookBtn.onclick=()=>bookOptions(true);
  const subjectAddStudy=$("#subjectAddStudy"); if(subjectAddStudy) subjectAddStudy.onclick=()=>openStudy(null, currentSubject==="전체"?null:currentSubject);
  const subjectAddClass=$("#subjectAddClass"); if(subjectAddClass) subjectAddClass.onclick=()=>openClass(null, currentSubject==="전체"?null:currentSubject);
  const subjectSaveNote=$("#subjectSaveNote"); if(subjectSaveNote) subjectSaveNote.onclick=saveSubjectNote;
  const subjectCoverBtn=$("#subjectCoverBtn"); if(subjectCoverBtn) subjectCoverBtn.onclick=()=>coverOptions("subject");
  const subjectCoverInput=$("#subjectCoverInput"); if(subjectCoverInput) subjectCoverInput.onchange=loadSubjectCover;
  const bookCoverBtn=$("#bookCoverBtn"); if(bookCoverBtn) bookCoverBtn.onclick=()=>coverOptions("book");
  const bookCoverInput=$("#bookCoverInput"); if(bookCoverInput) bookCoverInput.onchange=loadBookCover;
  const bookSaveRecord=$("#bookSaveRecord"); if(bookSaveRecord) bookSaveRecord.onclick=saveBookRecord;
  const bookBackSubject=$("#bookBackSubject"); if(bookBackSubject) bookBackSubject.onclick=()=>showSubjectPage(currentSubject==="전체"?state.subjects[0]:currentSubject);
  $("#prevMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()-1);renderCalendar()};
  $("#nextMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()+1);renderCalendar()};
  $("#calendarSubject").onchange=e=>{currentSubject=e.target.value;renderDrawer();renderCalendar();renderSelected()};
  $("#homeAddStudy").onclick=()=>openStudy(); $("#addStudyBtn").onclick=()=>openStudy();
  const printA4Btn=$("#printA4Btn"); if(printA4Btn) printA4Btn.onclick=()=>window.print();
  $("#homeAddClass").onclick=()=>openClass(); $("#addClassBtn").onclick=()=>openClass(); $("#homeAddEvent").onclick=()=>openEvent(); $("#addEventBtn").onclick=()=>openEvent();
  $("#studySubject").onchange=e=>{updateStudyBookOptions(e.target.value); $("#studyGoal").value=state.subjectGoals[e.target.value]||""};
  $("#saveStudyBtn").onclick=saveStudy; $("#saveClassBtn").onclick=saveClass; $("#deleteClassBtn").onclick=deleteClassFromModal;
  $("#addDdayBtn").onclick=()=>openDday(); $("#saveDdayBtn").onclick=saveDday;
  $("#coverBtn").onclick=()=>$("#coverInput").click(); $("#coverInput").onchange=loadCover;
  $("#scoreBtn").onclick=scoreOptions;
  $("#prevTask").onclick=()=>{taskIndex--;renderPlayer()}; $("#nextTask").onclick=()=>{taskIndex++;renderPlayer()};
  $("#toggleCurrentDone").onclick=()=>{const it=currentPlayerItem(); if(it) toggleDone(it.rid)};
  $("#playerGo").onclick=()=>{const it=currentPlayerItem(); if(it) focusItemDate(it.date||today())};
  $("#cycleSetting").onclick=cycleOptions; $("#ddaySetting").onclick=ddayOptions;
  $("#scoreSetting").onclick=scoreOptions; $("#quoteSetting").onclick=quoteOptions; $("#themeSetting").onclick=themeOptions; $("#fontSetting").onclick=fontOptions; $("#animSetting").onclick=animOptions; $("#weekStartSetting").onclick=weekStartOptions;
  $("#exportBtn").onclick=exportData; $("#importInput").onchange=importData; $("#resetBtn").onclick=resetData;
  $$(".close").forEach(b=>b.onclick=()=>close(b.dataset.close));
  $$(".modal-backdrop").forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove("show")});
}
function showScreen(id){$$(".nav-tab").forEach(x=>x.classList.toggle("active",x.dataset.screen===id)); $$(".screen").forEach(s=>s.classList.toggle("active",s.id===id)); setTimeout(updateNavPill,20)}
function toggleDrawer(open){$("#drawer").classList.toggle("open",open);$("#drawerDim").classList.toggle("show",open);document.body.classList.toggle("drawer-open",open)}
window.selectSubject=s=>{currentSubject=s; currentBook=null; toggleDrawer(false); showSubjectPage(s)}
window.selectBook=(b,subj=null)=>{currentBook=b; if(subj) currentSubject=subj; toggleDrawer(false); showBookPage(b)}

function bookName(b){return typeof b==="string"?b:b.name}
function bookSubject(b){return typeof b==="string"?"":(b.subject||"")}
function bookKey(subj,name){return `${subj}::${name}`}
const coverColors=["music","midnight","ocean","forest","neon","sunset","paper","obsidian","charcoal","snow","latte","mint","rose","deep"];
function coverColorStyle(kind,key){
  const map={
music:"linear-gradient(135deg,#636d92,#56617f,#ffffff)",
midnight:"linear-gradient(135deg,#111827,#020617,#93c5fd)",
ocean:"linear-gradient(135deg,#082f49,#0f766e,#67e8f9)",
forest:"linear-gradient(135deg,#052e16,#166534,#86efac)",
neon:"linear-gradient(135deg,#2e1065,#7c3aed,#c084fc)",
sunset:"linear-gradient(135deg,#431407,#ea580c,#f9a8d4)",
paper:"linear-gradient(135deg,#f8fafc,#ffffff,#cbd5e1)",
obsidian:"linear-gradient(135deg,#0a0a0a,#171717,#525252)",
charcoal:"linear-gradient(135deg,#1f2937,#374151,#9ca3af)",
snow:"linear-gradient(135deg,#ffffff,#f3f4f6,#d1d5db)",
latte:"linear-gradient(135deg,#faf7f2,#e7d7c1,#b08968)",
mint:"linear-gradient(135deg,#ecfdf5,#a7f3d0,#34d399)",
rose:"linear-gradient(135deg,#fff1f2,#fecdd3,#fb7185)",
deep:"linear-gradient(135deg,#172554,#1e3a8a,#60a5fa)"
};
  const store=kind==="subject"?state.subjectCoverColors:state.bookCoverColors;
  const c=store?.[key]||"";
  return c && map[c] ? map[c] : "";
}

function calendarColorForSubject(subject){
  const solid={
    music:"#636d92",
    midnight:"#93c5fd",
    black:"#a3a3a3",
    obsidian:"#525252",
    charcoal:"#9ca3af",
    sky:"#38bdf8",
    cream:"#b08968",
    forest:"#86efac",
    lilac:"#c084fc",
    mono:"#737373",
    snow:"#94a3b8",
    latte:"#b08968",
    mint:"#34d399",
    rose:"#fb7185",
    ocean:"#67e8f9",
    neon:"#c084fc",
    sunset:"#fb7185",
    paper:"#64748b",
    deep:"#60a5fa"
  };
  const id=state.subjectCoverColors?.[subject] || state.appearance?.theme || "";
  return solid[id] || "";
}
function calendarMark(it){
  const cls=`mark ${it.done?"done":it.kind==="event"?"event":it.kind==="class"?"class":it.kind==="review"?"review":""}`;
  const color=(it.kind==="study"||it.kind==="review"||it.kind==="class") ? calendarColorForSubject(it.subject) : "";
  return `<span class="${cls}"${color?` style="background:${color}"`:""}></span>`;
}

function coverStyle(kind,key,img){
  if(img) return `style="background-image:url('${img}')"`;
  const bg=coverColorStyle(kind,key);
  return bg ? `style="background:${bg}"` : "";
}
function booksForSubject(subj){return (state.books||[]).filter(b=>bookSubject(b)===subj)}
function booksForDrawer(){
  // 왼쪽 서랍의 교재 목록은 항상 전체 교재를 보여준다.
  // 예전처럼 현재 과목으로 필터링하면 다른 과목 교재가 잠깐 사라진 것처럼 보인다.
  return state.books||[];
}
function recordsForBook(book,subj=currentSubject){state.bookRecords ||= {}; return state.bookRecords[bookKey(subj||"",book)] ||= []}
function subjectNotesFor(subj){
  state.subjectNotes ||= {};
  const raw=state.subjectNotes[subj];
  if(Array.isArray(raw)) return raw;
  if(typeof raw==="string" && raw.trim()){
    state.subjectNotes[subj]=[{id:uid(),date:today(),text:raw.trim()}];
    return state.subjectNotes[subj];
  }
  state.subjectNotes[subj]=[];
  return state.subjectNotes[subj];
}
function studyBooksForSubject(subj){return booksForSubject(subj).map(bookName)}
function updateStudyBookOptions(subject, selectedBook=""){
  const sel=$("#studyBook"); if(!sel) return;
  const books=studyBooksForSubject(subject);
  sel.innerHTML=`<option value="">교재 선택 안 함</option>`;
  books.forEach(b=>sel.append(new Option(b,b)));
  sel.value=selectedBook && books.includes(selectedBook)? selectedBook : "";
}
function renderSubjectPage(){
  const page=$("#subjectPage"); if(!page) return;
  const s=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const title=$("#subjectPageTitle"); if(title) title.textContent=s;
  const sub=$("#subjectPageSub"); if(sub) sub.textContent=`${countStudies(s)}개 진도 · ${monthClassCount(s)}개 수업`;
  const cover=$("#subjectCoverPreview"); if(cover) applyCoverToElement(cover,"subject",s,state.subjectCovers?.[s]);
  const note=$("#subjectNoteInput"); if(note && document.activeElement!==note) note.value="";
  const noteList=$("#subjectNoteList");
  if(noteList){
    const notes=subjectNotesFor(s).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    noteList.innerHTML=notes.length?notes.map(n=>`<div class="item-row"><div class="item-main"><div class="row-title">${esc(n.text)}</div><div class="row-sub">${esc(n.date||"")}</div></div><div class="row-actions"><button onclick="editSubjectNote('${esc(s)}','${n.id}')">수정</button><button onclick="removeSubjectNote('${esc(s)}','${n.id}')">삭제</button></div></div>`).join(""):`<div class="empty">아직 과목 메모 기록이 없음.</div>`;
  }
  const list=$("#subjectBookList");
  if(list){
    const books=booksForSubject(s);
    list.innerHTML=books.length?books.map((bb,i)=>{
      const b=bookName(bb), key=bookKey(s,b);
      const c=coverStyle("book", key, state.bookCovers?.[key] || state.bookCovers?.[b]);
      const n=recordsForBook(b,s).length;
      return `<div class="playlist subject-book-card" data-book="${esc(b)}" data-index="${i}">
        <div class="play-art playlist-cover-preview" ${c}></div>
        <button class="playlist-main" onclick="selectBook('${esc(b)}','${esc(s)}')">
          <div><div class="play-title">${esc(b)}</div><div class="play-sub">${n}개 기록</div></div>
        </button>
      </div>`;
    }).join(""):`<div class="empty">아직 이 과목 교재가 없음. 왼쪽에서 새로운 교재를 추가해줘.</div>`;
  }
  const timeline=$("#subjectTimeline");
  if(timeline){
    const studies=state.studies.filter(x=>x.subject===s).slice().sort((a,b)=>b.date.localeCompare(a.date));
    timeline.innerHTML=studies.length?studies.map(st=>`<div class="item-row"><div class="item-main"><div class="row-title">${esc(st.name)}</div><div class="row-sub">${st.date}${st.book?` · ${esc(st.book)}`:""}${st.memo?` · ${esc(st.memo)}`:""}</div></div><div class="row-actions"><button onclick="openStudy('${st.id}')">수정</button></div></div>`).join(""):`<div class="empty">아직 진도 기록이 없음.</div>`;
  }
}
function showSubjectPage(s){currentSubject=s; currentBook=null; renderSubjectPage(); showScreen("subjectPage")}
window.showSubjectPage=showSubjectPage;
function saveSubjectNote(){
  const s=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const text=$("#subjectNoteInput").value.trim();
  if(!text) return alert("메모 내용을 입력해줘.");
  subjectNotesFor(s).push({id:uid(),date:today(),text});
  $("#subjectNoteInput").value="";
  save(); toast("과목 메모 저장됨"); renderSubjectPage();
}
window.editSubjectNote=(subj,id)=>{
  const arr=subjectNotesFor(subj); const n=arr.find(x=>x.id===id); if(!n) return;
  const text=prompt("메모 수정", n.text||""); if(text===null) return;
  n.text=text.trim(); if(!n.text){ state.subjectNotes[subj]=arr.filter(x=>x.id!==id); }
  save(); renderSubjectPage();
}
window.removeSubjectNote=(subj,id)=>{
  if(!confirm("이 메모를 삭제할까?")) return;
  state.subjectNotes[subj]=subjectNotesFor(subj).filter(x=>x.id!==id);
  save(); renderSubjectPage();
}
function loadSubjectCover(e){
  const f=e.target.files[0]; if(!f) return;
  const s=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  resizeImage(f,720,0.82).then(data=>{state.subjectCovers[s]=data; save(); render(); toast("과목 표지 저장됨");}).catch(()=>alert("이미지를 불러오지 못했어."));
  e.target.value="";
}

function applyCoverToElement(el,kind,key,img){
  if(!el) return;
  el.style.backgroundImage="";
  el.style.background="";
  if(img){el.style.backgroundImage=`url(${img})`;return;}
  const bg=coverColorStyle(kind,key);
  if(bg) el.style.background=bg;
}
function resizeImage(file,max=720,quality=.82){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")) return reject(new Error("not image"));
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.onerror=reject;
      img.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function coverOptions(kind){
  const isBook=kind==="book";
  const subj=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const b=currentBook || (booksForSubject(subj)[0]?bookName(booksForSubject(subj)[0]):"");
  if(isBook&&!b) return alert("교재를 먼저 추가해줘.");
  const key=isBook?bookKey(subj,b):subj;
  const title=isBook?`${b} 표지 변경`:`${subj} 표지 변경`;
  const colorButtons=coverColors.map(c=>`<button class="cover-color-option ${((isBook?state.bookCoverColors:state.subjectCoverColors)?.[key]===c)?"active":""}" data-color="${c}" onclick="setCoverColor('${kind}','${esc(key)}','${c}')"><span class="cover-swatch cover-${c}"></span>${c}</button>`).join("");
  option(title,`<div class="soft" style="margin-bottom:12px">사진을 넣거나 색 표지를 고를 수 있어. 사진 삭제를 누르면 기본 표지로 돌아감.</div><button class="primary" onclick="pickCoverImage('${kind}')">사진 변경</button><button class="secondary danger-text" onclick="deleteCoverImage('${kind}','${esc(key)}')">사진 삭제 / 기본 표지로</button><label>색 표지</label><div class="cover-color-grid">${colorButtons}</div>`);
}
window.pickCoverImage=(kind)=>{close("optionModal"); setTimeout(()=>$(kind==="book"?"#bookCoverInput":"#subjectCoverInput")?.click(),60)}
window.deleteCoverImage=(kind,key)=>{
  if(kind==="book"){delete state.bookCovers[key]; delete state.bookCoverColors[key];}
  else {delete state.subjectCovers[key]; delete state.subjectCoverColors[key];}
  save(); close("optionModal"); render(); toast("기본 표지로 돌아감");
}
window.setCoverColor=(kind,key,color)=>{
  if(kind==="book"){state.bookCoverColors[key]=color; delete state.bookCovers[key];}
  else {state.subjectCoverColors[key]=color; delete state.subjectCovers[key];}
  save(); close("optionModal"); render(); toast("표지 색 저장됨");
}
function loadBookCover(e){
  const f=e.target.files[0]; if(!f) return;
  const subj=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const b=currentBook || (booksForSubject(subj)[0]?bookName(booksForSubject(subj)[0]):null);
  if(!b) return alert("교재를 먼저 추가해줘.");
  const key=bookKey(subj,b);
  resizeImage(f,720,0.82).then(data=>{state.bookCovers[key]=data; save(); render(); toast("교재 표지 저장됨");}).catch(()=>alert("이미지를 불러오지 못했어."));
  e.target.value="";
}

function showBookPage(b){currentBook=b; renderBookPage(); showScreen("bookPage")}
window.showBookPage=showBookPage;
function renderBookPage(){
  const page=$("#bookPage"); if(!page) return;
  const subj=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const b=currentBook || (booksForSubject(subj)[0]?bookName(booksForSubject(subj)[0]):"교재");
  const title=$("#bookPageTitle"); if(title) title.textContent=b;
  const sub=$("#bookPageSub"); if(sub) sub.textContent=`${subj} · ${recordsForBook(b,subj).length}개 기록`;
  const cover=$("#bookCoverPreview"); if(cover) applyCoverToElement(cover,"book",bookKey(subj,b),state.bookCovers?.[bookKey(subj,b)]);
  const list=$("#bookRecordList");
  if(list){
    const arr=recordsForBook(b,subj).slice().sort((a,b)=>b.date.localeCompare(a.date));
    list.innerHTML=arr.length?arr.map(r=>`<div class="item-row"><div class="item-main"><div class="row-title">${esc(r.range||"문제 기록")}</div><div class="row-sub">${r.date}${r.memo?` · ${esc(r.memo)}`:""}</div></div><div class="row-actions"><button onclick="removeBookRecord('${esc(subj)}','${esc(b)}','${r.id}')">삭제</button></div></div>`).join(""):`<div class="empty">아직 문제 기록이 없음.</div>`;
  }
  const date=$("#bookRecordDate"); if(date && !date.value) date.value=today();
}
function saveBookRecord(){
  const subj=currentSubject!=="전체"?currentSubject:(state.subjects[0]||"과목");
  const b=currentBook || (booksForSubject(subj)[0]?bookName(booksForSubject(subj)[0]):null); if(!b) return alert("교재를 먼저 추가해줘.");
  const date=$("#bookRecordDate").value||today(), range=$("#bookRecordRange").value.trim(), memo=$("#bookRecordMemo").value.trim();
  if(!range&&!memo) return alert("범위나 메모를 입력해줘.");
  recordsForBook(b,subj).push({id:uid(),date,range,memo});
  $("#bookRecordRange").value=""; $("#bookRecordMemo").value="";
  save(); renderBookPage(); renderDrawer(); toast("교재 기록 저장됨");
}
window.removeBookRecord=(subj,b,id)=>{state.bookRecords[bookKey(subj,b)]=recordsForBook(b,subj).filter(x=>x.id!==id); save(); renderBookPage(); renderDrawer()}

window.focusItemDate=k=>{selected=k; viewDate=parse(k); showScreen("calendar"); render()}

function openStudy(id=null, presetSubject=null){
  const st=state.studies.find(x=>x.id===id);
  $("#studyModalTitle").textContent=st?"진도 수정":"진도 추가";
  const subject=st?.subject||presetSubject||(currentSubject==="전체"?state.subjects[0]:currentSubject);
  $("#studyId").value=st?.id||""; $("#studyDate").value=st?.date||selected; $("#studySubject").value=subject;
  updateStudyBookOptions(subject, st?.book||"");
  $("#studyName").value=st?.name||""; $("#studyGoal").value=state.subjectGoals[$("#studySubject").value]||""; if($("#studyReviewEnabled")) $("#studyReviewEnabled").value=reviewEnabledFor(st)?"true":"false"; $("#studyMemo").value=st?.memo||""; $("#studyModal").classList.add("show");
}
window.openStudy=openStudy;
function saveStudy(){
  const id=$("#studyId").value, date=$("#studyDate").value, subject=$("#studySubject").value, book=$("#studyBook")?$("#studyBook").value:"", name=$("#studyName").value.trim(), memo=$("#studyMemo").value.trim(), goal=parseInt($("#studyGoal").value), reviewEnabled=$("#studyReviewEnabled")?$("#studyReviewEnabled").value!=="false":true;
  if(!date||!subject||!name)return alert("날짜, 과목, 강의명을 입력해줘.");
  if(goal>0) state.subjectGoals[subject]=goal;
  if(id){const st=state.studies.find(x=>x.id===id); Object.assign(st,{date,subject,book,name,memo,reviewEnabled});}
  else state.studies.push({id:uid(),date,subject,book,name,memo,reviewEnabled});
  currentSubject=subject; selected=date; viewDate=parse(date); save(); close("studyModal"); render();
}

function openClass(id=null, presetSubject=null){
  const cls=state.classes.find(x=>x.id===id);
  $("#classModalTitle").textContent=cls?"수업 일정 수정":"수업 일정 추가";
  $("#classId").value=cls?.id||""; $("#classDate").value=cls?.date||selected;
  $("#classSubject").value=cls?.subject||presetSubject||(currentSubject==="전체"?state.subjects[0]:currentSubject);
  $("#className").value=cls?.name||""; $("#classStart").value=cls?.startTime||""; $("#classEnd").value=cls?.endTime||"";
  $("#classRepeat").value=cls?.repeat||"none"; $("#classUntil").value=cls?.until||""; $("#classMemo").value=cls?.memo||"";
  $("#deleteClassBtn").classList.toggle("hidden",!cls);
  $("#classModal").classList.add("show");
}
window.openClass=openClass;
function saveClass(){
  const id=$("#classId").value;
  const cls={date:$("#classDate").value,subject:$("#classSubject").value,name:$("#className").value.trim(),startTime:$("#classStart").value,endTime:$("#classEnd").value,repeat:$("#classRepeat").value,until:$("#classUntil").value,memo:$("#classMemo").value.trim()};
  if(!cls.date||!cls.subject||!cls.name)return alert("날짜, 과목, 수업명을 입력해줘.");
  if(cls.repeat!=="none"&&!cls.until) cls.until=add(cls.date,90);
  if(id) Object.assign(state.classes.find(x=>x.id===id),cls);
  else state.classes.push({id:uid(),...cls});
  currentSubject=cls.subject; selected=cls.date; viewDate=parse(cls.date); save(); close("classModal"); render();
}
function deleteClassFromModal(){
  const id=$("#classId").value; if(!id)return;
  if(!confirm("이 수업 일정을 삭제할까? 반복 수업이면 전체 반복이 삭제돼."))return;
  state.classes=state.classes.filter(x=>x.id!==id); save(); close("classModal"); render();
}

function openEvent(id=null){
  const ev=state.events.find(x=>x.id===id);
  $("#eventModalTitle").textContent=ev?"일정 수정":"일정 추가";
  $("#eventId").value=ev?.id||"";
  $("#eventDate").value=ev?.date||selected;
  $("#eventName").value=ev?.name||"";
  $("#eventStart").value=ev?.startTime||"";
  $("#eventEnd").value=ev?.endTime||"";
  $("#eventRepeat").value=ev?.repeat||"none";
  $("#eventUntil").value=ev?.until||"";
  $("#eventMemo").value=ev?.memo||"";
  $("#deleteEventBtn").classList.toggle("hidden",!ev);
  $("#eventModal").classList.add("show");
}
window.openEvent=openEvent;
function saveEvent(){
  const id=$("#eventId").value;
  const ev={date:$("#eventDate").value,name:$("#eventName").value.trim(),startTime:$("#eventStart").value,endTime:$("#eventEnd").value,repeat:$("#eventRepeat").value,until:$("#eventUntil").value,memo:$("#eventMemo").value.trim()};
  if(!ev.date||!ev.name)return alert("날짜와 일정명을 입력해줘.");
  if(ev.repeat!=="none"&&!ev.until) ev.until=add(ev.date,90);
  if(id) Object.assign(state.events.find(x=>x.id===id),ev);
  else state.events.push({id:uid(),...ev});
  selected=ev.date; viewDate=parse(ev.date); save(); close("eventModal"); render();
}
function deleteEventFromModal(){
  const id=$("#eventId").value; if(!id)return;
  if(!confirm("이 일정을 삭제할까? 반복 일정이면 전체 반복이 삭제돼."))return;
  state.events=state.events.filter(x=>x.id!==id);
  save(); close("eventModal"); render();
}

function openDday(id=null){
  const d=state.ddays.find(x=>x.id===id); $("#ddayModalTitle").textContent=d?"D-Day 수정":"D-Day 추가";
  $("#ddayId").value=d?.id||""; $("#ddayName").value=d?.name||""; $("#ddayDate").value=d?.date||""; $("#ddayStart").value=d?.start||today(); $("#ddayModal").classList.add("show");
}
window.openDday=openDday;
function saveDday(){const id=$("#ddayId").value,name=$("#ddayName").value.trim(),date=$("#ddayDate").value,start=$("#ddayStart").value||today(); if(!name||!date)return alert("이름과 날짜를 입력해줘."); if(id){Object.assign(state.ddays.find(x=>x.id===id),{name,date,start})} else state.ddays.push({id:uid(),name,date,start}); save(); close("ddayModal"); render()}
function close(id){$("#"+id).classList.remove("show")}

function toggleDone(rid){state.completed[rid]=!state.completed[rid];save();render()}
window.toggleDone=toggleDone;

function deleteStudyFromCalendar(id){
  const st=state.studies.find(x=>x.id===id);
  if(!st) return;
  if(!confirm(`이 진도 기록을 삭제할까? 해당 진도에서 생긴 복습도 같이 사라져.`)) return;
  state.studies=state.studies.filter(x=>x.id!==id);
  state.cycles.forEach(c=>{
    const rid=`${id}:${c}`;
    if(state.completed) delete state.completed[rid];
    if(state.deletedReviews) delete state.deletedReviews[rid];
  });
  save(); render();
}
window.deleteStudyFromCalendar=deleteStudyFromCalendar;

function deleteReviewFromCalendar(rid){
  if(!rid) return;
  if(!confirm("이 복습 표시를 캘린더에서 삭제할까? 진도 기록은 유지돼.")) return;
  state.deletedReviews ||= {};
  state.deletedReviews[rid]=true;
  if(state.completed) delete state.completed[rid];
  save(); render();
}
window.deleteReviewFromCalendar=deleteReviewFromCalendar;

function option(title,html){$("#optionTitle").textContent=title;$("#optionBody").innerHTML=html;$("#optionModal").classList.add("show")}
function cycleOptions(){option("복습 주기",`<input id="cycleInput" value="${state.cycles.join(",")}" placeholder="1,3,7,14,28"><button class="primary" onclick="saveCycles()">저장</button>`)}
window.saveCycles=()=>{const arr=$("#cycleInput").value.split(",").map(x=>parseInt(x.trim())).filter(x=>x>0); if(!arr.length)return; state.cycles=[...new Set(arr)].sort((a,b)=>a-b); save(); close("optionModal"); render()}
function subjectOptions(addMode=false){
  option("과목 관리",`<div id="subjectManageList" class="manage-drag-list">${state.subjects.map((s,i)=>`<div class="manage-row draggable-manage-row" data-index="${i}"><button class="manage-drag-handle" title="드래그해서 순서 변경" aria-label="드래그해서 순서 변경">☰</button><strong>${esc(s)}</strong><button onclick="renameSubject('${esc(s)}')">수정</button><button onclick="removeSubject('${esc(s)}')">삭제</button></div>`).join("")}</div><input id="newSub" placeholder="새 과목"><button class="primary" onclick="addSubject()">추가</button>`);
  initManageDrag("#subjectManageList", state.subjects, ()=>{save(); subjectOptions(false); render();}, "과목 순서 저장됨");
  if(addMode) setTimeout(()=>$("#newSub").focus(),50);
}
window.addSubject=()=>{let s=$("#newSub").value.trim(); if(s&&!state.subjects.includes(s)){state.subjects.push(s); state.subjectGoals[s]=0;} save(); close("optionModal"); render()}
window.renameSubject=(old)=>{let n=prompt("새 과목명",old); if(!n)return; state.subjects=state.subjects.map(s=>s===old?n:s); state.studies.forEach(st=>{if(st.subject===old)st.subject=n}); state.classes.forEach(c=>{if(c.subject===old)c.subject=n}); state.books.forEach(b=>{if(bookSubject(b)===old)b.subject=n}); state.subjectGoals[n]=state.subjectGoals[old]||0; delete state.subjectGoals[old]; if(state.subjectCovers?.[old]){state.subjectCovers[n]=state.subjectCovers[old]; delete state.subjectCovers[old];} if(state.subjectCoverColors?.[old]){state.subjectCoverColors[n]=state.subjectCoverColors[old]; delete state.subjectCoverColors[old];} if(state.bookRecords){Object.keys(state.bookRecords).forEach(k=>{if(k.startsWith(old+"::")){const nk=n+k.slice(old.length); state.bookRecords[nk]=state.bookRecords[k]; delete state.bookRecords[k];}})} if(state.bookCovers){Object.keys(state.bookCovers).forEach(k=>{if(k.startsWith(old+"::")){const nk=n+k.slice(old.length); state.bookCovers[nk]=state.bookCovers[k]; delete state.bookCovers[k];}})} if(state.bookCoverColors){Object.keys(state.bookCoverColors).forEach(k=>{if(k.startsWith(old+"::")){const nk=n+k.slice(old.length); state.bookCoverColors[nk]=state.bookCoverColors[k]; delete state.bookCoverColors[k];}})} if(currentSubject===old) currentSubject=n; save(); close("optionModal"); render()}
window.removeSubject=(s)=>{if(!confirm(`${s} 삭제? 해당 과목의 진도, 수업, 교재도 같이 삭제됨.`))return; state.subjects=state.subjects.filter(x=>x!==s); state.studies=state.studies.filter(x=>x.subject!==s); state.classes=state.classes.filter(x=>x.subject!==s); state.books=state.books.filter(b=>bookSubject(b)!==s); delete state.subjectGoals[s]; if(state.subjectCovers) delete state.subjectCovers[s]; if(state.subjectCoverColors) delete state.subjectCoverColors[s]; if(state.bookRecords){Object.keys(state.bookRecords).forEach(k=>{if(k.startsWith(s+"::")) delete state.bookRecords[k];})} if(state.bookCovers){Object.keys(state.bookCovers).forEach(k=>{if(k.startsWith(s+"::")) delete state.bookCovers[k];})} if(state.bookCoverColors){Object.keys(state.bookCoverColors).forEach(k=>{if(k.startsWith(s+"::")) delete state.bookCoverColors[k];})} if(currentSubject===s) currentSubject="전체"; save(); close("optionModal"); render()}
window.moveSubject=(i,dir)=>{const j=i+dir; if(j<0||j>=state.subjects.length)return; [state.subjects[i],state.subjects[j]]=[state.subjects[j],state.subjects[i]]; save(); close("optionModal"); subjectOptions()}
function bookOptions(addMode=false){
  state.books ||= [];
  const preferred=currentSubject!=="전체"?currentSubject:"";
  const books=state.books;
  const subjectOptions=`<option value="" ${preferred?"":"selected"} disabled>과목 선택</option>`+state.subjects.map(s=>`<option value="${esc(s)}" ${s===preferred?"selected":""}>${esc(s)}</option>`).join("");
  const rowSubjectOptions=(current)=>state.subjects.map(s=>`<option value="${esc(s)}" ${s===current?"selected":""}>${esc(s)}</option>`).join("");
  option(`교재 관리`,`<div class="soft" style="margin-bottom:10px">교재 이름과 소속 과목을 여기서 확인/수정해. 왼쪽 서랍은 전체 교재를 항상 보여주게 바꿨어.</div><label>교재명</label><input id="newBook" placeholder="새 교재"><label>과목 선택</label><select id="bookSubjectSelect">${subjectOptions}</select><button class="primary" onclick="addBook()">추가</button><div class="soft" style="margin:16px 0 8px">교재 순서 변경</div><div id="bookManageList" class="manage-drag-list">${books.map((bb,i)=>{const name=bookName(bb), subj=bookSubject(bb); return `<div class="manage-row draggable-manage-row" data-index="${i}"><button class="manage-drag-handle" title="드래그해서 순서 변경" aria-label="드래그해서 순서 변경">☰</button><strong>${esc(name)}</strong><select class="mini-select" onchange="changeBookSubject(${i}, this.value)"><option value="" ${subj?"":"selected"} disabled>과목 미지정</option>${rowSubjectOptions(subj)}</select><button onclick="renameBookByIndex(${i})">이름</button><button onclick="removeBookByIndex(${i})">삭제</button></div>`}).join("")}</div>`);
  initManageDrag("#bookManageList", books, ()=>{ save(); bookOptions(false); render(); }, "교재 순서 저장됨");
  if(addMode) setTimeout(()=>$("#newBook")?.focus(),50);
}
window.addBook=()=>{
  const subj=$("#bookSubjectSelect")?.value||"";
  const b=$("#newBook")?.value.trim();
  if(!b) return alert("교재명을 입력해줘.");
  if(!subj) return alert("과목을 선택해줘.");
  if(!state.subjects.includes(subj)) return alert("존재하는 과목을 선택해줘.");
  if(booksForSubject(subj).some(x=>bookName(x)===b)) return alert("이미 이 과목에 같은 이름의 교재가 있어.");
  state.books.push({name:b,subject:subj});
  currentSubject=subj; currentBook=null;
  save(); close("optionModal"); render();
}
window.renameBook=(subj,old)=>{let n=prompt("새 교재명",old); if(!n)return; state.books=state.books.map(b=>bookSubject(b)===subj&&bookName(b)===old?{name:n,subject:subj}:b); const oldKey=bookKey(subj,old), newKey=bookKey(subj,n); if(state.bookCovers?.[oldKey]){state.bookCovers[newKey]=state.bookCovers[oldKey]; delete state.bookCovers[oldKey];} if(state.bookCoverColors?.[oldKey]){state.bookCoverColors[newKey]=state.bookCoverColors[oldKey]; delete state.bookCoverColors[oldKey];} if(state.bookRecords?.[oldKey]){state.bookRecords[newKey]=state.bookRecords[oldKey]; delete state.bookRecords[oldKey];} if(currentBook===old) currentBook=n; save(); close("optionModal"); render()}
window.removeBook=(subj,b)=>{if(!confirm(`${b} 삭제?`))return; state.books=state.books.filter(x=>!(bookSubject(x)===subj&&bookName(x)===b)); const key=bookKey(subj,b); if(state.bookCovers) delete state.bookCovers[key]; if(state.bookCoverColors) delete state.bookCoverColors[key]; if(state.bookRecords) delete state.bookRecords[key]; if(currentBook===b) currentBook=null; save(); close("optionModal"); render()}

window.renameBookByIndex=(i)=>{
  const b=state.books[i]; if(!b) return;
  const subj=bookSubject(b), old=bookName(b);
  let n=prompt("새 교재명",old); if(!n)return; n=n.trim(); if(!n)return;
  if(booksForSubject(subj).some((x,idx)=>bookName(x)===n && state.books.indexOf(x)!==i)) return alert("이미 이 과목에 같은 이름의 교재가 있어.");
  b.name=n;
  const oldKey=bookKey(subj,old), newKey=bookKey(subj,n);
  if(state.bookCovers?.[oldKey]){state.bookCovers[newKey]=state.bookCovers[oldKey]; delete state.bookCovers[oldKey];} if(state.bookCoverColors?.[oldKey]){state.bookCoverColors[newKey]=state.bookCoverColors[oldKey]; delete state.bookCoverColors[oldKey];}
  if(state.bookRecords?.[oldKey]){state.bookRecords[newKey]=state.bookRecords[oldKey]; delete state.bookRecords[oldKey];}
  if(currentBook===old) currentBook=n;
  save(); bookOptions(false); render();
}
window.changeBookSubject=(i,newSubj)=>{
  const b=state.books[i]; if(!b||!newSubj||!state.subjects.includes(newSubj)) return;
  const oldSubj=bookSubject(b), name=bookName(b);
  if(oldSubj===newSubj) return;
  if(booksForSubject(newSubj).some(x=>bookName(x)===name)) return alert("이 과목에 같은 이름의 교재가 이미 있어.");
  b.subject=newSubj;
  const oldKey=bookKey(oldSubj,name), newKey=bookKey(newSubj,name);
  if(state.bookCovers?.[oldKey]){state.bookCovers[newKey]=state.bookCovers[oldKey]; delete state.bookCovers[oldKey];} if(state.bookCoverColors?.[oldKey]){state.bookCoverColors[newKey]=state.bookCoverColors[oldKey]; delete state.bookCoverColors[oldKey];}
  if(state.bookRecords?.[oldKey]){state.bookRecords[newKey]=state.bookRecords[oldKey]; delete state.bookRecords[oldKey];}
  if(currentBook===name) currentSubject=newSubj;
  save(); bookOptions(false); render();
}
window.removeBookByIndex=(i)=>{
  const b=state.books[i]; if(!b) return;
  removeBook(bookSubject(b), bookName(b));
}

function ddayOptions(){
  option("D-Day 관리",`<div id="ddayManageList" class="manage-drag-list">${state.ddays.map((d,i)=>`<div class="manage-row draggable-manage-row" data-index="${i}"><button class="manage-drag-handle" title="드래그해서 순서 변경" aria-label="드래그해서 순서 변경">☰</button><strong>${esc(d.name)}<br><span class="row-sub">${d.date}</span></strong><button onclick="openDdayFromSettings('${d.id}')">수정</button><button onclick="removeDday('${d.id}')">삭제</button></div>`).join("")}</div><button class="primary" onclick="openDdayFromSettings()">추가</button>`);
  initManageDrag("#ddayManageList", state.ddays, ()=>{save(); ddayOptions(); render();}, "D-Day 순서 저장됨");
}
window.openDdayFromSettings=(id=null)=>{close("optionModal");openDday(id)}
window.removeDday=id=>{state.ddays=state.ddays.filter(d=>d.id!==id);save();close("optionModal");render()}
window.moveDday=(i,dir)=>{const j=i+dir; if(j<0||j>=state.ddays.length)return; [state.ddays[i],state.ddays[j]]=[state.ddays[j],state.ddays[i]]; save(); close("optionModal"); ddayOptions()}

/* shared drag engine for settings/manage rows */
let __manageDrag = null;

function initManageDrag(listSelector, targetArray, onSave, message){
  const list = document.querySelector(listSelector);
  if(!list) return;

  [...list.querySelectorAll(".draggable-manage-row")].forEach((row)=>{
    const handle = row.querySelector(".manage-drag-handle");
    if(!handle) return;

    handle.onpointerdown = (e)=>{
      e.preventDefault();
      e.stopPropagation();

      const freshRows = [...list.querySelectorAll(".draggable-manage-row")];
      const startIndex = freshRows.indexOf(row);
      if(startIndex < 0) return;

      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      const placeholder = document.createElement("div");

      placeholder.className = "manage-row manage-drag-placeholder";
      placeholder.style.height = rect.height + "px";

      ghost.classList.add("manage-drag-ghost");
      ghost.style.width = rect.width + "px";
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";

      document.body.appendChild(ghost);
      row.parentNode.insertBefore(placeholder, row.nextSibling);
      row.classList.add("manage-drag-source-hidden");

      __manageDrag = {
        list, row, ghost, placeholder, startIndex, targetArray, onSave, message,
        offsetY: e.clientY - rect.top,
        pointerId: e.pointerId
      };

      try{ handle.setPointerCapture(e.pointerId); }catch{}

      window.addEventListener("pointermove", onManageDragMove, {passive:false});
      window.addEventListener("pointerup", onManageDragEnd, {passive:false});
      window.addEventListener("pointercancel", onManageDragEnd, {passive:false});
    };
  });
}

function onManageDragMove(e){
  if(!__manageDrag) return;
  e.preventDefault();

  const {list, ghost, placeholder, offsetY} = __manageDrag;
  const y = e.clientY;
  ghost.style.top = (y - offsetY) + "px";

  const rows = [...list.querySelectorAll(".draggable-manage-row:not(.manage-drag-source-hidden)")];
  let placed = false;

  for(const item of rows){
    const r = item.getBoundingClientRect();
    if(y < r.top + r.height / 2){
      list.insertBefore(placeholder, item);
      placed = true;
      break;
    }
  }
  if(!placed) list.appendChild(placeholder);
}

function onManageDragEnd(e){
  if(!__manageDrag) return;
  e.preventDefault();

  const {list, row, ghost, placeholder, startIndex, targetArray, onSave, message} = __manageDrag;

  const allSlots = [...list.children];
  let newIndex = allSlots.indexOf(placeholder);
  if(newIndex < 0) newIndex = startIndex;

  row.classList.remove("manage-drag-source-hidden");
  ghost.remove();
  placeholder.remove();

  if(startIndex >= 0 && startIndex < targetArray.length){
    const [moved] = targetArray.splice(startIndex, 1);
    if(newIndex > startIndex) newIndex--;
    newIndex = Math.max(0, Math.min(targetArray.length, newIndex));
    targetArray.splice(newIndex, 0, moved);
    if(typeof onSave === "function") onSave();
  }

  __manageDrag = null;

  window.removeEventListener("pointermove", onManageDragMove);
  window.removeEventListener("pointerup", onManageDragEnd);
  window.removeEventListener("pointercancel", onManageDragEnd);

  if(typeof toast === "function") toast(message || "순서 저장됨");
}

function scoreOptions(){option("최근 성적",`<input id="scoreTitle" placeholder="예) 6모"><textarea id="scoreBody" placeholder="예) 국어 3 / 수학 4 / 영어 2"></textarea><button class="primary" onclick="saveScore()">저장</button>${state.scores.map(s=>`<div class="score-row"><div class="score-main"><strong>${esc(s.title)}</strong><br>${esc(s.body)}</div><button onclick="deleteScore('${s.id}')">삭제</button></div>`).join("")||`<div class="empty">저장된 성적 없음</div>`}`)}
window.saveScore=()=>{const title=$("#scoreTitle").value.trim(), body=$("#scoreBody").value.trim(); if(!title&&!body)return; state.scores.unshift({id:uid(),title:title||"최근 성적",body,date:today()}); save(); close("optionModal"); render()}
window.deleteScore=id=>{if(!confirm("이 성적 기록을 삭제할까?"))return; state.scores=state.scores.filter(s=>s.id!==id); save(); scoreOptions(); render()}
function quoteOptions(){option("오늘의 문구",`<textarea id="quoteInput" placeholder="원할 때만 입력">${esc(state.quote.text)}</textarea><div class="option-grid"><button class="option ${state.quote.enabled?"active":""}" onclick="setQuoteVisible(true)">표시</button><button class="option ${!state.quote.enabled?"active":""}" onclick="setQuoteVisible(false)">숨김</button></div><button class="primary" onclick="saveQuote()">저장</button><button class="secondary danger-text" onclick="deleteQuote()">삭제</button>`)}
window.setQuoteVisible=v=>{state.quote.enabled=v; save(); render()}
window.saveQuote=()=>{state.quote.text=$("#quoteInput").value.trim(); state.quote.enabled=!!state.quote.text; save(); close("optionModal"); render()}
window.deleteQuote=()=>{state.quote={enabled:false,text:""}; save(); close("optionModal"); render()}
function themeOptions(){const opts=[["music","Music"],["midnight","Midnight"],["black","Black"],["obsidian","Obsidian"],["charcoal","Charcoal"],["sky","Sky"],["cream","Cream"],["forest","Forest"],["lilac","Lilac"],["mono","Mono"],["snow","Snow"],["latte","Latte"],["mint","Mint"],["rose","Rose"]]; option("테마",`<div class="option-grid">${opts.map(([id,name])=>`<button class="option ${state.appearance.theme===id?"active":""}" onclick="setTheme('${id}')">${name}</button>`).join("")}</div>`)}
window.setTheme=o=>{state.appearance.theme=o;save();applyAppearance();close("optionModal");render()}
function fontOptions(){const opts=["pretendard","apple","suit","serif"]; option("폰트",`<div class="option-grid">${opts.map(o=>`<button class="option ${state.appearance.font===o?"active":""}" onclick="setFont('${o}')">${o}</button>`).join("")}</div>`)}
window.setFont=o=>{state.appearance.font=o;save();applyAppearance();close("optionModal");render()}
function animOptions(){const opts=[["off","없음"],["normal","보통"],["slow","느림"],["dramatic","매우 느림"]]; option("창 페이드",`<div class="option-grid">${opts.map(([id,n])=>`<button class="option ${state.appearance.anim===id?"active":""}" onclick="setAnim('${id}')">${n}</button>`).join("")}</div>`)}
window.setAnim=o=>{state.appearance.anim=o;save();applyAppearance();close("optionModal");render()}
function weekStartOptions(){option("캘린더 시작 요일",`<div class="option-grid"><button class="option ${state.weekStart==="mon"?"active":""}" onclick="setWeekStart('mon')">월요일</button><button class="option ${state.weekStart==="sun"?"active":""}" onclick="setWeekStart('sun')">일요일</button></div>`)}
window.setWeekStart=o=>{state.weekStart=o;save();close("optionModal");render()}
function loadCover(e){const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{state.cover=r.result;save();renderCover()}; r.readAsDataURL(f)}
function exportData(){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="juheonoo-backup.json";a.click()}
function importData(e){const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{state=JSON.parse(r.result);save();applyAppearance();render();alert("복원 완료")}catch{alert("백업 파일을 확인해줘.")}}; r.readAsText(f)}
function resetData(){if(!confirm("모든 데이터를 삭제할까?"))return; localStorage.removeItem("juheonooV3"); location.reload()}

init();








/* v5.1 restored subject drag engine */
function initSubjectDrag(){
  initFinalSubjectDrag();
}

let __finalDrag = null;

function initFinalSubjectDrag(){
  const list = document.querySelector("#subjectDrawerList");
  if(!list) return;

  const cards = [...list.querySelectorAll(".playlist")];

  cards.forEach((card)=>{
    const handle = card.querySelector(".subject-drag-handle");
    if(!handle) return;

    handle.onpointerdown = (e)=>{
      e.preventDefault();
      e.stopPropagation();

      const freshCards = [...list.querySelectorAll(".playlist")];
      const startIndex = freshCards.indexOf(card);
      if(startIndex < 0) return;

      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      const placeholder = document.createElement("div");

      placeholder.className = "playlist drag-placeholder";
      placeholder.style.height = rect.height + "px";

      ghost.classList.add("drag-ghost");
      ghost.style.width = rect.width + "px";
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";

      document.body.appendChild(ghost);
      card.parentNode.insertBefore(placeholder, card.nextSibling);
      card.classList.add("drag-source-hidden");

      __finalDrag = {
        list,
        card,
        ghost,
        placeholder,
        startIndex,
        offsetY: e.clientY - rect.top,
        pointerId: e.pointerId
      };

      try{ handle.setPointerCapture(e.pointerId); }catch{}

      window.addEventListener("pointermove", onFinalDragMove, {passive:false});
      window.addEventListener("pointerup", onFinalDragEnd, {passive:false});
      window.addEventListener("pointercancel", onFinalDragEnd, {passive:false});
    };
  });
}

function onFinalDragMove(e){
  if(!__finalDrag) return;
  e.preventDefault();

  const {list, ghost, placeholder, offsetY} = __finalDrag;
  const y = e.clientY;
  ghost.style.top = (y - offsetY) + "px";

  const cards = [...list.querySelectorAll(".playlist:not(.drag-source-hidden):not(.drag-placeholder)")];
  let placed = false;

  for(const item of cards){
    const r = item.getBoundingClientRect();
    if(y < r.top + r.height / 2){
      list.insertBefore(placeholder, item);
      placed = true;
      break;
    }
  }
  if(!placed) list.appendChild(placeholder);
}

function onFinalDragEnd(e){
  if(!__finalDrag) return;
  e.preventDefault();

  const {list, card, ghost, placeholder, startIndex} = __finalDrag;

  const allSlots = [...list.children];
  let newIndex = allSlots.indexOf(placeholder);
  if(newIndex < 0) newIndex = startIndex;

  card.classList.remove("drag-source-hidden");
  ghost.remove();
  placeholder.remove();

  const arr = state.subjects;
  if(startIndex >= 0 && startIndex < arr.length){
    const [moved] = arr.splice(startIndex, 1);
    if(newIndex > startIndex) newIndex--;
    newIndex = Math.max(0, Math.min(arr.length, newIndex));
    arr.splice(newIndex, 0, moved);
    save();
  }

  __finalDrag = null;

  window.removeEventListener("pointermove", onFinalDragMove);
  window.removeEventListener("pointerup", onFinalDragEnd);
  window.removeEventListener("pointercancel", onFinalDragEnd);

  render();
  if(typeof toast === "function") toast("과목 순서 저장됨");
}


/* book drawer drag: same behavior as subject playlist */
let __bookDrag = null;
function initBookDrawerDrag(){
  const list = document.querySelector("#bookDrawerList");
  if(!list) return;
  const cards = [...list.querySelectorAll(".playlist")];
  cards.forEach((card)=>{
    const handle = card.querySelector(".subject-drag-handle");
    if(!handle) return;
    handle.onpointerdown = (e)=>{
      e.preventDefault(); e.stopPropagation();
      const freshCards = [...list.querySelectorAll(".playlist")];
      const startIndex = freshCards.indexOf(card);
      if(startIndex < 0) return;
      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      const placeholder = document.createElement("div");
      placeholder.className = "playlist drag-placeholder";
      placeholder.style.height = rect.height + "px";
      ghost.classList.add("drag-ghost");
      ghost.style.width = rect.width + "px";
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      document.body.appendChild(ghost);
      card.parentNode.insertBefore(placeholder, card.nextSibling);
      card.classList.add("drag-source-hidden");
      __bookDrag={list,card,ghost,placeholder,startIndex,offsetY:e.clientY-rect.top,pointerId:e.pointerId};
      try{ handle.setPointerCapture(e.pointerId); }catch{}
      window.addEventListener("pointermove", onBookDragMove, {passive:false});
      window.addEventListener("pointerup", onBookDragEnd, {passive:false});
      window.addEventListener("pointercancel", onBookDragEnd, {passive:false});
    };
  });
}
function onBookDragMove(e){
  if(!__bookDrag) return;
  e.preventDefault();
  const {list,ghost,placeholder,offsetY}=__bookDrag;
  const y=e.clientY;
  ghost.style.top=(y-offsetY)+"px";
  const cards=[...list.querySelectorAll(".playlist:not(.drag-source-hidden):not(.drag-placeholder)")];
  let placed=false;
  for(const item of cards){
    const r=item.getBoundingClientRect();
    if(y < r.top + r.height/2){ list.insertBefore(placeholder,item); placed=true; break; }
  }
  if(!placed) list.appendChild(placeholder);
}
function onBookDragEnd(e){
  if(!__bookDrag) return;
  e.preventDefault();
  const {list,card,ghost,placeholder,startIndex}=__bookDrag;
  const allSlots=[...list.children];
  let newIndex=allSlots.indexOf(placeholder);
  if(newIndex < 0) newIndex=startIndex;
  card.classList.remove("drag-source-hidden");
  ghost.remove(); placeholder.remove();
  // 왼쪽 서랍의 교재 목록은 항상 전체 교재(state.books)를 보여주므로
  // 현재 선택 과목(currentSubject) 기준으로 booksForSubject()를 쓰면
  // 화면상의 startIndex와 실제 배열 인덱스가 어긋나 순서가 저장되지 않는다.
  // 따라서 서랍 드래그는 교재 관리창과 동일하게 전체 state.books 순서를 직접 바꾼다.
  const arr=state.books;
  if(startIndex >= 0 && startIndex < arr.length){
    const [moved]=arr.splice(startIndex,1);
    if(newIndex > startIndex) newIndex--;
    newIndex=Math.max(0,Math.min(arr.length,newIndex));
    arr.splice(newIndex,0,moved);
    save();
  }
  __bookDrag=null;
  window.removeEventListener("pointermove", onBookDragMove);
  window.removeEventListener("pointerup", onBookDragEnd);
  window.removeEventListener("pointercancel", onBookDragEnd);
  render();
  toast("교재 순서 저장됨");
}

/* update 1: bulk study add */
(function(){
  function p2(n){return String(n).padStart(2,"0")}
  function dkey(d){return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`}
  function dparse(k){const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)}
  function dadd(k,n){const d=dparse(k);d.setDate(d.getDate()+n);return dkey(d)}

  function fillBulkSubjects(){
    const sel=document.querySelector("#bulkSubject");
    if(!sel) return;
    sel.innerHTML="";
    (state.subjects||[]).forEach(s=>{
      const op=document.createElement("option");
      op.value=s; op.textContent=s; sel.appendChild(op);
    });
    if(typeof currentSubject!=="undefined" && currentSubject!=="전체" && state.subjects?.includes(currentSubject)){
      sel.value=currentSubject;
    }
  }

  function openBulkStudy(){
    fillBulkSubjects();
    const start=document.querySelector("#bulkStartDate");
    const end=document.querySelector("#bulkEndDate");
    const base=(typeof selected!=="undefined" ? selected : dkey(new Date()));
    if(start&&!start.value) start.value=base;
    if(end&&!end.value) end.value=dadd(start.value,60);
    document.querySelector("#bulkStudyModal")?.classList.add("show");
  }

  function buildBulkNames(text,startNo,endNo,format){
    const raw=(text||"").trim();
    if(raw){
      const parts=raw.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
      const names=[];
      for(const part of parts){
        let m=part.match(/^([가-힣A-Za-z_\- ]*?)(\d+)\s*(?:~|-|부터)\s*([가-힣A-Za-z_\- ]*?)?(\d+)\s*(강|회|번|차)?$/);
        if(m){
          const prefix=(m[1]||m[3]||"").trim();
          const a=Number(m[2]), b=Number(m[4]);
          const suffix=m[5]||(/강/.test(part)?"강":"");
          const step=a<=b?1:-1;
          for(let n=a; step>0?n<=b:n>=b; n+=step) names.push(`${prefix}${n}${suffix}`.trim());
        }else{
          names.push(part);
        }
      }
      return names;
    }
    const names=[];
    for(let n=startNo;n<=endNo;n++) names.push((format||"{n}강").replaceAll("{n}",String(n)));
    return names;
  }

  function saveBulkStudy(){
    const subject=document.querySelector("#bulkSubject")?.value;
    const startNo=parseInt(document.querySelector("#bulkStartNo")?.value,10);
    const endNo=parseInt(document.querySelector("#bulkEndNo")?.value,10);
    const format=document.querySelector("#bulkNameFormat")?.value.trim()||"{n}강";
    const listText=document.querySelector("#bulkListText")?.value||"";
    const startDate=document.querySelector("#bulkStartDate")?.value;
    let endDate=document.querySelector("#bulkEndDate")?.value;
    const memo=document.querySelector("#bulkMemo")?.value.trim()||"";
    const reviewEnabled=document.querySelector("#bulkReviewEnabled")?.value!=="false";
    const weekdays=[...document.querySelectorAll(".bulkWeekday:checked")].map(x=>Number(x.value));

    if(!subject) return alert("과목을 선택해줘.");
    if(!startDate) return alert("시작일을 입력해줘.");
    if(!weekdays.length) return alert("요일을 하나 이상 선택해줘.");

    const names=buildBulkNames(listText,startNo,endNo,format);
    if(!names.length || (!listText.trim() && (!startNo||!endNo||startNo>endNo))) return alert("강의 범위를 확인해줘.");
    if(!endDate) endDate=dadd(startDate,260);

    let i=0, d=dparse(startDate), end=dparse(endDate), count=0;
    while(d<=end && i<names.length){
      if(weekdays.includes(d.getDay())){
        const date=dkey(d);
        state.studies.push({id:crypto.randomUUID(),date,subject,name:names[i],memo,reviewEnabled});
        count++; i++;
      }
      d.setDate(d.getDate()+1);
    }

    if(i<names.length) alert(`종료일까지 다 못 넣었어. ${names[i-1]||"0개"}까지 추가됨.`);
    if(typeof currentSubject!=="undefined") currentSubject=subject;
    if(typeof selected!=="undefined") selected=startDate;
    if(typeof viewDate!=="undefined") viewDate=dparse(startDate);

    save();
    document.querySelector("#bulkStudyModal")?.classList.remove("show");
    render();
    alert(`${count}개 진도를 추가했어. 복습은 ${reviewEnabled?"ON":"OFF"} 상태.`);
  }

  document.addEventListener("click",function(e){
    if(e.target.closest("#bulkStudyBtn")||e.target.closest("#homeBulkStudy")){
      e.preventDefault(); e.stopPropagation(); openBulkStudy();
    }
    if(e.target.closest("#saveBulkStudyBtn")){
      e.preventDefault(); e.stopPropagation(); saveBulkStudy();
    }
  },true);

  window.openBulkStudy=openBulkStudy;
})();

/* update 2: life pattern + available study time */
(function(){
  state.lifeBlocks ||= [];
  save();

  const typeLabels={
    sleep:"수면", school:"학교", academy:"학원", meal:"식사",
    move:"이동", study:"공부", rest:"휴식", other:"기타"
  };
  const dayLabels=["일","월","화","수","목","금","토"];

  function toMin(t){
    if(!t) return 0;
    const [h,m]=t.split(":").map(Number);
    return h*60+m;
  }
  function minToText(min){
    min=Math.max(0,Math.round(min));
    const h=Math.floor(min/60), m=min%60;
    if(h && m) return `${h}시간 ${m}분`;
    if(h) return `${h}시간`;
    return `${m}분`;
  }
  function duration(start,end){
    let s=toMin(start), e=toMin(end);
    if(e<=s) e+=1440;
    return e-s;
  }
  function todayDow(){
    return new Date().getDay();
  }
  function blocksForDay(day){
    return state.lifeBlocks.filter(b=>Number(b.day)===Number(day));
  }
  function busyMinutes(day){
    return blocksForDay(day).reduce((sum,b)=>sum+duration(b.start,b.end),0);
  }
  function sleepMinutes(day){
    return blocksForDay(day).filter(b=>b.type==="sleep").reduce((sum,b)=>sum+duration(b.start,b.end),0);
  }
  function studyAvailable(day=todayDow()){
    return Math.max(0,1440-busyMinutes(day));
  }
  function lifeAdviceText(){
    const d=todayDow();
    const todaySleep=sleepMinutes(d);
    const prev1=sleepMinutes((d+6)%7);
    const prev2=sleepMinutes((d+5)%7);
    if(todaySleep && prev1 && prev2 && todaySleep<=270 && prev1<=270 && prev2<=270){
      return "최근 3일 수면이 4시간 30분 이하야. 오늘은 공부량보다 수면 확보가 우선으로 보여.";
    }
    if(todaySleep && todaySleep<=270){
      return "오늘 수면 시간이 짧아. 무리해서 늘리기보다 핵심 과목 위주로 줄이는 게 좋아 보여.";
    }
    if(studyAvailable(d)>=360){
      return "오늘은 공부 가능 시간이 꽤 있어. 진도와 복습을 같이 가져가기 좋아.";
    }
    return "오늘은 시간이 많지 않아. 밀린 복습부터 압축해서 처리하는 게 좋아.";
  }

  function renderLifeHome(){
    const el=document.querySelector("#availableStudyTime");
    if(el) el.textContent=minToText(studyAvailable());
    const advice=document.querySelector("#lifeAdvice");
    if(advice) advice.textContent=lifeAdviceText();
  }

  function renderLifeSummary(){
    const box=document.querySelector("#lifeSummary");
    if(!box) return;
    const d=todayDow();
    const busy=busyMinutes(d);
    const available=studyAvailable(d);
    const sleep=sleepMinutes(d);
    box.innerHTML=`
      <div class="life-box"><strong>${minToText(available)}</strong><span>오늘 공부 가능</span></div>
      <div class="life-box"><strong>${minToText(sleep)}</strong><span>오늘 수면</span></div>
      <div class="life-box"><strong>${minToText(busy)}</strong><span>고정 일정</span></div>
    `;
  }

  function renderLifeTable(){
    const box=document.querySelector("#lifeTable");
    if(!box) return;
    let html=`<div class="life-grid"><div class="life-cell life-head">시간</div>`;
    for(let d=1; d<=7; d++){
      const day=d%7;
      html+=`<div class="life-cell life-head">${dayLabels[day]}</div>`;
    }
    for(let h=0; h<24; h++){
      html+=`<div class="life-cell life-time">${String(h).padStart(2,"0")}:00</div>`;
      for(let d=1; d<=7; d++){
        const day=d%7;
        const chips=blocksForDay(day).filter(b=>{
          const s=toMin(b.start), e=toMin(b.end);
          const startHour=Math.floor(s/60);
          const endHour=Math.floor(((e<=s?e+1440:e)-1)/60)%24;
          if(e<=s){
            return h>=startHour || h<=endHour;
          }
          return h>=startHour && h<=endHour;
        }).map(b=>`<button class="life-chip ${b.type}" onclick="openLifeBlock('${b.id}')">${b.name||typeLabels[b.type]}</button>`).join("");
        html+=`<div class="life-cell">${chips}</div>`;
      }
    }
    html+=`</div>`;
    box.innerHTML=html;
  }

  function renderLifeList(){
    const box=document.querySelector("#lifeBlockList");
    if(!box) return;
    const sorted=[...state.lifeBlocks].sort((a,b)=>Number(a.day)-Number(b.day)||toMin(a.start)-toMin(b.start));
    box.innerHTML=sorted.map(b=>`
      <div class="row">
        <div class="row-art"></div>
        <div>
          <div class="row-title">${dayLabels[b.day]} · ${b.name||typeLabels[b.type]}</div>
          <div class="row-sub">${b.start}~${b.end} · ${typeLabels[b.type]}</div>
        </div>
        <div class="row-right">${typeLabels[b.type]}</div>
        <button class="more" onclick="openLifeBlock('${b.id}')">⋯</button>
      </div>
    `).join("") || `<div class="empty">아직 시간 블록 없음</div>`;
  }

  function renderLife(){
    renderLifeHome();
    renderLifeSummary();
    renderLifeTable();
    renderLifeList();
  }

  window.openLifeBlock=function(id=null){
    const b=state.lifeBlocks.find(x=>x.id===id);
    document.querySelector("#lifeBlockModalTitle").textContent=b?"시간 블록 수정":"시간 블록 추가";
    document.querySelector("#lifeBlockId").value=b?.id||"";
    document.querySelector("#lifeDay").value=b?.day ?? todayDow();
    document.querySelector("#lifeType").value=b?.type||"school";
    document.querySelector("#lifeName").value=b?.name||"";
    document.querySelector("#lifeStart").value=b?.start||"08:00";
    document.querySelector("#lifeEnd").value=b?.end||"16:00";
    document.querySelector("#deleteLifeBlockBtn").classList.toggle("hidden",!b);
    document.querySelector("#lifeBlockModal")?.classList.add("show");
  };

  function saveLifeBlock(){
    const id=document.querySelector("#lifeBlockId").value;
    const block={
      day:Number(document.querySelector("#lifeDay").value),
      type:document.querySelector("#lifeType").value,
      name:document.querySelector("#lifeName").value.trim(),
      start:document.querySelector("#lifeStart").value,
      end:document.querySelector("#lifeEnd").value
    };
    if(!block.start||!block.end) return alert("시작/끝 시간을 입력해줘.");
    if(id){
      Object.assign(state.lifeBlocks.find(x=>x.id===id),block);
    }else{
      state.lifeBlocks.push({id:crypto.randomUUID(),...block});
    }
    save();
    document.querySelector("#lifeBlockModal")?.classList.remove("show");
    if(typeof render==="function") render();
    renderLife();
  }

  function deleteLifeBlock(){
    const id=document.querySelector("#lifeBlockId").value;
    if(!id) return;
    if(!confirm("이 시간 블록을 삭제할까?")) return;
    state.lifeBlocks=state.lifeBlocks.filter(b=>b.id!==id);
    save();
    document.querySelector("#lifeBlockModal")?.classList.remove("show");
    if(typeof render==="function") render();
    renderLife();
  }

  document.addEventListener("click",function(e){
    if(e.target.closest("#addLifeBlockBtn")){
      e.preventDefault(); e.stopPropagation(); openLifeBlock();
    }
    if(e.target.closest("#saveLifeBlockBtn")){
      e.preventDefault(); e.stopPropagation(); saveLifeBlock();
    }
    if(e.target.closest("#deleteLifeBlockBtn")){
      e.preventDefault(); e.stopPropagation(); deleteLifeBlock();
    }
  },true);

  const oldRender=window.render || render;
  if(typeof oldRender==="function"){
    window.render=function(){
      oldRender();
      renderLife();
    };
  }

  setTimeout(renderLife,300);
})();

/* update 2.1: drag select timetable cells */
(function(){
  function p2(n){return String(n).padStart(2,"0")}
  function hourToTime(h){return `${p2(h)}:00`}
  function dayName(day){return ["일","월","화","수","목","금","토"][day]}

  function patchLifeTableDrag(){
    const table=document.querySelector("#lifeTable");
    if(!table) return;

    let dragging=false;
    let start=null;
    let current=null;

    function clear(){
      table.querySelectorAll(".life-selected").forEach(x=>x.classList.remove("life-selected"));
    }

    function mark(){
      clear();
      if(!start||!current) return;
      if(start.day!==current.day) return;
      const a=Math.min(start.hour,current.hour);
      const b=Math.max(start.hour,current.hour);
      table.querySelectorAll(`[data-life-day="${start.day}"]`).forEach(cell=>{
        const h=Number(cell.dataset.lifeHour);
        if(h>=a && h<=b) cell.classList.add("life-selected");
      });
    }

    function openFromSelection(){
      if(!start||!current||start.day!==current.day) return;
      const a=Math.min(start.hour,current.hour);
      const b=Math.max(start.hour,current.hour)+1;

      const modal=document.querySelector("#lifeBlockModal");
      if(!modal) return;

      document.querySelector("#lifeBlockModalTitle").textContent="시간 블록 추가";
      document.querySelector("#lifeBlockId").value="";
      document.querySelector("#lifeDay").value=String(start.day);
      document.querySelector("#lifeType").value="school";
      document.querySelector("#lifeName").value="";
      document.querySelector("#lifeStart").value=hourToTime(a);
      document.querySelector("#lifeEnd").value=hourToTime(b%24);
      document.querySelector("#deleteLifeBlockBtn")?.classList.add("hidden");

      modal.classList.add("show");
      setTimeout(clear,200);
    }

    table.onpointerdown=e=>{
      const cell=e.target.closest(".life-cell.selectable");
      if(!cell) return;
      e.preventDefault();
      dragging=true;
      start={day:Number(cell.dataset.lifeDay),hour:Number(cell.dataset.lifeHour)};
      current=start;
      try{cell.setPointerCapture(e.pointerId)}catch{}
      mark();
    };

    const updateDragCell=e=>{
      if(!dragging) return;
      const cell=e.target.closest(".life-cell.selectable");
      if(!cell) return;
      const next={day:Number(cell.dataset.lifeDay),hour:Number(cell.dataset.lifeHour)};
      if(next.day!==start.day) return;
      current=next;
      mark();
    };

    table.onpointerover=updateDragCell;
    table.onpointerenter=updateDragCell;
    table.onpointermove=updateDragCell;

    table.onpointerup=e=>{
      if(!dragging) return;
      dragging=false;
      openFromSelection();
      start=null;
      current=null;
    };

    table.onpointercancel=()=>{
      dragging=false;
      start=null;
      current=null;
      clear();
    };
  }

  function rebuildLifeTableWithDrag(){
    if(typeof state==="undefined" || !state.lifeBlocks) return false;
    const box=document.querySelector("#lifeTable");
    if(!box) return false;

    const dayLabels=["일","월","화","수","목","금","토"];
    const typeLabels={
      sleep:"수면", school:"학교", academy:"학원", meal:"식사",
      move:"이동", study:"공부", rest:"휴식", other:"기타"
    };
    function toMin(t){if(!t)return 0;const [h,m]=t.split(":").map(Number);return h*60+m}
    function blocksForDay(day){return state.lifeBlocks.filter(b=>Number(b.day)===Number(day))}

    let html=`<div class="life-drag-tip">시간표 칸을 드래그해서 블록을 만들 수 있어.</div>`;
    html+=`<div class="life-grid"><div class="life-cell life-head">시간</div>`;

    for(let d=1; d<=7; d++){
      const day=d%7;
      html+=`<div class="life-cell life-head">${dayLabels[day]}</div>`;
    }

    for(let h=0; h<24; h++){
      html+=`<div class="life-cell life-time">${String(h).padStart(2,"0")}:00</div>`;
      for(let d=1; d<=7; d++){
        const day=d%7;
        const chips=blocksForDay(day).filter(b=>{
          const s=toMin(b.start), e=toMin(b.end);
          const startHour=Math.floor(s/60);
          const endHour=Math.floor(((e<=s?e+1440:e)-1)/60)%24;
          if(e<=s) return h>=startHour || h<=endHour;
          return h>=startHour && h<=endHour;
        }).map(b=>`<button class="life-chip ${b.type}" onclick="openLifeBlock('${b.id}')">${b.name||typeLabels[b.type]||"일정"}</button>`).join("");

        html+=`<div class="life-cell selectable" data-life-day="${day}" data-life-hour="${h}">${chips}</div>`;
      }
    }

    html+=`</div>`;
    box.innerHTML=html;
    patchLifeTableDrag();
    return true;
  }

  const oldRender = window.render || (typeof render==="function" ? render : null);
  if(oldRender && !window.__lifeDragRenderPatched){
    window.__lifeDragRenderPatched=true;
    window.render=function(){
      oldRender();
      setTimeout(rebuildLifeTableWithDrag,30);
    };
  }

  setTimeout(rebuildLifeTableWithDrag,500);
})();

/* update 4.1: subject books tab */
(function(){
  state.subjectBooks ||= [];
  save();

  let currentSubjectTab = "schedule";

  function getActiveSubject(){
    if(typeof currentSubject !== "undefined" && currentSubject && currentSubject !== "전체"){
      return currentSubject;
    }
    return state.subjects?.[0] || "";
  }

  function fillBookSubjects(){
    const sel=document.querySelector("#subjectBookSubject");
    if(!sel) return;
    sel.innerHTML="";
    (state.subjects||[]).forEach(s=>{
      const op=document.createElement("option");
      op.value=s;
      op.textContent=s;
      sel.appendChild(op);
    });
    const active=getActiveSubject();
    if(active) sel.value=active;
  }

  function renderSubjectTabs(){
    const tabs=document.querySelectorAll(".subject-tab");
    if(!tabs.length) return;
    tabs.forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.subjectTab===currentSubjectTab);
    });
    const schedule=document.querySelector("#subjectSchedulePanel");
    const books=document.querySelector("#subjectBooksPanel");
    if(schedule) schedule.classList.toggle("hidden", currentSubjectTab!=="schedule");
    if(books) books.classList.toggle("hidden", currentSubjectTab!=="books");
  }

  function renderSubjectBooks(){
    const box=document.querySelector("#subjectBookList");
    if(!box) return;
    const subject=getActiveSubject();
    const books=(state.subjectBooks||[]).filter(b=>b.subject===subject);
    box.innerHTML=books.map(b=>`
      <div class="book-card">
        <div class="book-cover-mini"></div>
        <div>
          <div class="book-card-title">${esc(b.name)}</div>
          <div class="book-card-sub">${b.memo?esc(b.memo):"문제 기록은 다음 단계에서 추가"}</div>
        </div>
        <button class="more" onclick="openSubjectBook('${b.id}')">⋯</button>
      </div>
    `).join("") || `<div class="empty">아직 교재 없음</div>`;
  }

  window.openSubjectBook=function(id=null){
    const b=(state.subjectBooks||[]).find(x=>x.id===id);
    document.querySelector("#subjectBookModalTitle").textContent=b?"교재 수정":"교재 추가";
    document.querySelector("#subjectBookId").value=b?.id||"";
    fillBookSubjects();
    if(b) document.querySelector("#subjectBookSubject").value=b.subject;
    document.querySelector("#subjectBookName").value=b?.name||"";
    document.querySelector("#subjectBookMemo").value=b?.memo||"";
    document.querySelector("#deleteSubjectBookBtn")?.classList.toggle("hidden",!b);
    document.querySelector("#subjectBookModal")?.classList.add("show");
  };

  function saveSubjectBook(){
    const id=document.querySelector("#subjectBookId")?.value;
    const subject=document.querySelector("#subjectBookSubject")?.value;
    const name=document.querySelector("#subjectBookName")?.value.trim();
    const memo=document.querySelector("#subjectBookMemo")?.value.trim()||"";
    if(!subject) return alert("과목을 선택해줘.");
    if(!name) return alert("교재명을 입력해줘.");
    if(id){
      const b=state.subjectBooks.find(x=>x.id===id);
      Object.assign(b,{subject,name,memo});
    }else{
      state.subjectBooks.push({id:crypto.randomUUID(),subject,name,memo});
    }
    if(typeof currentSubject!=="undefined") currentSubject=subject;
    save();
    document.querySelector("#subjectBookModal")?.classList.remove("show");
    currentSubjectTab="books";
    if(typeof render==="function") render();
    renderSubjectTabs();
    renderSubjectBooks();
  }

  function deleteSubjectBook(){
    const id=document.querySelector("#subjectBookId")?.value;
    if(!id) return;
    if(!confirm("이 교재를 삭제할까?")) return;
    state.subjectBooks=state.subjectBooks.filter(b=>b.id!==id);
    save();
    document.querySelector("#subjectBookModal")?.classList.remove("show");
    currentSubjectTab="books";
    if(typeof render==="function") render();
    renderSubjectTabs();
    renderSubjectBooks();
  }

  document.addEventListener("click",function(e){
    const tab=e.target.closest(".subject-tab");
    if(tab){
      e.preventDefault();
      currentSubjectTab=tab.dataset.subjectTab;
      renderSubjectTabs();
      renderSubjectBooks();
    }
    if(e.target.closest("#addSubjectBookBtn")){
      e.preventDefault();
      e.stopPropagation();
      openSubjectBook();
    }
    if(e.target.closest("#saveSubjectBookBtn")){
      e.preventDefault();
      e.stopPropagation();
      saveSubjectBook();
    }
    if(e.target.closest("#deleteSubjectBookBtn")){
      e.preventDefault();
      e.stopPropagation();
      deleteSubjectBook();
    }
  },true);

  const oldRender = window.render || (typeof render==="function" ? render : null);
  if(oldRender && !window.__subjectBooksRenderPatched){
    window.__subjectBooksRenderPatched=true;
    window.render=function(){
      oldRender();
      setTimeout(()=>{
        renderSubjectTabs();
        renderSubjectBooks();
      },30);
    };
  }

  setTimeout(()=>{
    renderSubjectTabs();
    renderSubjectBooks();
  },300);
})();

/* update 4.2: key problems with photos */
(function(){
  state.keyProblems ||= [];
  save();

  let activeBookId = "";

  function getActiveSubject(){
    if(typeof currentSubject !== "undefined" && currentSubject && currentSubject !== "전체") return currentSubject;
    return state.subjects?.[0] || "";
  }

  function stars(n){ return "★".repeat(Number(n)||1); }

  function compressImage(file){
    return new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const canvas=document.createElement("canvas");
          const max=900;
          let w=img.width, h=img.height;
          if(w>h && w>max){h=Math.round(h*max/w);w=max;}
          else if(h>=w && h>max){w=Math.round(w*max/h);h=max;}
          canvas.width=w; canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL("image/jpeg",0.78));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderKeyProblems(bookId){
    const problems=(state.keyProblems||[]).filter(p=>p.bookId===bookId);
    if(!problems.length) return `<div class="key-problem-empty">아직 주요문제 없음</div>`;
    return problems.map(p=>`
      <div class="key-problem-card">
        <div class="key-problem-title">
          <span>${esc(p.title)}</span>
          <span class="stars">${stars(p.level)}</span>
        </div>
        ${p.memo?`<div class="row-sub" style="margin-top:5px">${esc(p.memo)}</div>`:""}
        ${p.photos?.length?`<div class="problem-photo-grid">${p.photos.map(src=>`<img src="${src}" alt="문제 사진">`).join("")}</div>`:""}
        <div style="margin-top:8px">
          <button class="tiny" onclick="openKeyProblem('${bookId}','${p.id}')">수정</button>
        </div>
      </div>
    `).join("");
  }

  function renderSubjectBooksV42(){
    const box=document.querySelector("#subjectBookList");
    if(!box || !state.subjectBooks) return false;
    const subject=getActiveSubject();
    const books=state.subjectBooks.filter(b=>b.subject===subject);
    box.innerHTML=books.map(b=>`
      <div class="book-card open">
        <div class="book-cover-mini"></div>
        <div>
          <div class="book-card-title">${esc(b.name)}</div>
          <div class="book-card-sub">${b.memo?esc(b.memo):"주요문제 관리"}</div>
        </div>
        <button class="more" onclick="openSubjectBook('${b.id}')">⋯</button>
        <div class="book-detail">
          <div class="book-detail-head">
            <h3>주요문제</h3>
            <button class="tiny" onclick="openKeyProblem('${b.id}')">＋ 문제</button>
          </div>
          ${renderKeyProblems(b.id)}
        </div>
      </div>
    `).join("") || `<div class="empty">아직 교재 없음</div>`;
    return true;
  }

  window.openKeyProblem=function(bookId, problemId=null){
    activeBookId=bookId;
    const p=(state.keyProblems||[]).find(x=>x.id===problemId);
    document.querySelector("#keyProblemModalTitle").textContent=p?"주요문제 수정":"주요문제 추가";
    document.querySelector("#keyProblemId").value=p?.id||"";
    document.querySelector("#keyProblemBookId").value=bookId;
    document.querySelector("#keyProblemTitle").value=p?.title||"";
    document.querySelector("#keyProblemLevel").value=p?.level||"2";
    document.querySelector("#keyProblemMemo").value=p?.memo||"";
    document.querySelector("#keyProblemPhotos").value="";
    document.querySelector("#deleteKeyProblemBtn")?.classList.toggle("hidden",!p);
    const preview=document.querySelector("#keyProblemPhotoPreview");
    preview.dataset.existing=JSON.stringify(p?.photos||[]);
    preview.innerHTML=p?.photos?.length ? p.photos.map(src=>`<img src="${src}" alt="문제 사진">`).join("") : "";
    document.querySelector("#keyProblemModal")?.classList.add("show");
  };

  async function saveKeyProblem(){
    const id=document.querySelector("#keyProblemId").value;
    const bookId=document.querySelector("#keyProblemBookId").value || activeBookId;
    const title=document.querySelector("#keyProblemTitle").value.trim();
    const level=Number(document.querySelector("#keyProblemLevel").value);
    const memo=document.querySelector("#keyProblemMemo").value.trim();
    if(!title) return alert("문제번호나 위치를 입력해줘.");
    let photos=[];
    try{ photos=JSON.parse(document.querySelector("#keyProblemPhotoPreview").dataset.existing||"[]"); }catch{}
    if(id){
      const p=state.keyProblems.find(x=>x.id===id);
      Object.assign(p,{bookId,title,level,memo,photos});
    }else{
      state.keyProblems.push({id:crypto.randomUUID(),bookId,title,level,memo,photos,createdAt:new Date().toISOString()});
    }
    save();
    document.querySelector("#keyProblemModal")?.classList.remove("show");
    if(typeof render==="function") render();
    setTimeout(renderSubjectBooksV42,50);
  }

  function deleteKeyProblem(){
    const id=document.querySelector("#keyProblemId").value;
    if(!id) return;
    if(!confirm("이 주요문제를 삭제할까?")) return;
    state.keyProblems=state.keyProblems.filter(p=>p.id!==id);
    save();
    document.querySelector("#keyProblemModal")?.classList.remove("show");
    if(typeof render==="function") render();
    setTimeout(renderSubjectBooksV42,50);
  }

  document.addEventListener("change",function(e){
    if(e.target?.id==="keyProblemPhotos"){
      const preview=document.querySelector("#keyProblemPhotoPreview");
      const files=[...e.target.files];
      if(!files.length) return;
      Promise.all(files.map(compressImage)).then(imgs=>{
        let existing=[];
        try{existing=JSON.parse(preview.dataset.existing||"[]");}catch{}
        const next=[...existing,...imgs];
        preview.dataset.existing=JSON.stringify(next);
        preview.innerHTML=next.map(src=>`<img src="${src}" alt="문제 사진">`).join("");
        e.target.value="";
      });
    }
  },true);

  document.addEventListener("click",function(e){
    if(e.target.closest("#saveKeyProblemBtn")){
      e.preventDefault(); e.stopPropagation(); saveKeyProblem();
    }
    if(e.target.closest("#deleteKeyProblemBtn")){
      e.preventDefault(); e.stopPropagation(); deleteKeyProblem();
    }
  },true);

  const oldRender=window.render || (typeof render==="function" ? render : null);
  if(oldRender && !window.__keyProblemsRenderPatched){
    window.__keyProblemsRenderPatched=true;
    window.render=function(){
      oldRender();
      setTimeout(renderSubjectBooksV42,80);
    };
  }
  setTimeout(renderSubjectBooksV42,400);
})();


/* update 4.3 clean final key problems override */
(function(){
  if(window.__keyProblemsClean43) return;
  window.__keyProblemsClean43=true;

  state.keyProblems ||= [];
  save();

  function getActiveSubject43(){
    if(typeof currentSubject !== "undefined" && currentSubject && currentSubject !== "전체") return currentSubject;
    return state.subjects?.[0] || "";
  }
  function stars43(n){ return "★".repeat(Number(n)||1); }
  function bookId43(bookName, subject){
    return `${subject || ""}::${bookName || ""}`;
  }
  function compressImage43(file){
    return new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const canvas=document.createElement("canvas");
          const max=720;
          let w=img.width, h=img.height;
          if(w>h && w>max){h=Math.round(h*max/w);w=max;}
          else if(h>=w && h>max){w=Math.round(w*max/h);h=max;}
          canvas.width=w; canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL("image/jpeg",0.74));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function problemsFor43(bookName, subject){
    const id=bookId43(bookName, subject);
    return (state.keyProblems||[]).filter(p=>p.bookId===id || (p.book===bookName && p.subject===subject));
  }
  function renderProblems43(bookName, subject){
    const bookId=bookId43(bookName, subject);
    const probs=problemsFor43(bookName, subject);
    if(!probs.length) return `<div class="key-problem-empty">아직 주요문제 없음</div>`;
    return probs.map(p=>`
      <div class="key-problem-card">
        <div class="key-problem-title">
          <span>${esc(p.title)}</span>
          <span class="stars">${stars43(p.level)}</span>
        </div>
        ${p.memo?`<div class="row-sub" style="margin-top:5px">${esc(p.memo)}</div>`:""}
        ${p.photos?.length?`<div class="problem-photo-grid">${p.photos.map(src=>`<img src="${src}" alt="문제 사진">`).join("")}</div>`:""}
        <div style="margin-top:8px">
          <button class="tiny" onclick="openKeyProblem43('${bookId}','${p.id}')">수정</button>
        </div>
      </div>
    `).join("");
  }
  function renderSubjectBooks43(){
    const box=document.querySelector("#subjectBookList");
    if(!box || !state.books) return;
    const subject=getActiveSubject43();
    const books=(state.books||[]).filter(b=>{
      const subj=typeof b==="string" ? "" : (b.subject||"");
      return subj===subject;
    });
    box.innerHTML=books.length ? books.map(b=>{
      const name=typeof b==="string"?b:b.name;
      const memo=typeof b==="string"?"":(b.memo||"");
      return `<div class="book-card open">
        <div class="book-cover-mini"></div>
        <div>
          <div class="book-card-title">${esc(name)}</div>
          <div class="book-card-sub">${memo?esc(memo):"주요문제 관리"}</div>
        </div>
        <button class="more" onclick="bookOptions && bookOptions(false)">⋯</button>
        <div class="book-detail">
          <div class="book-detail-head">
            <h3>주요문제</h3>
            <button class="tiny" onclick="openKeyProblem43('${bookId43(name,subject)}')">＋ 문제</button>
          </div>
          ${renderProblems43(name, subject)}
        </div>
      </div>`;
    }).join("") : `<div class="empty">아직 이 과목 교재가 없음. 왼쪽에서 새로운 교재를 추가해줘.</div>`;
  }

  window.openKeyProblem43=function(bookId, problemId=null){
    const p=(state.keyProblems||[]).find(x=>x.id===problemId);
    const [subject, book] = String(bookId).split("::");
    document.querySelector("#keyProblemModalTitle").textContent=p?"주요문제 수정":"주요문제 추가";
    document.querySelector("#keyProblemId").value=p?.id||"";
    document.querySelector("#keyProblemBookId").value=bookId;
    document.querySelector("#keyProblemTitle").value=p?.title||"";
    document.querySelector("#keyProblemLevel").value=p?.level||"2";
    document.querySelector("#keyProblemMemo").value=p?.memo||"";
    document.querySelector("#keyProblemPhotos").value="";
    document.querySelector("#deleteKeyProblemBtn")?.classList.toggle("hidden",!p);
    const preview=document.querySelector("#keyProblemPhotoPreview");
    preview.dataset.existing=JSON.stringify(p?.photos||[]);
    preview.innerHTML=p?.photos?.length ? p.photos.map(src=>`<img src="${src}" alt="문제 사진">`).join("") : "";
    document.querySelector("#keyProblemModal")?.classList.add("show");
  };

  async function saveKeyProblem43(){
    const id=document.querySelector("#keyProblemId").value;
    const bookId=document.querySelector("#keyProblemBookId").value;
    const title=document.querySelector("#keyProblemTitle").value.trim();
    const level=Number(document.querySelector("#keyProblemLevel").value);
    const memo=document.querySelector("#keyProblemMemo").value.trim();
    if(!title) return alert("문제번호나 위치를 입력해줘.");
    let photos=[];
    try{photos=JSON.parse(document.querySelector("#keyProblemPhotoPreview").dataset.existing||"[]");}catch{}
    const [subject, book]=String(bookId).split("::");
    if(id){
      const p=state.keyProblems.find(x=>x.id===id);
      Object.assign(p,{bookId,subject,book,title,level,memo,photos});
    }else{
      state.keyProblems.push({id:crypto.randomUUID(),bookId,subject,book,title,level,memo,photos,createdAt:new Date().toISOString()});
    }
    save();
    document.querySelector("#keyProblemModal")?.classList.remove("show");
    if(typeof render==="function") render();
    setTimeout(renderSubjectBooks43,60);
  }
  function deleteKeyProblem43(){
    const id=document.querySelector("#keyProblemId").value;
    if(!id) return;
    if(!confirm("이 주요문제를 삭제할까?")) return;
    state.keyProblems=state.keyProblems.filter(p=>p.id!==id);
    save();
    document.querySelector("#keyProblemModal")?.classList.remove("show");
    if(typeof render==="function") render();
    setTimeout(renderSubjectBooks43,60);
  }

  document.addEventListener("change",function(e){
    if(e.target?.id==="keyProblemPhotos"){
      const preview=document.querySelector("#keyProblemPhotoPreview");
      const files=[...e.target.files];
      if(!files.length) return;
      Promise.all(files.map(compressImage43)).then(imgs=>{
        let existing=[];
        try{existing=JSON.parse(preview.dataset.existing||"[]");}catch{}
        const next=[...existing,...imgs];
        preview.dataset.existing=JSON.stringify(next);
        preview.innerHTML=next.map(src=>`<img src="${src}" alt="문제 사진">`).join("");
        e.target.value="";
      });
    }
  },true);

  document.addEventListener("click",function(e){
    if(e.target.closest("#saveKeyProblemBtn")){
      e.preventDefault(); e.stopPropagation(); saveKeyProblem43();
    }
    if(e.target.closest("#deleteKeyProblemBtn")){
      e.preventDefault(); e.stopPropagation(); deleteKeyProblem43();
    }
  },true);

  const oldRender43 = window.render || (typeof render==="function" ? render : null);
  if(oldRender43 && !window.__keyProblemsRender43){
    window.__keyProblemsRender43=true;
    window.render=function(){
      oldRender43();
      setTimeout(renderSubjectBooks43,70);
    };
  }
  setTimeout(renderSubjectBooks43,400);
})();
