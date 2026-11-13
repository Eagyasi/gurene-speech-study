// Everything the participant reads. Translate the text between the quotes.
// Keep the words in {curly brackets} as they are: they are filled in automatically.
const TEXT = {
  consent_html:
    "<h2>Gurenɛ production study</h2>" +
    "<p>You are invited to participate in a speech production research study. During this session, you will be asked to read short phrases and record your voice via your microphone.</p>" +
    "<p>Your audio recordings will be de-identified, and no personal information will be linked to them. All data are stored securely and kept strictly confidential. Participation carries no known risks.</p>" +
    "<p>You will be offered 30 cedis as compensation. If you choose to be paid, your mobile money details are used only for the payment and deleted afterwards. Participation is completely voluntary—you may withdraw at any time by closing your browser.</p>" +
    "<p>The study takes about 20 to 25 minutes.</p>" +
    "<p><b>Please continue only if you are a native speaker of Gurenɛ and can read simple phrases.</b></p>" +
    "<p>By clicking \"I Agree,\" you confirm that you are at least 18 years old and consent to participate and have your voice recorded.</p>",
  consent_button: "I Agree",

  number_wait: "One moment…",

  invite_html: "<p>Enter the invitation code you were given.</p>",
  invite_button: "Continue",
  invite_wrong: "That code is not valid. Check it and try again.",
  invite_used: "This code has already been used.",

  mic_html:
    "<p>This study records your voice.</p>" +
    "<p>Please find a quiet place. Hold the phone or sit about a hand's length from the microphone.</p>" +
    "<p>When your device asks for the microphone, choose <b>Allow</b>.</p>",
  mic_button: "Turn on microphone",
  mic_wait: "Waiting for the microphone…",
  mic_error_html:
    "<p>The microphone could not be turned on.</p>" +
    "<p>Check that this page is allowed to use the microphone, then try again.</p>",
  mic_retry: "Try again",
  unsupported_html:
    "<p>This browser cannot record audio.</p>" +
    "<p>Please open the link in Chrome, Firefox, or Safari and make sure the address starts with https.</p>",

  instructions_html:
    "<p>A phrase will appear on the screen.</p>" +
    "<p>Read it aloud once, in your normal voice.</p>" +
    "<p><b>Please tap Done after each reading.</b></p>",
  instructions_button: "Continue",

  check_html:
    "<p>First we set the sound level.</p>" +
    "<p>On the next screen, read the phrase aloud in the same voice you will use for the whole study. Then tap <b>Done</b>.</p>",
  check_button: "Start",
  check_fail_html:
    "<p>We could not hear you.</p>" +
    "<p>Move closer to the microphone and read the phrase aloud again.</p>",
  check_retry: "Try again",

  practice_intro_html:
    "<p>Now two practice phrases.</p>" +
    "<p>After each one you can listen to yourself. If it is too quiet or noisy, record it again.</p>",
  practice_button: "Continue",
  record_again: "Record again",
  accept: "It sounds fine",

  block_isolated_html: "<p>Part 1 of 2.</p><p>Read each phrase aloud.</p><p><b>Please tap Done after each reading.</b></p>",
  block_cv_html: "<p>Part 2 of 2.</p><p>Read each phrase aloud.</p><p><b>Please tap Done after each reading.</b></p>",
  block_button: "Start",

  recording: "recording",
  done: "Done",

  break_html: "<p>You have finished {done} of {total}.</p><p>Rest if you need to.</p>",
  break_button: "Continue",

  saving_html: "<p>Sending your recordings.</p><p>Please keep this page open.</p><p class='note'>{sent} of {total} sent</p>",
  failed_html:
    "<p>Files not sent: {n}.</p>" +
    "<p>Check your internet connection, keep this page open, and try again.</p>",
  failed_button: "Try again",
  failed_skip: "Save the files on this device instead",

  payment_offer_html:
    "<h2>You have finished. Thank you.</h2>" +
    "<p>You can receive 30 Ghana cedis by mobile money for taking part.</p>",
  payment_yes: "Enter payment details",
  payment_no: "I do not want payment",
  payment_form_html:
    "<p>Enter the mobile money account that should receive the payment.</p>" +
    "<p>These details are used only to send your payment. They are deleted after you are paid.</p>" +
    "<p><b>Do not enter your PIN.</b> We will never ask for it.</p>",
  payment_name: "Name on the mobile money account",
  payment_number: "Mobile money number",
  payment_number_again: "Enter the number again",
  payment_network: "Network",
  payment_choose: "Choose…",
  payment_mismatch: "The two numbers do not match.",
  payment_button: "Submit",

  end_html: "<h2>Thank you.</h2><p>Your recordings have been saved. You can close this page.</p>",
  end_code_html: "<p>Your code is <b>{code}</b>. Keep it in case you need to contact the researcher.</p>",
  payment_test_note: "<p class='bad'>Practice run. No payment is made and nothing you enter here is sent.</p>",
  end_test_html:
    "<h2>Test finished</h2>" +
    "<p>Test mode: nothing was uploaded. Listen to the recordings below to check the sound.</p>",
  download_data: "Download the trial data (CSV)",
  download: "download"
};
