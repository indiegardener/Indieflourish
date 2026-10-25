const SUPABASE_URL = 'https://wzfhgkwivhftxdjtzapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let quizQuestions = [];
let userAnswersMap = {};

function showSection(sectionId) {
  const sections = ['auth-section', 'profile-section', 'quiz-section', 'dashboard-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(sectionId);
  if (activeEl) activeEl.classList.add('active');
}

window.addEventListener('DOMContentLoaded', async () => {
  // 1. Check Magic Link Tokens in Hash
  const hash = window.location.hash;
  if (hash && (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=magiclink'))) {
    const { data } = await supabaseClient.auth.getSessionFromUrl({ url: window.location.href });
    if (data && data.session) {
      currentUser = data.session.user;
      window.history.replaceState({}, document.title, window.location.pathname);
      await checkProfileStatus();
      return;
    }
  }

  // 2. Standard Session Check
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    await checkProfileStatus();
  }

  // 3. Auth Button Listener
  const sendBtn = document.getElementById('send-magic-link-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('email-input');
      const statusEl = document.getElementById('auth-status');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email) {
        if (statusEl) statusEl.textContent = 'Please enter a valid email address.';
        return;
      }

      if (statusEl) statusEl.textContent = 'Sending verification code...';

      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin }
      });

      if (error) {
        if (statusEl) statusEl.textContent = 'Error: ' + error.message;
      } else {
        if (statusEl) statusEl.textContent = 'Verification code sent! Check your inbox.';
      }
    });
  }

  // 4. Profile Save Listener
  const saveProfileBtn = document.getElementById('save-profile-btn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const fullName = document.getElementById('full-name').value.trim();
      const location = document.getElementById('location').value.trim();
      const intent = document.getElementById('intent').value;
      const bio = document.getElementById('bio').value.trim();

      if (!fullName || !location) {
        alert('Please fill out your name and location.');
        return;
      }

      const { error } = await supabaseClient.from('profiles').insert([
        { id: currentUser.id, full_name: fullName, location_name: location, intent: intent, bio: bio }
      ]);

      if (error) {
        alert('Error saving profile: ' + error.message);
      } else {
        await loadQuestionnaire();
      }
    });
  }

  // 5. Quiz Submit Listener
  const submitQuizBtn = document.getElementById('submit-quiz-btn');
  if (submitQuizBtn) {
    submitQuizBtn.addEventListener('click', async () => {
      const payload = Object.keys(userAnswersMap).map(qid => ({
        user_id: currentUser.id,
        question_id: parseInt(qid),
        selected_option_id: userAnswersMap[qid],
        weight: 1
      }));

      const { error } = await supabaseClient.from('user_answers').upsert(payload, { onConflict: 'user_id,question_id' });

      if (error) {
        alert('Error saving answers: ' + error.message);
      } else {
        showSection('dashboard-section');
      }
    });
  }

  // 6. Sign Out Listener
  const signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      currentUser = null;
      userAnswersMap = {};
      showSection('auth-section');
    });
  }
});

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    await checkProfileStatus();
  }
});

async function checkProfileStatus() {
  if (!currentUser) return;
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (profile) {
    // Check if they have already answered the quiz to decide whether to show dashboard or quiz
    const { data: answers } = await supabaseClient.from('user_answers').select('question_id').eq('user_id', currentUser.id);
    if (answers && answers.length > 0) {
      showSection('dashboard-section');
    } else {
      await loadQuestionnaire();
    }
  } else {
    showSection('profile-section');
  }
}

async function loadQuestionnaire() {
  showSection('quiz-section');
  const container = document.getElementById('quiz-container');
  if (!container) return;
  
  container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading your questionnaire...</p>';
  const { data: questions, error } = await supabaseClient.from('questions').select('*').order('id', { ascending: true });

  if (error || !questions || !questions.length) {
    container.innerHTML = '<p style="text-align: center; color: var(--accent);">Unable to load questions.</p>';
    return;
  }

  quizQuestions = questions;
  container.innerHTML = '';

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    let optionsHTML = '';
    q.options.forEach(opt => {
      optionsHTML += `<button type="button" class="option-btn" data-qid="${q.id}" data-optid="${opt.id}">${opt.label}</button>`;
    });
    card.innerHTML = `<span class="badge">${q.category}</span><p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 10px;">${idx + 1}. ${q.question_text}</p><div>${optionsHTML}</div>`;
    container.appendChild(card);
  });

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const optid = e.target.getAttribute('data-optid');
      document.querySelectorAll(`.option-btn[data-qid="${qid}"]`).forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      userAnswersMap[qid] = optid;
      if (Object.keys(userAnswersMap).length === quizQuestions.length) {
        const submitBtn = document.getElementById('submit-quiz-btn');
        if (submitBtn) submitBtn.style.display = 'block';
      }
    });
  });
}
