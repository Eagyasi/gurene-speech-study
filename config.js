// Settings for the study. This is the only file you normally need to change.
const CONFIG = {
  // Paste the experiment ID from pipe.jspsych.org between the quotes.
  // While it is empty the study runs in TEST MODE: nothing is uploaded, and the
  // last page lets you play back and download every recording.
  // Adding ?test to the web address also gives test mode, for example
  // http://localhost:8000/?test&reps=1
  DATAPIPE_ID: "9SoJBmyPxmip",

  // Carrier phrase. The - marks where the target goes.
  CARRIER: "Yele - buyi",

  // How many times each item is recorded. Every repetition is a separately
  // shuffled pass through the items. In test mode, adding reps=1 to the web
  // address overrides this for a quick run. Real sessions ignore it.
  REPETITIONS: 2,

  // Participant numbers are given out automatically in order: P001, P002, ...
  // A number is given only when someone FINISHES the study, so people who
  // start and quit never use one up.
  PARTICIPANT_PREFIX: "P",

  // Invitation codes. When true, nobody can start without a valid code.
  // Each recruited person gets one code from the private list.
  REQUIRE_CODE: true,

  // Payment. When true, people who finish are asked for mobile money details.
  // The details are saved in a separate PAYMENT file, never with the research data.
  COLLECT_PAYMENT: true,
  PAYMENT_NETWORKS: ["MTN", "Telecel (Vodafone)", "AT (AirtelTigo)"],

  // Longest recording per item, in milliseconds. Tapping Done ends it sooner.
  MAX_RECORDING_MS: 10000,

  // Silent pause between items, in milliseconds.
  GAP_MS: 500,

  // A rest screen appears after this many recordings, counted from the start
  // of each part. With 30, Part 2 (80 recordings) has two rests, after 30 and
  // after 60, and the screen between Part 1 and Part 2 is a third pause.
  BREAK_EVERY: 30,

  // Syllables for the two practice recordings. They are not in the stimulus
  // set and are never saved.
  PRACTICE_ITEMS: ["ka", "go"],

  // Audio quality requested from the browser. Higher is better and larger.
  AUDIO_BITS_PER_SECOND: 128000,

  // Sound level. During the sound check the study measures the voice once and
  // sets one fixed volume for the whole session, so quiet microphones still
  // give a healthy level. A fixed volume does not change the formants.
  // TARGET_LEVEL is the loudness aimed for (0 to 1). MAX_GAIN caps the boost.
  TARGET_LEVEL: 0.12,
  MAX_GAIN: 20,

  // Loudness guard. After the sound check the volume can only go DOWN.
  // If any recording, practice or real, peaks above GUARD_PEAK (1 is the
  // loudest the recorder can hold; above it the sound is distorted), the
  // volume is lowered so that the same voice would peak at SAFE_PEAK.
  // Every recording's volume is saved in the data as gain_used.
  GUARD_PEAK: 0.7,
  SAFE_PEAK: 0.35,

  // How many times each upload is tried before it is set aside for a retry.
  UPLOAD_ATTEMPTS: 3
};
