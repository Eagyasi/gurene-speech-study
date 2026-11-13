// Gurenɛ production study: reads the settings (config.js), the participant
// text (text.js) and the stimuli (stimuli.js), then runs the session.
(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const TEST_MODE = !CONFIG.DATAPIPE_ID || params.has("test");
  // The reps shortcut works only in test mode, so a real session is always full length.
  const REPS = Math.max(1, (TEST_MODE && parseInt(params.get("reps"), 10)) || CONFIG.REPETITIONS);

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: false,
    message_progress_bar: "",
    on_finish: showLastPage
  });

  // Every session has a random code. Files carry that code while the session
  // runs. The participant number is added only when the session is finished.
  const session = jsPsych.randomization.randomID(8);
  const started = new Date().toISOString();
  let participant = "";
  let isComplete = false;
  let wantsPayment = false;
  const prefix = () => session;
  const csvLine = (values) => values.map((v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`).join(",");
  const toCsv = (row) => csvLine(Object.keys(row)) + "\r\n" + csvLine(Object.values(row)) + "\r\n";
  const fill = (s, values) => s.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
  const pad = (n) => String(n).padStart(3, "0");
  const phrase = (item) => CONFIG.CARRIER.replace("-", item);
  const leaveWarning = (e) => { e.preventDefault(); e.returnValue = ""; };

  // --------------------------------------------------------- invitation
  // A code is valid when its fingerprint is in codes.js. The same check is
  // repeated against the private list when the data are sorted.
  const invite = { code: "", ok: false, tried: false, message: "" };
  const normalizeCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function validCode(raw) {
    const code = normalizeCode(raw);
    if (code.length !== 8 || typeof CODE_HASHES === "undefined") return false;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CODE_SALT + ":" + code));
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return CODE_HASHES.includes(hex);
  }

  const usedHere = (code) => { try { return localStorage.getItem("gurune_done_" + code) === "1"; } catch (e) { return false; } };
  const markUsedHere = (code) => { try { localStorage.setItem("gurune_done_" + code, "1"); } catch (e) { /* ignore */ } };

  async function tryCode(raw) {
    const code = normalizeCode(raw);
    invite.tried = true;
    if (!(await validCode(code))) { invite.message = TEXT.invite_wrong; return; }
    if (usedHere(code)) { invite.message = TEXT.invite_used; return; }
    invite.ok = true;
    invite.code = code;
  }

  // ---------------------------------------------------------------- order
  // Neighbouring items never share an onset consonant or a vowel.
  const clash = (a, b) =>
    !!a && !!b && (a.item === b.item || (a.onset !== "" && a.onset === b.onset) || a.vowel === b.vowel);

  function orderOnce(items, previous) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const pool = jsPsych.randomization.shuffle(items);
      const out = [];
      let last = previous;
      while (pool.length) {
        const i = pool.findIndex((x) => !clash(last, x));
        if (i < 0) break;
        last = pool.splice(i, 1)[0];
        out.push(last);
      }
      if (out.length === items.length) return out;
    }
    return jsPsych.randomization.shuffle(items);
  }

  function buildBlock(items, block) {
    const out = [];
    let previous = null;
    for (let rep = 1; rep <= REPS; rep++) {
      const order = orderOnce(items, previous);
      order.forEach((x) => out.push(Object.assign({}, x, { block: block, repetition: rep })));
      previous = order[order.length - 1];
    }
    return out;
  }

  const trials = buildBlock(ISOLATED, "isolated").concat(buildBlock(CV, "cv"));
  trials.forEach((t, i) => { t.order = i + 1; t.phrase = phrase(t.item); });
  const TOTAL = trials.length;

  // -------------------------------------------------------------- uploads
  // Recordings are sent in the background, one at a time, so a slow
  // connection never holds the participant up. Failed files are retried at the end.
  const queue = [];
  const failed = [];
  const kept = [];          // test mode: recordings held for the last page
  const waiting = [];
  let running = false;
  let sent = 0;
  let sentAudio = 0;
  let queued = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function trySend(job) {
    const url = "https://pipe.jspsych.org/api/" + (job.kind === "csv" ? "data/" : "base64/");
    for (let attempt = 1; attempt <= CONFIG.UPLOAD_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "*/*" },
          body: JSON.stringify({ experimentID: CONFIG.DATAPIPE_ID, filename: job.filename, data: job.data })
        });
        if (res.ok) return true;
        job.error = `${res.status} ${(await res.text()).slice(0, 200)}`;
        if (res.status >= 400 && res.status < 500) return false;   // a retry will not help
      } catch (e) {
        job.error = String(e);
      }
      await sleep(1500 * attempt);
    }
    return false;
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      if (await trySend(job)) { sent++; if (job.kind === "audio") sentAudio++; } else failed.push(job);
    }
    running = false;
    waiting.splice(0).forEach((resolve) => resolve());
  }

  function enqueue(job) { queued++; queue.push(job); pump(); }
  const busy = () => running || queue.length > 0;
  const whenIdle = () => (busy() ? new Promise((r) => waiting.push(r)) : Promise.resolve());

  function storeAudio(filename, base64, mime, block) {
    const file = { kind: "audio", filename: filename, data: base64, mime: mime, block: block };
    if (TEST_MODE) kept.push(file); else enqueue(file);
  }

  const dataCsv = () => jsPsych.data.get().ignore(["response", "stimulus"]).csv();

  // ----------------------------------------------------------- microphone
  // The browser's echo cancellation, noise suppression and automatic gain
  // are switched off because they distort speech for acoustic analysis.
  const mic = { ok: false, info: {}, stream: null, ctx: null, gain: null, analyser: null, heard: true };

  // Each recording gets a brand-new recorder on the same microphone stream.
  // Reusing one recorder for many recordings is unreliable in some browsers.
  function newRecorder() {
    const Native = window.MediaRecorder;
    try {
      // jsPsych builds the recorder itself, so the bitrate is passed in here.
      window.MediaRecorder = function (s) {
        return new Native(s, { audioBitsPerSecond: CONFIG.AUDIO_BITS_PER_SECOND });
      };
      jsPsych.pluginAPI.initializeMicrophoneRecorder(mic.stream);
    } catch (e) {
      window.MediaRecorder = Native;
      jsPsych.pluginAPI.initializeMicrophoneRecorder(mic.stream);
    } finally {
      window.MediaRecorder = Native;
    }
  }

  async function openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });
    mic.stream = stream;
    try {
      // microphone -> one fixed volume -> recorder. The volume is set once,
      // in the sound check, and never changes during the session.
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      const out = ctx.createMediaStreamDestination();
      analyser.fftSize = 2048;
      out.channelCount = 1;
      source.connect(gain);
      gain.connect(analyser);
      gain.connect(out);
      if (ctx.state === "suspended") ctx.resume();
      document.addEventListener("click", () => { if (ctx.state === "suspended") ctx.resume(); }, true);
      mic.ctx = ctx; mic.gain = gain; mic.analyser = analyser; mic.stream = out.stream;
    } catch (e) {
      mic.gain = null; mic.analyser = null;        // record the microphone as it is
    }
    newRecorder();
    const s = stream.getAudioTracks()[0].getSettings();
    mic.info = {
      mic_sample_rate: s.sampleRate || null,
      mic_echo_cancellation: s.echoCancellation === undefined ? null : s.echoCancellation,
      mic_noise_suppression: s.noiseSuppression === undefined ? null : s.noiseSuppression,
      mic_auto_gain: s.autoGainControl === undefined ? null : s.autoGainControl
    };
  }

  // Loudness meter: watches the signal while a phrase is being recorded.
  const meter = { timer: null, rms: 0, peak: 0, buf: null };

  function meterStart() {
    if (!mic.analyser) return;
    meter.rms = 0; meter.peak = 0;
    meter.buf = meter.buf || new Float32Array(mic.analyser.fftSize);
    clearInterval(meter.timer);
    meter.timer = setInterval(() => {
      mic.analyser.getFloatTimeDomainData(meter.buf);
      let sum = 0, peak = 0;
      for (let i = 0; i < meter.buf.length; i++) {
        const v = meter.buf[i];
        sum += v * v;
        if (v > peak) peak = v; else if (-v > peak) peak = -v;
      }
      meter.rms = Math.max(meter.rms, Math.sqrt(sum / meter.buf.length));
      meter.peak = Math.max(meter.peak, peak);
    }, 40);
  }

  function meterStop() {
    clearInterval(meter.timer);
    return { rms: meter.rms, peak: meter.peak };
  }

  const round3 = (x) => Math.round(x * 1000) / 1000;

  function recorderFormat() {
    const mime = (jsPsych.pluginAPI.getMicrophoneRecorder().mimeType || "audio/webm").toLowerCase();
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    return { mime: mime, ext: ext };
  }

  // --------------------------------------------------------------- trials
  const button = (html, label, extra) =>
    Object.assign({ type: jsPsychHtmlButtonResponse, stimulus: html, choices: [label] }, extra || {});

  const display = (item) =>
    `<div class="phrase">${phrase(item)}</div><div class="rec">${TEXT.recording}</div>`;

  function recordTrial(t) {
    return {
      type: jsPsychHtmlAudioResponse,
      stimulus: display(t.item),
      recording_duration: CONFIG.MAX_RECORDING_MS,
      show_done_button: true,
      done_button_label: TEXT.done,
      post_trial_gap: CONFIG.GAP_MS,
      data: Object.assign({ phase: "recording" }, t),
      on_start: newRecorder,
      on_load: meterStart,
      on_finish: (data) => {
        const level = meterStop();
        data.level_peak = mic.analyser ? round3(level.peak) : null;
        data.level_rms = mic.analyser ? round3(level.rms) : null;
        const f = recorderFormat();
        data.filename = `${prefix()}_${pad(t.order)}_${t.block}_${t.item}_r${t.repetition}.${f.ext}`;
        data.mime_type = f.mime;
        storeAudio(data.filename, data.response, f.mime, t.block);
        data.response = null;            // the audio is saved as its own file
        jsPsych.progressBar.progress = t.order / TOTAL;
      }
    };
  }

  const practiceTrial = (item) => ({
    type: jsPsychHtmlAudioResponse,
    stimulus: display(item),
    recording_duration: CONFIG.MAX_RECORDING_MS,
    show_done_button: true,
    done_button_label: TEXT.done,
    allow_playback: true,
    record_again_button_label: TEXT.record_again,
    accept_button_label: TEXT.accept,
    data: { phase: "practice", item: item },
    on_start: newRecorder,
    on_finish: (data) => { data.response = null; }
  });

  // Sound check: one phrase is measured and the volume is fixed from it.
  const soundCheck = {
    timeline: [
      button(TEXT.check_html, TEXT.check_button),
      {
        type: jsPsychHtmlAudioResponse,
        stimulus: display(CONFIG.PRACTICE_ITEMS[0]),
        recording_duration: CONFIG.MAX_RECORDING_MS,
        show_done_button: true,
        done_button_label: TEXT.done,
        data: { phase: "sound_check" },
        on_start: () => { mic.gain.gain.value = 1; newRecorder(); },
        on_load: meterStart,
        on_finish: (data) => {
          const level = meterStop();
          mic.heard = level.rms >= 0.002;
          if (mic.heard) {
            mic.gain.gain.value = Math.min(CONFIG.MAX_GAIN, Math.max(0.25, CONFIG.TARGET_LEVEL / level.rms));
          }
          data.response = null;
          data.check_rms = round3(level.rms);
          data.mic_gain = round3(mic.gain.gain.value);
          jsPsych.data.addProperties({ mic_gain: round3(mic.gain.gain.value) });
        }
      },
      { timeline: [button(TEXT.check_fail_html, TEXT.check_retry)], conditional_function: () => !mic.heard }
    ],
    conditional_function: () => !!mic.gain,
    loop_function: () => !mic.heard
  };

  // Participant number: the next number in sequence, handed out by DataPipe.
  // This runs only after every recording has arrived, so only people who
  // finish get a number and the numbers have no gaps.
  const assignNumber = {
    type: jsPsychCallFunction,
    async: true,
    func: (done) => {
      jsPsych.getDisplayElement().innerHTML = `<p>${TEXT.number_wait}</p>`;
      const finish = (id, source) => {
        participant = id;
        jsPsych.data.addProperties({ participant: participant, participant_source: source });
        done({ phase: "participant_number", participant: id, participant_source: source });
      };
      if (TEST_MODE) { finish("TEST", "test"); return; }
      const fallback = () => finish("UNNUMBERED", "fallback");
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 10000);
      fetch("https://pipe.jspsych.org/api/condition/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({ experimentID: CONFIG.DATAPIPE_ID }),
        signal: abort.signal
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((json) => {
          clearTimeout(timer);
          if (Number.isInteger(json.condition)) finish(CONFIG.PARTICIPANT_PREFIX + pad(json.condition + 1), "sequence");
          else fallback();
        })
        .catch(() => { clearTimeout(timer); fallback(); });
    }
  };

  const micLoop = {
    timeline: [
      button(TEXT.mic_html, TEXT.mic_button),
      {
        type: jsPsychCallFunction,
        async: true,
        func: (done) => {
          jsPsych.getDisplayElement().innerHTML = `<p>${TEXT.mic_wait}</p>`;
          openMic()
            .then(() => { mic.ok = true; done(Object.assign({ mic_ok: true }, mic.info)); })
            .catch((e) => { mic.ok = false; done({ mic_ok: false, mic_error: String(e) }); });
        }
      },
      { timeline: [button(TEXT.mic_error_html, TEXT.mic_retry)], conditional_function: () => !mic.ok }
    ],
    loop_function: () => !mic.ok
  };

  let gaveUp = false;

  // Completion record: one small file that exists only for finished sessions.
  const markComplete = {
    type: jsPsychCallFunction,
    func: () => {
      const device = jsPsych.data.get().filter({ trial_type: "browser-check" }).values()[0] || {};
      const record = {
        trial_type: "completion-record",
        participant: participant,
        session: session,
        status: "complete",
        started: started,
        completed: new Date().toISOString(),
        invite_code: invite.code,
        expected_recordings: TOTAL,
        recordings_sent: TEST_MODE ? kept.length : sentAudio,
        repetitions: REPS,
        browser: device.browser,
        os: device.os,
        mobile: device.mobile,
        mic_gain: mic.gain ? round3(mic.gain.gain.value) : ""
      };
      isComplete = true;
      if (TEST_MODE) return;
      if (invite.code) markUsedHere(invite.code);
      enqueue({ kind: "csv", filename: `COMPLETE_${participant}_${session}.csv`, data: toCsv(record) });
      enqueue({ kind: "csv", filename: `${session}_data.csv`, data: dataCsv() });
    }
  };

  // Invitation code: taken from a personal link (?code=...) or typed in.
  const codeFromLink = {
    type: jsPsychCallFunction,
    async: true,
    func: (done) => {
      const raw = params.get("code");
      if (!raw) { done({ phase: "invite_link", in_link: false }); return; }
      tryCode(raw).then(() => done({ phase: "invite_link", in_link: true, valid: invite.ok }));
    }
  };

  const codeEntry = {
    timeline: [{
      type: jsPsychSurveyHtmlForm,
      preamble: () => (invite.tried ? `<p class="bad">${invite.message}</p>` : "") + TEXT.invite_html,
      html: '<p><input name="code" type="text" required autocomplete="off" autocapitalize="characters" style="text-transform: uppercase"></p>',
      button_label: TEXT.invite_button,
      data: { phase: "invite" },
      on_finish: async (data) => {
        await tryCode((data.response || {}).code);
        data.response = null;
      }
    }],
    conditional_function: () => !invite.ok,
    loop_function: () => !invite.ok
  };

  // Start record: lets an unfinished session be traced to its invitation code.
  const markStart = {
    type: jsPsychCallFunction,
    func: () => {
      if (TEST_MODE) return;
      const device = jsPsych.data.get().filter({ trial_type: "browser-check" }).values()[0] || {};
      enqueue({
        kind: "csv",
        filename: `START_${session}.csv`,
        data: toCsv({
          trial_type: "start-record",      // DataPipe rejects a CSV without this column
          session: session,
          invite_code: invite.code,
          started: started,
          expected_recordings: TOTAL,
          browser: device.browser,
          os: device.os,
          mobile: device.mobile
        })
      });
    }
  };

  // Payment details go into their own file and are wiped from the study data.
  const paymentOffer = {
    type: jsPsychHtmlButtonResponse,
    stimulus: (TEST_MODE ? TEXT.payment_test_note : "") + TEXT.payment_offer_html,
    choices: [TEXT.payment_yes, TEXT.payment_no],
    data: { phase: "payment_offer" },
    on_finish: (data) => { wantsPayment = data.response === 0; }
  };

  const field = (label, input) => `<p><label>${label}<br>${input}</label></p>`;
  const paymentForm = {
    type: jsPsychSurveyHtmlForm,
    preamble: (TEST_MODE ? TEXT.payment_test_note : "") + TEXT.payment_form_html,
    html:
      field(TEXT.payment_name, '<input name="name" type="text" required autocomplete="off">') +
      field(TEXT.payment_number, '<input name="number" id="momo1" type="tel" inputmode="numeric" pattern="[0-9+ ]{9,15}" required autocomplete="off">') +
      field(TEXT.payment_number_again, '<input name="number2" id="momo2" type="tel" inputmode="numeric" required autocomplete="off">') +
      field(TEXT.payment_network, `<select name="network" required><option value="">${TEXT.payment_choose}</option>` +
        CONFIG.PAYMENT_NETWORKS.map((n) => `<option>${n}</option>`).join("") + "</select>"),
    button_label: TEXT.payment_button,
    data: { phase: "payment" },
    on_load: () => {
      const a = document.getElementById("momo1");
      const b = document.getElementById("momo2");
      const check = () => b.setCustomValidity(a.value.replace(/\s/g, "") === b.value.replace(/\s/g, "") ? "" : TEXT.payment_mismatch);
      a.addEventListener("input", check);
      b.addEventListener("input", check);
    },
    on_finish: (data) => {
      const r = data.response || {};
      if (!TEST_MODE) {
        enqueue({
          kind: "csv",
          filename: `PAYMENT_${participant}_${session}.csv`,
          data: toCsv({
            trial_type: "payment-record",
            participant: participant,
            session: session,
            invite_code: invite.code,
            completed: new Date().toISOString(),
            name: r.name,
            number: String(r.number || "").replace(/\s/g, ""),
            network: r.network
          })
        });
      }
      data.response = null;                // never kept with the research data
      data.payment_submitted = true;
    }
  };

  const saving = {
    type: jsPsychCallFunction,
    async: true,
    func: (done) => {
      const el = jsPsych.getDisplayElement();
      const render = () => { el.innerHTML = fill(TEXT.saving_html, { sent: sent, total: queued }); };
      render();
      const tick = setInterval(render, 500);
      whenIdle().then(() => {
        clearInterval(tick);
        done({ phase: "saving", uploads_sent: sent, uploads_failed: failed.length });
      });
    }
  };

  const retry = {
    timeline: [{
      type: jsPsychHtmlButtonResponse,
      stimulus: () =>
        fill(TEXT.failed_html, { n: failed.length }) +
        `<p class="note">${failed.length ? failed[0].error || "" : ""}</p>`,
      choices: [TEXT.failed_button, TEXT.failed_skip],
      on_finish: (data) => {
        if (data.response === 0) { failed.splice(0).forEach((job) => queue.push(job)); pump(); }
        else { gaveUp = true; }
      }
    }],
    conditional_function: () => failed.length > 0
  };

  // ------------------------------------------------------------- timeline
  const timeline = [];

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    timeline.push({ type: jsPsychHtmlButtonResponse, stimulus: TEXT.unsupported_html, choices: [] });
  } else {
    timeline.push(button(TEXT.consent_html, TEXT.consent_button, {
      on_finish: () => window.addEventListener("beforeunload", leaveWarning)
    }));
    if (CONFIG.REQUIRE_CODE && !TEST_MODE) {
      timeline.push(codeFromLink);
      timeline.push(codeEntry);
    }
    timeline.push({
      type: jsPsychCallFunction,
      func: () => jsPsych.data.addProperties({
        session: session,
        invite_code: invite.code,
        started: started,
        carrier: CONFIG.CARRIER,
        repetitions: REPS,
        test_mode: TEST_MODE
      })
    });
    timeline.push({
      type: jsPsychBrowserCheck,
      features: ["width", "height", "browser", "browser_version", "mobile", "os"]
    });
    timeline.push(micLoop);
    timeline.push(markStart);
    timeline.push(button(TEXT.instructions_html, TEXT.instructions_button));
    timeline.push(soundCheck);
    timeline.push(button(TEXT.practice_intro_html, TEXT.practice_button));
    CONFIG.PRACTICE_ITEMS.forEach((item) => timeline.push(practiceTrial(item)));

    // Rest screens are counted from the start of each part, so they are evenly
    // spaced and never fall right after a part begins.
    let inBlock = 0;
    trials.forEach((t, i) => {
      const firstOfBlock = i === 0 || trials[i - 1].block !== t.block;
      inBlock = firstOfBlock ? 0 : inBlock + 1;
      if (firstOfBlock) {
        timeline.push(button(t.block === "isolated" ? TEXT.block_isolated_html : TEXT.block_cv_html, TEXT.block_button));
      } else if (inBlock % CONFIG.BREAK_EVERY === 0) {
        timeline.push(button(fill(TEXT.break_html, { done: i, total: TOTAL }), TEXT.break_button));
      }
      timeline.push(recordTrial(t));
    });

    // The ending. A session counts as finished only when every recording has
    // arrived. Only then does it get a number, a completion record and payment.
    const drain = () => ({
      timeline: [saving, retry],
      conditional_function: () => !TEST_MODE,
      loop_function: () => !gaveUp && (failed.length > 0 || busy())
    });
    const allArrived = () => !gaveUp && failed.length === 0;

    timeline.push(drain());
    timeline.push({ timeline: [assignNumber, markComplete, drain()], conditional_function: allArrived });
    if (CONFIG.COLLECT_PAYMENT) {
      timeline.push({
        timeline: [
          paymentOffer,
          { timeline: [paymentForm, drain()], conditional_function: () => wantsPayment }
        ],
        conditional_function: () => isComplete && allArrived()
      });
    }
  }

  // ------------------------------------------------------------ last page
  function toBlob(file) {
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: file.mime.split(";")[0] });
  }

  function reviewTable(files) {
    const parts = [["isolated", "Part 1: isolated vowels"], ["cv", "Part 2: CV syllables"]];
    let html = `<p id="review-summary">${files.length} recordings. Checking the sound…</p><table>`;
    parts.forEach(([block, title]) => {
      const group = files.filter((f) => f.block === block);
      if (!group.length) return;
      html += `<tr><th colspan="4">${title} (${group.length})</th></tr>`;
      group.forEach((f) => {
        const i = files.indexOf(f);
        const url = URL.createObjectURL(toBlob(f));
        html += `<tr><td>${f.filename}</td><td><audio controls preload="metadata" src="${url}"></audio></td>` +
                `<td id="check-${i}">…</td><td><a download="${f.filename}" href="${url}">${TEXT.download}</a></td></tr>`;
      });
    });
    return html + "</table>";
  }

  // Decodes every recording and reports its length and loudness, so a silent
  // or empty file is obvious without listening to all of them.
  async function checkSound(files) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let problems = 0;
    for (let i = 0; i < files.length; i++) {
      const cell = document.getElementById(`check-${i}`);
      let label;
      try {
        const audio = await ctx.decodeAudioData(await toBlob(files[i]).arrayBuffer());
        const samples = audio.getChannelData(0);
        let peak = 0;
        for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k]));
        const level = peak < 0.01 ? "NO SOUND" : peak < 0.05 ? "very quiet" : peak > 0.99 ? "too loud" : "ok";
        if (level === "NO SOUND" || audio.duration < 0.3) problems++;
        label = `${audio.duration.toFixed(1)} s, ${level}`;
      } catch (e) {
        problems++;
        label = "CANNOT BE READ";
      }
      if (cell) { cell.textContent = label; if (/[A-Z]{3}/.test(label)) cell.className = "bad"; }
    }
    const summary = document.getElementById("review-summary");
    if (summary) summary.textContent = `${files.length} recordings. ${problems ? problems + " with a problem." : "All have sound."}`;
  }

  function showLastPage() {
    window.removeEventListener("beforeunload", leaveWarning);
    const unsent = failed.filter((job) => job.kind === "audio");
    const files = TEST_MODE ? kept : unsent;
    const code = fill(TEXT.end_code_html, { code: participant && isComplete ? `${participant}-${session}` : session });
    let html = TEXT.end_html + code;
    if (TEST_MODE || failed.length) {
      const csv = URL.createObjectURL(new Blob([dataCsv()], { type: "text/csv" }));
      html = (TEST_MODE ? TEXT.end_test_html : fill(TEXT.failed_html, { n: failed.length }) + code) +
        `<div class="review"><p><a download="${prefix()}_data.csv" href="${csv}">${TEXT.download_data}</a></p>` +
        reviewTable(files) + `</div>`;
    }
    jsPsych.getDisplayElement().innerHTML = html;
    const bar = document.querySelector("#jspsych-progressbar-container");
    if (bar) bar.style.display = "none";
    if (TEST_MODE || failed.length) checkSound(files);
  }

  jsPsych.run(timeline);
})();
