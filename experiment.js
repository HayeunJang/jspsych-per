/******************************************************
 * Audio Rating Task (slider) + Google Sheets upload
 * - No user-entered participant ID (server auto-numbers)
 * - Random order (timeline_variables)
 * - Preload audio
 * - CSV fallback if upload fails
 ******************************************************/

/* ===== CONFIG: Apps Script Web App URL ===== */
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbx_V4Ay6Nzl1sw94IMxKUL_a0E-t9w-pNsvRpi3WV_GMWx9lLCuUhP1Q2ZtQTJ2yINz1A/exec'; // TODO: 교체

/* ===== UI TEXTS (수업에서 여기만 바꿔도 충분) ===== */
const TEXTS = {
  welcomeTitle: 'Audio Rating Task',
  welcomeBody: 'You will hear short sounds and rate them on a scale.',
  startBtn: 'Start',
  prompt: 'How strongly did this sound match the “sarcastic” category?',
  leftLabel: 'Not at all',
  rightLabel: 'Very strongly',
  endTitle: 'Thanks!',
  endBody: 'Your data have been prepared. If upload fails, use the CSV button.',
  finishBtn: 'Finish'
};

/* ===== STIMULI: 오디오 파일 목록 (원하는 만큼 추가) ===== */
const STIMULI = [
  { file: 'assets/audio/amazed.wav' },
  { file: 'assets/audio/sarcastic.wav' }
  // { file: 'assets/audio/angry.wav' },
  // { file: 'assets/audio/happy.wav' },
];

/* ===== SLIDER SETTINGS (Likert 1–7 기본) ===== */
const SLIDER = {
  min: 1, max: 7, step: 1, start: 4, require_movement: true,
  labels: ['1','2','3','4','5','6','7']
};

/* ===== INIT ===== */
const jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  on_finish: async () => {
    const ok = await uploadAllRowsToGoogle();
    if (!ok) {
      // 업로드 실패 대비: CSV 즉시 다운로드
      const csv = jsPsych.data.get().csv();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'data_fallback.csv';
      a.textContent = 'Download CSV (upload failed)';
      document.body.appendChild(a);
    }
  }
});

/* ===== PRELOAD ===== */
const preload = {
  type: jsPsychPreload,
  audio: STIMULI.map(s => s.file)
};

/* ===== SCREENS ===== */
const welcome = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>${TEXTS.welcomeTitle}</h2><p>${TEXTS.welcomeBody}</p>`,
  choices: [TEXTS.startBtn]
};

const end = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>${TEXTS.endTitle}</h2><p>${TEXTS.endBody}</p>`,
  choices: [TEXTS.finishBtn]
};

/* ===== TRIAL FACTORY: audio + slider rating ===== */
function makeAudioRatingTrial(tv) {
  return {
    type: jsPsychAudioSliderResponse,
    stimulus: tv.file,
    prompt: `<p>${TEXTS.prompt}</p>
             <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-top:4px;">
              <span>${TEXTS.leftLabel}</span><span>${TEXTS.rightLabel}</span>
             </div>`,
    slider_min: SLIDER.min,
    slider_max: SLIDER.max,
    slider_start: SLIDER.start,
    slider_step: SLIDER.step,
    labels: SLIDER.labels,
    require_movement: SLIDER.require_movement,
    response_allowed_while_playing: false, // RT 일관성 향상
    data: { task: 'rating', stimulus_file: tv.file },
    on_finish: (d) => {
      // jsPsych 기본 저장: rt(ms), response(슬라이더 값)
      d.rating     = d.response;
      d.stimulus   = d.stimulus_file || d.stimulus;
      d.user_agent = navigator.userAgent;
      d.timestamp  = new Date().toISOString();
    }
  };
}

/* ===== RANDOM ORDER via timeline_variables ===== */
const rating_block = {
  timeline: [ makeAudioRatingTrial(jsPsych.timelineVariable('tv')) ],
  timeline_variables: STIMULI.map(s => ({ tv: s })),
  sample: { type: 'without-replacement' } // 전 항목 1회씩 무작위
};

/* ===== RUN ===== */
jsPsych.run([preload, welcome, rating_block, end]);

/* ===== GOOGLE UPLOAD (서버에서 participant_id 자동 부여) ===== */
async function uploadAllRowsToGoogle() {
  if (!GAS_ENDPOINT || GAS_ENDPOINT.startsWith('PASTE_')) {
    console.warn('No GAS endpoint configured.');
    return false;
  }
  try {
    // 서버 헤더에 맞춰 필드 구성
    const rows = jsPsych.data.get().values().map(d => ({
      trial_index:  d.trial_index,
      task:         d.task || '',
      stimulus:     d.stimulus || d.stimulus_file || '',
      rating:       d.rating ?? d.response,
      rt:           d.rt,
      time_elapsed: d.time_elapsed,
      timestamp:    d.timestamp || new Date().toISOString(),
      user_agent:   d.user_agent || navigator.userAgent
    }));

    await fetch(GAS_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors', // Apps Script CORS 제약 회피
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows)
    });
    console.log('Upload attempted (no-cors). Check your Google Sheet.');
    return true; // 응답을 읽을 수는 없지만 업로드 시도 완료
  } catch (e) {
    console.warn('Upload error:', e);
    return false;
  }
}
