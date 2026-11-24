/* Four games only. Same seeded board per shared game room; friendly timed race. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const asset=name=>(window.GAZELLE_ASSETS&&window.GAZELLE_ASSETS[name])||'assets/'+name;
const elt=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
let game='',seq=0,gameStart=0,cleanup=[];
const cleanupFns=()=>{cleanup.splice(0).forEach(fn=>{try{fn();}catch{}});};
function rand(seed){let a=(seed||1)>>>0;return()=>{a^=a<<13;a^=a>>>17;a^=a<<5;return (a>>>0)/4294967296;};}
function shuffle(arr,r){for(let i=arr.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function open(kind,seed,onFinish){cleanupFns();seq++;const mySeq=seq;game=kind;gameStart=performance.now();$('gameMessage').textContent='';$('gameBody').replaceChildren();
 const win=()=>{if(mySeq!==seq)return;onFinish(Math.max(1,(performance.now()-gameStart)/1000));};
 const r=rand(seed);if(kind==='memory')memory(r,win,mySeq);if(kind==='sudoku')sudoku(r,win,mySeq);if(kind==='crossword')crossword(r,win,mySeq);if(kind==='jigsaw')jigsaw(r,win,mySeq);
}
function close(){seq++;cleanupFns();game='';}
const buttons=(box,items)=>{const row=elt('div','game-controls');items.forEach(([title,fn,cls])=>{const b=elt('button',cls||'',title);b.type='button';b.onclick=fn;row.append(b);});box.append(row);return row;};
function setInfo(message){$('gameMessage').textContent=message;}
function memory(r,win,mySeq){const b=$('gameBody');const wrap=elt('div','game-inner');wrap.append(elt('h3','', 'A little memory garden ♡'),elt('p','', 'Turn two cards at a time. Matched pairs stay visible.'));
 const icons=['🌷','🌙','🍓','🍵','📚','🌻','🧸','☁️'];const vals=shuffle([...icons,...icons],r),board=elt('div','memory-board');let flipped=[],matched=new Set(),moves=0,locked=false,done=false;const metrics=elt('div','game-metrics','0 / 8 pairs · 0 turns');
 vals.forEach((icon,i)=>{const card=elt('button','memory-tile','♡');card.setAttribute('aria-label','Flip memory card '+(i+1));card.onclick=()=>{
  if(done||locked||matched.has(i)||flipped.includes(i)||mySeq!==seq)return;
  card.textContent=icon;card.classList.add('revealed');flipped.push(i);
  if(flipped.length===2){moves++;const [a,z]=flipped;if(vals[a]===vals[z]){
   matched.add(a);matched.add(z);board.children[a].classList.add('matched');board.children[z].classList.add('matched');flipped=[];
   if(matched.size===16){done=true;metrics.textContent=`8 / 8 pairs · ${moves} turns · solved! ♡`;setInfo('Every pair found! Your memory garden is complete.');win();}}
   else{locked=true;const t=setTimeout(()=>{if(mySeq!==seq)return;[a,z].forEach(k=>{board.children[k].textContent='♡';board.children[k].classList.remove('revealed');});flipped=[];locked=false;},800);cleanup.push(()=>clearTimeout(t));}
  }
  if(!done)metrics.textContent=`${matched.size/2} / 8 pairs · ${moves} turns`;
 };board.append(card);});wrap.append(metrics,board);buttons(wrap,[['New shuffled round',()=>open('memory',Math.floor(r()*1e8),window.GazelleApp.gameDone),'']]);b.append(wrap);
}
const BASE_SOLUTION='534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const BASE_PUZZLE='530070000600195000098000060800060003400803001700020006060000280000419005000080079';
function transformedSudoku(r){let sol=BASE_SOLUTION.split('').map(Number),puz=BASE_PUZZLE.split('').map(Number);
 const digits=shuffle([1,2,3,4,5,6,7,8,9],r);const order=[0,1,2,3,4,5,6,7,8];for(let b=0;b<3;b++){const t=shuffle([0,1,2],r);for(let j=0;j<3;j++)order[b*3+j]=b*3+t[j];}
 const corder=[0,1,2,3,4,5,6,7,8];for(let b=0;b<3;b++){const t=shuffle([0,1,2],r);for(let j=0;j<3;j++)corder[b*3+j]=b*3+t[j];}
 let s=[],p=[];for(let i=0;i<9;i++)for(let j=0;j<9;j++){const old=order[i]*9+corder[j],val=sol[old],orig=puz[old];s.push(digits[val-1]);p.push(orig?digits[orig-1]:0);}
 return {s,p};}
function sudoku(r,win,mySeq){const {s,p}=transformedSudoku(r),v=p.slice(),notes=Array.from({length:81},()=>new Set());let selected=0,noteMode=false,hints=3,complete=false;
 const body=$('gameBody'),wrap=elt('div','game-inner sudoku-wrap');wrap.append(elt('h3','', 'Sudoku · a calm challenge'),elt('p','', 'Fill each row, column and 3×3 box with 1–9.'));
 const board=elt('div','sudoku-board'),metrics=elt('div','game-metrics','3 hints left · Notes off');
 function redraw(){[...board.children].forEach((cell,i)=>{cell.textContent=v[i]||([...notes[i]].sort().join('')||'');cell.style.fontSize=!v[i]&&notes[i].size?'10px':'';cell.classList.toggle('selected',selected===i);cell.classList.toggle('given',p[i]!==0);cell.classList.toggle('same',selected!==i&&v[i]&&v[selected]===v[i]);cell.classList.toggle('wrong',v[i]!==0&&v[i]!==s[i]);});metrics.textContent=`${hints} hints left · Notes ${noteMode?'on':'off'} · ${v.filter(Boolean).length}/81 cells`;
  if(!complete&&v.every((x,i)=>x===s[i])){complete=true;setInfo('Perfect grid! Well solved ♡');win();}
 }
 function enter(n){if(complete||p[selected])return;if(noteMode&&n){if(notes[selected].has(n))notes[selected].delete(n);else notes[selected].add(n);}else{v[selected]=n;notes[selected].clear();}redraw();}
 for(let i=0;i<81;i++){const cell=elt('button','sudoku-cell'+(i%3===2&&i%9!==8?' right-edge':'')+(Math.floor(i/9)%3===2&&i<72?' bottom-edge':''));cell.type='button';cell.setAttribute('aria-label','Row '+(Math.floor(i/9)+1)+', column '+(i%9+1));cell.onclick=()=>{selected=i;redraw();};board.append(cell);}
 const pad=elt('div','number-pad');for(let n=1;n<=9;n++){const k=elt('button','',n);k.onclick=()=>enter(n);pad.append(k);}
 wrap.append(metrics,board,pad);
 const toggleNotes=()=>{noteMode=!noteMode;redraw();};const hint=()=>{if(hints<=0||complete){setInfo('No hints remaining.');return;}const missing=v.map((x,i)=>x!==s[i]&&!p[i]?i:-1).filter(i=>i>=0);if(!missing.length)return;selected=missing[Math.floor(r()*missing.length)];v[selected]=s[selected];notes[selected].clear();hints--;redraw();};
 const reset=()=>{if(complete)return;for(let i=0;i<81;i++)if(!p[i]){v[i]=0;notes[i].clear();}redraw();};
 buttons(wrap,[['✏ Notes on/off',toggleNotes],['💡 Hint ('+hints+')',hint],['⌫ Erase',()=>enter(0)],['↻ Reset',reset]]);
 const handler=e=>{if(game!=='sudoku'||mySeq!==seq||$('gameModal').hidden)return;if(e.target?.tagName==='INPUT')return;const digit=Number(e.key);if(Number.isInteger(digit)&&digit>=1&&digit<=9){enter(digit);e.preventDefault();}else if(['Backspace','Delete','0'].includes(e.key)){enter(0);e.preventDefault();}else if(e.key.startsWith('Arrow')){let pos=selected;switch(e.key){case 'ArrowLeft':pos=Math.max(0,pos-1);break;case 'ArrowRight':pos=Math.min(80,pos+1);break;case 'ArrowUp':pos=Math.max(0,pos-9);break;case 'ArrowDown':pos=Math.min(80,pos+9);break;}selected=pos;redraw();e.preventDefault();}};
 document.addEventListener('keydown',handler);cleanup.push(()=>document.removeEventListener('keydown',handler));body.append(wrap);redraw();}
const CROSS_WORDS=[
 {w:'GARDEN',r:5,c:2,d:'across',clue:'Where flowers and plants grow'},
 {w:'QUIET',r:2,c:6,d:'down',clue:'Not noisy'},
 {w:'PAGES',r:3,c:2,d:'down',clue:'The leaves inside a book'},
 {w:'RAIN',r:5,c:4,d:'down',clue:'Drops falling from a cloudy sky'},
 {w:'TEA',r:4,c:0,d:'across',clue:'A warm drink made with leaves'},
 {w:'SUNNY',r:3,c:5,d:'across',clue:'Full of sunshine'},
 {w:'COZY',r:0,c:9,d:'down',clue:'Warm, comfortable and inviting'},
 {w:'PEACE',r:0,c:6,d:'across',clue:'Calm, harmony or tranquility'},
 {w:'STUDY',r:3,c:0,d:'down',clue:'Learn or review for an exam'},
 {w:'NOTES',r:8,c:4,d:'across',clue:'Short written reminders'}
];
function crossword(r,win,mySeq){const words=CROSS_WORDS.map(x=>({...x})); // two equivalent clue sets can be added later.
 const size=11,grid=new Map(),numbered=new Map();words.forEach(w=>{for(let i=0;i<w.w.length;i++){const pos=(w.r+(w.d==='down'?i:0))*size+(w.c+(w.d==='across'?i:0));const ch=w.w[i];if(grid.has(pos)&&grid.get(pos)!==ch)throw Error('Invalid crossword intersection');grid.set(pos,ch);}});
 let n=0;[...words].sort((a,b)=>a.r-b.r||a.c-b.c).forEach(w=>{const k=w.r*size+w.c;if(!numbered.has(k))numbered.set(k,++n);w.num=numbered.get(k);});
 const body=$('gameBody'),wrap=elt('div','game-inner');wrap.append(elt('h3','', 'Cozy Crossword'),elt('p','', 'Tap a clue, then type letters. Every word crosses another.'));
 const board=elt('div','cross-grid');board.style.gridTemplateColumns=`repeat(${size}, minmax(0, 1fr))`;const letters=Array(size*size).fill('');let current=words[0],cursor=current.r*size+current.c,complete=false;const cellEls=[];
 function belonging(index){return words.filter(w=>{for(let i=0;i<w.w.length;i++){if((w.r+(w.d==='down'?i:0))*size+(w.c+(w.d==='across'?i:0))===index)return true;}return false;});}
 function inWord(w){const a=[];for(let i=0;i<w.w.length;i++)a.push((w.r+(w.d==='down'?i:0))*size+(w.c+(w.d==='across'?i:0)));return a;}
 function setCursor(i){const candidate=belonging(i);if(!candidate.length)return;current=candidate.includes(current)?current:candidate[0];cursor=i;redraw();}
 function chooseWord(w){current=w;cursor=inWord(w).find(i=>!letters[i])??inWord(w)[0];redraw();}
 function redraw(){cellEls.forEach((cell,i)=>{if(!grid.has(i))return;cell.textContent=letters[i]||'';cell.classList.toggle('active',inWord(current).includes(i));cell.classList.toggle('selected',cursor===i);if(cursor===i)cell.style.boxShadow='inset 0 0 0 2px #d49baa';else cell.style.boxShadow='';if(numbered.has(i)){const label=elt('span','num',numbered.get(i));cell.append(label);}});document.querySelectorAll('.cross-clues button').forEach(b=>b.classList.toggle('active',b.dataset.key===current.d+current.num));
  if(!complete&&[...grid].every(([i,ch])=>letters[i]===ch)){complete=true;setInfo('Every clue solved — beautiful work! ♡');win();}}
 function enter(ch){if(complete||!grid.has(cursor))return;letters[cursor]=ch;const indices=inWord(current),at=indices.indexOf(cursor);if(ch&&at<indices.length-1)cursor=indices[at+1];if(!ch&&at>0)cursor=indices[at-1];redraw();}
 for(let i=0;i<size*size;i++){const c=elt('button','cross-cell'+(!grid.has(i)?' block':''));if(grid.has(i)){c.setAttribute('aria-label',`Row ${Math.floor(i/size)+1} column ${i%size+1}`);c.onclick=()=>{if(i===cursor){const candidates=belonging(i);if(candidates.length>1)current=candidates.find(w=>w!==current)||current;}setCursor(i);};}cellEls.push(c);board.append(c);}
 const clues=elt('div','cross-clues');['across','down'].forEach(dir=>{const col=elt('div');col.append(elt('h4','',dir==='across'?'Across':'Down'));words.filter(w=>w.d===dir).sort((a,b)=>a.num-b.num).forEach(w=>{const btn=elt('button','',`${w.num}. ${w.clue} (${w.w.length})`);btn.dataset.key=w.d+w.num;btn.onclick=()=>chooseWord(w);col.append(btn);});clues.append(col);});
 const letterPad=elt('div','cross-letter-pad');
 for(const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){const keyBtn=elt('button','',ch);keyBtn.type='button';keyBtn.setAttribute('aria-label','Enter '+ch);keyBtn.onclick=()=>enter(ch);letterPad.append(keyBtn);}
 const eraseBtn=elt('button','cross-erase','⌫');eraseBtn.type='button';eraseBtn.setAttribute('aria-label','Erase letter');eraseBtn.onclick=()=>enter('');letterPad.append(eraseBtn);
 buttons(wrap,[['💡 Reveal letter',()=>{if(!complete){letters[cursor]=grid.get(cursor);redraw();}}],['Check grid',()=>{const wrong=[...grid].filter(([i,ch])=>letters[i]&&letters[i]!==ch).length;setInfo(wrong?`${wrong} letters need another look.`:'So far, everything looks correct ♡');}],['Clear puzzle',()=>{letters.fill('');complete=false;redraw();}]]);
 const key=e=>{if(game!=='crossword'||mySeq!==seq||$('gameModal').hidden||e.target?.tagName==='INPUT')return;if(/^[a-zA-Z]$/.test(e.key)){enter(e.key.toUpperCase());e.preventDefault();}else if(e.key==='Backspace'||e.key==='Delete'){enter('');e.preventDefault();}};
 document.addEventListener('keydown',key);cleanup.push(()=>document.removeEventListener('keydown',key));wrap.insertBefore(board,wrap.querySelector('.game-controls'));wrap.append(clues,letterPad);body.append(wrap);redraw();}
function jigsaw(r,win,mySeq){const SIZE=7,N=49,solution=Array.from({length:N},(_,i)=>i),pieces=shuffle([...solution],r);if(pieces.every((x,i)=>x===i)){[pieces[0],pieces[1]]=[pieces[1],pieces[0]];}
 let selected=-1,dragged=-1,moves=0,complete=false;const body=$('gameBody'),wrap=elt('div','game-inner');wrap.append(elt('h3','', 'A 49-piece picture puzzle'),elt('p','', 'Drag a piece onto another, or tap two pieces to swap them.'));
 const metrics=elt('div','game-metrics','0 moves · 49 pieces');const preview=elt('div','jigsaw-preview-row');const image=elt('img','jigsaw-preview');image.src=asset('jigsaw.webp');image.alt='Completed reference picture';preview.append(image);
 const board=elt('div','jigsaw-board');
 function swap(a,b){if(complete||a===b||a<0||b<0)return;[pieces[a],pieces[b]]=[pieces[b],pieces[a]];selected=-1;moves++;redraw();if(pieces.every((x,i)=>x===i)){complete=true;metrics.textContent=`Solved in ${moves} moves! ♡`;setInfo('You rebuilt the whole picture! ♡');win();}}
 function redraw(){board.replaceChildren();pieces.forEach((piece,i)=>{const tile=elt('button','jigsaw-piece'+(selected===i?' selected':''));const row=Math.floor(piece/SIZE),col=piece%SIZE;tile.style.backgroundPosition=`${col/(SIZE-1)*100}% ${row/(SIZE-1)*100}%`;tile.title='Piece '+(piece+1);tile.setAttribute('aria-label','Puzzle position '+(i+1));tile.draggable=true;
  tile.onclick=()=>{if(complete)return;if(selected===-1){selected=i;redraw();}else swap(selected,i);};
  tile.ondragstart=e=>{dragged=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));tile.classList.add('dragging');};
  tile.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};
  tile.ondrop=e=>{e.preventDefault();swap(dragged,i);dragged=-1;};
  board.append(tile);
 });metrics.textContent=`${moves} moves · ${pieces.filter((x,i)=>x===i).length}/49 correctly placed`;}
 const shuffleAgain=()=>{if(complete)return;shuffle(pieces,r);if(pieces.every((x,i)=>x===i))pieces.reverse();selected=-1;moves=0;redraw();};
 wrap.append(metrics,board,preview);buttons(wrap,[['Shuffle pieces',shuffleAgain],['Show reference',()=>{image.hidden=!image.hidden;}]]);body.append(wrap);redraw();}
window.GazelleGames={open,close};
})();
