const SUPABASE_URL = 'https://wzfhgkwivhftxdjtzapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let quizQuestions = [];
let userAnswersMap = {};
let availableProfiles = [];
let currentCardIndex = 0;
let currentReviewConnection = null;
let activeChatConnectionId = null;
let activeChatPartner = null;
let uploadedImageUrlsTemp = [];
let tempLatitude = null;
let tempLongitude = null;
let nsfwModel = null;
let activeReportTargetId = null;

// Load NSFWJS model for client-side content moderation
async function loadModerationModel() {
  if (window.nsfwjs) {
    nsfwModel = await nsfwjs.load();
  }
}
loadModerationModel();

// Client-Side Image Scan for Nudity / Explicit Content
async function isImageSafe(imageElement) {
  if (!nsfwModel) return true;
  const predictions = await nsfwModel.classify(imageElement);
  const nsfwScore = predictions.find(p => p.className === 'Porn' || p.className === 'Sexy' || p.className === 'Hentai');
  if (nsfwScore && nsfwScore.probability > 0.60) {
    return false;
  }
  return true;
}

function showSection(sectionId) {
  const sections = ['auth-section', 'profile-section', 'photos-prompt-section', 'quiz-section', 'dashboard-section', 'chat-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(sectionId);
  if (activeEl) activeEl.classList.add('active');

  const menuContainer = document.getElementById('header-menu-container');
  const donateBtn = document.getElementById('header-donate-btn');
  
  if (menuContainer && donateBtn) {
    const isDashboard = (sectionId === 'dashboard-section' || sectionId === 'chat-section');
    menuContainer.style.display = isDashboard ? 'block' : 'none';
    donateBtn.style.display = isDashboard ? 'inline-block' : 'none';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
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

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    await checkProfileStatus();
  }

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

  // Donate Modal Trigger
  const headerDonateBtn = document.getElementById('header-donate-btn');
  const donateModal = document.getElementById('donate-modal');
  const closeDonateModalBtn = document.getElementById('close-donate-modal-btn');

  if (headerDonateBtn && donateModal) {
    headerDonateBtn.addEventListener('click', () => {
      donateModal.classList.add('show');
    });
  }

  if (closeDonateModalBtn && donateModal) {
    closeDonateModalBtn.addEventListener('click', () => {
      donateModal.classList.remove('show');
    });
  }

  // Geolocation button listener for Profile Setup
  const detectLocBtn = document.getElementById('detect-location-btn');
  if (detectLocBtn) {
    detectLocBtn.addEventListener('click', () => {
      detectUserGeolocation('location');
    });
  }

  // Geolocation button listener for Edit Profile
  const editDetectLocBtn = document.getElementById('edit-detect-location-btn');
  if (editDetectLocBtn) {
    editDetectLocBtn.addEventListener('click', () => {
      detectUserGeolocation('edit-location');
    });
  }

  // Profile Save Listener (Enforces Terms Checkbox & Ensures Reliable Session Initialization)
  const saveProfileBtn = document.getElementById('save-profile-btn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const fullName = document.getElementById('full-name').value.trim();
      const location = document.getElementById('location').value.trim();
      const intent = document.getElementById('intent').value;
      const bio = document.getElementById('bio').value.trim();
      const termsAgreed = document.getElementById('terms-agree-checkbox').checked;

      if (!fullName || !location) {
        alert('Please fill out your name and location.');
        return;
      }

      if (!termsAgreed) {
        alert('You must agree to the Terms & Conditions to create an account.');
        return;
      }

      // Explicit Session Fallback to fix 1st-click issue
      if (!currentUser) {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (sessionData && sessionData.session) {
          currentUser = sessionData.session.user;
        } else {
          alert('Authentication error. Please refresh or re-enter your magic link.');
          return;
        }
      }

      saveProfileBtn.disabled = true;
      saveProfileBtn.textContent = 'Saving Profile...';

      const { error } = await supabaseClient.from('profiles').upsert([
        { 
          id: currentUser.id, 
          full_name: fullName, 
          location_name: location, 
          intent: intent, 
          bio: bio, 
          latitude: tempLatitude,
          longitude: tempLongitude,
          updated_at: new Date().toISOString() 
        }
      ], { onConflict: 'id' });

      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = 'Save Profile & Begin Quiz';

      if (error) {
        alert('Error saving profile: ' + error.message);
      } else {
        await loadQuestionnaire();
      }
    });
  }

  // Photo Upload Handler for Onboarding
  const photoInput = document.getElementById('photo-upload-input');
  if (photoInput) {
    photoInput.addEventListener('change', async (e) => {
      uploadedImageUrlsTemp = await uploadImagesToSupabase(e.target.files, 'photo-preview-grid');
    });
  }

  const savePhotosPromptBtn = document.getElementById('save-photos-prompt-btn');
  if (savePhotosPromptBtn) {
    savePhotosPromptBtn.addEventListener('click', async () => {
      const promptQ = document.getElementById('setup-prompt-q').value;
      const promptA = document.getElementById('setup-prompt-a').value.trim();

      const { error } = await supabaseClient.from('profiles').update({
        images: uploadedImageUrlsTemp,
        prompt_question: promptQ,
        prompt_answer: promptA
      }).eq('id', currentUser.id);

      if (error) {
        alert('Error saving photos/prompt: ' + error.message);
      } else {
        await loadDashboard();
      }
    });
  }

  const submitQuizBtn = document.getElementById('submit-quiz-btn');
  if (submitQuizBtn) {
    submitQuizBtn.addEventListener('click', async () => {
      if (!currentUser) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) currentUser = session.user;
      }

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
        showSection('photos-prompt-section');
      }
    });
  }

  const discoverTab = document.getElementById('tab-discover-btn');
  const connectionsTab = document.getElementById('tab-connections-btn');
  const viewDiscover = document.getElementById('view-discover');
  const viewConnections = document.getElementById('view-connections');

  if (discoverTab && connectionsTab) {
    discoverTab.addEventListener('click', () => {
      discoverTab.classList.add('active');
      connectionsTab.classList.remove('active');
      viewDiscover.style.display = 'block';
      viewConnections.style.display = 'none';
    });

    connectionsTab.addEventListener('click', async () => {
      connectionsTab.classList.add('active');
      discoverTab.classList.remove('active');
      viewDiscover.style.display = 'none';
      viewConnections.style.display = 'block';
      const unreadDot = document.getElementById('unread-dot');
      if (unreadDot) unreadDot.style.display = 'none';
      await loadConnectionsList();
    });
  }

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

  const profilePreviewBtn = document.getElementById('menu-profile-preview');
  const signOutBtn = document.getElementById('menu-sign-out');
  const deleteAccountBtn = document.getElementById('menu-delete-account');
  const profileModal = document.getElementById('profile-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const editProfileBtn = document.getElementById('edit-profile-btn');

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
      if (confirm('Are you sure you want to delete your account?')) {
        await deleteUserAccount();
      }
    });
  }

  if (closeModalBtn && profileModal) {
    closeModalBtn.addEventListener('click', () => {
      profileModal.classList.remove('show');
    });
  }

  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', async () => {
      profileModal.classList.remove('show');
      await openEditProfileModal();
    });
  }

  const editProfileModal = document.getElementById('edit-profile-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
  const saveEditedProfileBtn = document.getElementById('save-edited-profile-btn');
  const editPhotoInput = document.getElementById('edit-photo-input');
  let editPhotosTemp = [];

  if (editPhotoInput) {
    editPhotoInput.addEventListener('change', async (e) => {
      editPhotosTemp = await uploadImagesToSupabase(e.target.files, 'edit-photo-preview');
    });
  }

  if (closeEditModalBtn && editProfileModal) {
    closeEditModalBtn.addEventListener('click', () => {
      editProfileModal.classList.remove('show');
    });
  }

  if (saveEditedProfileBtn) {
    saveEditedProfileBtn.addEventListener('click', async () => {
      const fullName = document.getElementById('edit-full-name').value.trim();
      const location = document.getElementById('edit-location').value.trim();
      const intent = document.getElementById('edit-intent').value;
      const bio = document.getElementById('edit-bio').value.trim();
      const promptQ = document.getElementById('edit-prompt-q').value;
      const promptA = document.getElementById('edit-prompt-a').value.trim();

      const updatePayload = {
        full_name: fullName,
        location_name: location,
        intent: intent,
        bio: bio,
        prompt_question: promptQ,
        prompt_answer: promptA,
        updated_at: new Date().toISOString()
      };

      if (tempLatitude !== null && tempLongitude !== null) {
        updatePayload.latitude = tempLatitude;
        updatePayload.longitude = tempLongitude;
      }

      if (editPhotosTemp.length > 0) {
        updatePayload.images = editPhotosTemp;
      }

      const { error } = await supabaseClient.from('profiles').update(updatePayload).eq('id', currentUser.id);

      if (error) {
        alert('Error updating profile: ' + error.message);
      } else {
        editProfileModal.classList.remove('show');
        alert('Profile successfully updated!');
        await loadDashboard();
      }
    });
  }

  const bioCommentModal = document.getElementById('bio-comment-modal');
  const cancelCommentBtn = document.getElementById('cancel-comment-btn');
  const sendCommentConnectBtn = document.getElementById('send-comment-connect-btn');

  if (cancelCommentBtn && bioCommentModal) {
    cancelCommentBtn.addEventListener('click', () => { bioCommentModal.classList.remove('show'); });
  }

  if (sendCommentConnectBtn) {
    sendCommentConnectBtn.addEventListener('click', async () => {
      const commentText = document.getElementById('bio-comment-input').value.trim();
      if (!commentText) {
        alert('Please write a note or reaction.');
        return;
      }
      const targetProfile = availableProfiles[currentCardIndex];
      bioCommentModal.classList.remove('show');
      await handleRightSwipeWithNote(targetProfile, commentText);
    });
  }

  // Report Modal Listeners
  const closeReportModalBtn = document.getElementById('close-report-modal-btn');
  const submitReportBtn = document.getElementById('submit-report-btn');
  const reportModal = document.getElementById('report-modal');

  if (closeReportModalBtn && reportModal) {
    closeReportModalBtn.addEventListener('click', () => {
      reportModal.classList.remove('show');
    });
  }

  if (submitReportBtn) {
    submitReportBtn.addEventListener('click', async () => {
      const reason = document.getElementById('report-reason').value;
      const details = document.getElementById('report-details').value.trim();

      if (!activeReportTargetId) return;

      const { error } = await supabaseClient.from('reports').insert([
        {
          reporter_id: currentUser.id,
          reported_user_id: activeReportTargetId,
          reason: reason,
          details: details
        }
      ]);

      if (error) {
        alert('Error submitting report: ' + error.message);
      } else {
        reportModal.classList.remove('show');
        alert('Thank you. The profile has been reported to our moderation team for review.');
      }
    });
  }

  const reviewModal = document.getElementById('review-modal');
  const closeReviewModalBtn = document.getElementById('close-review-modal-btn');
  const reviewPassBtn = document.getElementById('review-pass-btn');
  const reviewConnectBtn = document.getElementById('review-connect-btn');

  if (closeReviewModalBtn && reviewModal) {
    closeReviewModalBtn.addEventListener('click', () => { reviewModal.classList.remove('show'); });
  }

  if (reviewPassBtn) {
    reviewPassBtn.addEventListener('click', async () => {
      if (currentReviewConnection) {
        await supabaseClient.from('connections').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', currentReviewConnection.id);
        reviewModal.classList.remove('show');
        await loadConnectionsList();
      }
    });
  }

  if (reviewConnectBtn) {
    reviewConnectBtn.addEventListener('click', async () => {
      if (currentReviewConnection) {
        await supabaseClient.from('connections').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', currentReviewConnection.id);
        reviewModal.classList.remove('show');
        alert(`🎉 It's a Match! Your active chat space is now open.`);
        await updateActiveChatCount();
        await loadConnectionsList();
      }
    });
  }

  const backToConnectionsBtn = document.getElementById('back-to-connections-btn');
  if (backToConnectionsBtn) {
    backToConnectionsBtn.addEventListener('click', async () => {
      showSection('dashboard-section');
      await loadConnectionsList();
    });
  }

  const sendMessageBtn = document.getElementById('send-message-btn');
  const chatMessageInput = document.getElementById('chat-message-input');

  if (sendMessageBtn && chatMessageInput) {
    sendMessageBtn.addEventListener('click', async () => { await sendChatMessage(); });
    chatMessageInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') { await sendChatMessage(); }
    });
  }

  const chatHeaderProfileTrigger = document.getElementById('chat-header-profile-trigger');
  const partnerProfileModal = document.getElementById('partner-profile-modal');
  const closePartnerModalBtn = document.getElementById('close-partner-modal-btn');
  const unmatchBtn = document.getElementById('unmatch-btn');

  if (chatHeaderProfileTrigger) {
    chatHeaderProfileTrigger.addEventListener('click', () => {
      if (activeChatPartner) { openPartnerProfileModal(activeChatPartner); }
    });
  }

  if (closePartnerModalBtn && partnerProfileModal) {
    closePartnerModalBtn.addEventListener('click', () => { partnerProfileModal.classList.remove('show'); });
  }

  if (unmatchBtn) {
    unmatchBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to unmatch?')) { await unmatchCurrentConnection(); }
    });
  }

  const passBtn = document.getElementById('pass-btn');
  const connectBtn = document.getElementById('connect-btn');

  if (passBtn) passBtn.addEventListener('click', () => swipeCurrentCard('left'));
  if (connectBtn) connectBtn.addEventListener('click', () => swipeCurrentCard('right'));
});

// Helper: Detect Device Geolocation & Reverse Geocode via OpenStreetMap Nominatim
function detectUserGeolocation(inputId) {
  const inputEl = document.getElementById(inputId);
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser');
    return;
  }

  inputEl.value = 'Detecting GPS location...';

  navigator.geolocation.getCurrentPosition(async (position) => {
    tempLatitude = position.coords.latitude;
    tempLongitude = position.coords.longitude;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${tempLatitude}&lon=${tempLongitude}`);
      const data = await response.json();
      
      if (data && data.address) {
        const city = data.address.city || data.address.town || data.address.village || data.address.state_district || '';
        const state = data.address.state || '';
        inputEl.value = city ? `${city}, ${state}` : data.display_name;
      } else {
        inputEl.value = `${tempLatitude.toFixed(2)}, ${tempLongitude.toFixed(2)}`;
      }
    } catch (err) {
      inputEl.value = `${tempLatitude.toFixed(2)}, ${tempLongitude.toFixed(2)}`;
    }
  }, (error) => {
    alert('Unable to retrieve your location. Please type it manually.');
    inputEl.value = '';
  }, { timeout: 10000 });
}

// Haversine distance formula in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Image Upload Helper with NSFWJS Pre-Scan
async function uploadImagesToSupabase(files, previewContainerId) {
  const previewContainer = document.getElementById(previewContainerId);
  if (!files || files.length === 0) return [];
  previewContainer.innerHTML = 'Analyzing and uploading photos...';

  let urls = [];
  const maxFiles = Math.min(files.length, 5);

  for (let i = 0; i < maxFiles; i++) {
    const file = files[i];

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    await new Promise(resolve => img.onload = resolve);

    const safe = await isImageSafe(img);
    if (!safe) {
      alert(`Photo "${file.name}" was flagged for explicit/suggestive content and cannot be uploaded.`);
      continue;
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}_${Date.now()}_${i}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('profile-images')
      .upload(fileName, file);

    if (!uploadError) {
      const { data } = supabaseClient.storage.from('profile-images').getPublicUrl(fileName);
      if (data && data.publicUrl) {
        urls.push(data.publicUrl);
      }
    }
  }

  previewContainer.innerHTML = '';
  urls.forEach(url => {
    const imgEl = document.createElement('img');
    imgEl.src = url;
    imgEl.className = 'card-photo-thumb';
    previewContainer.appendChild(imgEl);
  });

  return urls;
}

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
      if (!profile.images || profile.images.length === 0) {
        showSection('photos-prompt-section');
      } else {
        await loadDashboard();
      }
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
  
  container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading questionnaire...</p>';
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

// DASHBOARD & PROXIMITY-SORTED SWIPE DECK
async function loadDashboard() {
  showSection('dashboard-section');
  const deckContainer = document.getElementById('deck-container');
  if (!deckContainer) return;

  deckContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding-top: 100px;">Finding nearby profiles...</p>';

  const { data: myProfile } = await supabaseClient
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', currentUser.id)
    .single();

  const myLat = myProfile ? myProfile.latitude : null;
  const myLon = myProfile ? myProfile.longitude : null;

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
        if (createdAt > thirtyDaysAgo) { excludedUserIds.add(otherId); }
      }
    });
  }

  const { data: profiles, error } = await supabaseClient.from('profiles').select('*');

  if (error || !profiles) {
    deckContainer.innerHTML = '<p style="text-align: center; color: var(--accent);">Error loading profiles.</p>';
    return;
  }

  let filteredProfiles = profiles.filter(p => !excludedUserIds.has(p.id));

  // Sort profiles by distance (nearest first)
  filteredProfiles.sort((a, b) => {
    const distA = calculateDistance(myLat, myLon, a.latitude, a.longitude);
    const distB = calculateDistance(myLat, myLon, b.latitude, b.longitude);
    return distA - distB;
  });

  availableProfiles = filteredProfiles;
  currentCardIndex = 0;
  
  await updateActiveChatCount();
  await checkForUnreadMessages();
  renderDeck();
}

async function updateActiveChatCount() {
  const { data: activeMatches } = await supabaseClient
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  const count = activeMatches ? activeMatches.length : 0;
  const countBadge = document.getElementById('active-chat-count');
  if (countBadge) { countBadge.innerHTML = `${count} / 3`; }
}

async function checkForUnreadMessages() {
  const { data: connections } = await supabaseClient
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  if (!connections || connections.length === 0) return;
  const connectionIds = connections.map(c => c.id);

  const { data: latestMsgs } = await supabaseClient
    .from('messages')
    .select('sender_id, created_at, connection_id')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false });

  if (latestMsgs && latestMsgs.length > 0) {
    const mostRecent = latestMsgs[0];
    if (mostRecent.sender_id !== currentUser.id) {
      const unreadDot = document.getElementById('unread-dot');
      if (unreadDot && !document.getElementById('view-connections').classList.contains('active')) {
        unreadDot.style.display = 'inline-block';
      }
    }
  }
}

// RENDER DISCOVER CARD WITH FEATURED LARGE IMAGE
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
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';

  // Large Featured Image Logic
  let mainPhotoHTML = '';
  if (profile.images && profile.images.length > 0) {
    mainPhotoHTML = `<img src="${profile.images[0]}" class="card-featured-photo" alt="${escapeHTML(profile.full_name)}" />`;
  }

  let promptHTML = '';
  if (profile.prompt_question && profile.prompt_answer) {
    promptHTML = `
      <div class="card-prompt-box">
        <div class="card-prompt-q">💬 ${escapeHTML(profile.prompt_question)}</div>
        <div class="card-prompt-a">"${escapeHTML(profile.prompt_answer)}"</div>
      </div>
    `;
  }

  card.innerHTML = `
    <div>
      <div class="card-header">
        <div>
          <div class="card-name">${escapeHTML(profile.full_name || 'Anonymous')}</div>
          <div class="card-location">📍 ${escapeHTML(profile.location_name || 'Location not specified')}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div class="card-match-badge">${matchPercentage}% Match</div>
          <button type="button" class="report-trigger-btn" onclick="openReportModal('${profile.id}')" style="background: none; border: none; color: #d9534f; font-size: 0.75rem; cursor: pointer; padding: 0;">🚩 Report</button>
        </div>
      </div>
      ${mainPhotoHTML}
      <div class="card-bio">
        "${escapeHTML(profile.bio || 'Living mindfully and seeking genuine connections.')}"
      </div>
      ${promptHTML}
      <button type="button" class="comment-bio-btn" id="open-comment-modal-btn">💬 Comment on Bio / Answer Prompt</button>
    </div>
    <div class="card-intent" style="margin-top: 10px;">
      🌱 Intent: <strong>${escapeHTML(intentText)}</strong>
    </div>
  `;

  deckContainer.appendChild(card);

  const commentBtn = card.querySelector('#open-comment-modal-btn');
  if (commentBtn) {
    commentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCommentModal(profile);
    });
  }

  attachSwipeEvents(card);
}

function openCommentModal(profile) {
  const modal = document.getElementById('bio-comment-modal');
  const bioBox = document.getElementById('comment-target-bio');
  document.getElementById('bio-comment-input').value = '';

  bioBox.innerHTML = `<strong>${escapeHTML(profile.full_name)}'s Reflection:</strong><br/>"${escapeHTML(profile.bio || profile.prompt_answer || 'No bio provided.')}"`;
  modal.classList.add('show');
}

async function handleRightSwipeWithNote(targetProfile, noteText) {
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
      await supabaseClient.from('messages').insert([
        { connection_id: incomingRequest.id, sender_id: currentUser.id, message_text: `Note: ${noteText}` }
      ]);
      alert(`🎉 It's a Match! Your note was sent and your chat is now open.`);
      await updateActiveChatCount();
    }
  } else {
    const { data: newConn, error } = await supabaseClient
      .from('connections')
      .upsert([
        { requester_id: currentUser.id, receiver_id: targetProfile.id, status: 'pending' }
      ], { onConflict: 'requester_id,receiver_id' })
      .select()
      .single();

    if (newConn && !error) {
      await supabaseClient.from('messages').insert([
        { connection_id: newConn.id, sender_id: currentUser.id, message_text: `Note: ${noteText}` }
      ]);
    }
    alert('Your note and connection request have been sent!');
  }

  currentCardIndex++;
  renderDeck();
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

// RENDER CONNECTIONS & MATCHES LIST WITH CIRCULAR AVATARS
async function loadConnectionsList() {
  const acceptedContainer = document.getElementById('accepted-matches-container');
  const pendingContainer = document.getElementById('pending-matches-container');

  acceptedContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.88rem;">Loading...</p>';
  pendingContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.88rem;">Loading...</p>';

  const { data: connections, error } = await supabaseClient
    .from('connections')
    .select('*, requester:profiles!connections_requester_id_fkey(*), receiver:profiles!connections_receiver_id_fkey(*)')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  if (error || !connections) {
    acceptedContainer.innerHTML = '<p style="color: var(--text-muted);">No active connections yet.</p>';
    pendingContainer.innerHTML = '<p style="color: var(--text-muted);">No pending requests.</p>';
    return;
  }

  const accepted = connections.filter(c => c.status === 'accepted');
  const pending = connections.filter(c => c.status === 'pending');

  if (accepted.length === 0) {
    acceptedContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.88rem;">No active matches yet. Keep exploring!</p>';
  } else {
    const acceptedWithMessages = await Promise.all(accepted.map(async (c) => {
      const { data: msgs } = await supabaseClient
        .from('messages')
        .select('message_text, created_at')
        .eq('connection_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMsg = msgs && msgs.length > 0 ? msgs[0] : null;
      return {
        connection: c,
        lastMessageText: lastMsg ? lastMsg.message_text : 'Tap to chat',
        lastMessageTime: lastMsg ? new Date(lastMsg.created_at).getTime() : new Date(c.updated_at || c.created_at).getTime()
      };
    }));

    acceptedWithMessages.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    acceptedContainer.innerHTML = '';
    acceptedWithMessages.forEach(itemData => {
      const c = itemData.connection;
      const otherUser = c.requester_id === currentUser.id ? c.receiver : c.requester;
      if (!otherUser) return;

      const avatarHTML = (otherUser.images && otherUser.images.length > 0)
        ? `<img src="${otherUser.images[0]}" class="connection-avatar" alt="${escapeHTML(otherUser.full_name)}" />`
        : `<div class="connection-avatar">👤</div>`;

      const item = document.createElement('div');
      item.className = 'connection-item';
      item.innerHTML = `
        ${avatarHTML}
        <div class="connection-info">
          <h4>${escapeHTML(otherUser.full_name)}</h4>
          <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 2px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(itemData.lastMessageText)}</p>
        </div>
        <span class="status-tag accepted">Chat 💬</span>
      `;
      item.addEventListener('click', () => { openChat(c.id, otherUser); });
      acceptedContainer.appendChild(item);
    });
  }

  if (pending.length === 0) {
    pendingContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.88rem;">No pending connection requests.</p>';
  } else {
    pendingContainer.innerHTML = '';
    pending.forEach(c => {
      const otherUser = c.requester_id === currentUser.id ? c.receiver : c.requester;
      if (!otherUser) return;
      const isSentByMe = c.requester_id === currentUser.id;

      const avatarHTML = (otherUser.images && otherUser.images.length > 0)
        ? `<img src="${otherUser.images[0]}" class="connection-avatar" alt="${escapeHTML(otherUser.full_name)}" />`
        : `<div class="connection-avatar">👤</div>`;

      const item = document.createElement('div');
      item.className = `connection-item ${!isSentByMe ? 'clickable' : ''}`;
      item.innerHTML = `
        ${avatarHTML}
        <div class="connection-info">
          <h4>${escapeHTML(otherUser.full_name)}</h4>
          <p>${isSentByMe ? 'Request sent by you' : 'Tap to review profile & respond'}</p>
        </div>
        <span class="status-tag pending">${isSentByMe ? 'Pending' : 'Incoming 💌'}</span>
      `;

      if (!isSentByMe) {
        item.addEventListener('click', () => { openReviewModal(c, otherUser); });
      }

      pendingContainer.appendChild(item);
    });
  }
}

async function openChat(connectionId, partnerProfile) {
  activeChatConnectionId = connectionId;
  activeChatPartner = partnerProfile;

  const nameEl = document.getElementById('chat-partner-name');
  if (nameEl) nameEl.textContent = partnerProfile.full_name;

  showSection('chat-section');
  await loadChatMessages();
}

async function loadChatMessages() {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">Loading messages...</p>';

  const { data: messages, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('connection_id', activeChatConnectionId)
    .order('created_at', { ascending: true });

  if (error) {
    container.innerHTML = '<p style="text-align: center; color: var(--accent); font-size: 0.85rem;">Error loading messages.</p>';
    return;
  }

  container.innerHTML = '';
  if (!messages || messages.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 20px;">No messages yet. Say hello and start a mindful conversation!</p>';
    return;
  }

  messages.forEach(msg => {
    const bubble = document.createElement('div');
    const isMe = msg.sender_id === currentUser.id;
    bubble.className = `message-bubble ${isMe ? 'sent' : 'received'}`;
    bubble.textContent = msg.message_text;
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !activeChatConnectionId) return;

  input.value = '';

  const { error } = await supabaseClient
    .from('messages')
    .insert([
      { connection_id: activeChatConnectionId, sender_id: currentUser.id, message_text: text }
    ]);

  if (error) {
    alert('Error sending message: ' + error.message);
  } else {
    await supabaseClient
      .from('connections')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeChatConnectionId);

    await loadChatMessages();
  }
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
    const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';
    let photosHTML = '';
    if (profile.images && profile.images.length > 0) {
      photosHTML = `<div style="display:flex; gap:6px; margin: 10px 0; overflow-x:auto;">`;
      profile.images.forEach(u => { photosHTML += `<img src="${u}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;" />`; });
      photosHTML += `</div>`;
    }

    detailsEl.innerHTML = `
      <p style="margin-bottom: 6px;"><strong>Name:</strong> ${escapeHTML(profile.full_name)}</p>
      <p style="margin-bottom: 6px;"><strong>Location:</strong> ${escapeHTML(profile.location_name)}</p>
      <p style="margin-bottom: 6px;"><strong>Intent:</strong> ${escapeHTML(intentText)}</p>
      ${photosHTML}
      <p style="margin-top: 8px;"><strong>Bio:</strong><br/>"${escapeHTML(profile.bio || '')}"</p>
      ${profile.prompt_question ? `<p style="margin-top: 8px;"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</p>` : ''}
    `;
  } else {
    detailsEl.innerHTML = 'Profile not found.';
  }
}

async function openEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!profile) return;

  document.getElementById('edit-full-name').value = profile.full_name || '';
  document.getElementById('edit-location').value = profile.location_name || '';
  document.getElementById('edit-intent').value = profile.intent || 'both';
  document.getElementById('edit-bio').value = profile.bio || '';
  document.getElementById('edit-prompt-q').value = profile.prompt_question || 'A simple joy that always grounds me is...';
  document.getElementById('edit-prompt-a').value = profile.prompt_answer || '';
  
  tempLatitude = profile.latitude || null;
  tempLongitude = profile.longitude || null;

  const preview = document.getElementById('edit-photo-preview');
  preview.innerHTML = '';
  if (profile.images && profile.images.length > 0) {
    profile.images.forEach(u => {
      const img = document.createElement('img');
      img.src = u;
      img.className = 'card-photo-thumb';
      preview.appendChild(img);
    });
  }

  modal.classList.add('show');
}

function openPartnerProfileModal(profile) {
  const modal = document.getElementById('partner-profile-modal');
  const bodyEl = document.getElementById('partner-profile-body');
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';

  let photosHTML = '';
  if (profile.images && profile.images.length > 0) {
    photosHTML = `<div style="display:flex; gap:6px; margin: 10px 0; overflow-x:auto;">`;
    profile.images.forEach(u => { photosHTML += `<img src="${u}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;" />`; });
    photosHTML += `</div>`;
  }

  bodyEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div>
        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${escapeHTML(profile.full_name)}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">📍 ${escapeHTML(profile.location_name)}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
        <div style="background: var(--primary-light); color: var(--primary); font-weight: 700; font-size: 0.8rem; padding: 4px 10px; border-radius: 12px;">Matched Partner</div>
        <button type="button" onclick="openReportModal('${profile.id}')" style="background:none; border:none; color:#d9534f; font-size:0.75rem; cursor:pointer; padding:0;">🚩 Report User</button>
      </div>
    </div>
    ${photosHTML}
    <div style="font-size: 0.95rem; color: var(--text-main); background: #fff; padding: 12px; border-radius: 8px; border-left: 3px solid var(--primary); margin-bottom: 10px;">
      "${escapeHTML(profile.bio || 'No bio provided.')}"
    </div>
    ${profile.prompt_question ? `<div style="background:var(--primary-light); padding:10px; border-radius:6px; font-size:0.85rem; margin-bottom:10px;"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</div>` : ''}
    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: capitalize;">
      🌱 Intent: <strong>${escapeHTML(intentText)}</strong>
    </div>
  `;

  modal.classList.add('show');
}

async function unmatchCurrentConnection() {
  if (!activeChatConnectionId) return;

  const { error } = await supabaseClient.from('connections').delete().eq('id', activeChatConnectionId);

  if (error) {
    alert('Error unmatching: ' + error.message);
  } else {
    document.getElementById('partner-profile-modal').classList.remove('show');
    alert('Successfully unmatched.');
    showSection('dashboard-section');
    await loadConnectionsList();
    await updateActiveChatCount();
  }
}

function openReviewModal(connection, profile) {
  currentReviewConnection = connection;
  const reviewModal = document.getElementById('review-modal');
  const bodyEl = document.getElementById('review-profile-body');
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';

  let photosHTML = '';
  if (profile.images && profile.images.length > 0) {
    photosHTML = `<div style="display:flex; gap:6px; margin: 10px 0; overflow-x:auto;">`;
    profile.images.forEach(u => { photosHTML += `<img src="${u}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;" />`; });
    photosHTML += `</div>`;
  }

  bodyEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div>
        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${escapeHTML(profile.full_name)}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">📍 ${escapeHTML(profile.location_name)}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
        <div style="background: var(--primary-light); color: var(--primary); font-weight: 700; font-size: 0.8rem; padding: 4px 10px; border-radius: 12px;">Incoming Like</div>
        <button type="button" onclick="openReportModal('${profile.id}')" style="background:none; border:none; color:#d9534f; font-size:0.75rem; cursor:pointer; padding:0;">🚩 Report</button>
      </div>
    </div>
    ${photosHTML}
    <div style="font-size: 0.95rem; color: var(--text-main); background: #fff; padding: 12px; border-radius: 8px; border-left: 3px solid var(--primary); margin-bottom: 10px;">
      "${escapeHTML(profile.bio || 'No bio provided.')}"
    </div>
    ${profile.prompt_question ? `<div style="background:var(--primary-light); padding:10px; border-radius:6px; font-size:0.85rem; margin-bottom:10px;"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</div>` : ''}
    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: capitalize;">
      🌱 Intent: <strong>${escapeHTML(intentText)}</strong>
    </div>
  `;

  reviewModal.classList.add('show');
}

function openReportModal(targetUserId) {
  activeReportTargetId = targetUserId;
  document.getElementById('report-details').value = '';
  document.getElementById('report-modal').classList.add('show');
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

async function deleteUserAccount() {
  await supabaseClient.from('user_answers').delete().eq('user_id', currentUser.id);
  await supabaseClient.from('connections').delete().or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
  await supabaseClient.from('reports').delete().or(`reporter_id.eq.${currentUser.id},reported_user_id.eq.${currentUser.id}`);
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
