const ENTRIES_KEY = 'db_entries';
const CATEGORIES_KEY = 'db_categories';

const DEFAULT_CATEGORIES = {
  Push: [
    'Dumbbell Bench Press',
    'Incline Dumbbell Press',
    'Dumbbell Shoulder Press',
    'Dumbbell Lateral Raise',
    'Dumbbell Fly'
  ],
  Pull: [
    'One-Arm Dumbbell Row',
    'Dumbbell Pullover',
    'Dumbbell Shrug',
    'Dumbbell Hammer Curl',
    'Incline Dumbbell Curl'
  ],
  Legs: [
    'Dumbbell Goblet Squat',
    'Dumbbell Romanian Deadlift',
    'Dumbbell Lunges',
    'Dumbbell Step-Up',
    'Dumbbell Calf Raise'
  ]
};

let categories = {};
let entries = [];
let selectedCategory = 'Push';
let lastInputs = {};
// lastInputs structure: { '<exercise name>': { weight: '12.5', reps: '8' }, ... }
let chartInstance = null;
let currentChartExercise = null;
// Rest timer state
let restDurationSec = Number(localStorage.getItem('rest_duration_seconds') || 60);
let restRemainingSec = null;
let restIntervalId = null;

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function loadEntries(){
  entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
}
function formatTimeSec(s){
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

function updateRestDisplay(){
  const disp = document.getElementById('restTimerDisplay'); if (!disp) return;
  const sec = restRemainingSec !== null ? restRemainingSec : restDurationSec;
  disp.textContent = formatTimeSec(sec);
}

function startRestTimer(){
  if (restIntervalId) return; // already running
  if (restRemainingSec === null) restRemainingSec = restDurationSec;
  updateRestDisplay();
  restIntervalId = setInterval(()=>{
    restRemainingSec -= 1;
    if (restRemainingSec <= 0){
      clearInterval(restIntervalId); restIntervalId = null; restRemainingSec = 0; updateRestDisplay();
      try{ new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=').play(); }catch(e){}
      return;
    }
    updateRestDisplay();
  },1000);
}

function pauseRestTimer(){
  if (!restIntervalId) return; clearInterval(restIntervalId); restIntervalId = null;
}

function resetRestTimer(){
  if (restIntervalId) { clearInterval(restIntervalId); restIntervalId = null; }
  restRemainingSec = null;
  updateRestDisplay();
}

function setRestFromInputs(){
  const min = Number(document.getElementById('restMinutes').value || 0);
  const sec = Number(document.getElementById('restSeconds').value || 0);
  restDurationSec = Math.max(0, Math.floor(min*60 + sec));
  localStorage.setItem('rest_duration_seconds', String(restDurationSec));
  // reset running timer to apply new duration
  resetRestTimer();
  updateRestDisplay();
}
function loadLastInputs(){
  lastInputs = JSON.parse(localStorage.getItem('db_lastInputs') || '{}');
}
function saveLastInputs(){
  localStorage.setItem('db_lastInputs', JSON.stringify(lastInputs));
}
function saveEntries(){
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

function renderCategories(){
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = '';
  Object.keys(categories).forEach(cat => {
    const b = document.createElement('button');
    b.className = 'catBtn'; b.dataset.cat = cat; b.textContent = cat;
    if (cat === selectedCategory) b.classList.add('active');
    b.onclick = ()=>{ selectedCategory = cat; renderCategories(); renderExercises(); };
    const del = document.createElement('button'); del.className='smallDel'; del.textContent='✕';
    del.title = `Delete category ${cat}`;
    del.onclick = (ev)=>{ ev.stopPropagation(); if (!confirm('Delete category "'+cat+'"? This will remove custom exercises but not saved entries.')) return; deleteCategory(cat); };
    const wrap = document.createElement('span'); wrap.className = 'catWrap'; wrap.appendChild(b); if (cat !== 'Push' && cat !== 'Pull' && cat !== 'Legs') wrap.appendChild(del);
    bar.appendChild(wrap);
  });
}

function loadCategories(){
  categories = JSON.parse(localStorage.getItem(CATEGORIES_KEY) || 'null');
  if (!categories) { categories = Object.assign({}, DEFAULT_CATEGORIES); saveCategories(); }
}
function saveCategories(){
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function addCategory(name){
  if (!name) return;
  if (categories[name]) return alert('Category already exists');
  categories[name] = [];
  saveCategories();
  selectedCategory = name;
  renderCategories(); renderExercises();
}

function deleteCategory(name){
  if (!categories[name]) return;
  delete categories[name];
  saveCategories();
  selectedCategory = Object.keys(categories)[0] || null;
  renderCategories(); renderExercises();
}

function renderExercises(){
  const container = document.getElementById('exerciseList');
  container.innerHTML = '';
  const current = document.getElementById('currentCat'); if (current) current.textContent = selectedCategory;
  const list = (categories[selectedCategory] || []);
  list.forEach((name, idx) => {
    const li = document.createElement('div');
    li.className = 'exerciseRow';
    const titleWrap = document.createElement('div'); titleWrap.style.display = 'flex'; titleWrap.style.alignItems = 'center'; titleWrap.style.gap = '8px';
    const title = document.createElement('div'); title.className = 'exName'; title.textContent = name;
    title.style.cursor = 'pointer';
    title.title = `Show progress chart for ${name}`;
    title.onclick = ()=> showChart(name);
    const delEx = document.createElement('button'); delEx.className='smallDel'; delEx.textContent='✕'; delEx.title = `Delete exercise ${name}`;
    delEx.onclick = (ev)=>{ ev.stopPropagation(); if (!confirm('Delete exercise "'+name+'" from '+selectedCategory+'?')) return; deleteExercise(selectedCategory, idx); };
    titleWrap.appendChild(title); titleWrap.appendChild(delEx);

    const inputs = document.createElement('div'); inputs.className = 'exInputs';
    const weight = document.createElement('input'); weight.type='number'; weight.placeholder='Weight'; weight.min='0'; weight.step='0.5';
    const reps = document.createElement('input'); reps.type='number'; reps.placeholder='Reps'; reps.min='0'; reps.step='1';
    // Prefill with last inputs for this exercise (if any)
    if (lastInputs[name]){
      if (lastInputs[name].weight !== undefined) weight.value = lastInputs[name].weight;
      if (lastInputs[name].reps !== undefined) reps.value = lastInputs[name].reps;
    }
    const add = document.createElement('button'); add.textContent = 'Add Set';
    add.onclick = ()=>{
      const w = weight.value.trim(); const r = reps.value.trim();
      if (!w && !r) { alert('Enter weight or reps'); return; }
      addEntry(name, Number(w||0), Number(r||0));
      // persist last inputs for this exercise and keep them in the fields
      lastInputs[name] = { weight: w, reps: r };
      saveLastInputs();
    };
    inputs.appendChild(weight); inputs.appendChild(reps); inputs.appendChild(add);
    li.appendChild(titleWrap); li.appendChild(inputs);
    li.draggable = true;
    li.dataset.idx = idx;
    // drag handlers for reordering
    li.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', String(idx));
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', ()=>{ li.classList.remove('dragging'); });
    li.addEventListener('dragover', (e)=>{ e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', ()=>{ li.classList.remove('drag-over'); });
    li.addEventListener('drop', (e)=>{
      e.preventDefault(); li.classList.remove('drag-over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = Number(idx);
      if (isNaN(from) || isNaN(to) || from === to) return;
      const arr = categories[selectedCategory] || [];
      const item = arr.splice(from,1)[0];
      arr.splice(to,0,item);
      saveCategories();
      renderExercises();
    });
    container.appendChild(li);
  });
}

function showChart(exName){
  const canvas = document.getElementById('progressChart');
  const notice = document.getElementById('chartNotice');
  if (!canvas) return;
  const data = entries.filter(e=>e.ex === exName).sort((a,b)=>a.ts-b.ts);
  if (!data.length){
    notice.textContent = `No saved sets for "${exName}" yet.`;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    currentChartExercise = exName;
    return;
  }
  notice.textContent = '';
  const labels = data.map(d=>new Date(d.ts).toLocaleDateString());
  const weights = data.map(d=>d.weight || 0);
  const reps = data.map(d=>d.reps || 0);
  const ctx = canvas.getContext('2d');
  const config = {
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Weight (kg)', data: weights, borderColor: '#0b7285', backgroundColor: 'rgba(11,114,133,0.08)', yAxisID: 'y' },
        { type: 'bar', label: 'Reps', data: reps, backgroundColor: 'rgba(90,107,112,0.6)', yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      stacked: false,
      scales: {
        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Weight (kg)' } },
        y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Reps' }, grid: { drawOnChartArea: false } }
      }
    }
  };

  if (chartInstance) {
    chartInstance.data = config.data;
    chartInstance.options = config.options;
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, config);
  }
  currentChartExercise = exName;
}

function clearChartHistory(){
  if (!currentChartExercise) { alert('No exercise selected'); return; }
  if (!confirm('Delete all saved sets for "' + currentChartExercise + '"? This cannot be undone.')) return;
  // remove entries for this exercise
  entries = entries.filter(e => e.ex !== currentChartExercise);
  saveEntries();
  // also remove lastInputs for this exercise so chart/input state is clean
  if (lastInputs && lastInputs[currentChartExercise]) { delete lastInputs[currentChartExercise]; saveLastInputs(); }
  // refresh chart and any UI
  showChart(currentChartExercise);
  renderExercises();
}

// Tab switching and swipe support
function switchTab(tabName){
  document.querySelectorAll('.tabBtn').forEach(b=> b.classList.toggle('active', b.dataset.tab===tabName));
  const chartPanel = document.getElementById('chartPanel');
  const restPanel = document.getElementById('restPanel');
  if (chartPanel && restPanel){
    chartPanel.classList.toggle('active', tabName==='chart');
    restPanel.classList.toggle('active', tabName==='rest');
  }
}

function setupSwipe(){
  const panels = document.getElementById('panels'); if (!panels) return;
  let startX = null;
  panels.addEventListener('touchstart', (e)=>{ startX = e.touches[0].clientX; });
  panels.addEventListener('touchend', (e)=>{
    if (startX === null) return;
    const endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : null;
    if (endX === null) { startX = null; return; }
    const dx = endX - startX;
    const threshold = 40;
    if (dx > threshold){ // swipe right -> previous tab
      // if currently on rest, go to chart
      const chartActive = document.querySelector('.tabBtn[data-tab="chart"]').classList.contains('active');
      if (!chartActive) switchTab('chart');
    } else if (dx < -threshold){ // swipe left -> next tab
      const restActive = document.querySelector('.tabBtn[data-tab="rest"]').classList.contains('active');
      if (!restActive) switchTab('rest');
    }
    startX = null;
  });
}

function addExerciseToCategory(cat, exName){
  if (!exName) return;
  categories[cat] = categories[cat] || [];
  if (categories[cat].includes(exName)) return alert('Exercise already exists in '+cat);
  categories[cat].push(exName);
  saveCategories();
  renderExercises();
}

function deleteExercise(cat, index){
  if (!categories[cat]) return;
  categories[cat].splice(index,1);
  saveCategories();
  renderExercises();
}
function addEntry(exName, weight, reps){
  const ent = { id: uid(), ex: exName, weight: Number(weight), reps: Number(reps), ts: Date.now() };
  entries.push(ent);
  saveEntries();
  renderHistory();
}

function renderHistory(){
  const list = document.getElementById('sessionList');
  if (!list) return; // history UI removed — nothing to render
  list.innerHTML = '';
  entries.slice().reverse().forEach(e=>{
    const li = document.createElement('li');
    li.textContent = `${e.ex} — ${e.weight || '-'} kg x ${e.reps || '-'} reps — ${new Date(e.ts).toLocaleString()}`;
    const del = document.createElement('button'); del.textContent='Delete'; del.onclick=()=>{ entries = entries.filter(x=>x.id!==e.id); saveEntries(); renderHistory(); };
    li.appendChild(del);
    list.appendChild(li);
  });
}

function exportData(){
  const data = { entries };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download = `dumbbell-entries-${new Date().toISOString()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', ()=>{
  loadEntries();
  loadLastInputs();
  loadCategories();
  renderCategories();
  renderExercises();
  renderHistory();
  const exp = document.getElementById('exportBtn'); if (exp) exp.addEventListener('click', exportData);
  const addCatBtn = document.getElementById('addCategoryBtn');
  if (addCatBtn) addCatBtn.addEventListener('click', ()=>{ const n = document.getElementById('newCategoryName').value.trim(); if (!n) return; addCategory(n); document.getElementById('newCategoryName').value=''; });
  const addExBtn = document.getElementById('addNewExerciseBtn');
  if (addExBtn) addExBtn.addEventListener('click', ()=>{ const n = document.getElementById('newExerciseName').value.trim(); if (!n) return; addExerciseToCategory(selectedCategory, n); document.getElementById('newExerciseName').value=''; });
  // Service worker registration: only register on non-dev hosts
  if ('serviceWorker' in navigator) {
    const devHosts = ['localhost', '127.0.0.1'];
    const isDev = devHosts.includes(location.hostname) || location.protocol === 'file:';
    if (!isDev) {
      navigator.serviceWorker.register('/service-worker.js').then(reg => {
        console.log('Service worker registered:', reg.scope);
      }).catch(err => console.warn('SW registration failed:', err));
    } else {
      console.log('Skipping service worker registration in development environment');
    }
  }
  const clearBtn = document.getElementById('clearChartBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearChartHistory);
  // Rest timer control wiring
  const startBtn = document.getElementById('restStartBtn');
  const pauseBtn = document.getElementById('restPauseBtn');
  const resetBtn = document.getElementById('restResetBtn');
  const setBtn = document.getElementById('setRestBtn');
  const minInput = document.getElementById('restMinutes');
  const secInput = document.getElementById('restSeconds');
  if (minInput) minInput.value = Math.floor(restDurationSec/60);
  if (secInput) secInput.value = restDurationSec%60;
  updateRestDisplay();
  if (startBtn) startBtn.addEventListener('click', startRestTimer);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseRestTimer);
  if (resetBtn) resetBtn.addEventListener('click', resetRestTimer);
  if (setBtn) setBtn.addEventListener('click', setRestFromInputs);
  // Tab buttons
  document.querySelectorAll('.tabBtn').forEach(b=> b.addEventListener('click', ()=> switchTab(b.dataset.tab)));
  // initialize panels and swipe
  switchTab('chart');
  setupSwipe();
});
