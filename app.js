// Initialize Supabase Client
const SUPABASE_URL = 'https://wzfhgkwivhftxdjtzapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE';
const supabase = window.supabase.createClient('https://wzfhgkwivhftxdjtzapx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE');

// DOM Elements
const authSection = document.getElementById('auth-section');
const profileSection = document.getElementById('profile-section');
const quizSection = document.getElementById('quiz-section');
const dashboardSection = document.getElementById('dashboard-section');

let currentUser = null;
let quizQuestions = [];
let userAnswersMap = {};

// View Switcher
function showSection(sectionElement) {
  [authSection, profileSection, quizSection, dashboardSection].forEach(s => s.classList.remove('active'));
  sectionElement.classList.add('active');
}

// 1. Magic Link Auth
document.getElementById('send-magic-link-btn').addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const statusEl = document.getElementById('auth-status');
  
  if (!email) {
    statusEl.textContent = 'Please enter a valid email address.';
    return;
  }

  statusEl.textContent = 'Sending Magic Link...';
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    statusEl.textContent = 'Error: ' + error.message;
  } else {
    statusEl.textContent = 'Magic Link sent! Check your email inbox.';
  }
});

// Check Session and Handle Magic Link Redirects on Load
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Handle PKCE authorization code if passed in query params (?code=...)
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get('code');

  if (authCode) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (data?.session) {
      currentUser = data.session.user;
      window.history.replaceState({}, document.title, window.location.pathname);
      await checkProfileStatus();
      return;
    }
  }

  // 2. Handle Hash tokens (#access_token=...)
  if (window.location.hash && window.location.hash.includes('access_token')) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 3. Standard session check from browser storage
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    if (window.location.hash || window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    await checkProfileStatus();
  }
});

// Single Unified Auth State Change Listener
supabase.auth.onAuthStateChange(async (event, session) => {
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
    currentUser = session.user;
    if (window.location.hash || window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    await checkProfileStatus();
  }
});

// 2. Check Profile Status
async function checkProfileStatus() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (profile) {
    await loadQuestionnaire();
  } else {
    showSection(profileSection);
  }
}

// 3. Save Profile
document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const fullName = document.getElementById('full-name').value.trim();
  const location = document.getElementById('location').value.trim();
  const intent = document.getElementById('intent').value;
  const bio = document.getElementById('bio').value.trim();

  if (!fullName || !location) {
    alert('Please fill out your name and location.');
    return;
  }

  const { error } = await supabase.from('profiles').insert([
    {
      id: currentUser.id,
      full_name: fullName,
      location_name: location,
      intent: intent,
      bio: bio
    }
  ]);

  if (error) {
    alert('Error saving profile: ' + error.message);
  } else {
    await loadQuestionnaire();
  }
});

// 4. Load & Render Questionnaire
async function loadQuestionnaire() {
  showSection(quizSection);
  const container = document.getElementById('quiz-container');
  container.innerHTML = '<p>Loading your questionnaire...</p>';

  const { data: questions, error } = await supabase.from('questions').select('*').order('id', { ascending: true });

  if (error || !questions.length) {
    container.innerHTML = '<p>Unable to load questions.</p>';
    return;
  }

  quizQuestions = questions;
  container.innerHTML = '';

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    
    let optionsHTML = '';
    q.options.forEach(opt => {
      optionsHTML += `
        <button class="option-btn" data-qid="${q.id}" data-optid="${opt.id}">
          ${opt.label}
        </button>
      `;
    });

    card.innerHTML = `
      <span class="badge">${q.category}</span>
      <p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 10px;">${idx + 1}. ${q.question_text}</p>
      <div>${optionsHTML}</div>
    `;

    container.appendChild(card);
  });

  // Attach option selection events
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const optid = e.target.getAttribute('data-optid');

      // Highlight selected button
      document.querySelectorAll(`.option-btn[data-qid="${qid}"]`).forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');

      userAnswersMap[qid] = optid;

      // Show submit button if all answered
      if (Object.keys(userAnswersMap).length === quizQuestions.length) {
        document.getElementById('submit-quiz-btn').style.display = 'block';
      }
    });
  });
}

// 5. Submit Answers
document.getElementById('submit-quiz-btn').addEventListener('click', async () => {
  const payload = Object.keys(userAnswersMap).map(qid => ({
    user_id: currentUser.id,
    question_id: parseInt(qid),
    selected_option_id: userAnswersMap[qid],
    weight: 1
  }));

  const { error } = await supabase.from('user_answers').upsert(payload, { onConflict: 'user_id,question_id' });

  if (error) {
    alert('Error saving answers: ' + error.message);
  } else {
    showSection(dashboardSection);
  }
});
