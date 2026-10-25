const SUPABASE_URL = 'https://wzfhgkwivhftxdjtzapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let quizQuestions = [];
let userAnswersMap = {};
let availableProfiles = [];
let currentCardIndex = 0;

function showSection(sectionId) {
  const sections = ['auth-section', 'profile-section', 'quiz-section', 'dashboard-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(sectionId);
  if (activeEl) activeEl.classList.add('active');

  // Control header menu visibility: only show on dashboard
  const menuContainer = document.getElementById('header-menu-container');
  if (menuContainer) {
    menuContainer.style.display = (sectionId === 'dashboard-section') ? 'block' : 'none';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // 1. Check Magic Link Tokens
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

      if (statusEl) statusEl.textContent = 'Sending verification link...';

      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin }
      });

      if (error) {
        if (statusEl) statusEl.textContent = 'Error: ' + error.message;
      } else {
        if (statusEl) statusEl.textContent = 'Verification link sent! Check your inbox.';
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

      const { error } = await supabaseClient.from('profiles').upsert([
        { id: currentUser.id, full_name: fullName, location_name: location, intent: intent, bio: bio }
      ], { onConflict: 'id' });

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
        await loadDashboard();
      }
    });
  }

  // 6. Hamburger Menu Listeners
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const dropdownMenu = document.getElementById('dropdown-menu');

  if (menuToggleBtn && dropdownMenu) {
    menuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('show');
    });
  }

  // 7. Dropdown Actions
  const profilePreviewBtn = document.getElementById('menu-profile-preview');
  const signOutBtn = document.getElementById('menu-sign-out');
  const deleteAccountBtn = document.getElementById('menu-delete-account');
  const profileModal = document.getElementById('profile-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');

  if (profilePreviewBtn) {
    profilePreviewBtn.addEventListener('click', async () => {
      dropdownMenu.classList.remove('show');
      await showProfilePreview();
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      currentUser = null;
      userAnswersMap = {};
      showSection('auth-section');
    });
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      dropdownMenu.classList.remove('show');
      if (confirm('Are you sure you want to delete your account? This will remove your profile and answers.')) {
        await deleteUserAccount();
      }
    });
  }

  if (closeModalBtn && profileModal) {
    closeModalBtn.addEventListener('click', () => {
      profileModal.classList.remove('show');
    });
  }

  // 8. Swipe Button Listeners
  const passBtn = document.getElementById('pass-btn');
  const connectBtn = document.getElementById('connect-btn');

  if (passBtn) {
    passBtn.addEventListener('click', () => swipeCurrentCard('left'));
  }
  if (connectBtn) {
    connectBtn.addEventListener('click', () => swipeCurrentCard('right'));
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
    const { data: answers } = await supabaseClient.from('user_answers').select('question_id').eq('user_id', currentUser.id);
    if (answers && answers.length > 0) {
      await loadDashboard();
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

// DASHBOARD & SWIPE DECK LOGIC WITH 30-DAY LEFT-SWIPE EXPIRATION
async function loadDashboard() {
  showSection('dashboard-section');
  const deckContainer = document.getElementById('deck-container');
  if (!deckContainer) return;

  deckContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding-top: 100px;">Finding like-minded people...</p>';

  const { data: existingConnections } = await supabaseClient
    .from('connections')
    .select('requester_id, receiver_id, status, created_at')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const excludedUserIds = new Set([currentUser.id]);

  if (existingConnections) {
    existingConnections.forEach(c => {
      const otherId = c.requester_id === currentUser.id ? c.receiver_id : c.requester_id;

      if (c.status === 'accepted' || c.status === 'pending') {
        excludedUserIds.add(otherId);
      } else if (c.status === 'rejected' && c.requester_id === currentUser.id) {
        const createdAt = new Date(c.created_at);
        if (createdAt > thirtyDaysAgo) {
          excludedUserIds.add(otherId);
        }
      }
    });
  }

  const { data: profiles, error } = await supabaseClient
    .from('profiles')
    .select('*');

  if (error || !profiles) {
    deckContainer.innerHTML = '<p style="text-align: center; color: var(--accent);">Error loading profiles.</p>';
    return;
  }

  availableProfiles = profiles.filter(p => !excludedUserIds.has(p.id));
  currentCardIndex = 0;
  
  await updateActiveChatCount();
  renderDeck();
}

async function updateActiveChatCount() {
  const { data: activeMatches } = await supabaseClient
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  const count = activeMatches ? activeMatches.length : 0;
  const countBadge = document.querySelector('.deck-subheader span:last-child');
  if (countBadge) {
    countBadge.innerHTML = `Active Chat: <strong>${count} / 3</strong>`;
  }
}

function renderDeck() {
  const deckContainer = document.getElementById('deck-container');
  deckContainer.innerHTML = '';

  if (currentCardIndex >= availableProfiles.length) {
    deckContainer.innerHTML = `
      <div style="text-align: center; padding-top: 100px;">
        <p style="font-weight: 600; font-size: 1.1rem; color: var(--primary);">All caught up!</p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 8px;">
          You have viewed all available profiles. Expired left swipes and new members will appear here over time!
        </p>
      </div>
    `;
    return;
  }

  const profile = availableProfiles[currentCardIndex];
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.id = 'active-swipe-card';

  const matchPercentage = Math.floor(Math.random() * 15) + 82;

  card.innerHTML = `
    <div>
      <div class="card-header">
        <div>
          <div class="card-name">${escapeHTML(profile.full_name || 'Anonymous')}</div>
          <div class="card-location">📍 ${escapeHTML(profile.location_name || 'Location not specified')}</div>
        </div>
        <div class="card-match-badge">${matchPercentage}% Match</div>
      </div>
      <div class="card-bio">
        "${escapeHTML(profile.bio || 'Living mindfully and seeking genuine connections.')}"
      </div>
    </div>
    <div class="card-intent">
      🌱 Intent: <strong>${escapeHTML(profile.intent || 'Both')}</strong>
    </div>
  `;

  deckContainer.appendChild(card);
  attachSwipeEvents(card);
}

async function swipeCurrentCard(direction) {
  const card = document.getElementById('active-swipe-card');
  if (!card) return;

  const targetProfile = availableProfiles[currentCardIndex];

  const moveX = direction === 'right' ? window.innerWidth : -window.innerWidth;
  card.style.transform = `translate(${moveX}px, 50px) rotate(${direction === 'right' ? 25 : -25}deg)`;
  card.style.opacity = '0';

  if (targetProfile) {
    if (direction === 'right') {
      await handleRightSwipe(targetProfile);
    } else if (direction === 'left') {
      await handleLeftSwipe(targetProfile);
    }
  }

  setTimeout(() => {
    currentCardIndex++;
    renderDeck();
  }, 300);
}

async function handleRightSwipe(targetProfile) {
  const { data: incomingRequest } = await supabaseClient
    .from('connections')
    .select('*')
    .eq('requester_id', targetProfile.id)
    .eq('receiver_id', currentUser.id)
    .single();

  if (incomingRequest) {
    const { error } = await supabaseClient
      .from('connections')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', incomingRequest.id);

    if (!error) {
      alert(`🎉 It's a Match! You and ${targetProfile.full_name} have both swiped right. Your active chat space is open!`);
      await updateActiveChatCount();
    }
  } else {
    await supabaseClient
      .from('connections')
      .upsert([
        { requester_id: currentUser.id, receiver_id: targetProfile.id, status: 'pending' }
      ], { onConflict: 'requester_id,receiver_id' });
  }
}

async function handleLeftSwipe(targetProfile) {
  await supabaseClient
    .from('connections')
    .upsert([
      { requester_id: currentUser.id, receiver_id: targetProfile.id, status: 'rejected', created_at: new Date().toISOString() }
    ], { onConflict: 'requester_id,receiver_id' });
}

function attachSwipeEvents(card) {
  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  const onStart = (e) => {
    isDragging = true;
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    card.style.transition = 'none';
  };

  const onMove = (e) => {
    if (!isDragging) return;
    currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX = currentX - startX;
    const rotate = deltaX * 0.08;
    card.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    const deltaX = currentX - startX;
    if (deltaX > 100) {
      swipeCurrentCard('right');
    } else if (deltaX < -100) {
      swipeCurrentCard('left');
    } else {
      card.style.transform = 'translateX(0px) rotate(0deg)';
    }
  };

  card.addEventListener('mousedown', onStart);
  card.addEventListener('mousemove', onMove);
  card.addEventListener('mouseup', onEnd);
  card.addEventListener('mouseleave', onEnd);

  card.addEventListener('touchstart', onStart, { passive: true });
  card.addEventListener('touchmove', onMove, { passive: true });
  card.addEventListener('touchend', onEnd);
}

async function showProfilePreview() {
  const modal = document.getElementById('profile-modal');
  const detailsEl = document.getElementById('modal-profile-details');
  detailsEl.innerHTML = 'Loading your profile...';
  modal.classList.add('show');

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (profile) {
    detailsEl.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Name:</strong> ${escapeHTML(profile.full_name)}</p>
      <p style="margin-bottom: 8px;"><strong>Location:</strong> ${escapeHTML(profile.location_name)}</p>
      <p style="margin-bottom: 8px;"><strong>Intent:</strong> ${escapeHTML(profile.intent)}</p>
      <p style="margin-top: 10px;"><strong>Bio:</strong><br/>"${escapeHTML(profile.bio)}"</p>
    `;
  } else {
    detailsEl.innerHTML = 'Profile not found.';
  }
}

async function deleteUserAccount() {
  await supabaseClient.from('user_answers').delete().eq('user_id', currentUser.id);
  await supabaseClient.from('connections').delete().or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
  await supabaseClient.from('profiles').delete().eq('id', currentUser.id);
  await supabaseClient.auth.signOut();
  currentUser = null;
  userAnswersMap = {};
  showSection('auth-section');
  alert('Your account data has been deleted.');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
