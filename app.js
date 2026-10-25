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

// View Switcher Utility
function showSection(sectionElement) {
  [authSection, profileSection, quizSection, dashboardSection].forEach(s => s.classList.remove('active'));
  sectionElement.classList.add('active');
}

// 1. Explicit Session Check & Magic Link Hash Handler on Load
window.addEventListener('DOMContentLoaded', async () => {
  // Check if Supabase passed tokens in the URL hash (from Magic Link / Verification)
  const hash = window.location.hash;
  if (hash && (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=magiclink'))) {
    const { data, error } = await supabase.auth.getSessionFromUrl({ url: window.location.href });
    if (data && data.session) {
      currentUser = data.session.user;
      // Clean the token hash from the URL bar
      window.history.replaceState({}, document.title, window.location.pathname);
      await checkProfileStatus();
      return;
    }
  }

  // Standard session check
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    await checkProfileStatus();
  }
});

// Listen for subsequent Auth State Changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    await checkProfileStatus();
  }
});

// 2. Authentication: Send Magic Link / Verification Code
document.getElementById('send-magic-link-btn').addEventListener('click', async () => {
  const emailInput = document.getElementById('email-input');
  const statusEl = document.getElementById('auth-status');
  const email = emailInput ? emailInput.value.trim() : '';
  
  if (!email) {
    statusEl.textContent = 'Please enter a valid email address.';
    return;
  }

  statusEl.textContent = 'Sending verification link...';
  
  // Use current window origin so it redirects back to your live Vercel domain correctly
  const { error } = await supabase.auth.signInWithOtp({ 
    email: email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  if (error) {
    statusEl.textContent = 'Error: ' + error.message;
  } else {
    statusEl.textContent = 'Verification link sent! Check your email inbox.';
  }
});

// 3. Check Profile Status in Database
async function checkProfileStatus() {
  if (!currentUser) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profile) {
    // Profile exists, proceed to questionnaire / dashboard
    await loadQuestionnaire();
  } else {
    // Profile does not exist yet, show profile setup form
    showSection(profileSection);
  }
}

// 4. Save User Profile
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

// 5. Load & Render Questionnaire
async function loadQuestionnaire() {
  showSection(quizSection);
  const container = document.getElementById('quiz-container');
  container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading your questionnaire...</p>';

  const { data: questions, error } = await supabase.from('questions').select('*').order('id', { ascending: true });

  if (error || !questions || !questions.length) {
    container.innerHTML = '<p style="text-align: center; color: var(--accent);">Unable to load questions. Please check database tables.</p>';
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
        <button type="button" class="option-btn" data-qid="${q.id}" data-optid="${opt.id}">
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

  // Attach option selection event listeners
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const optid = e.target.getAttribute('data-optid');

      // Update UI selection styling
      document.querySelectorAll(`.option-btn[data-qid="${qid}"]`).forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');

      // Store answer
      userAnswersMap[qid] = optid;

      // Show submit button once all questions have been answered
      if (Object.keys(userAnswersMap).length === quizQuestions.length) {
        document.getElementById('submit-quiz-btn').style.display = 'block';
      }
    });
  });
}

// 6. Submit Questionnaire Answers
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
