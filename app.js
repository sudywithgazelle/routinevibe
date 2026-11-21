/* Study With Gazelle v2 — original yellow-bubble UX, secure Supabase path + local preview. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const asset=name=>(window.GAZELLE_ASSETS&&window.GAZELLE_ASSETS[name])||'assets/'+name;
const cfg=window.GAZELLE_CONFIG||{};
const backendConfigured=!!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const configured=backendConfigured&&!!window.supabase;
let db=null, session=null, preview=false, authMode='login', currentPage='study';
const KEYPREVIEW='study_with_gazelle_v2_preview';
const DEFAULT_PREFS={focus:50,short:10,long:30,rounds:4,autoBreak:false,theme:'Buttercream',shape:'bubble'};
const THEMES=[
 {name:'Sunday',colors:['#F6D875','#B6DAEB'],bg:'#f7f5ed',accent:'#F3CF71',secondary:'#DCEEF3'},
 {name:'Pink Cloud',colors:['#F2C0CF','#fffafa'],bg:'#fff5f6',accent:'#F2C0CF',secondary:'#f9dbe5'},
 {name:'Buttercream',colors:['#F6D875','#fff9e8'],bg:'#F7F2E8',accent:'#F6D875',secondary:'#F5C2CF'},
 {name:'Lavender Kiss',colors:['#C9B6E7','#F2BED4'],bg:'#F6F0F8',accent:'#D7C8EE',secondary:'#F3C1D4'},
 {name:'Sage Garden',colors:['#B8D4BF','#F7F2E8'],bg:'#F6F6F0',accent:'#C0DBBF',secondary:'#E5D5BE'},
 {name:'Vanilla',colors:['#F4E5CD','#DDB99D'],bg:'#FAF5ED',accent:'#F2DBBD',secondary:'#EECABC'},
 {name:'Trend',colors:['#E9C7B4','#783349'],bg:'#FFF5F1',accent:'#C78391',secondary:'#E7C2C8'},
 {name:'Old Money',colors:['#DCC8A7','#20344E'],bg:'#F8F5EE',accent:'#D2B88A',secondary:'#D1D9DC'},
 {name:'Monochrome',colors:['#fff','#222'],bg:'#F4F3F1',accent:'#d6d4d2',secondary:'#d6d4d2'},
 {name:'Midnight',colors:['#343434','#151515'],bg:'#eeeef0',accent:'#c2c1cb',secondary:'#d3d0dc'},
 {name:'Pure White',colors:['#fff','#f3f3f3'],bg:'#fbfbf8',accent:'#e7e4df',secondary:'#eee8e5'},
 {name:'Rosewood',colors:['#dfd0cf','#b6a0a1'],bg:'#F7F2F2',accent:'#dcc4c9',secondary:'#e5d8da'},
 {name:'Terracotta',colors:['#EEDBCF','#BD8575'],bg:'#FAF4EE',accent:'#D9A08B',secondary:'#efd2c4'},
 {name:'Ice Blue',colors:['#fff','#BED9E6'],bg:'#F3F7FA',accent:'#B9D9E9',secondary:'#E4D8E7'},
 {name:'Burgundy',colors:['#702438','#D5A7A7'],bg:'#F9F0F1',accent:'#9F5062',secondary:'#E4C2CC',premium:true},
 {name:'Navy',colors:['#203551','#ADC3DD'],bg:'#EFF2F8',accent:'#788FB3',secondary:'#CED8E9',premium:true}
];
const GAMES=[
 {id:'crossword',name:'Crossword',icon:'✏️',description:'A real crossing word grid with cozy clues.'},
 {id:'sudoku',name:'Sudoku',icon:'🔢',description:'Classic 9×9 number puzzles, notes and hints.'},
 {id:'memory',name:'Memory Match',icon:'🃏',description:'Flip pastel cards to discover eight matching pairs.'},
 {id:'jigsaw',name:'Jigsaw Puzzle',icon:'🧩',description:'Rebuild a 49-piece picture, by drag or tap.'}
];
const BADGES=[
 {id:'streak3',label:'3-day streak',desc:'Study three days in a row',asset:'badge1.webp',goal:3,type:'streak'},
 {id:'streak7',label:'7-day streak',desc:'Study for seven days in a row',asset:'badge2.webp',goal:7,type:'streak'},
 {id:'streak30',label:'30-day streak',desc:'A whole month of consistency',asset:'badge3.webp',goal:30,type:'streak'},
 {id:'hours100',label:'100-hour scholar',desc:'100 real study hours',asset:'badge4.webp',goal:100,type:'hours'},
 {id:'hours500',label:'500-hour legend',desc:'500 real study hours',asset:'badge4.webp',goal:500,type:'hours'}
];
const state={profile:null,preferences:{...DEFAULT_PREFS},tasks:[],links:[],insights:{},snapshot:null,leaderboard:[],period:'day',roomJoined:false,activeGame:null,room:null,gameSeed:null};
const timer={phase:'focus',studyMode:'solo',remaining:DEFAULT_PREFS.focus*60,deadline:0,running:false,busy:false,serverRunOpen:false,completedFocus:0,ticker:null,pulser:null,localLast:0,ending:false};
let polling=null,pingBusy=false,toastTimeout=null,pulseCount=0,pollCount=0;
const pad=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
const formatTime=n=>`${pad(n/60)}:${pad(n%60)}`;
const xpFormat=x=>Number(x||0).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
const hours=s=>Number(s||0)/3600;
const fmtHours=s=>hours(s).toFixed(1).replace(/\.0$/,'')+'h';
const utcDate=d=>new Date(d).toISOString().slice(0,10);
const $node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const safeText=x=>String(x??'');
const makeId=()=>globalThis.crypto?.randomUUID?.()||('local_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
const closeToast=()=>{if(toastTimeout)clearTimeout(toastTimeout);$('toast').classList.remove('show');};
function toast(message){closeToast();$('toast').textContent=message;$('toast').classList.add('show');toastTimeout=setTimeout(closeToast,3200);}
const demoDefault=()=>({profile:{user_id:'preview',username:'gazelle_friend',display_name:'Study friend',plan:'free',is_admin:false,avatar:1,selected_badges:[]},preferences:{...DEFAULT_PREFS},tasks:[],links:[],blocks:[],runs:[]});
let demo=demoDefault();
function loadDemo(){try{demo={...demoDefault(),...JSON.parse(localStorage.getItem(KEYPREVIEW)||'{}')};demo.preferences={...DEFAULT_PREFS,...(demo.preferences||{})};}catch{demo=demoDefault();}}
function saveDemo(){if(preview){try{localStorage.setItem(KEYPREVIEW,JSON.stringify(demo));}catch{toast('Unable to save preview data in this browser.');}}}
async function rpc(name,args){const {data,error}=await db.rpc(name,args||{});if(error)throw new Error(error.message);return data;}
function setAuthView(mode){authMode=mode;const signup=mode==='signup';$('signupExtra').hidden=!signup;$('identity').hidden=signup;$('identity').required=!signup;$('signupUsername').required=signup;$('signupEmail').required=signup;document.querySelector('label[for="identity"]').hidden=signup;$('loginTab').classList.toggle('active',!signup);$('signupTab').classList.toggle('active',signup);$('authTitle').textContent=signup?'Start your journey':'Welcome back';$('authDesc').textContent=signup?'Create your free study account.':'Log in to continue your study journey.';$('authSubmit').textContent=signup?'Create free account ♡':'Log in ♡';$('resetPassword').hidden=signup;$('authError').textContent='';}
function setAuthError(msg){$('authError').textContent=msg||'';}
async function signIn(event){event.preventDefault();const submit=$('authSubmit');submit.disabled=true;setAuthError('');try{
 if(authMode==='signup'){
  const username=$('signupUsername').value.trim().toLowerCase(),email=$('signupEmail').value.trim().toLowerCase(),password=$('password').value;
  if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Username: 3–24 lowercase letters, numbers or underscores.');
  if(password.length<8)throw Error('Choose at least 8 password characters.');
  const {data,error}=await db.auth.signUp({email,password,options:{data:{username,display_name:username}}});
  if(error)throw error;
  if(!data.session){setAuthError('Account created. Check your email to verify your address, then log in.');setAuthView('login');setAuthError('Check your email for a verification link, then log in.');}
  else {session=data.session;await enterApp();}
 }else{
  const identifier=$('identity').value.trim(),password=$('password').value;
  if(!identifier)throw Error('Enter your email or username.');
  if(identifier.includes('@')){const {data,error}=await db.auth.signInWithPassword({email:identifier.toLowerCase(),password});if(error)throw error;session=data.session;}
  else {const res=await fetch(cfg.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/username-login',{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_ANON_KEY},body:JSON.stringify({username:identifier,password})});const ans=await res.json();if(!res.ok)throw Error(ans.error||'Invalid username or password');const {data,error}=await db.auth.setSession({access_token:ans.access_token,refresh_token:ans.refresh_token});if(error)throw error;session=data.session;}
  await enterApp();
 }
}catch(err){setAuthError(err.message||'Could not sign in');}finally{submit.disabled=false;}}
async function resetPassword(){const email=prompt('Enter your email address to receive a password-reset link:');if(!email)return;try{const {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;setAuthError('If this email has an account, a recovery email will be sent.');}catch(e){setAuthError(e.message);}}
async function init(){
 document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
 $('profileTop').addEventListener('click',()=>navigate('profile'));
 $('loginTab').onclick=()=>setAuthView('login');$('signupTab').onclick=()=>setAuthView('signup');$('authForm').onsubmit=signIn;$('resetPassword').onclick=resetPassword;
 $('openPreview').onclick=async()=>{preview=true;loadDemo();await enterApp();};
 $('previewBreakToggle').onclick=async()=>{if(!preview)return;demo.previewBreak=!demo.previewBreak;saveDemo();await refreshSnapshot();$('previewBreakToggle').textContent=demo.previewBreak?'Lock games again':'Try all games';toast(demo.previewBreak?'All four games unlocked for local testing ♡':'Normal XP unlocks restored');};
 $('signOut').onclick=logout;
 $('openSettings').onclick=()=>openModal('settingsModal');$('openTheme').onclick=()=>openModal('themeModal');$('profileThemes').onclick=()=>openModal('themeModal');
 $('skipBreak').onclick=async()=>{if(timer.running)await pauseTimer();if(timer.phase==='focus')await switchPhase('short');else await switchPhase('focus');};
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
 document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(m=>closeModal(m.id));});
 $('startBtn').onclick=toggleTimer;$('resetBtn').onclick=resetTimer;
 $('saveSettings').onclick=saveTimerSettings;
 document.querySelectorAll('[data-study-mode]').forEach(b=>b.onclick=()=>setStudyMode(b.dataset.studyMode));
 $('joinRoom').onclick=()=>joinTogether();
 $('taskForm').onsubmit=submitTask;$('shelfForm').onsubmit=addShelf;
 $('refreshLeaderboard').onclick=()=>loadLeaderboard(true);
 document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{state.period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x.dataset.period===state.period));loadLeaderboard();});
 $('roomToggle').onclick=()=>adminAction(state.snapshot?.room_open?'room_close':'room_open');
 $('breakToggle').onclick=()=>adminAction(state.snapshot?.break_active?'break_off':'break_on');
 $('grantPremium').onclick=()=>adminAction('set_premium',$('adminUsername').value.trim());
 $('revokePremium').onclick=()=>adminAction('set_free',$('adminUsername').value.trim());
 $('gamePremium').onclick=()=>adminAction('game_premium',null,$('adminGame').value);
 $('gameFree').onclick=()=>adminAction('game_free',null,$('adminGame').value);
 $('reloadAdminUsers').onclick=loadAdminUsers;
 renderThemes();renderGameCards();renderTimer();
 if(!configured){$('cloudAuth').hidden=true;$('demoEntry').hidden=backendConfigured||!cfg.ALLOW_LOCAL_PREVIEW;setAuthError(backendConfigured?'Could not load the Supabase library. Check your connection or CDN settings.':cfg.ALLOW_LOCAL_PREVIEW?'':'Set Supabase URL/key in config.js to run this app.');return;}
 db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data,error}=await db.auth.getSession();if(error){setAuthError(error.message);return;}
 if(data.session){session=data.session;await enterApp();}
 db.auth.onAuthStateChange(async (event,next)=>{if(event==='SIGNED_OUT'){showLogin();}if(event==='PASSWORD_RECOVERY'){setAuthError('Recovery link opened. Sign in using your new password after updating it in Supabase Auth.');}});
}
async function enterApp(){try{
 if(!preview){const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Please log in.');session=data.session;const {data:profile,error:pe}=await db.from('profiles').select('*').eq('user_id',session.user.id).single();if(pe)throw pe;state.profile=profile;const {data:pref}=await db.from('preferences').select('settings').eq('user_id',session.user.id).maybeSingle();state.preferences={...DEFAULT_PREFS,...(pref?.settings||{})};}
 else{state.profile=demo.profile;state.preferences={...DEFAULT_PREFS,...demo.preferences};}
 $('authGate').hidden=true;$('appRoot').hidden=false;$('previewRibbon').hidden=!preview;
 timer.phase='focus';timer.studyMode='solo';timer.remaining=Number(state.preferences.focus)*60;timer.running=false;timer.serverRunOpen=false;
 applyTheme();renderSettings();navigate('study');
 await Promise.all([loadTasks(),loadShelf(),loadInsights(),refreshSnapshot(),loadLeaderboard()]);
 renderProfile();renderGameCards();if(!preview&&state.profile.is_admin)loadAdminUsers();
 if(!preview){await recoverRun();await heartBeat();polling=setInterval(()=>{heartBeat();refreshSnapshot();if(currentPage==='study'&&++pollCount%2===0)loadLeaderboard();},30000);}
}catch(e){console.error(e);toast(e.message||'Could not load account');if(!preview){$('authGate').hidden=false;$('appRoot').hidden=true;}}}
function showLogin(){stopIntervals();preview=false;session=null;state.profile=null;$('authGate').hidden=false;$('appRoot').hidden=true;setAuthView('login');}
async function logout(){if(timer.running)await pauseTimer();if(timer.serverRunOpen&&!preview){try{await rpc('tick_study',{p_action:'stop'});}catch{}}stopIntervals();if(!preview)await db.auth.signOut();showLogin();}
function stopIntervals(){if(timer.ticker)clearInterval(timer.ticker);if(timer.pulser)clearInterval(timer.pulser);if(polling)clearInterval(polling);timer.ticker=timer.pulser=polling=null;timer.running=false;}
function navigate(section){if(!['study','todoSection','games','playlists','profile'].includes(section))return;currentPage=section;document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===section));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===section));scrollTo({top:0,behavior:'instant'});if(section==='profile')renderProfile();if(section==='games')renderGameCards();}
function openModal(id){$(id).hidden=false;if(id==='themeModal')renderThemes();}
function closeModal(id){$(id).hidden=true;if(id==='gameModal'){state.activeGame=null;state.room=null;window.GazelleGames?.close?.();if(!preview)rpc('game_leave').catch(()=>{});}}
function settingValues(){return {focus:Number($('focusMinutes').value),short:Number($('shortMinutes').value),long:Number($('longMinutes').value),rounds:Number($('rounds').value),autoBreak:$('autoBreak').checked};}
function renderSettings(){const p=state.preferences;for(const [k,id] of [['focus','focusMinutes'],['short','shortMinutes'],['long','longMinutes'],['rounds','rounds']])$(id).value=p[k];$('autoBreak').checked=!!p.autoBreak;}
async function saveTimerSettings(){const p=settingValues();if(!Number.isInteger(p.focus)||p.focus<1||p.focus>180||!Number.isInteger(p.short)||p.short<1||p.short>60||!Number.isInteger(p.long)||p.long<1||p.long>90||!Number.isInteger(p.rounds)||p.rounds<2||p.rounds>12){toast('Check the duration limits.');return;}
 try{await stopCurrentRun();state.preferences={...state.preferences,...p};await persistPreferences();timer.remaining=Number(p[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;renderTimer();closeModal('settingsModal');toast('Pomodoro settings saved ♡');}catch(e){toast(e.message);}}
async function persistPreferences(){if(preview){demo.preferences={...state.preferences};saveDemo();return;}await rpc('save_my_preferences',{p_settings:state.preferences});}
function premium(){return state.profile && (state.profile.plan==='premium'||state.profile.is_admin);}
function renderThemes(){const grid=$('themeGrid');grid.replaceChildren();THEMES.forEach(t=>{const locked=!!(t.premium&&!premium());const b=$node('button','theme-choice'+(t.name===state.preferences.theme?' current':''),t.name+(locked?' ✦':''));b.type='button';b.title=locked?'Premium only':t.name;const pips=$node('span','theme-pips');t.colors.forEach(c=>{const i=document.createElement('i');i.style.background=c;pips.append(i);});b.prepend(pips);b.onclick=()=>selectTheme(t);grid.append(b);});document.querySelectorAll('[data-shape]').forEach(b=>b.classList.toggle('active',b.dataset.shape===state.preferences.shape));document.querySelectorAll('[data-shape]').forEach(b=>b.onclick=async()=>{state.preferences.shape=b.dataset.shape;applyTheme();try{await persistPreferences();}catch(e){toast(e.message);}renderThemes();});}
async function selectTheme(t){if(t.premium&&!premium()){toast('This palette is a Premium theme ♡');return;}const previous=state.preferences.theme;state.preferences.theme=t.name;applyTheme();try{await persistPreferences();renderThemes();toast(t.name+' applied ♡');}catch(e){state.preferences.theme=previous;applyTheme();toast(e.message);}}
function applyTheme(){const p=THEMES.find(t=>t.name===state.preferences.theme)||THEMES[2];const root=document.documentElement;const c=p.colors;
 root.style.setProperty('--bg',p.bg);root.style.setProperty('--accent',p.accent);root.style.setProperty('--second',p.secondary);root.style.setProperty('--gradA',p.name==='Buttercream'?'#FFF1B5':lighten(c[0],0.4));root.style.setProperty('--gradB',c[0]);root.style.setProperty('--gradC',darken(c[0],0.11));
 $('timerBubble').classList.remove('shape-bubble','shape-soft','shape-halo');$('timerBubble').classList.add('shape-'+(state.preferences.shape||'bubble'));
}
function lighten(hex,f){return blend(hex,'#ffffff',f);}function darken(hex,f){return blend(hex,'#836f66',f);}
function blend(a,b,f){function rgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v*(1-f)+y[i]*f).toString(16).padStart(2,'0')).join('');}
function renderTimer(){const n=timer.running?Math.max(0,Math.ceil((timer.deadline-Date.now())/1000)):timer.remaining;
 $('timeDisplay').textContent=formatTime(n);$('modeLabel').textContent=timer.phase==='focus'?'FOCUS TIME':timer.phase==='short'?'SHORT BREAK':'LONG BREAK';$('startBtn').textContent=timer.running?'PAUSE':n<(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long']*60)?'RESUME':'START';
 $('sessionLabel').textContent=timer.running?(timer.phase==='focus'?'One page at a time ✦':'Enjoy your little pause ♡'):(timer.phase==='focus'?'Ready when you are ♡':'Time to rest ♡');
 $('xpNote').textContent=(timer.studyMode==='together'?'Together earns 20 XP/hour':'Solo earns 10 XP/hour')+' · only actual active focus time counts';
 document.querySelectorAll('[data-study-mode]').forEach(b=>b.classList.toggle('active',b.dataset.studyMode===timer.studyMode));
 $('currentStudyCount').textContent=state.snapshot?.[timer.studyMode]??(preview?'—':'0');$('currentStudyLabel').textContent=timer.studyMode==='solo'?'Studying in Solo':'Studying Together';
 $('togetherInfo').hidden=timer.studyMode!=='together';$('joinRoom').textContent=state.roomJoined?'Joined ✓':'Join room';$('joinRoom').disabled=!(state.snapshot?.room_open)&&!preview;
 $('togetherStatus').textContent=state.snapshot?.room_open?'Host room is open ♡':'Waiting for host to open the room';
}
async function setStudyMode(next){if(!['solo','together'].includes(next))return;if(next==='together'){if(!premium()){toast('Study Together is a Premium feature.');return;}if(!state.snapshot?.room_open){toast('The host has not opened a study room yet.');return;}}
 if(timer.studyMode===next)return;await stopCurrentRun();timer.studyMode=next;timer.remaining=Number(state.preferences.focus)*60;timer.phase='focus';state.roomJoined=next==='solo';renderTimer();}
async function joinTogether(){if(!premium()||!state.snapshot?.room_open){toast('The room needs Premium access and an active host.');return;}state.roomJoined=true;renderTimer();toast('Joined the host study room ♡');}
function stopLocalClock(){timer.running=false;if(timer.ticker)clearInterval(timer.ticker);if(timer.pulser)clearInterval(timer.pulser);timer.ticker=timer.pulser=null;}
async function stopCurrentRun(){if(timer.running)await pauseTimer();if(timer.serverRunOpen&&!preview){try{await rpc('tick_study',{p_action:'stop'});}catch(e){toast(e.message);}timer.serverRunOpen=false;}timer.running=false;timer.remaining=Number(state.preferences.focus)*60;}
async function switchPhase(phase){if(timer.running)await pauseTimer();if(timer.phase==='focus'&&phase!=='focus'&&timer.serverRunOpen){await stopCurrentRun();}timer.phase=phase;timer.remaining=Number(state.preferences[phase==='focus'?'focus':phase==='short'?'short':'long'])*60;timer.serverRunOpen=false;renderTimer();}
async function toggleTimer(){if(timer.busy||timer.ending)return;timer.busy=true;try{if(timer.running)await pauseTimer();else await startTimer();}catch(e){toast(e.message||'Timer error');}finally{timer.busy=false;renderTimer();}}
async function startTimer(){if(timer.phase==='focus'){
 if(timer.studyMode==='together'&&(!premium()||!state.snapshot?.room_open||!state.roomJoined)){throw Error('Join an open Premium host room first.');}
 if(!preview){if(!timer.serverRunOpen){await rpc('start_study',{p_mode:timer.studyMode,p_target_seconds:Math.max(60,Math.round(timer.remaining))});timer.serverRunOpen=true;}else await rpc('tick_study',{p_action:'resume'});}
 timer.localLast=Date.now();
}
 timer.deadline=Date.now()+timer.remaining*1000;timer.running=true;
 timer.ticker=setInterval(tickTimer,200);if(timer.phase==='focus')timer.pulser=setInterval(pulseFocus,20000);renderTimer();
}
async function pauseTimer(){if(!timer.running)return;timer.remaining=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));stopLocalClock();if(timer.phase==='focus'){
 if(preview)accountLocalFocus();else if(timer.serverRunOpen){try{const r=await rpc('tick_study',{p_action:'pause'});if(r?.status==='room_closed')timer.serverRunOpen=false;await loadInsights();}catch(e){toast('Could not sync focus time: '+e.message);}}
}renderTimer();}
async function resetTimer(){if(timer.busy)return;timer.busy=true;try{await stopCurrentRun();timer.remaining=Number(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;toast('Timer reset ♡');}finally{timer.busy=false;renderTimer();await loadInsights();}}
function tickTimer(){if(!timer.running)return;const left=Math.ceil((timer.deadline-Date.now())/1000);$('timeDisplay').textContent=formatTime(Math.max(0,left));if(left<=0&&!timer.ending){timer.ending=true;completeTimer().finally(()=>{timer.ending=false;});}}
async function completeTimer(){const original=timer.phase;stopLocalClock();timer.remaining=0;
 if(original==='focus'){
  if(preview){accountLocalFocus();demo.runs.push({completed:true,ended_at:new Date().toISOString()});saveDemo();}
  else if(timer.serverRunOpen){try{const res=await rpc('tick_study',{p_action:'complete'});timer.serverRunOpen=false;if(res.status==='room_closed'){toast('The host closed the study room.');}else if(!res.completed){toast('Focus time recorded, but round was not marked complete.');}}catch(e){toast('Study sync error: '+e.message);}}
  timer.completedFocus++;await loadInsights();await refreshSnapshot();await loadLeaderboard();
  timer.phase=timer.completedFocus%state.preferences.rounds===0?'long':'short';
 }else timer.phase='focus';timer.remaining=Number(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;
 renderTimer();toast(original==='focus'?'Focus complete! Lovely work ♡':'Break finished — welcome back ♡');
 if(original==='focus'&&state.preferences.autoBreak){await startTimer();}
}
function accountLocalFocus(){if(!timer.localLast)return;const now=Date.now();const sec=Math.max(0,(now-timer.localLast)/1000);timer.localLast=now;
 if(sec<0.001)return;demo.blocks.push({seconds:sec,xp:sec/(timer.studyMode==='together'?180:360),mode:timer.studyMode,created_at:new Date().toISOString()});saveDemo();}
function applyPulseToInsights(result){
 const ds=Number(result?.added_seconds||0),dx=Number(result?.added_xp||0);if(ds<=0)return;
 for(const key of ['total_seconds','today_seconds','week_seconds','month_seconds','year_seconds'])
  state.insights[key]=Number(state.insights[key]||0)+ds;
 for(const key of ['total_xp','today_xp'])state.insights[key]=Number(state.insights[key]||0)+dx;
 const chart=state.insights.week_chart||[],last=chart[chart.length-1];
 if(last&&last.date===utcDate(new Date()))last.seconds=Number(last.seconds||0)+ds;
 $('todayXp').textContent=xpFormat(state.insights.today_xp);renderProfile();
}
async function pulseFocus(){if(!timer.running||timer.phase!=='focus'||pingBusy)return;pingBusy=true;try{if(preview){accountLocalFocus();await loadInsights();}else{const res=await rpc('tick_study',{p_action:'pulse'});if(res.status==='room_closed'){stopLocalClock();timer.serverRunOpen=false;timer.studyMode='solo';state.roomJoined=false;toast('The host closed the room. Study Together has ended.');renderTimer();}else applyPulseToInsights(res);if(++pulseCount%6===0)await loadInsights();}}catch(e){console.warn('Focus heartbeat failed:',e.message);}finally{pingBusy=false;}}
async function recoverRun(){try{const {data}=await db.from('study_runs').select('mode,target_seconds,total_seconds,is_active').is('ended_at',null).maybeSingle();if(!data)return;const s=await rpc('tick_study',{p_action:'pause'});timer.serverRunOpen=s.status!=='room_closed';timer.phase='focus';timer.studyMode=data.mode;timer.remaining=Math.max(0,Math.ceil(Number(data.target_seconds)-Number(s.seconds||data.total_seconds)));timer.running=false;state.roomJoined=data.mode==='together';renderTimer();toast('Your previous session was restored paused ♡');}catch(e){console.warn('Run recovery:',e.message);}}
async function heartBeat(){if(preview||!session)return;try{await rpc('presence_ping');if(state.activeGame)await rpc('game_ping',{p_game:state.activeGame});}catch(e){console.warn('Presence',e.message);}}
async function refreshSnapshot(){if(preview){state.snapshot={registered:'—',online:'—',solo:'—',together:'—',break_active:!!demo.previewBreak,room_open:false,catalog:[{game:'crossword',xp_required:0,premium_only:false,players:0},{game:'sudoku',xp_required:10,premium_only:false,players:0},{game:'memory',xp_required:5,premium_only:false,players:0},{game:'jigsaw',xp_required:15,premium_only:false,players:0}]};}
 else{try{state.snapshot=await rpc('get_app_snapshot');}catch(e){console.warn('Snapshot',e.message);return;}}
 $('registeredCount').textContent=state.snapshot.registered;$('onlineCount').textContent=state.snapshot.online;
 if(preview)$('previewBreakToggle').textContent=demo.previewBreak?'Lock games again':'Try all games';
 if(!state.snapshot.room_open&&timer.studyMode==='together'&&!timer.running){state.roomJoined=false;}
 $('roomToggle').textContent=state.snapshot.room_open?'Close Together room':'Open Together room';$('breakToggle').textContent=state.snapshot.break_active?'Disable Break Mode':'Enable Break Mode';
 $('breakBanner').textContent=state.snapshot.break_active?(preview?'☕ Local showcase: all four games are temporarily unlocked.':'☕ Host Break Mode is on — study XP requirements are waived!'):'Games unlock through accumulated study XP. Requirements are provisional.';
 renderTimer();renderGameCards();}
async function loadTasks(){if(preview){state.tasks=demo.tasks||[];}else{const {data,error}=await db.from('todos').select('*').order('created_at',{ascending:false});if(error)throw error;state.tasks=data||[];}renderTasks();}
async function submitTask(e){e.preventDefault();const title=$('taskInput').value.trim();if(!title)return;try{if(preview){const t={id:makeId(),title,done:false,created_at:new Date().toISOString(),completed_at:null};demo.tasks.unshift({...t,subtitle:'',note:''});saveDemo();}
 else{const {error}=await db.from('todos').insert({title,user_id:session.user.id});if(error)throw error;}
 $('taskInput').value='';await loadTasks();renderProfile();}catch(e){toast(e.message);}}
async function updateTask(id,patch){try{if(preview){const t=demo.tasks.find(x=>x.id===id);Object.assign(t,patch);saveDemo();}else{const {error}=await db.from('todos').update(patch).eq('id',id);if(error)throw error;}await loadTasks();renderProfile();}catch(e){toast(e.message);}}
async function deleteTask(id){try{if(preview){demo.tasks=demo.tasks.filter(t=>t.id!==id);saveDemo();}else{const {error}=await db.from('todos').delete().eq('id',id);if(error)throw error;}await loadTasks();renderProfile();}catch(e){toast(e.message);}}
function renderTasks(){const box=$('taskRows');box.replaceChildren();const done=state.tasks.filter(t=>t.done).length,total=state.tasks.length;
 $('todoProgressLabel').textContent=`${done} of ${total} completed`;$('todoPercent').textContent=(total?Math.round(100*done/total):0)+'%';$('todoProgress').style.width=(total?100*done/total:0)+'%';$('emptyTasks').hidden=total>0;
 state.tasks.forEach(t=>{const row=$node('div','task-row'+(t.done?' task-done':''));const cb=$node('input');cb.type='checkbox';cb.checked=!!t.done;cb.setAttribute('aria-label','Mark '+t.title+' as completed');cb.onchange=()=>updateTask(t.id,{done:cb.checked,completed_at:cb.checked?new Date().toISOString():null});
 const inner=$node('div','task-main');const input=$node('input','task-edit');input.value=t.title;input.maxLength=140;input.title='Click to rename your task';input.onchange=()=>{const str=input.value.trim();if(str&&str!==t.title)updateTask(t.id,{title:str});};const small=$node('small','',t.done?'Completed ♡':'In progress');inner.append(input,small);
 const detailToggle=$node('button','task-detail-toggle','✎ Details');detailToggle.type='button';
 const details=$node('div','task-details');details.hidden=true;
 const subtitle=$node('input','task-detail-input');subtitle.maxLength=160;subtitle.placeholder='Subtitle / chapter';subtitle.value=t.subtitle||'';subtitle.setAttribute('aria-label','Subtitle for '+t.title);subtitle.onchange=()=>updateTask(t.id,{subtitle:subtitle.value});
 const note=$node('textarea','task-detail-input task-note');note.maxLength=2000;note.rows=2;note.placeholder='Notes, pages, ideas…';note.value=t.note||'';note.setAttribute('aria-label','Notes for '+t.title);note.onchange=()=>updateTask(t.id,{note:note.value});
 details.append(subtitle,note);detailToggle.onclick=()=>{details.hidden=!details.hidden;};inner.append(detailToggle,details);const del=$node('button','task-del','×');del.setAttribute('aria-label','Delete task');del.onclick=()=>deleteTask(t.id);row.append(cb,inner,del);box.append(row);});}
async function loadShelf(){if(preview)state.links=demo.links||[];else{const {data,error}=await db.from('shelf_links').select('*').order('created_at',{ascending:false});if(error)throw error;state.links=data||[];}renderShelf();}
async function addShelf(e){e.preventDefault();const title=$('shelfTitle').value.trim(),url=$('shelfUrl').value.trim();if(!/^https:\/\//i.test(url)){toast('Please use a valid HTTPS link.');return;}
 try{if(preview){demo.links.unshift({id:makeId(),title,url});saveDemo();}else{const {error}=await db.from('shelf_links').insert({user_id:session.user.id,title,url});if(error)throw error;}
 $('shelfTitle').value='';$('shelfUrl').value='';await loadShelf();toast('Saved to your study shelf ♡');}catch(e){toast(e.message);}}
function renderShelf(){const box=$('shelfRows');box.replaceChildren();if(!state.links.length){box.append($node('p','empty-line','Your study shelf is waiting for its first playlist.'));return;}
 state.links.forEach(link=>{const row=$node('div','shelf-row');const a=$node('a','',link.title);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';const rm=$node('button','small-btn','Remove');rm.onclick=async()=>{try{if(preview){demo.links=demo.links.filter(x=>x.id!==link.id);saveDemo();}else{const {error}=await db.from('shelf_links').delete().eq('id',link.id);if(error)throw error;}await loadShelf();}catch(e){toast(e.message);}};row.append(a,rm);box.append(row);});}
function localInsights(){const blocks=demo.blocks||[],now=new Date(),startUTC=(type)=>{const d=new Date(now);d.setUTCHours(0,0,0,0);if(type==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(type==='month')d.setUTCDate(1);if(type==='year')d.setUTCMonth(0,1);return d.getTime();};const sum=(field,after=0)=>blocks.filter(b=>new Date(b.created_at).getTime()>=after).reduce((a,b)=>a+Number(b[field]||0),0);const days=new Set(blocks.filter(b=>b.seconds>0).map(b=>utcDate(b.created_at)));let d=new Date(startUTC('day')),streak=0;if(!days.has(utcDate(d)))d.setUTCDate(d.getUTCDate()-1);while(days.has(utcDate(d))){streak++;d.setUTCDate(d.getUTCDate()-1);}const weekChart=[];for(let i=6;i>=0;i--){const date=new Date(startUTC('day'));date.setUTCDate(date.getUTCDate()-i);const key=utcDate(date);weekChart.push({date:key,seconds:blocks.filter(b=>utcDate(b.created_at)===key).reduce((a,b)=>a+Number(b.seconds),0)});}
 let best=0,consecutive=0,lastDay=null;for(const key of [...days].sort()){const ord=Date.parse(key+'T00:00:00Z')/86400000;consecutive=lastDay===ord-1?consecutive+1:1;best=Math.max(best,consecutive);lastDay=ord;}
 return {best_streak:best,total_seconds:sum('seconds'),total_xp:sum('xp'),today_seconds:sum('seconds',startUTC('day')),today_xp:sum('xp',startUTC('day')),week_seconds:sum('seconds',startUTC('week')),month_seconds:sum('seconds',startUTC('month')),year_seconds:sum('seconds',startUTC('year')),streak,focus_rounds_today:demo.runs.filter(r=>r.completed&&new Date(r.ended_at).getTime()>=startUTC('day')).length,focus_rounds_total:demo.runs.filter(r=>r.completed).length,week_chart:weekChart};}
async function loadInsights(){try{state.insights=preview?localInsights():await rpc('get_my_insights');$('todayXp').textContent=xpFormat(state.insights.today_xp);$('focusRounds').textContent=Number(state.insights.focus_rounds_today||0);renderProfile();}catch(e){console.warn('Insights',e.message);}}
async function loadLeaderboard(notify=false){try{if(preview){const period=state.period,now=new Date(),d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));if(period==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(period==='month')d.setUTCDate(1);const p=demo.blocks.filter(b=>new Date(b.created_at)>=d).reduce((a,b)=>a+Number(b.xp),0);state.leaderboard=p>0?[{username:state.profile.username,avatar:state.profile.avatar,level:level(),period_xp:p,selected_badges:state.profile.selected_badges||[]}]:[];}
 else state.leaderboard=await rpc('get_focus_leaderboard',{p_period:state.period});renderLeaderboard();if(notify)toast('Leaderboard updated ♡');}catch(e){$('leaderboardRows').textContent='Rankings are unavailable right now.';}}
function renderLeaderboard(){const box=$('leaderboardRows');box.replaceChildren();if(!state.leaderboard?.length){box.append($node('p','empty-line',preview?'Start a focus session to appear here ♡':'No study sessions recorded for this period yet.'));return;}
 state.leaderboard.forEach((entry,i)=>{const row=$node('div','leader-row');const rank=$node('div','rank',i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1));const img=$node('img');img.src=asset('avatar'+Number(entry.avatar||1)+'.webp');img.alt='Study avatar';const name=$node('div');name.append($node('strong','',entry.username));name.append($node('small','',`Level ${entry.level||1}`));if(entry.selected_badges?.length){const badges=$node('span','leader-badges');entry.selected_badges.slice(0,3).forEach(id=>{const def=BADGES.find(b=>b.id===id);if(def){const icon=$node('img');icon.src=asset(def.asset);icon.alt=def.label;icon.title=def.label;badges.append(icon);}});name.append(badges);}const xp=$node('span','leader-xp',xpFormat(entry.period_xp)+' XP');row.append(rank,img,name,xp);box.append(row);});}
function level(){return 1+Math.floor(Number(state.insights?.total_xp||0)/50);}
function availableBadges(){const s=Number(state.insights.best_streak||state.insights.streak||0),h=hours(state.insights.total_seconds);return new Set(BADGES.filter(b=>(b.type==='streak'?s>=b.goal:h>=b.goal)).map(b=>b.id));}
function startTaskPeriod(period){const d=new Date();d.setUTCHours(0,0,0,0);if(period==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(period==='month')d.setUTCDate(1);if(period==='year')d.setUTCMonth(0,1);return d;}
function renderProfile(){if(!state.profile)return;const profile=state.profile,ins=state.insights;const xp=Number(ins.total_xp||0),lvl=level(),pct=(xp%50)/50*100;
 $('profileName').textContent='@'+profile.username;$('levelLabel').textContent='Level '+lvl+' · '+xpFormat(xp)+' study XP';$('planPill').textContent=profile.is_admin?'ADMIN · PREMIUM':profile.plan.toUpperCase();$('levelPct').textContent=Math.round(pct)+'%';$('levelProgress').style.width=pct+'%';$('profileAvatar').src=asset('avatar'+profile.avatar+'.webp');$('profileMini').src=asset('avatar'+profile.avatar+'.webp');$('adminPanel').hidden=!profile.is_admin;
 const taskDone=state.tasks.filter(t=>t.done),today=utcDate(new Date()),stats=[
 ['Today',fmtHours(ins.today_seconds)],['This week',fmtHours(ins.week_seconds)],['This month',fmtHours(ins.month_seconds)],['This year',fmtHours(ins.year_seconds)],['Total study',fmtHours(ins.total_seconds)],['Study streak',String(ins.streak||0)+' days'],['All focus rounds',String(ins.focus_rounds_total||0)],['To-Dos completed',String(taskDone.length)],['To-Dos today',String(taskDone.filter(t=>t.completed_at&&utcDate(t.completed_at)===today).length)],['To-Dos this week',String(taskDone.filter(t=>t.completed_at&&new Date(t.completed_at)>=startTaskPeriod('week')).length)],['To-Dos this month',String(taskDone.filter(t=>t.completed_at&&new Date(t.completed_at)>=startTaskPeriod('month')).length)],['To-Dos this year',String(taskDone.filter(t=>t.completed_at&&new Date(t.completed_at)>=startTaskPeriod('year')).length)]];
 const box=$('summaryStats');box.replaceChildren();stats.forEach(([name,v])=>{const div=$node('div','stat-card');div.append($node('b','',v),$node('small','',name));box.append(div);});
 $('accountHelp').textContent=preview?'Local preview only — your sample data stays on this browser.':'Account info and private study statistics are synchronized through Supabase.';
 renderHistory();renderAvatars();renderBadges();}
function renderHistory(){const chart=$('historyChart');chart.replaceChildren();const data=state.insights.week_chart||[];const max=Math.max(1800,...data.map(d=>Number(d.seconds||0)));data.forEach(item=>{const col=$node('div','chart-col');const bar=$node('div','chart-bar');bar.style.height=Math.max(3,Math.round(100*Number(item.seconds||0)/max))+'%';bar.title=item.date+' · '+fmtHours(item.seconds);col.append(bar,$node('span','',new Date(item.date+'T12:00:00Z').toLocaleDateString('en',{weekday:'short',timeZone:'UTC'})));chart.append(col);});$('historyDetail').textContent='Last seven UTC days · '+fmtHours(data.reduce((a,b)=>a+Number(b.seconds||0),0))+' studied';}
function avatarUnlock(i){const xp=Number(state.insights.total_xp||0);if(i===4||i===8)return premium()&&xp>=300;return xp>=(i===1||i===5?0:i===2||i===6?20:100);}
function renderAvatars(){const box=$('avatarGrid');box.replaceChildren();for(let i=1;i<=8;i++){const unlocked=avatarUnlock(i);const b=$node('button','avatar-choice'+(unlocked?'':' locked')+(state.profile.avatar===i?' selected':''));const img=$node('img');img.src=asset('avatar'+i+'.webp');img.alt='Portrait stage '+i;b.append(img,$node('small','',i===4||i===8?'Graduate ✦':'Stage '+((i-1)%4+1)));if(!unlocked)b.append($node('span','lock','🔒'));b.title=unlocked?'Select portrait':i===4||i===8?'Premium graduation avatar':'Study more to unlock';b.onclick=()=>chooseAvatar(i);box.append(b);}}
async function chooseAvatar(i){if(!avatarUnlock(i)){toast(i===4||i===8?'Graduation portrait needs Premium and 300 study XP':'Study more to unlock this portrait');return;}try{if(!preview)await rpc('change_my_avatar',{p_avatar:i});state.profile.avatar=i;if(preview){demo.profile.avatar=i;saveDemo();}renderProfile();await loadLeaderboard();toast('New portrait selected ♡');}catch(e){toast(e.message);}}
function renderBadges(){const box=$('achievementGrid');box.replaceChildren();const unlocked=availableBadges(),selected=new Set(state.profile.selected_badges||[]);BADGES.forEach(badge=>{const earned=unlocked.has(badge.id);const b=$node('button','achievement'+(earned?'':' locked')+(selected.has(badge.id)?' selected':''));const img=$node('img');img.src=asset(badge.asset);img.alt='Badge';b.append(img,$node('strong','',badge.label),$node('small','',earned?(selected.has(badge.id)?'On profile ✓':'Earned · tap to display'):badge.desc));b.title=earned?'Toggle public badge':'Not earned yet';b.onclick=()=>toggleBadge(badge.id);box.append(b);});}
async function toggleBadge(id){if(!availableBadges().has(id)){toast('Earn this badge first ♡');return;}const prev=state.profile.selected_badges||[],selection=new Set(prev);if(selection.has(id))selection.delete(id);else {if(selection.size>=3){toast('Choose at most three public badges.');return;}selection.add(id);}const a=[...selection];try{if(!preview)await rpc('set_my_badges',{p_badges:a});state.profile.selected_badges=a;if(preview){demo.profile.selected_badges=a;saveDemo();}renderBadges();await loadLeaderboard();}catch(e){toast(e.message);}}
function gameAllowed(g){const conf=(state.snapshot?.catalog||[]).find(x=>x.game===g.id);if(!conf)return false;if(conf.premium_only&&!premium())return false;return !!state.snapshot?.break_active||Number(state.insights.total_xp||0)>=Number(conf.xp_required||0);}
function renderGameCards(){const root=$('gameCards');root.replaceChildren();GAMES.forEach(game=>{const conf=(state.snapshot?.catalog||[]).find(x=>x.game===game.id)||{xp_required:0,premium_only:false,players:0};const available=!!state.profile&&gameAllowed(game);
 const card=$node('button','game-card');const art=$node('div','game-art',game.icon),copy=$node('div','game-copy');copy.append($node('strong','',game.name),$node('p','',game.description));const foot=$node('div','game-foot');foot.append($node('span','',(preview?'Local preview':conf.players+' playing now')),$node('b','',available?'Play →':conf.premium_only&&!premium()?'Premium ✦':'Unlock at '+xpFormat(conf.xp_required)+' XP'));copy.append(foot);card.append(art,copy);if(!available)card.append($node('span','game-lock','🔒 Locked'));card.onclick=()=>openGame(game.id);root.append(card);});}
async function openGame(id){const g=GAMES.find(x=>x.id===id);if(!g)return;if(!gameAllowed(g)){const conf=state.snapshot?.catalog?.find(x=>x.game===id);toast(conf?.premium_only&&!premium()?'Premium game ♡':'Study more to unlock this game.');return;}
 state.activeGame=id;state.room=null;state.gameSeed=Math.floor(Math.random()*1000000);$('gameTitle').textContent=g.name;$('gameMessage').textContent='';openModal('gameModal');renderRoomBar();window.GazelleGames?.open?.(id,state.gameSeed,completeGame);
 if(!preview)try{await rpc('game_ping',{p_game:id});}catch(e){toast(e.message);closeModal('gameModal');}
}
function renderRoomBar(){const bar=$('gameRoomBar');bar.replaceChildren();bar.append($node('span','',state.room?'Shared challenge code: '+state.room.code:'Play solo or race friends on the same puzzle.'));
 if(preview){bar.append($node('span','', 'Multiplayer is available with Supabase.'));return;}
 const create=$node('button','small-btn',state.room?'New room':'Create room');create.onclick=async()=>{try{state.room=await rpc('create_game_room',{p_game:state.activeGame});state.gameSeed=state.room.seed;window.GazelleGames?.open?.(state.activeGame,state.gameSeed,completeGame);renderRoomBar();toast('Share code '+state.room.code+' with a friend ♡');}catch(e){toast(e.message);}};
 const input=$node('input');input.placeholder='ABC123';input.maxLength=6;input.setAttribute('aria-label','Join shared game code');const join=$node('button','small-btn','Join');join.onclick=async()=>{try{const room=await rpc('join_game_room',{p_code:input.value.toUpperCase().trim()});if(room.game!==state.activeGame)throw Error('That room is for a different game.');state.room=room;state.gameSeed=room.seed;window.GazelleGames?.open?.(state.activeGame,room.seed,completeGame);renderRoomBar();toast('Joined shared challenge ♡');}catch(e){toast(e.message);}};
 bar.append(create,input,join);if(state.room){const score=$node('button','small-btn','Race scores');score.onclick=refreshRoomScores;bar.append(score);}}
async function refreshRoomScores(){if(!state.room)return;try{const data=await rpc('get_game_room_scores',{p_room:state.room.id});$('gameMessage').textContent=data.length?'Friendly race times: '+data.map((r,i)=>`${i+1}. ${r.username} ${r.duration_seconds}s`).join(' · '):'Nobody has finished this room yet.';}catch(e){toast(e.message);}}
async function completeGame(seconds){if(state.room&&!preview){try{await rpc('submit_game_result',{p_room:state.room.id,p_seconds:Math.ceil(seconds)});await refreshRoomScores();}catch(e){toast(e.message);}}else $('gameMessage').textContent='Beautifully done! ♡';}
async function loadAdminUsers(){if(!state.profile?.is_admin)return;try{const users=await rpc('admin_list_users');const box=$('adminUsers');box.replaceChildren();users.forEach(u=>{const row=$node('div','admin-user');row.append($node('span','', '@'+u.username+' · Lv '+u.level),$node('strong','',u.is_admin?'ADMIN':u.plan.toUpperCase()));box.append(row);});if(!users.length)box.append($node('p','empty-line','No registered users yet.'));}catch(e){$('adminStatus').textContent=e.message;}}
async function adminAction(action,username=null,value=null){if(!state.profile?.is_admin)return;try{await rpc('admin_control',{p_action:action,p_username:username,p_value:value});$('adminStatus').textContent='Updated securely ♡';await refreshSnapshot();await loadAdminUsers();}catch(e){$('adminStatus').textContent=e.message;}}
window.GazelleApp={gameDone:completeGame,toast,closeGame:()=>closeModal('gameModal')};
document.addEventListener('DOMContentLoaded',init);
})();
