/* Study With Gazelle v2 — original yellow-bubble UX, secure Supabase path + local preview. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const asset=name=>(window.GAZELLE_ASSETS&&window.GAZELLE_ASSETS[name])||'assets/'+name;
const cfg=window.GAZELLE_CONFIG||{};
const backendConfigured=!!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const configured=backendConfigured&&!!window.supabase;
let db=null, session=null, preview=false, authMode='login', currentPage='study', selectedSignupAvatar=1;
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
 {id:'first_focus',label:'First Focus',desc:'Complete your first focus round',asset:'achievements/first-focus.svg',goal:1,type:'rounds'},
 {id:'streak3',label:'3-Day Streak',desc:'Study three days in a row',asset:'achievements/streak-3.svg',goal:3,type:'streak'},
 {id:'streak7',label:'7-Day Streak',desc:'Study seven days in a row',asset:'achievements/streak-7.svg',goal:7,type:'streak'},
 {id:'streak30',label:'30-Day Streak',desc:'Study thirty days in a row',asset:'achievements/streak-30.svg',goal:30,type:'streak'},
 {id:'hours10',label:'10-Hour Scholar',desc:'Reach 10 recorded study hours',asset:'achievements/hours-10.svg',goal:10,type:'hours'},
 {id:'hours25',label:'25-Hour Scholar',desc:'Reach 25 recorded study hours',asset:'achievements/hours-25.svg',goal:25,type:'hours'},
 {id:'hours100',label:'Century Scholar',desc:'Reach 100 recorded study hours',asset:'achievements/hours-100.svg',goal:100,type:'hours'},
 {id:'hours500',label:'Study Legend',desc:'Reach 500 recorded study hours',asset:'achievements/hours-500.svg',goal:500,type:'hours'},
 {id:'rounds10',label:'Focus Starter',desc:'Complete 10 focus rounds',asset:'achievements/rounds-10.svg',goal:10,type:'rounds'},
 {id:'rounds50',label:'Focus Regular',desc:'Complete 50 focus rounds',asset:'achievements/rounds-50.svg',goal:50,type:'rounds'},
 {id:'rounds100',label:'Focus Master',desc:'Complete 100 focus rounds',asset:'achievements/rounds-100.svg',goal:100,type:'rounds'},
 {id:'subject5',label:'Curious Mind',desc:'Study five different subjects',asset:'achievements/subject-5.svg',goal:5,type:'subjects'}
];
const state={profile:null,preferences:{...DEFAULT_PREFS},tasks:[],links:[],insights:{},snapshot:null,leaderboard:[],period:'day',analyticsPeriod:'week',analytics:null,studyRecords:[],roomJoined:false,activeGame:null,room:null,gameSeed:null};
const timer={phase:'focus',studyMode:'solo',remaining:DEFAULT_PREFS.focus*60,deadline:0,running:false,busy:false,serverRunOpen:false,completedFocus:0,ticker:null,pulser:null,localLast:0,ending:false,infinite:false,subject:''};
let polling=null,pingBusy=false,toastTimeout=null,pulseCount=0,pollCount=0;
const pad=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
const formatTime=n=>`${pad(n/60)}:${pad(n%60)}`;
const xpFormat=x=>Number(x||0).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
const hours=s=>Number(s||0)/3600;
const fmtHours=s=>hours(s).toFixed(1).replace(/\.0$/,'')+'h';
const fmtDuration=s=>{const n=Math.max(0,Math.round(Number(s||0))),h=Math.floor(n/3600),m=Math.floor((n%3600)/60);return h?`${h}h ${m}m`:m?`${m}m`:`${n}s`;};
const utcDate=d=>new Date(d).toISOString().slice(0,10);
const localDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;};
const SUBJECT_COLORS=['#93B8B0','#D9A6B5','#AFA0CC','#D6B47D','#8FA8C8','#C58F79','#9FB77E','#B5A6A0'];
const subjectColor=name=>{let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))>>>0;return SUBJECT_COLORS[h%SUBJECT_COLORS.length];};
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
function selectSignupAvatar(i){selectedSignupAvatar=[1,5].includes(i)?i:1;document.querySelectorAll('[data-signup-avatar]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.signupAvatar)===selectedSignupAvatar));}
function setAuthView(mode){
 authMode=mode;
 const signup=mode==='signup',recovery=mode==='recovery';
 $('signupExtra').hidden=!signup;
 $('identity').hidden=signup||recovery;
 $('identity').required=!signup&&!recovery;
 $('signupUsername').required=signup;$('signupEmail').required=signup;
 document.querySelector('label[for="identity"]').hidden=signup||recovery;
 document.querySelector('.auth-tabs').hidden=recovery;
 document.querySelector('label[for="password"]').textContent=recovery?'New password':'Password';
 $('password').autocomplete=signup||recovery?'new-password':'current-password';
 $('password').value='';$('password').placeholder='At least 8 characters';
 $('loginTab').classList.toggle('active',!signup&&!recovery);
 $('signupTab').classList.toggle('active',signup);
 $('authTitle').textContent=recovery?'Choose a new password':signup?'Start your journey':'Welcome back';
 $('authDesc').textContent=recovery?'Enter a new password for your account.':signup?'Create your free study account.':'Log in to continue your study journey.';
 $('authSubmit').textContent=recovery?'Update password ♡':signup?'Create free account ♡':'Log in ♡';
 $('resetPassword').hidden=signup||recovery;
 $('authError').textContent='';
}
function setAuthError(msg){$('authError').textContent=msg||'';}
async function signIn(event){event.preventDefault();const submit=$('authSubmit');submit.disabled=true;setAuthError('');try{
 if(authMode==='recovery'){
  const password=$('password').value;
  if(password.length<8)throw Error('Choose at least 8 password characters.');
  const {error}=await db.auth.updateUser({password});if(error)throw error;
  await db.auth.signOut();setAuthView('login');setAuthError('Your password has been updated. You can now sign in.');
 }else if(authMode==='signup'){
  const username=$('signupUsername').value.trim().toLowerCase(),email=$('signupEmail').value.trim().toLowerCase(),password=$('password').value;
  if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Username: 3–24 lowercase letters, numbers or underscores.');
  if(password.length<8)throw Error('Choose at least 8 password characters.');
  const {data:available,error:availabilityError}=await db.rpc('is_username_available',{p_username:username});
  if(!availabilityError && available===false)throw Error('This username is already taken. Please choose another one.');
  const {data,error}=await db.auth.signUp({email,password,options:{data:{username,display_name:username,avatar:selectedSignupAvatar}}});
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
}catch(err){const raw=err.message||'Could not sign in';const duplicate=/duplicate key|profiles_username|username.*already|already.*username/i.test(raw);setAuthError(duplicate?'This username is already taken. Please choose another one.':raw);}finally{submit.disabled=false;}}
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
 $('infiniteToggle').onclick=toggleInfiniteMode;
 $('subjectInput').addEventListener('change',()=>{if(!timer.serverRunOpen&&!timer.running)timer.subject=$('subjectInput').value.trim().slice(0,60);});
 document.querySelectorAll('[data-signup-avatar]').forEach(b=>b.onclick=()=>selectSignupAvatar(Number(b.dataset.signupAvatar)));
 document.querySelectorAll('[data-analytics-period]').forEach(b=>b.onclick=()=>{state.analyticsPeriod=b.dataset.analyticsPeriod;document.querySelectorAll('[data-analytics-period]').forEach(x=>x.classList.toggle('active',x.dataset.analyticsPeriod===state.analyticsPeriod));loadAnalytics();});
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
 renderThemes();renderGameCards();renderTimer();selectSignupAvatar(1);
 if(!configured){
  $('cloudAuth').hidden=true;$('demoEntry').hidden=!cfg.ALLOW_LOCAL_PREVIEW;
  setAuthError(backendConfigured?'Could not load the Supabase library. Check your connection or CDN settings.':cfg.ALLOW_LOCAL_PREVIEW?'':'Set Supabase URL/key in config.js to enable cloud accounts.');
  return;
 }
 db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 db.auth.onAuthStateChange((event,next)=>{
  if(event==='SIGNED_OUT')showLogin();
  if(event==='PASSWORD_RECOVERY'){
   session=next;$('authGate').hidden=false;$('appRoot').hidden=true;
   setAuthView('recovery');setAuthError('Recovery link verified. Choose a new password below.');
  }
 });
 const {data,error}=await db.auth.getSession();if(error){setAuthError(error.message);return;}
 if(data.session&&authMode!=='recovery'){session=data.session;await enterApp();}
}
async function enterApp(){try{
 if(!preview){const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Please log in.');session=data.session;const {data:profile,error:pe}=await db.from('profiles').select('*').eq('user_id',session.user.id).single();if(pe)throw pe;state.profile=profile;const {data:pref}=await db.from('preferences').select('settings').eq('user_id',session.user.id).maybeSingle();state.preferences={...DEFAULT_PREFS,...(pref?.settings||{})};}
 else{state.profile=demo.profile;state.preferences={...DEFAULT_PREFS,...demo.preferences};}
 $('authGate').hidden=true;$('appRoot').hidden=false;$('previewRibbon').hidden=!preview;
 timer.phase='focus';timer.studyMode='solo';timer.remaining=Number(state.preferences.focus)*60;timer.running=false;timer.serverRunOpen=false;timer.infinite=false;timer.subject='';$('subjectInput').value='';
 applyTheme();renderSettings();navigate('study');
 await Promise.all([loadTasks(),loadShelf(),loadInsights(),refreshSnapshot(),loadLeaderboard(),loadAnalytics(),loadStudyRecords()]);
 renderProfile();renderGameCards();if(!preview&&state.profile.is_admin)loadAdminUsers();
 if(!preview){await recoverRun();await heartBeat();polling=setInterval(()=>{heartBeat();refreshSnapshot();loadLeaderboard();if(currentPage==='profile')loadStudyRecords();},20000);}
}catch(e){console.error(e);toast(e.message||'Could not load account');if(!preview){$('authGate').hidden=false;$('appRoot').hidden=true;setAuthError(e.message||'Could not load account');}}}
function showLogin(){stopIntervals();preview=false;session=null;state.profile=null;$('authGate').hidden=false;$('appRoot').hidden=true;setAuthView('login');}
async function logout(){if(timer.running)await pauseTimer();if(timer.serverRunOpen&&!preview){try{await rpc('tick_study',{p_action:'stop'});}catch{}}stopIntervals();if(!preview)await db.auth.signOut();showLogin();}
function stopIntervals(){if(timer.ticker)clearInterval(timer.ticker);if(timer.pulser)clearInterval(timer.pulser);if(polling)clearInterval(polling);timer.ticker=timer.pulser=polling=null;timer.running=false;}
function navigate(section){if(!['study','todoSection','games','playlists','profile'].includes(section))return;currentPage=section;document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===section));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===section));window.scrollTo({top:0,behavior:'auto'});if(section==='profile'){renderProfile();loadAnalytics();loadStudyRecords();}if(section==='games')renderGameCards();}
function openModal(id){$(id).hidden=false;if(id==='themeModal')renderThemes();}
function closeModal(id){$(id).hidden=true;if(id==='gameModal'){state.activeGame=null;state.room=null;window.GazelleGames?.close?.();if(!preview)rpc('game_leave').catch(()=>{});}}
function settingValues(){return {focus:Number($('focusMinutes').value),short:Number($('shortMinutes').value),long:Number($('longMinutes').value),rounds:Number($('rounds').value),autoBreak:$('autoBreak').checked};}
function renderSettings(){const p=state.preferences;for(const [k,id] of [['focus','focusMinutes'],['short','shortMinutes'],['long','longMinutes'],['rounds','rounds']])$(id).value=p[k];$('autoBreak').checked=!!p.autoBreak;}
async function saveTimerSettings(){const p=settingValues();if(!Number.isInteger(p.focus)||p.focus<1||p.focus>180||!Number.isInteger(p.short)||p.short<1||p.short>60||!Number.isInteger(p.long)||p.long<1||p.long>90||!Number.isInteger(p.rounds)||p.rounds<2||p.rounds>12){toast('Check the duration limits.');return;}
 const previous={...state.preferences},previousRemaining=timer.remaining;
 try{await stopCurrentRun();state.preferences={...state.preferences,...p};await persistPreferences();timer.remaining=Number(p[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;renderTimer();closeModal('settingsModal');toast('Pomodoro settings saved ♡');}catch(e){state.preferences=previous;timer.remaining=previousRemaining;renderSettings();renderTimer();toast(e.message);}}
async function persistPreferences(){if(preview){demo.preferences={...state.preferences};saveDemo();return;}await rpc('save_my_preferences',{p_settings:state.preferences});}
function premium(){return state.profile && (state.profile.plan==='premium'||state.profile.is_admin);}
function renderThemes(){const grid=$('themeGrid');grid.replaceChildren();THEMES.forEach(t=>{const locked=!!(t.premium&&!premium());const b=$node('button','theme-choice'+(t.name===state.preferences.theme?' current':''),t.name+(locked?' ✦':''));b.type='button';b.title=locked?'Premium only':t.name;const pips=$node('span','theme-pips');t.colors.forEach(c=>{const i=document.createElement('i');i.style.background=c;pips.append(i);});b.prepend(pips);b.onclick=()=>selectTheme(t);grid.append(b);});document.querySelectorAll('[data-shape]').forEach(b=>b.classList.toggle('active',b.dataset.shape===state.preferences.shape));document.querySelectorAll('[data-shape]').forEach(b=>b.onclick=async()=>{const previous=state.preferences.shape;state.preferences.shape=b.dataset.shape;applyTheme();try{await persistPreferences();}catch(e){state.preferences.shape=previous;applyTheme();toast(e.message);}renderThemes();});}
async function selectTheme(t){if(t.premium&&!premium()){toast('This palette is a Premium theme ♡');return;}const previous=state.preferences.theme;state.preferences.theme=t.name;applyTheme();try{await persistPreferences();renderThemes();toast(t.name+' applied ♡');}catch(e){state.preferences.theme=previous;applyTheme();toast(e.message);}}
function applyTheme(){const p=THEMES.find(t=>t.name===state.preferences.theme)||THEMES[2];const root=document.documentElement;const c=p.colors;
 root.style.setProperty('--bg',p.bg);root.style.setProperty('--accent',p.accent);root.style.setProperty('--second',p.secondary);root.style.setProperty('--gradA',p.name==='Buttercream'?'#FFF1B5':lighten(c[0],0.4));root.style.setProperty('--gradB',c[0]);root.style.setProperty('--gradC',darken(c[0],0.11));
 $('timerBubble').classList.remove('shape-bubble','shape-soft','shape-halo');$('timerBubble').classList.add('shape-'+(state.preferences.shape||'bubble'));
}
function lighten(hex,f){return blend(hex,'#ffffff',f);}function darken(hex,f){return blend(hex,'#836f66',f);}
function blend(a,b,f){function rgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v*(1-f)+y[i]*f).toString(16).padStart(2,'0')).join('');}
function renderTimer(){const target = Number(state.preferences.focus) * 60;
const left = timer.running
  ? Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000))
  : timer.remaining;

const n = timer.infinite
  ? Math.max(0, target - left)
  : left;
 $('timeDisplay').textContent=formatTime(n);
 $('modeLabel').textContent=timer.phase==='focus'?(timer.infinite?'INFINITE FOCUS':'FOCUS TIME'):timer.phase==='short'?'SHORT BREAK':'LONG BREAK';
 $('startBtn').textContent=timer.running?'PAUSE':n<(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long']*60)?'RESUME':'START';
 $('sessionLabel').textContent=timer.running?(timer.phase==='focus'?(timer.infinite?'A fresh focus cycle, every time ✦':'One page at a time ✦'):'Enjoy your little pause ♡'):(timer.phase==='focus'?'Ready when you are ♡':'Time to rest ♡');
 $('xpNote').textContent=(timer.studyMode==='together'?'Together earns 20 XP/hour':'Solo earns 10 XP/hour')+' · only actual active focus time counts';
 document.querySelectorAll('[data-study-mode]').forEach(b=>b.classList.toggle('active',b.dataset.studyMode===timer.studyMode));
 $('currentStudyCount').textContent=state.snapshot?.[timer.studyMode]??(preview?'—':'0');$('currentStudyLabel').textContent=timer.studyMode==='solo'?'Studying in Solo':'Studying Together';
 $('togetherInfo').hidden=timer.studyMode!=='together';$('joinRoom').textContent=state.roomJoined?'Joined ✓':'Join room';$('joinRoom').disabled=!(state.snapshot?.room_open)&&!preview;
 $('togetherStatus').textContent=state.snapshot?.room_open?'Host room is open ♡':'Waiting for host to open the room';
 $('infiniteToggle').classList.toggle('active',timer.infinite);$('infiniteToggle').setAttribute('aria-pressed',String(timer.infinite));$('infiniteToggle').disabled=timer.running;
 $('subjectInput').value=timer.subject;$('subjectInput').disabled=timer.running||timer.serverRunOpen;
}
async function setStudyMode(next){if(!['solo','together'].includes(next))return;if(next==='together'){if(!premium()){toast('Study Together is a Premium feature.');return;}if(!state.snapshot?.room_open){toast('The host has not opened a study room yet.');return;}}
 if(timer.studyMode===next)return;try{await stopCurrentRun();timer.studyMode=next;timer.remaining=Number(state.preferences.focus)*60;timer.phase='focus';state.roomJoined=next==='solo';renderTimer();}catch(e){toast('Could not switch study mode: '+e.message);}}
async function joinTogether(){if(!premium()||!state.snapshot?.room_open){toast('The room needs Premium access and an active host.');return;}state.roomJoined=true;renderTimer();toast('Joined the host study room ♡');}
function stopLocalClock(){timer.running=false;if(timer.ticker)clearInterval(timer.ticker);if(timer.pulser)clearInterval(timer.pulser);timer.ticker=timer.pulser=null;}
async function stopCurrentRun(){if(timer.running)await pauseTimer();if(timer.serverRunOpen&&!preview){await rpc('tick_study',{p_action:'stop'});timer.serverRunOpen=false;}timer.running=false;timer.remaining=Number(state.preferences.focus)*60;}
async function switchPhase(phase){try{if(timer.running)await pauseTimer();if(timer.phase==='focus'&&phase!=='focus'&&timer.serverRunOpen){await stopCurrentRun();}timer.phase=phase;if(phase!=='focus')timer.infinite=false;timer.remaining=Number(state.preferences[phase==='focus'?'focus':phase==='short'?'short':'long'])*60;renderTimer();}catch(e){toast('Could not switch timer mode: '+e.message);}}
async function toggleTimer(){if(timer.busy||timer.ending)return;timer.busy=true;try{if(timer.running)await pauseTimer();else await startTimer();}catch(e){toast(e.message||'Timer error');}finally{timer.busy=false;renderTimer();}}
async function startTimer(){if(timer.phase==='focus'){
 if(timer.studyMode==='together'&&(!premium()||!state.snapshot?.room_open||!state.roomJoined)){throw Error('Join an open Premium host room first.');}
 if(!preview){
  if(!timer.serverRunOpen){
   const started=await rpc('start_study_with_subject',{p_mode:timer.studyMode,p_target_seconds:Math.max(60,Math.round(timer.remaining)),p_subject:timer.subject||null});
   timer.serverRunOpen=true;
   if(Number(started?.seconds)>0&&Number.isFinite(Number(started?.target_seconds)))timer.remaining=Math.max(0,Math.ceil(Number(started.target_seconds)-Number(started.seconds)));
   if(started?.active===false){const resumed=await rpc('tick_study',{p_action:'resume'});if(resumed?.status==='missing'||resumed?.status==='room_closed'){timer.serverRunOpen=false;throw Error('Your previous study session has ended. Press Start again to begin a new one.');}}
  }else{
   const resumed=await rpc('tick_study',{p_action:'resume'});
   if(resumed?.status==='missing'||resumed?.status==='room_closed'){
    timer.serverRunOpen=false;
    if(timer.studyMode==='together'){timer.studyMode='solo';state.roomJoined=false;}
    throw Error('Your previous study session has ended. Press Start again to begin a new one.');
   }
  }
 }
 timer.localLast=Date.now();
}
 timer.deadline=Date.now()+timer.remaining*1000;timer.running=true;
 timer.ticker=setInterval(tickTimer,200);if(timer.phase==='focus')timer.pulser=setInterval(pulseFocus,20000);renderTimer();
}
async function pauseTimer(){if(!timer.running)return;timer.remaining=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));stopLocalClock();if(timer.phase==='focus'){
 if(preview)accountLocalFocus();else if(timer.serverRunOpen){try{
  const r=await rpc('tick_study',{p_action:'pause'});
  if(r?.status==='room_closed'||r?.status==='missing'){
   timer.serverRunOpen=false;
   if(timer.studyMode==='together'){timer.studyMode='solo';state.roomJoined=false;}
   toast('The server study session has ended. Any unsynced time was not added.');
  }else await loadInsights();
 }catch(e){toast('Could not sync focus time: '+e.message);}}
}renderTimer();}
async function resetTimer(){if(timer.busy)return;timer.busy=true;try{await stopCurrentRun();timer.remaining=Number(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;toast('Timer reset ♡');}catch(e){toast('Could not reset timer: '+e.message);}finally{timer.busy=false;renderTimer();await loadInsights();}}
function tickTimer(){if(!timer.running)return;const left=Math.ceil((timer.deadline-Date.now())/1000);$('const shown = timer.infinite
  ? Math.max(0, Number(state.preferences.focus) * 60 - left)
  : Math.max(0, left);

$('#timeDisplay').textContent = formatTime(shown);if(left<=0&&!timer.ending){timer.ending=true;completeTimer().finally(()=>{timer.ending=false;});}}
async function completeTimer(){const original=timer.phase;stopLocalClock();timer.remaining=0;let syncNotice='',canContinueInfinite=true;
 if(original==='focus'){
  if(preview){accountLocalFocus();demo.runs.push({completed:true,ended_at:new Date().toISOString()});saveDemo();}
  else if(timer.serverRunOpen){try{
   const res=await rpc('tick_study',{p_action:'complete'});timer.serverRunOpen=false;
   if(res.status==='room_closed'||res.status==='missing'){syncNotice='The server session ended before this round could be recorded.';canContinueInfinite=false;if(timer.studyMode==='together'){timer.studyMode='solo';state.roomJoined=false;}}
   else if(!res.completed)syncNotice='Focus time was recorded, but the round was not marked complete.';
  }catch(e){syncNotice='Study sync error: '+e.message;canContinueInfinite=false;}}
  timer.completedFocus++;await loadInsights();await refreshSnapshot();await loadLeaderboard();await loadStudyRecords();
  if(timer.infinite&&canContinueInfinite){
   timer.phase='focus';timer.remaining=Number(state.preferences.focus)*60;renderTimer();
   toast(syncNotice||'Focus cycle complete — starting the next one ♡');
   await startTimer();return;
  }
  timer.phase=timer.completedFocus%state.preferences.rounds===0?'long':'short';
 }else timer.phase='focus';
 timer.remaining=Number(state.preferences[timer.phase==='focus'?'focus':timer.phase==='short'?'short':'long'])*60;
 renderTimer();toast(syncNotice||(original==='focus'?'Focus complete! Lovely work ♡':'Break finished — welcome back ♡'));
 if(original==='focus'&&state.preferences.autoBreak){await startTimer();}
}
async function toggleInfiniteMode(){if(timer.running){toast('Pause the timer before changing modes.');return;}try{if(timer.serverRunOpen)await stopCurrentRun();timer.infinite=!timer.infinite;timer.phase='focus';timer.remaining=Number(state.preferences.focus)*60;renderTimer();toast(timer.infinite?'Infinite focus is on ♡':'Regular Pomodoro is on ♡');}catch(e){toast('Could not change timer mode: '+e.message);}}
function accountLocalFocus(){if(!timer.localLast)return;const now=Date.now();const sec=Math.max(0,(now-timer.localLast)/1000);timer.localLast=now;
 if(sec<0.001)return;demo.blocks.push({seconds:sec,xp:sec/(timer.studyMode==='together'?180:360),mode:timer.studyMode,subject:timer.subject||null,created_at:new Date().toISOString()});saveDemo();}
function applyPulseToInsights(result){
 const ds=Number(result?.added_seconds||0),dx=Number(result?.added_xp||0);if(ds<=0)return;
 for(const key of ['total_seconds','today_seconds','week_seconds','month_seconds','year_seconds'])
  state.insights[key]=Number(state.insights[key]||0)+ds;
 for(const key of ['total_xp','today_xp'])state.insights[key]=Number(state.insights[key]||0)+dx;
 const chart=state.insights.week_chart||[],last=chart[chart.length-1];
 if(last&&last.date===utcDate(new Date()))last.seconds=Number(last.seconds||0)+ds;
 $('todayXp').textContent=xpFormat(state.insights.today_xp);renderProfile();
}
async function pulseFocus(){if(!timer.running||timer.phase!=='focus'||pingBusy)return;pingBusy=true;try{
 if(preview){accountLocalFocus();await loadInsights();}
 else{
  const res=await rpc('tick_study',{p_action:'pulse'});
  if(res?.status==='room_closed'||res?.status==='missing'){
   timer.remaining=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));stopLocalClock();timer.serverRunOpen=false;
   if(timer.studyMode==='together'){timer.studyMode='solo';state.roomJoined=false;}
   toast(res.status==='room_closed'?'The host closed the room. Study Together has ended.':'The server study session has ended.');renderTimer();
  }else if(res?.status==='paused'&&timer.running){
   timer.remaining=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));stopLocalClock();
   toast('Your server study session is paused. Press Start to resume.');renderTimer();
  }else applyPulseToInsights(res);
  if(++pulseCount%6===0)await loadInsights();
 }
 }catch(e){console.warn('Focus heartbeat failed:',e.message);}finally{pingBusy=false;}}
async function recoverRun(){try{
 const {data}=await db.from('study_runs').select('mode,target_seconds,total_seconds,is_active,subject').is('ended_at',null).maybeSingle();if(!data)return;
 const s=await rpc('tick_study',{p_action:'pause'});timer.serverRunOpen=!['room_closed','missing'].includes(s?.status);
 timer.phase='focus';timer.studyMode=data.mode;timer.subject=data.subject||'';$('subjectInput').value=timer.subject;timer.remaining=Math.max(0,Math.ceil(Number(data.target_seconds)-Number(s?.seconds??data.total_seconds)));timer.running=false;
 if(!timer.serverRunOpen&&data.mode==='together'){timer.studyMode='solo';state.roomJoined=false;}else state.roomJoined=data.mode==='together';
 renderTimer();toast(timer.serverRunOpen?'Your previous session was restored paused ♡':'Your previous study session has ended.');
 }catch(e){console.warn('Run recovery:',e.message);}}
async function heartBeat(){if(preview||!session)return;try{await rpc('presence_ping');if(state.activeGame)await rpc('game_ping',{p_game:state.activeGame});}catch(e){console.warn('Presence',e.message);}}
async function refreshSnapshot(){if(preview){state.snapshot={registered:'—',online:'—',solo:'—',together:'—',break_active:!!demo.previewBreak,room_open:false,catalog:[{game:'crossword',xp_required:0,premium_only:false,players:0},{game:'sudoku',xp_required:10,premium_only:false,players:0},{game:'memory',xp_required:5,premium_only:false,players:0},{game:'jigsaw',xp_required:15,premium_only:false,players:0}]};}
 else{try{state.snapshot=await rpc('get_app_snapshot');}catch(e){console.warn('Snapshot',e.message);return;}}
 $('registeredCount').textContent=state.snapshot.registered;$('onlineCount').textContent=state.snapshot.online;
 if(preview)$('previewBreakToggle').textContent=demo.previewBreak?'Lock games again':'Try all games';
 if(!state.snapshot.room_open&&timer.studyMode==='together'&&!timer.running){state.roomJoined=false;timer.studyMode='solo';}
 $('roomToggle').textContent=state.snapshot.room_open?'Close Together room':'Open Together room';$('breakToggle').textContent=state.snapshot.break_active?'Disable Break Mode':'Enable Break Mode';
 $('breakBanner').textContent=state.snapshot.break_active?(preview?'☕ Local showcase: all four games are temporarily unlocked.':'☕ Host Break Mode is on — study XP requirements are waived!'):'Games unlock through accumulated study XP. Requirements are provisional.';
 renderTimer();renderGameCards();}
async function loadTasks(){if(preview){state.tasks=demo.tasks||[];}else{const {data,error}=await db.from('todos').select('*').order('created_at',{ascending:false});if(error)throw error;state.tasks=data||[];}renderTasks();}
async function submitTask(e){e.preventDefault();const title=$('taskInput').value.trim(),repeatCount=Math.min(99,Math.max(1,Number.parseInt($('taskRepeats').value||'1',10)));if(!title)return;
 try{if(preview){const t={id:makeId(),title,done:false,repeat_count:repeatCount,completed_repeats:0,created_at:new Date().toISOString(),completed_at:null};demo.tasks.unshift({...t,subtitle:'',note:''});saveDemo();}
 else{const {error}=await db.from('todos').insert({title,user_id:session.user.id,repeat_count:repeatCount,completed_repeats:0});if(error)throw error;}
 $('taskInput').value='';$('taskRepeats').value='1';await loadTasks();renderProfile();}catch(e){toast(e.message);}}
async function updateTask(id,patch){try{if(preview){const t=demo.tasks.find(x=>x.id===id);Object.assign(t,patch);saveDemo();}else{const {error}=await db.from('todos').update(patch).eq('id',id);if(error)throw error;}await loadTasks();renderProfile();}catch(e){toast(e.message);}}
async function advanceTask(task){const total=Math.max(1,Number(task.repeat_count||1)),done=Math.min(total,Number(task.completed_repeats??(task.done?total:0)));const next=done>=total?0:done+1;await updateTask(task.id,{completed_repeats:next,done:next>=total,completed_at:next>=total?new Date().toISOString():null});}
async function deleteTask(id){try{if(preview){demo.tasks=demo.tasks.filter(t=>t.id!==id);saveDemo();}else{const {error}=await db.from('todos').delete().eq('id',id);if(error)throw error;}await loadTasks();renderProfile();}catch(e){toast(e.message);}}
function renderTasks(){const box=$('taskRows');box.replaceChildren();const done=state.tasks.filter(t=>t.done).length,total=state.tasks.length;
 $('todoProgressLabel').textContent=`${done} of ${total} completed`;$('todoPercent').textContent=(total?Math.round(100*done/total):0)+'%';$('todoProgress').style.width=(total?100*done/total:0)+'%';$('emptyTasks').hidden=total>0;
 state.tasks.forEach(t=>{const row=$node('div','task-row'+(t.done?' task-done':''));const count=Math.max(1,Number(t.repeat_count||1)),completed=Math.min(count,Number(t.completed_repeats??(t.done?count:0)));
 const progress=$node('button','task-repeat-control');progress.type='button';progress.title=t.done?'Tap to reset repetitions':'Tap to complete one repetition';const label=$node('span','task-repeat-label',t.done?'✓':`${completed}/${count}`);const track=$node('span','task-repeat-track'),fill=$node('span','task-repeat-fill');fill.style.width=(completed/count*100)+'%';track.append(fill);progress.append(label,track);progress.onclick=()=>advanceTask(t);
 const inner=$node('div','task-main');const input=$node('input','task-edit');input.value=t.title;input.maxLength=140;input.title='Click to rename your task';input.onchange=()=>{const str=input.value.trim();if(str&&str!==t.title)updateTask(t.id,{title:str});};const small=$node('small','',t.done?'All repetitions completed ♡':`${count-completed} repetition${count-completed===1?'':'s'} left`);inner.append(input,small);
 const detailToggle=$node('button','task-detail-toggle','✎ Details');detailToggle.type='button';const details=$node('div','task-details');details.hidden=true;
 const subtitle=$node('input','task-detail-input');subtitle.maxLength=160;subtitle.placeholder='Subtitle / chapter';subtitle.value=t.subtitle||'';subtitle.setAttribute('aria-label','Subtitle for '+t.title);subtitle.onchange=()=>updateTask(t.id,{subtitle:subtitle.value});
 const note=$node('textarea','task-detail-input task-note');note.maxLength=2000;note.rows=2;note.placeholder='Notes, pages, ideas…';note.value=t.note||'';note.setAttribute('aria-label','Notes for '+t.title);note.onchange=()=>updateTask(t.id,{note:note.value});
 details.append(subtitle,note);detailToggle.onclick=()=>{details.hidden=!details.hidden;};inner.append(detailToggle,details);const del=$node('button','task-del','×');del.setAttribute('aria-label','Delete task');del.onclick=()=>deleteTask(t.id);row.append(progress,inner,del);box.append(row);});}
async function loadShelf(){if(preview)state.links=demo.links||[];else{const {data,error}=await db.from('shelf_links').select('*').order('created_at',{ascending:false});if(error)throw error;state.links=data||[];}renderShelf();}
async function addShelf(e){e.preventDefault();const title=$('shelfTitle').value.trim(),rawUrl=$('shelfUrl').value.trim();let parsedUrl;
 if(!title){toast('Please add a title for this link.');return;}
 try{parsedUrl=new URL(rawUrl);}catch{toast('Please enter a valid HTTPS link.');return;}
 if(parsedUrl.protocol!=='https:'){toast('Please use a valid HTTPS link.');return;}
 const url=parsedUrl.href;
 try{if(preview){demo.links.unshift({id:makeId(),title,url});saveDemo();}else{const {error}=await db.from('shelf_links').insert({user_id:session.user.id,title,url});if(error)throw error;}
 $('shelfTitle').value='';$('shelfUrl').value='';await loadShelf();toast('Saved to your study shelf ♡');}catch(e){toast(e.message);}}
function renderShelf(){const box=$('shelfRows');box.replaceChildren();if(!state.links.length){box.append($node('p','empty-line','Your study shelf is waiting for its first playlist.'));return;}
 state.links.forEach(link=>{const row=$node('div','shelf-row');const a=$node('a','',link.title);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';const rm=$node('button','small-btn','Remove');rm.onclick=async()=>{try{if(preview){demo.links=demo.links.filter(x=>x.id!==link.id);saveDemo();}else{const {error}=await db.from('shelf_links').delete().eq('id',link.id);if(error)throw error;}await loadShelf();}catch(e){toast(e.message);}};row.append(a,rm);box.append(row);});}
function localInsights(){const blocks=demo.blocks||[],now=new Date(),startUTC=(type)=>{const d=new Date(now);d.setUTCHours(0,0,0,0);if(type==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(type==='month')d.setUTCDate(1);if(type==='year')d.setUTCMonth(0,1);return d.getTime();};const sum=(field,after=0)=>blocks.filter(b=>new Date(b.created_at).getTime()>=after).reduce((a,b)=>a+Number(b[field]||0),0);const days=new Set(blocks.filter(b=>b.seconds>0).map(b=>utcDate(b.created_at)));let d=new Date(startUTC('day')),streak=0;if(!days.has(utcDate(d)))d.setUTCDate(d.getUTCDate()-1);while(days.has(utcDate(d))){streak++;d.setUTCDate(d.getUTCDate()-1);}const weekChart=[];for(let i=6;i>=0;i--){const date=new Date(startUTC('day'));date.setUTCDate(date.getUTCDate()-i);const key=utcDate(date);weekChart.push({date:key,seconds:blocks.filter(b=>utcDate(b.created_at)===key).reduce((a,b)=>a+Number(b.seconds),0)});}
 let best=0,consecutive=0,lastDay=null;for(const key of [...days].sort()){const ord=Date.parse(key+'T00:00:00Z')/86400000;consecutive=lastDay===ord-1?consecutive+1:1;best=Math.max(best,consecutive);lastDay=ord;}
 return {best_streak:best,subject_count:new Set(blocks.map(b=>String(b.subject||'').trim()).filter(Boolean)).size,total_seconds:sum('seconds'),total_xp:sum('xp'),today_seconds:sum('seconds',startUTC('day')),today_xp:sum('xp',startUTC('day')),week_seconds:sum('seconds',startUTC('week')),month_seconds:sum('seconds',startUTC('month')),year_seconds:sum('seconds',startUTC('year')),streak,focus_rounds_today:demo.runs.filter(r=>r.completed&&new Date(r.ended_at).getTime()>=startUTC('day')).length,focus_rounds_total:demo.runs.filter(r=>r.completed).length,week_chart:weekChart};}
async function loadInsights(){try{state.insights=preview?localInsights():await rpc('get_my_insights');if(!preview)state.insights.subject_count=await rpc('get_my_subject_count');$('todayXp').textContent=xpFormat(state.insights.today_xp);$('focusRounds').textContent=Number(state.insights.focus_rounds_today||0);renderProfile();}catch(e){console.warn('Insights',e.message);}}
async function loadLeaderboard(notify=false){try{if(preview){const period=state.period,now=new Date(),d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));if(period==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(period==='month')d.setUTCDate(1);const own=demo.blocks.filter(b=>new Date(b.created_at)>=d),p=own.reduce((a,b)=>a+Number(b.xp),0),secs=own.reduce((a,b)=>a+Number(b.seconds),0);state.leaderboard=p>0?[{username:state.profile.username,avatar:state.profile.avatar,level:level(),period_xp:p,period_seconds:secs,is_studying:timer.running&&timer.phase==='focus',selected_badges:state.profile.selected_badges||[]}]:[];}
 else state.leaderboard=await rpc('get_focus_leaderboard',{p_period:state.period});renderLeaderboard();if(notify)toast('Leaderboard updated ♡');}catch(e){$('leaderboardRows').textContent='Rankings are unavailable right now.';}}
function renderLeaderboard(){const box=$('leaderboardRows');box.replaceChildren();if(!state.leaderboard?.length){box.append($node('p','empty-line',preview?'Start a focus session to appear here ♡':'No study sessions recorded for this period yet.'));return;}
 state.leaderboard.forEach((entry,i)=>{const row=$node('div','leader-row');const rank=$node('div','rank',i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1));const avatarWrap=$node('div','leader-avatar-wrap');const img=$node('img');img.src=asset('avatar'+Number(entry.avatar||1)+'.webp');img.alt='Study avatar';avatarWrap.append(img);if(entry.is_studying){const dot=$node('span','leader-live-dot');dot.title='Studying now';dot.setAttribute('aria-label','Studying now');avatarWrap.append(dot);}const name=$node('div','leader-name');name.append($node('strong','',entry.username));name.append($node('small','',`Level ${entry.level||1} · ${fmtDuration(entry.period_seconds)} study`));if(entry.selected_badges?.length){const badges=$node('span','leader-badges');entry.selected_badges.slice(0,3).forEach(id=>{const def=BADGES.find(b=>b.id===id);if(def){const icon=$node('img');icon.src=asset(def.asset);icon.alt=def.label;icon.title=def.label;badges.append(icon);}});name.append(badges);}const xp=$node('span','leader-xp',xpFormat(entry.period_xp)+' XP');row.append(rank,avatarWrap,name,xp);box.append(row);});}
function level(){return 1+Math.floor(Number(state.insights?.total_xp||0)/50);}
function availableBadges(){const s=Number(state.insights.best_streak||state.insights.streak||0),h=hours(state.insights.total_seconds),r=Number(state.insights.focus_rounds_total||0),subjects=Number(state.insights.subject_count||0);return new Set(BADGES.filter(b=>b.type==='streak'?s>=b.goal:b.type==='hours'?h>=b.goal:b.type==='rounds'?r>=b.goal:b.type==='subjects'?subjects>=b.goal:false).map(b=>b.id));}
function startTaskPeriod(period){const d=new Date();d.setUTCHours(0,0,0,0);if(period==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(period==='month')d.setUTCDate(1);if(period==='year')d.setUTCMonth(0,1);return d;}
function renderProfile(){if(!state.profile)return;const profile=state.profile,ins=state.insights;const xp=Number(ins.total_xp||0),lvl=level(),pct=(xp%50)/50*100;
 $('profileName').textContent='@'+profile.username;$('levelLabel').textContent='Level '+lvl+' · '+xpFormat(xp)+' study XP';$('planPill').textContent=profile.is_admin?'ADMIN · PREMIUM':profile.plan.toUpperCase();$('levelPct').textContent=Math.round(pct)+'%';$('levelProgress').style.width=pct+'%';$('profileAvatar').src=asset('avatar'+profile.avatar+'.webp');$('profileMini').src=asset('avatar'+profile.avatar+'.webp');$('adminPanel').hidden=!profile.is_admin;
 const stats=[['Today',fmtHours(ins.today_seconds)],['This week',fmtHours(ins.week_seconds)],['Total study',fmtHours(ins.total_seconds)],['Study streak',String(ins.streak||0)+' days']];
 const box=$('summaryStats');box.replaceChildren();stats.forEach(([name,v])=>{const div=$node('div','stat-card');div.append($node('b','',v),$node('small','',name));box.append(div);});
 $('accountHelp').textContent=preview?'Local preview only — your sample data stays on this browser.':'Account info and private study statistics are synchronized through Supabase.';
 renderAvatars();renderBadges();if(currentPage==='profile'){renderAnalytics();renderStudyRecords();}}
async function loadAnalytics(){try{state.analytics=preview?localAnalytics():await rpc('get_my_study_analytics',{p_period:state.analyticsPeriod});renderAnalytics();}catch(e){console.warn('Study analytics',e.message);}}
function localAnalytics(){const blocks=demo.blocks||[],now=new Date();let cutoff=new Date(now);if(state.analyticsPeriod==='day')cutoff.setHours(0,0,0,0);else if(state.analyticsPeriod==='week'){cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-((cutoff.getDay()+6)%7));}else if(state.analyticsPeriod==='month'){cutoff.setDate(1);cutoff.setHours(0,0,0,0);}else{cutoff=new Date(now.getFullYear(),0,1);}const filtered=blocks.filter(b=>new Date(b.created_at)>=cutoff),subjects={};filtered.forEach(b=>{const key=String(b.subject||'').trim()||'Unspecified';subjects[key]=(subjects[key]||0)+Number(b.seconds||0);});let buckets=[];if(state.analyticsPeriod==='day'){buckets=Array.from({length:24},(_,h)=>({label:String(h).padStart(2,'0')+':00',seconds:filtered.filter(b=>new Date(b.created_at).getHours()===h).reduce((a,b)=>a+Number(b.seconds||0),0)}));}else if(state.analyticsPeriod==='year'){for(let m=0;m<=now.getMonth();m++)buckets.push({label:new Date(now.getFullYear(),m,1).toLocaleDateString('en',{month:'short'}),seconds:filtered.filter(b=>new Date(b.created_at).getMonth()===m).reduce((a,b)=>a+Number(b.seconds||0),0)});}else{const days=state.analyticsPeriod==='week'?7:now.getDate();for(let i=days-1;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);buckets.push({label:state.analyticsPeriod==='week'?d.toLocaleDateString('en',{weekday:'short'}):String(d.getDate()),seconds:filtered.filter(b=>localDate(b.created_at)===localDate(d)).reduce((a,b)=>a+Number(b.seconds||0),0)});}}return {period:state.analyticsPeriod,period_seconds:filtered.reduce((a,b)=>a+Number(b.seconds||0),0),subjects:Object.entries(subjects).map(([subject,seconds])=>({subject,seconds})).sort((a,b)=>b.seconds-a.seconds),buckets};}
async function loadStudyRecords(){try{if(preview){const blocks=(demo.blocks||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));const grouped=[];blocks.forEach(b=>{const end=new Date(b.created_at),start=new Date(end.getTime()-Number(b.seconds||0)*1000),last=grouped[grouped.length-1];if(last&&last.subject===(b.subject||'Unspecified')&&start-new Date(last.ended_at)<75000){last.ended_at=end.toISOString();last.seconds+=Number(b.seconds||0);}else grouped.push({started_at:start.toISOString(),ended_at:end.toISOString(),seconds:Number(b.seconds||0),subject:b.subject||'Unspecified'});});state.studyRecords=grouped;}else state.studyRecords=await rpc('get_my_study_records',{p_days:7});renderStudyRecords();}catch(e){console.warn('Study records',e.message);}}
function renderStudyRecords(){const root=$('studyRecords');if(!root)return;root.replaceChildren();const records=state.studyRecords||[],days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}const total=records.reduce((a,r)=>a+Number(r.seconds||0),0);days.forEach(day=>{const key=localDate(day),row=$node('div','timeline-row'),label=$node('span','timeline-day',day.toLocaleDateString('en',{weekday:'short'})),track=$node('div','timeline-track');records.filter(r=>localDate(r.started_at)===key).forEach(r=>{const start=new Date(r.started_at),end=new Date(r.ended_at);const from=start.getHours()*60+start.getMinutes()+start.getSeconds()/60;let to=end.getHours()*60+end.getMinutes()+end.getSeconds()/60;if(localDate(end)!==key)to=1440;const width=Math.max(.7,Math.min(1440,to-from));const seg=$node('span','timeline-segment');seg.style.left=(Math.max(0,from)/1440*100)+'%';seg.style.width=(width/1440*100)+'%';seg.style.background=subjectColor(r.subject);seg.title=`${r.subject||'Unspecified'} · ${fmtDuration(r.seconds)} · ${start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}–${end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;track.append(seg);});row.append(label,track);root.append(row);});$('recordsDetail').textContent=fmtDuration(total)+' recorded in the last 7 days';}
function renderAnalytics(){const a=state.analytics;if(!a)return;const donut=$('subjectDonut'),legend=$('subjectLegend'),chart=$('studyHoursChart');if(!donut||!legend||!chart)return;const subjects=(a.subjects||[]).filter(x=>Number(x.seconds)>0),sum=subjects.reduce((v,x)=>v+Number(x.seconds),0);donut.replaceChildren();legend.replaceChildren();if(!sum){donut.style.background='conic-gradient(#e9e3dc 0 100%)';donut.append($node('span','donut-empty','No data'));}else{let offset=0;const parts=[];subjects.forEach(item=>{const pct=Number(item.seconds)/sum*100,color=subjectColor(item.subject);parts.push(`${color} ${offset}% ${offset+pct}%`);offset+=pct;});donut.style.background=`conic-gradient(${parts.join(',')})`;donut.append($node('span','donut-total',fmtHours(sum)));subjects.slice(0,6).forEach(item=>{const row=$node('div','subject-legend-row'),dot=$node('i','');dot.style.background=subjectColor(item.subject);row.append(dot,$node('span','',item.subject),$node('small','',fmtHours(item.seconds)));legend.append(row);});}
 chart.replaceChildren();const buckets=a.buckets||[],max=Math.max(60,...buckets.map(x=>Number(x.seconds||0)));buckets.forEach(item=>{const col=$node('div','chart-col'),bar=$node('div','chart-bar');bar.style.height=Math.max(2,Math.round(100*Number(item.seconds||0)/max))+'%';bar.title=item.label+' · '+fmtHours(item.seconds);col.append(bar,$node('span','',item.label));chart.append(col);});$('analyticsDetail').textContent=fmtDuration(a.period_seconds)+' recorded in this '+({day:'day',week:'week',month:'month',year:'year'}[state.analyticsPeriod]||'period');}
function avatarUnlock(i){const xp=Number(state.insights.total_xp||0);if(i===4||i===8)return premium()&&xp>=300;return xp>=(i===1||i===5?0:i===2||i===6?20:100);}
function renderAvatars(){const box=$('avatarGrid');box.replaceChildren();for(let i=1;i<=8;i++){const unlocked=avatarUnlock(i);const b=$node('button','avatar-choice'+(unlocked?'':' locked')+(state.profile.avatar===i?' selected':''));const img=$node('img');img.src=asset('avatar'+i+'.webp');img.alt='Portrait stage '+i;b.append(img,$node('small','',i===4||i===8?'Graduate ✦':'Stage '+((i-1)%4+1)));if(!unlocked)b.append($node('span','lock','🔒'));b.title=unlocked?'Select portrait':i===4||i===8?'Premium graduation avatar':'Study more to unlock';b.onclick=()=>chooseAvatar(i);box.append(b);}}
async function chooseAvatar(i){if(!avatarUnlock(i)){toast(i===4||i===8?'Graduation portrait needs Premium and 300 study XP':'Study more to unlock this portrait');return;}try{if(!preview)await rpc('change_my_avatar',{p_avatar:i});state.profile.avatar=i;if(preview){demo.profile.avatar=i;saveDemo();}renderProfile();await loadLeaderboard();toast('New portrait selected ♡');}catch(e){toast(e.message);}}
function renderBadges(){const box=$('achievementGrid');box.replaceChildren();const unlocked=availableBadges(),selected=new Set(state.profile.selected_badges||[]);BADGES.forEach(badge=>{const earned=unlocked.has(badge.id);const b=$node('button','achievement'+(earned?'':' locked')+(selected.has(badge.id)?' selected':''));const img=$node('img');img.src=asset(badge.asset);img.alt='Badge';b.append(img,$node('strong','',badge.label),$node('small','',earned?(selected.has(badge.id)?'On profile ✓':'Earned · tap to display'):badge.desc));b.title=earned?'Toggle public badge':'Not earned yet';b.onclick=()=>toggleBadge(badge.id);box.append(b);});}
async function toggleBadge(id){if(!availableBadges().has(id)){toast('Earn this badge first ♡');return;}const prev=state.profile.selected_badges||[],selection=new Set(prev);if(selection.has(id))selection.delete(id);else {if(selection.size>=3){toast('Choose at most three public badges.');return;}selection.add(id);}const a=[...selection];try{if(!preview)await rpc('set_my_badges',{p_badges:a});state.profile.selected_badges=a;if(preview){demo.profile.selected_badges=a;saveDemo();}renderBadges();await loadLeaderboard();}catch(e){toast(e.message);}}
function gameAllowed(g){const conf=(state.snapshot?.catalog||[]).find(x=>x.game===g.id);if(!conf)return false;if(conf.premium_only&&!premium())return false;return !!state.snapshot?.break_active||Number(state.insights.total_xp||0)>=Number(conf.xp_required||0);}
function renderGameCards(){const root=$('gameCards');root.replaceChildren();GAMES.forEach(game=>{const conf=(state.snapshot?.catalog||[]).find(x=>x.game===game.id)||{xp_required:0,premium_only:false,players:0};const available=!!state.profile&&gameAllowed(game);
 const card=$node('button','game-card');const art=$node('div','game-art',game.icon),copy=$node('div','game-copy');copy.append($node('strong','',game.name),$node('p','',game.description));const foot=$node('div','game-foot');foot.append($node('span','',(preview?'Local preview':conf.players+' playing now')),$node('b','',available?'Play →':conf.premium_only&&!premium()?'Premium ✦':'Unlock at '+xpFormat(conf.xp_required)+' XP'));copy.append(foot);card.append(art,copy);if(!available)card.append($node('span','game-lock','🔒 Locked'));card.onclick=()=>openGame(game.id);root.append(card);});}
async function openGame(id){const g=GAMES.find(x=>x.id===id);if(!g)return;if(!gameAllowed(g)){const conf=state.snapshot?.catalog?.find(x=>x.game===id);toast(conf?.premium_only&&!premium()?'Premium game ♡':'Study more to unlock this game.');return;}
 state.activeGame=id;state.room=null;state.gameSeed=Math.floor(Math.random()*1000000);$('gameTitle').textContent=g.name;$('gameMessage').textContent='';openModal('gameModal');renderRoomBar();try{if(!window.GazelleGames?.open)throw Error('Game files did not load. Refresh the page and try again.');window.GazelleGames.open(id,state.gameSeed,completeGame);}catch(e){console.error('Game open failed:',e);$('gameBody').textContent='This game could not start. Please refresh and try again.';toast(e.message||'Game could not start');return;}
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
