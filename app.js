/* =========================================================================
   SECTION 1: CONSTANTS & GLOBAL STATE VARIABLES
   ========================================================================= */

// SECTION 1.a: Supabase Client Initialization & Environment Config
const SUPABASE_URL = 'https://wzfhgkwivhftxdjtzapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmhna3dpdmhmdHhkanR6YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTk0ODUsImV4cCI6MjEwODQzNTQ4NX0.HV12dnA-56Lm8D7UDzuoSw2cT9Nak8wBnHZoqAPgXBE';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// SECTION 1.b: Global Application State Variables
let currentUser = null;
let quizQuestions = [];
let userAnswersMap = {}; // Stores { answer: 'opt_id', acceptable: ['opt_id_1', ...] }
let availableProfiles = [];
let currentCardIndex = 0;
let currentReviewConnection = null;
let activeChatConnectionId = null;
let activeChatPartner = null;
let uploadedImageUrlsTemp = [];
let editPhotosTemp = [];
let tempLatitude = null;
let tempLongitude = null;
let activeReportTargetId = null;

/* =========================================================================
   SECTION 2: UTILITY & HELPER FUNCTIONS
   ========================================================================= */

// SECTION 2.a: Image Safety & Moderation Stubs
async function isImageSafe(imageElement) {
  return true;
}

// SECTION 2.b: Geolocation & Distance Calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
  const R = 6371; // Earth's radius in kilometers
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
  return deg * (Math.PI / 180); 
}

function detectUserGeolocation(inputId = 'location') {
  const inputEl = document.getElementById(inputId);
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    if (inputEl) inputEl.value = 'Geolocation not supported';
    return;
  }
  
  if (inputEl) inputEl.value = 'Detecting GPS location...';
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      tempLatitude = position.coords.latitude;
      tempLongitude = position.coords.longitude;
      
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${tempLatitude}&lon=${tempLongitude}`);
        const data = await response.json();
        
        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village || data.address.state_district || '';
          const state = data.address.state || '';
          if (inputEl) inputEl.value = city ? `${city}, ${state}` : data.display_name;
        } else {
          if (inputEl) inputEl.value = `${tempLatitude.toFixed(2)}, ${tempLongitude.toFixed(2)}`;
        }
      } catch (err) {
        console.warn('Reverse geocoding lookup failed:', err);
        if (inputEl) inputEl.value = `${tempLatitude.toFixed(2)}, ${tempLongitude.toFixed(2)}`;
      }
    },
    (error) => {
      console.error('Geolocation acquisition error:', error);
      alert('Unable to retrieve your location. Please ensure location permissions are enabled in your browser settings.');
      if (inputEl) inputEl.value = 'Location detection failed — Click retry button';
    }, 
    { timeout: 10000, enableHighAccuracy: true }
  );
}

// SECTION 2.c: Security & HTML Escaping
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// SECTION 2.d: Age Calculation Helper
function calculateAge(dobString) {
  if (!dobString) return 26;
  const birthDate = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* =========================================================================
   SECTION 3: NAVIGATION & VIEW SWITCHING MANAGER
   ========================================================================= */

// Manages visibility across app views (Auth, Onboarding, Quiz, Dashboard, Chat)
function showSection(sectionId) {
  const sections = ['auth-section', 'profile-section', 'photos-prompt-section', 'quiz-section', 'dashboard-section', 'chat-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  
  const activeEl = document.getElementById(sectionId);
  if (activeEl) activeEl.classList.add('active');

  // AUTO-TRIGGER: If navigating to profile setup, automatically fetch GPS location on load
  if (sectionId === 'profile-section') {
    const locInput = document.getElementById('location');
    if (locInput && (!locInput.value || locInput.value.trim() === '')) {
      detectUserGeolocation('location');
    }
  }

  const menuContainer = document.getElementById('header-menu-container');
  const donateBtn = document.getElementById('header-donate-btn');
  
  // Toggle header navigation menu & donate button visibility based on dashboard/chat state
  if (menuContainer && donateBtn) {
    const isDashboardOrChat = (sectionId === 'dashboard-section' || sectionId === 'chat-section');
    menuContainer.style.display = isDashboardOrChat ? 'block' : 'none';
    donateBtn.style.display = isDashboardOrChat ? 'inline-block' : 'none';
  }

  const actionBar = document.getElementById('sticky-action-bar');
  if (actionBar) {
    actionBar.style.display = (sectionId === 'dashboard-section' && document.getElementById('view-discover').style.display !== 'none' && currentCardIndex < availableProfiles.length) ? 'flex' : 'none';
  }
}

/* =========================================================================
   SECTION 4: APPLICATION INITIALIZATION & EVENT LISTENERS
   ========================================================================= */

window.addEventListener('DOMContentLoaded', async () => {
  // SECTION 4.a: Session Check & Magic Link Auth Handlers
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    window.history.replaceState({}, document.title, window.location.pathname);
    await checkProfileStatus();
    
    // Auto-poll unread messages and incoming requests every 12 seconds
    setInterval(async () => {
      if (currentUser && typeof checkForUnreadMessages === 'function') {
        await checkForUnreadMessages();
      }
    }, 12000);
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

  // SECTION 4.b: Global Modals, Geolocation & Navigation Listeners
  const headerDonateBtn = document.getElementById('header-donate-btn');
  const donateModal = document.getElementById('donate-modal');
  const closeDonateModalBtn = document.getElementById('close-donate-modal-btn');
  if (headerDonateBtn && donateModal) {
    headerDonateBtn.addEventListener('click', () => { donateModal.classList.add('show'); });
  }
  if (closeDonateModalBtn && donateModal) {
    closeDonateModalBtn.addEventListener('click', () => { donateModal.classList.remove('show'); });
  }

  const detectLocBtn = document.getElementById('detect-location-btn');
  if (detectLocBtn) {
    detectLocBtn.addEventListener('click', () => { detectUserGeolocation('location'); });
  }
  const editDetectLocBtn = document.getElementById('edit-detect-location-btn');
  if (editDetectLocBtn) {
    editDetectLocBtn.addEventListener('click', () => { detectUserGeolocation('edit-location'); });
  }

  const backToProfileBtn = document.getElementById('back-to-profile-btn');
  if (backToProfileBtn) {
    backToProfileBtn.addEventListener('click', () => { showSection('profile-section'); });
  }
  const backToQuizBtn = document.getElementById('back-to-quiz-btn');
  if (backToQuizBtn) {
    backToQuizBtn.addEventListener('click', async () => { await loadQuestionnaire(false); });
  }
  const backToConnectionsBtn = document.getElementById('back-to-connections-btn');
  if (backToConnectionsBtn) {
    backToConnectionsBtn.addEventListener('click', async () => {
      showSection('dashboard-section');
      const discoverTab = document.getElementById('tab-discover-btn');
      const connectionsTab = document.getElementById('tab-connections-btn');
      const viewDiscover = document.getElementById('view-discover');
      const viewConnections = document.getElementById('view-connections');
      if (discoverTab && connectionsTab) {
        discoverTab.classList.remove('active');
        connectionsTab.classList.add('active');
        if (viewDiscover) viewDiscover.style.display = 'none';
        if (viewConnections) viewConnections.style.display = 'flex';
      }
      await loadConnectionsList();
    });
  }

  // SECTION 4.c: Questionnaire, Feed, Chat, and Modal Action Listeners
  const photoInput = document.getElementById('photo-upload-input');
  if (photoInput) {
    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (uploadedImageUrlsTemp.length >= 5) {
        alert('You have already uploaded the maximum of 5 photos.');
        return;
      }
      const newUrl = await uploadImagesToSupabase(file, 'photo-preview-grid', false);
      if (newUrl) {
        uploadedImageUrlsTemp.push(newUrl);
        updatePhotoCountIndicator();
      }
      photoInput.value = '';
    });
  }

  const savePhotosPromptBtn = document.getElementById('save-photos-prompt-btn');
  if (savePhotosPromptBtn) {
    savePhotosPromptBtn.addEventListener('click', async () => {
      if (uploadedImageUrlsTemp.length === 0) {
        alert('Please upload at least 1 photo before completing setup.');
        return;
      }
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
        if (window.gtag) {
          gtag('event', 'profile_completed', { photo_count: uploadedImageUrlsTemp.length });
        }
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
        selected_option_id: userAnswersMap[qid].answer,
        acceptable_option_ids: userAnswersMap[qid].acceptable,
        weight: 1
      }));
      const { error } = await supabaseClient.from('user_answers').upsert(payload, { onConflict: 'user_id,question_id' });
      if (error) {
        alert('Error saving answers: ' + error.message);
      } else {
        const { data: profile } = await supabaseClient.from('profiles').select('images').eq('id', currentUser.id).single();
        if (profile && profile.images && profile.images.length > 0) {
          alert('Questionnaire responses saved successfully!');
          await loadDashboard();
        } else {
          showSection('photos-prompt-section');
        }
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
      viewDiscover.style.display = 'flex';
      viewConnections.style.display = 'none';
      sessionStorage.setItem('indieflourish_dashboard_tab', 'discover');
      const actionbar = document.getElementById('sticky-action-bar');
      if (actionbar && currentCardIndex < availableProfiles.length) {
        actionbar.style.display = 'flex';
      }
    });

    connectionsTab.addEventListener('click', async () => {
      connectionsTab.classList.add('active');
      discoverTab.classList.remove('active');
      viewDiscover.style.display = 'none';
      viewConnections.style.display = 'flex';
      sessionStorage.setItem('indieflourish_dashboard_tab', 'connections');
      const actionbar = document.getElementById('sticky-action-bar');
      if (actionbar) actionbar.style.display = 'none';
      
      const requestBadge = document.getElementById('request-badge');
      const messageBadge = document.getElementById('message-badge');
      if (requestBadge) requestBadge.style.display = 'none';
      if (messageBadge) messageBadge.style.display = 'none';
      
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
    document.addEventListener('click', () => { dropdownMenu.classList.remove('show'); });
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
    closeModalBtn.addEventListener('click', () => { profileModal.classList.remove('show'); });
  }
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', async () => {
      profileModal.classList.remove('show');
      await openEditProfileModal();
    });
  }

  const prefModal = document.getElementById('preferences-modal');
  const openPrefBtn = document.getElementById('open-preferences-modal-btn');
  const closePrefBtn = document.getElementById('close-preferences-modal-btn');
  const savePrefBtn = document.getElementById('save-preferences-btn');
  if (openPrefBtn && prefModal) {
    openPrefBtn.addEventListener('click', async () => { await openPreferencesModal(); });
  }
  if (closePrefBtn && prefModal) {
    closePrefBtn.addEventListener('click', () => { prefModal.classList.remove('show'); });
  }
  if (savePrefBtn) {
    savePrefBtn.addEventListener('click', async () => { await saveUserPreferences(); });
  }

  const editProfileModal = document.getElementById('edit-profile-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
  const saveEditedProfileBtn = document.getElementById('save-edited-profile-btn');
  const editPhotoInput = document.getElementById('edit-photo-input');

  if (editPhotoInput) {
    editPhotoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (editPhotosTemp.length >= 5) {
          alert('Maximum 5 photos allowed.');
          return;
        }
        const singleUrl = await uploadImagesToSupabase(file, 'edit-photo-preview', true);
        if (singleUrl) { 
          editPhotosTemp.push(singleUrl); 
          renderEditPhotoThumbnails();
        }
      }
      editPhotoInput.value = '';
    });
  }
  if (closeEditModalBtn && editProfileModal) {
    closeEditModalBtn.addEventListener('click', () => { editProfileModal.classList.remove('show'); });
  }

  if (saveEditedProfileBtn) {
    saveEditedProfileBtn.addEventListener('click', async () => {
      const updatePayload = {
        full_name: document.getElementById('edit-full-name').value.trim(),
        dob: document.getElementById('edit-dob').value,
        location_name: document.getElementById('edit-location').value.trim(),
        intent: document.getElementById('edit-intent').value,
        bio: document.getElementById('edit-bio').value.trim(),
        gender: document.getElementById('edit-gender').value,
        pronouns: document.getElementById('edit-pronouns').value.trim(),
        orientation: document.getElementById('edit-orientation').value,
        relationship_status: document.getElementById('edit-relationship_status').value,
        height: document.getElementById('edit-height').value.trim(),
        education: document.getElementById('edit-education').value.trim(),
        occupation: document.getElementById('edit-occupation').value.trim(),
        religion: document.getElementById('edit-religion').value,
        politics: document.getElementById('edit-politics').value,
        languages: document.getElementById('edit-languages').value.trim(),
        diet: document.getElementById('edit-diet').value,
        smoking: document.getElementById('edit-smoking').value,
        drinking: document.getElementById('edit-drinking').value,
        children: document.getElementById('edit-children').value,
        pets: document.getElementById('edit-pets').value,
        prompt_question: document.getElementById('edit-prompt-q').value,
        prompt_answer: document.getElementById('edit-prompt-a').value.trim(),
        images: editPhotosTemp,
        updated_at: new Date().toISOString()
      };
      if (tempLatitude !== null && tempLongitude !== null) {
        updatePayload.latitude = tempLatitude;
        updatePayload.longitude = tempLongitude;
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

  const closeReportModalBtn = document.getElementById('close-report-modal-btn');
  const submitReportBtn = document.getElementById('submit-report-btn');
  const reportModal = document.getElementById('report-modal');
  if (closeReportModalBtn && reportModal) {
    closeReportModalBtn.addEventListener('click', () => { reportModal.classList.remove('show'); });
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
});

/* =========================================================================
   SECTION 5: PROFILE & ONBOARDING MANAGEMENT
   ========================================================================= */

async function triggerSaveProfile() {
  const fullName = document.getElementById('full-name').value.trim();
  const dobVal = document.getElementById('dob').value;
  const location = document.getElementById('location').value.trim();
  const intent = document.getElementById('intent').value;
  const bio = document.getElementById('bio').value.trim();
  const termsAgreed = document.getElementById('terms-agree-checkbox').checked;
  
  if (!dobVal) {
    alert('Please enter your date of birth.');
    return;
  }
  if (!fullName || !location) {
    alert('Please fill out your name and location.');
    return;
  }
  if (!termsAgreed) {
    alert('You must agree to the Terms & Conditions to create an account.');
    return;
  }
  if (!currentUser) {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (sessionData && sessionData.session) {
      currentUser = sessionData.session.user;
    } else {
      alert('Authentication session not found. Please re-enter your magic link.');
      return;
    }
  }
  
  const saveBtn = document.getElementById('save-profile-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Profile...';
  }

  const profileData = {
    id: currentUser.id,
    full_name: fullName,
    dob: dobVal,
    location_name: location,
    intent: intent,
    bio: bio,
    gender: document.getElementById('gender').value,
    pronouns: document.getElementById('pronouns').value.trim(),
    orientation: document.getElementById('orientation').value,
    relationship_status: document.getElementById('relationship_status').value,
    height: document.getElementById('height').value.trim(),
    education: document.getElementById('education').value.trim(),
    occupation: document.getElementById('occupation').value.trim(),
    religion: document.getElementById('religion').value,
    politics: document.getElementById('politics').value,
    languages: document.getElementById('languages').value.trim(),
    diet: document.getElementById('diet').value,
    smoking: document.getElementById('smoking').value,
    drinking: document.getElementById('drinking').value,
    children: document.getElementById('children').value,
    pets: document.getElementById('pets').value,
    latitude: tempLatitude,
    longitude: tempLongitude,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient.from('profiles').upsert([profileData], { onConflict: 'id' });
  
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Profile & Begin Quiz';
  }
  
  if (error) {
    alert('Error saving profile: ' + error.message);
  } else {
    await loadQuestionnaire(false);
  }
}

async function uploadImagesToSupabase(file, previewContainerId, isEditMode = false) {
  const previewContainer = document.getElementById(previewContainerId);
  if (!file) return null;
  const fileExt = file.name.split('.').pop();
  const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabaseClient.storage
    .from('profile-images')
    .upload(fileName, file);
  if (uploadError) {
    alert('Upload error: ' + uploadError.message);
    return null;
  }
  const { data } = supabaseClient.storage.from('profile-images').getPublicUrl(fileName);
  if (data && data.publicUrl) {
    if (!isEditMode) {
      const wrapper = document.createElement('div');
      wrapper.className = 'photo-thumb-wrapper';
      wrapper.innerHTML = `<img src="${data.publicUrl}" class="card-photo-thumb" />`;
      previewContainer.appendChild(wrapper);
    }
    return data.publicUrl;
  }
  return null;
}

function renderEditPhotoThumbnails() {
  const preview = document.getElementById('edit-photo-preview');
  if (!preview) return;
  preview.innerHTML = '';
  editPhotosTemp.forEach((url, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrapper edit-thumb-wrap';
    wrap.innerHTML = `
      <img src="${url}" class="card-photo-thumb" />
      <button type="button" class="remove-photo-btn" onclick="removeEditPhoto(${index})">✕</button>
    `;
    preview.appendChild(wrap);
  });
}

function removeEditPhoto(index) {
  editPhotosTemp.splice(index, 1);
  renderEditPhotoThumbnails();
}

function updatePhotoCountIndicator() {
  const indicator = document.getElementById('photo-count-indicator');
  if (indicator) { indicator.textContent = uploadedImageUrlsTemp.length; }
  const inputEl = document.getElementById('photo-upload-input');
  if (inputEl && uploadedImageUrlsTemp.length >= 5) {
    inputEl.disabled = true;
    inputEl.style.display = 'none';
  }
}

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
      await loadQuestionnaire(false);
    }
  } else {
    showSection('profile-section');
  }
}

/* =========================================================================
   SECTION 6: QUESTIONNAIRE ENGINE
   ========================================================================= */

async function loadQuestionnaire(isDeepDive = false) {
  showSection('quiz-section');
  const container = document.getElementById('quiz-container');
  if (!container) return;
  
  container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading questionnaire...</p>';
  
  let { data: questions, error } = await supabaseClient
    .from('questions')
    .select('*')
    .order('id', { ascending: true });
  
  if (error || !questions || !questions.length) {
    container.innerHTML = '<p style="text-align: center; color: var(--accent);">Unable to load questions.</p>';
    return;
  }
  
  questions = questions.filter(q => isDeepDive ? q.is_deep_dive === true : !q.is_deep_dive);
  quizQuestions = questions;
  container.innerHTML = isDeepDive ? '<h3 style="color:var(--primary); margin-bottom:12px;">Deep-Dive Profile Questionnaire</h3>' : '';
  
  questions.forEach((q, idx) => {
    if (!userAnswersMap[q.id]) {
      userAnswersMap[q.id] = { answer: null, acceptable: [] };
    }
    const card = document.createElement('div');
    card.className = 'question-card';
    
    let ownOptionsHTML = '';
    q.options.forEach(opt => {
      const isSelected = userAnswersMap[q.id].answer === opt.id ? 'selected' : '';
      ownOptionsHTML += `<button type="button" class="option-btn ${isSelected}" data-qid="${q.id}" data-optid="${opt.id}">${opt.label}</button>`;
    });
    
    let acceptableOptionsHTML = '';
    q.options.forEach(opt => {
      const isChecked = userAnswersMap[q.id].acceptable.includes(opt.id) ? 'checked' : '';
      acceptableOptionsHTML += `
        <label class="acceptable-option-row">
          <input type="checkbox" class="acceptable-chk acceptable-option-checkbox" data-qid="${q.id}" data-optid="${opt.id}" ${isChecked} />
          <span class="acceptable-option-text">${opt.label}</span>
        </label>
      `;
    });
    
    card.innerHTML = `
      <span class="badge">${q.category || 'Lifestyle'}</span>
      <p style="font-weight: 600; font-size: 0.95rem; margin: 8px 0 12px 0; color: var(--text-main); text-align: left;">${idx + 1}. ${q.question_text}</p>
      
      <div style="margin-bottom: 14px; text-align: left;">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Your Answer:</div>
        <div>${ownOptionsHTML}</div>
      </div>
      <div class="acceptable-container-box">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 8px;">Acceptable answers from your match:</div>
        <div>${acceptableOptionsHTML}</div>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const optid = e.target.getAttribute('data-optid');
      document.querySelectorAll(`.option-btn[data-qid="${qid}"]`).forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      
      if (!userAnswersMap[qid]) userAnswersMap[qid] = { answer: null, acceptable: [] };
      userAnswersMap[qid].answer = optid;
      
      if (userAnswersMap[qid].acceptable.length === 0) {
        userAnswersMap[qid].acceptable.push(optid);
        const matchingChk = document.querySelector(`.acceptable-chk[data-qid="${qid}"][data-optid="${optid}"]`);
        if (matchingChk) matchingChk.checked = true;
      }
      updateQuizSubmitButtonState();
    });
  });

  document.querySelectorAll('.acceptable-chk').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const optid = e.target.getAttribute('data-optid');
      
      if (!userAnswersMap[qid]) userAnswersMap[qid] = { answer: null, acceptable: [] };
      
      if (e.target.checked) {
        if (!userAnswersMap[qid].acceptable.includes(optid)) {
          userAnswersMap[qid].acceptable.push(optid);
        }
      } else {
        userAnswersMap[qid].acceptable = userAnswersMap[qid].acceptable.filter(id => id !== optid);
      }
    });
  });
  updateQuizSubmitButtonState();
}

function updateQuizSubmitButtonState() {
  const submitBtn = document.getElementById('submit-quiz-btn');
  if (!submitBtn) return;
  const answeredCount = Object.keys(userAnswersMap).filter(qid => userAnswersMap[qid] && userAnswersMap[qid].answer !== null).length;
  const totalCount = quizQuestions.length;
  submitBtn.style.display = 'block';
  if (answeredCount >= totalCount) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Responses & Continue';
    submitBtn.style.backgroundColor = 'var(--primary)';
    submitBtn.style.opacity = '1';
  } else {
    submitBtn.disabled = true;
    submitBtn.textContent = `Answer all questions to continue (${answeredCount}/${totalCount})`;
    submitBtn.style.backgroundColor = '#7a8c84';
    submitBtn.style.opacity = '0.7';
  }
}

/* =========================================================================
   SECTION 7: DASHBOARD, DISCOVERY FEED & MATCHING ALGORITHM
   ========================================================================= */

async function loadDashboard() {
  showSection('dashboard-section');
  const deckContainer = document.getElementById('deck-container');
  if (!deckContainer) return;
  deckContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding-top: 100px;">Finding nearby profiles...</p>';
  
  const { data: myProfile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
    
  const myLat = myProfile ? myProfile.latitude : null;
  const myLon = myProfile ? myProfile.longitude : null;
  const preferredGenders = myProfile?.preferred_genders || ['Man', 'Woman', 'Non-binary', 'Other'];
  const preferredIntents = myProfile?.preferred_intents || ['both', 'platonic', 'romantic'];
  const maxAllowedDistance = myProfile?.max_distance !== undefined ? myProfile.max_distance : 100;
  const minAllowedAge = myProfile?.pref_min_age !== undefined ? myProfile.pref_min_age : 18;
  const maxAllowedAge = myProfile?.pref_max_age !== undefined ? myProfile.pref_max_age : 99;

  const { data: myAnswers } = await supabaseClient
    .from('user_answers')
    .select('question_id, selected_option_id, acceptable_option_ids')
    .eq('user_id', currentUser.id);
    
  const myAnswersLookup = {};
  if (myAnswers) {
    myAnswers.forEach(a => { 
      myAnswersLookup[a.question_id] = {
        answer: a.selected_option_id,
        acceptable: a.acceptable_option_ids || [a.selected_option_id]
      }; 
    });
  }

  const { data: existingConnections } = await supabaseClient
    .from('connections')
    .select('requester_id, receiver_id, status, created_at')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const excludedUserIds = new Set([currentUser.id]);
  
  if (existingConnections) {
    existingConnections.forEach(c => {
      const otherId = c.requester_id === currentUser.id ? c.receiver_id : c.requester_id;
      const createdAt = new Date(c.created_at);
      if (c.status === 'accepted') {
        excludedUserIds.add(otherId);
      } else if (c.status === 'pending') {
        const isIncoming = c.receiver_id === currentUser.id;
        if (!(isIncoming && createdAt < sevenDaysAgo) && !(!isIncoming && createdAt < thirtyDaysAgo)) {
          excludedUserIds.add(otherId);
        }
      } else if (c.status === 'rejected' && c.requester_id === currentUser.id) {
        if (createdAt > thirtyDaysAgo) { excludedUserIds.add(otherId); }
      }
    });
  }

  const { data: profiles, error } = await supabaseClient.from('profiles').select('*');
  if (error || !profiles) {
    deckContainer.innerHTML = '<p style="text-align: center; color: var(--accent);">Error loading profiles.</p>';
    return;
  }

  const { data: allAnswers } = await supabaseClient.from('user_answers').select('user_id, question_id, selected_option_id, acceptable_option_ids');
  const profilesAnswersMap = {};
  const profilesAcceptableMap = {};
  if (allAnswers) {
    allAnswers.forEach(ans => {
      if (!profilesAnswersMap[ans.user_id]) profilesAnswersMap[ans.user_id] = {};
      if (!profilesAcceptableMap[ans.user_id]) profilesAcceptableMap[ans.user_id] = {};
      profilesAnswersMap[ans.user_id][ans.question_id] = ans.selected_option_id;
      profilesAcceptableMap[ans.user_id][ans.question_id] = ans.acceptable_option_ids || [ans.selected_option_id];
    });
  }

  let filteredProfiles = profiles.filter(p => {
    if (excludedUserIds.has(p.id)) return false;
    const pGender = p.gender || 'Other';
    if (preferredGenders.length > 0 && !preferredGenders.includes(pGender)) return false;
    const pIntent = p.intent || 'both';
    if (preferredIntents.length > 0 && !preferredIntents.includes(pIntent) && pIntent !== 'both') return false;
    
    const pAge = calculateAge(p.dob);
    if (pAge < minAllowedAge || pAge > maxAllowedAge) return false;

    const distance = calculateDistance(myLat, myLon, p.latitude, p.longitude);
    p.distanceKm = distance;
    if (maxAllowedDistance < 100 && distance > maxAllowedDistance) return false;
    
    return true;
  });

  filteredProfiles = filteredProfiles.map(p => {
    let score = 75;
    const targetAnswers = profilesAnswersMap[p.id] || {};
    const targetAcceptable = profilesAcceptableMap[p.id] || {};
    let mutuallyCompatibleCount = 0;
    let totalCompared = 0;

    Object.keys(myAnswersLookup).forEach(qid => {
      const myAns = myAnswersLookup[qid]?.answer;
      const myAcceptable = myAnswersLookup[qid]?.acceptable || [myAns];
      const theirAns = targetAnswers[qid];
      const theirAcceptable = targetAcceptable[qid] || [theirAns];
      
      if (myAns !== undefined && theirAns !== undefined) {
        totalCompared++;
        if (myAcceptable.includes(theirAns) && theirAcceptable.includes(myAns)) {
          mutuallyCompatibleCount++;
        }
      }
    });
    
    if (totalCompared > 0) {
      const compatibilityRatio = mutuallyCompatibleCount / totalCompared;
      score = Math.floor(50 + (compatibilityRatio * 49));
    }
    
    return { ...p, matchScore: Math.min(score, 99) };
  });

  filteredProfiles.sort((a, b) => {
    const tierA = Math.floor((a.distanceKm || 0) / 5);
    const tierB = Math.floor((b.distanceKm || 0) / 5);
    if (tierA !== tierB) return tierA - tierB;
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return (a.distanceKm || 0) - (b.distanceKm || 0);
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
  if (!currentUser) return;
  const { data: connections } = await supabaseClient
    .from('connections')
    .select('id, requester_id, receiver_id, status')
    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
  if (!connections || connections.length === 0) return;

  const incomingPending = connections.filter(c => c.status === 'pending' && c.receiver_id === currentUser.id);
  const requestBadge = document.getElementById('request-badge');
  if (requestBadge) {
    if (incomingPending.length > 0 && !document.getElementById('view-connections').classList.contains('active')) {
      requestBadge.style.display = 'inline-flex';
      requestBadge.textContent = `💌 ${incomingPending.length} Req`;
    } else {
      requestBadge.style.display = 'none';
    }
  }

  const acceptedIds = connections.filter(c => c.status === 'accepted').map(c => c.id);
  const messageBadge = document.getElementById('message-badge');
  if (acceptedIds.length === 0) {
    if (messageBadge) messageBadge.style.display = 'none';
    return;
  }

  const { data: latestMsgs } = await supabaseClient
    .from('messages')
    .select('sender_id, created_at, connection_id')
    .in('connection_id', acceptedIds)
    .order('created_at', { ascending: false });
    
  if (latestMsgs && latestMsgs.length > 0) {
    const mostRecent = latestMsgs[0];
    if (mostRecent.sender_id !== currentUser.id) {
      if (messageBadge && !document.getElementById('view-connections').classList.contains('active')) {
        messageBadge.style.display = 'inline-flex';
        messageBadge.textContent = '💬 New Msg';
      }
    } else {
      if (messageBadge) messageBadge.style.display = 'none';
    }
  } else {
    if (messageBadge) messageBadge.style.display = 'none';
  }
}

function renderDeck() {
  const deckContainer = document.getElementById('deck-container');
  deckContainer.innerHTML = '';
  const oldBar = document.getElementById('sticky-action-bar');
  if (oldBar) oldBar.remove();
  
  if (currentCardIndex >= availableProfiles.length) {
    deckContainer.innerHTML = `
      <div style="text-align: center; padding-top: 140px;">
        <p style="font-weight: 600; font-size: 1.1rem; color: var(--primary);">All caught up!</p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 8px;">
          You have viewed all available profiles within your filters. Check back later or adjust your preferences!
        </p>
      </div>
    `;
    return;
  }
  
  const profile = availableProfiles[currentCardIndex];
  const matchPercentage = profile.matchScore || 85;
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';
  const ageDisplay = profile.dob ? `, ${calculateAge(profile.dob)}` : '';
  
  let streamHTML = '';
  streamHTML += `
    <div class="profile-feed-card">
      <div class="feed-header-info">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${escapeHTML(profile.full_name || 'Anonymous')}${ageDisplay}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 2px;">📍 ${escapeHTML(profile.location_name || 'Location not specified')} (${profile.distanceKm !== undefined ? Math.round(profile.distanceKm) + ' km away' : ''})</div>
          </div>
          <div class="card-match-badge" style="font-size: 0.85rem; padding: 6px 12px;">${matchPercentage}% Match</div>
        </div>
      </div>
  `;
  
  const images = profile.images || [];
  if (images.length > 0) {
    streamHTML += `<img src="${images[0]}" class="feed-photo" alt="Profile Photo" />`;
  }
  
  if (profile.bio && profile.bio.trim() !== '') {
    streamHTML += `
      <div class="feed-bio-box">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 4px;">About Me</div>
        <div style="font-size: 0.95rem; color: var(--text-main);">"${escapeHTML(profile.bio)}"</div>
      </div>
    `;
  }
  
  const detailMappings = [
    { key: 'gender', icon: '👤' },
    { key: 'pronouns', icon: '🗣️' },
    { key: 'orientation', icon: '🌈' },
    { key: 'relationship_status', icon: '💍' },
    { key: 'height', icon: '📏', suffix: ' cm' },
    { key: 'occupation', icon: '💼' },
    { key: 'education', icon: '🎓' },
    { key: 'religion', icon: '🕊️' },
    { key: 'politics', icon: '🏛️' },
    { key: 'languages', icon: '🌐' },
    { key: 'diet', icon: '🥗' },
    { key: 'smoking', icon: '🚬' },
    { key: 'drinking', icon: '🍷' },
    { key: 'children', icon: '👶' },
    { key: 'pets', icon: '🐾' }
  ];
  
  let tagsHTML = '';
  detailMappings.forEach(f => {
    let val = profile[f.key];
    if (val && val.trim() !== '' && val.toLowerCase() !== 'na' && val.toLowerCase() !== 'prefer not to say') {
      let formattedVal = escapeHTML(val);
      if (f.suffix && !formattedVal.includes('cm') && !formattedVal.includes('ft')) {
        formattedVal += f.suffix;
      }
      tagsHTML += `<span class="detail-tag">${f.icon} ${formattedVal}</span>`;
    }
  });
  
  if (tagsHTML) {
    streamHTML += `
      <div class="feed-section-box">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 8px;">Basics & Lifestyle</div>
        <div class="card-details-grid">${tagsHTML}</div>
      </div>
    `;
  }
  
  if (images.length > 1) {
    streamHTML += `<img src="${images[1]}" class="feed-photo" alt="Profile Photo" />`;
  }
  
  if (profile.prompt_question && profile.prompt_answer && profile.prompt_answer.trim() !== '') {
    streamHTML += `
      <div class="feed-prompt-box">
        <div class="card-prompt-q">💬 ${escapeHTML(profile.prompt_question)}</div>
        <div style="font-size: 0.95rem; font-weight: 600; margin-top: 4px; color: var(--text-main);">"${escapeHTML(profile.prompt_answer)}"</div>
      </div>
    `;
  }
  
  if (images.length > 2) {
    streamHTML += `<img src="${images[2]}" class="feed-photo" alt="Profile Photo" />`;
  }
  if (images.length > 3) {
    streamHTML += `<img src="${images[3]}" class="feed-photo" alt="Profile Photo" />`;
  }
  
  streamHTML += `
      <div style="padding: 16px; text-align: center;">
        <div class="card-intent" style="margin-bottom: 12px;">🌱 Intent: <strong>${escapeHTML(intentText)}</strong></div>
        <button type="button" class="comment-bio-btn" id="open-comment-modal-btn">💬 Comment on Bio / Prompt & Connect</button>
        <button type="button" onclick="openReportModal('${profile.id}')" style="background:none; border:none; color:#d9534f; font-size:0.8rem; cursor:pointer; margin-top: 14px;">🚩 Report This Profile</button>
      </div>
    </div>
  `;
  
  deckContainer.innerHTML = streamHTML;
  const actionBar = document.createElement('div');
  actionBar.className = 'sticky-action-bar';
  actionBar.id = 'sticky-action-bar';
  actionBar.innerHTML = `
    <button type="button" class="action-circle-btn pass" id="bar-pass-btn" title="Pass">✕</button>
    <button type="button" class="action-circle-btn super-like" id="bar-super-btn" title="Super Connect">⭐</button>
    <button type="button" class="action-circle-btn connect" id="bar-connect-btn" title="Connect">♥</button>
  `;
  document.getElementById('app-container').appendChild(actionBar);
  document.getElementById('bar-pass-btn').addEventListener('click', () => swipeCurrentCard('left'));
  document.getElementById('bar-connect-btn').addEventListener('click', () => swipeCurrentCard('right'));
  document.getElementById('bar-super-btn').addEventListener('click', () => { openCommentModal(profile); });
  const commentBtn = deckContainer.querySelector('#open-comment-modal-btn');
  if (commentBtn) {
    commentBtn.addEventListener('click', () => { openCommentModal(profile); });
  }
}

async function openPreferencesModal() {
  const modal = document.getElementById('preferences-modal');
  const { data: profile } = await supabaseClient.from('profiles').select('preferred_genders, preferred_intents, max_distance, pref_min_age, pref_max_age').eq('id', currentUser.id).single();
  
  if (profile) {
    const genders = profile.preferred_genders || ['Man', 'Woman', 'Non-binary', 'Other'];
    document.querySelectorAll('#pref-gender-checkboxes input').forEach(chk => {
      chk.checked = genders.includes(chk.value);
    });
    const intents = profile.preferred_intents || ['both'];
    document.getElementById('pref-intent-select').value = intents.length === 1 ? intents[0] : 'all';
    
    const maxDist = profile.max_distance !== undefined ? profile.max_distance : 100;
    const slider = document.getElementById('pref-max-distance');
    const output = document.getElementById('distance-output');
    if (slider && output) {
      slider.value = maxDist;
      output.innerText = maxDist >= 100 ? '99+ km' : maxDist + ' km';
      
      slider.oninput = (e) => {
        const val = parseInt(e.target.value);
        output.innerText = val >= 100 ? '99+ km' : val + ' km';
      };
    }
    
    if (document.getElementById('pref-min-age')) {
      document.getElementById('pref-min-age').value = profile.pref_min_age !== undefined ? profile.pref_min_age : 18;
      document.getElementById('pref-max-age').value = profile.pref_max_age !== undefined ? profile.pref_max_age : 99;
    }
  }
  modal.classList.add('show');
}

async function saveUserPreferences() {
  const selectedGenders = [];
  document.querySelectorAll('#pref-gender-checkboxes input:checked').forEach(chk => {
    selectedGenders.push(chk.value);
  });
  const intentVal = document.getElementById('pref-intent-select').value;
  const selectedIntents = intentVal === 'all' ? ['both', 'platonic', 'romantic'] : [intentVal];
  const maxDistVal = parseInt(document.getElementById('pref-max-distance').value) || 100;
  const minAge = parseInt(document.getElementById('pref-min-age').value) || 18;
  const maxAge = parseInt(document.getElementById('pref-max-age').value) || 99;
  
  const { error } = await supabaseClient.from('profiles').update({
    preferred_genders: selectedGenders,
    preferred_intents: selectedIntents,
    max_distance: maxDistVal,
    pref_min_age: minAge,
    pref_max_age: maxAge
  }).eq('id', currentUser.id);
  
  if (error) {
    alert('Error saving preferences: ' + error.message);
  } else {
    document.getElementById('preferences-modal').classList.remove('show');
    alert('Preferences updated successfully!');
    await loadDashboard();
  }
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
      if (window.gtag) {
        gtag('event', 'match_created', { method: 'note_connect' });
      }
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
      if (window.gtag) {
        gtag('event', 'connection_requested', { method: 'note_connect' });
      }
    }
    alert('Your note and connection request have been sent!');
  }
  currentCardIndex++;
  renderDeck();
}

async function swipeCurrentCard(direction) {
  const targetProfile = availableProfiles[currentCardIndex];
  if (targetProfile) {
    if (direction === 'right') {
      await handleRightSwipe(targetProfile);
    } else if (direction === 'left') {
      await handleLeftSwipe(targetProfile);
    }
  }
  currentCardIndex++;
  renderDeck();
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
      if (window.gtag) {
        gtag('event', 'match_created', { method: 'swipe_right' });
      }
      alert(`🎉 It's a Match! You and ${targetProfile.full_name} have both swiped right. Your active chat space is open!`);
      await updateActiveChatCount();
    }
  } else {
    const { error } = await supabaseClient
      .from('connections')
      .upsert([
        { requester_id: currentUser.id, receiver_id: targetProfile.id, status: 'pending' }
      ], { onConflict: 'requester_id,receiver_id' });
    if (!error && window.gtag) {
      gtag('event', 'connection_requested', { method: 'swipe_right' });
    }
  }
}

async function handleLeftSwipe(targetProfile) {
  await supabaseClient
    .from('connections')
    .upsert([
      { requester_id: currentUser.id, receiver_id: targetProfile.id, status: 'rejected', created_at: new Date().toISOString() }
    ], { onConflict: 'requester_id,receiver_id' });
}

/* =========================================================================
   SECTION 8: CONNECTIONS, CHAT & MESSAGING SYSTEM
   ========================================================================= */

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
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const accepted = connections.filter(c => c.status === 'accepted');
  const pending = connections.filter(c => {
    if (c.status !== 'pending') return false;
    const createdAt = new Date(c.created_at);
    const isIncoming = c.receiver_id === currentUser.id;
    if (isIncoming && createdAt < sevenDaysAgo) return false;
    if (!isIncoming && createdAt < thirtyDaysAgo) return false;
    return true;
  });

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

/* =========================================================================
   SECTION 9: PROFILE MODALS, EDITING, REPORTING & ACCOUNT MANAGEMENT
   ========================================================================= */

async function showProfilePreview() {
  const modal = document.getElementById('profile-modal');
  const detailsEl = document.getElementById('modal-profile-details');
  if (!detailsEl) return;
  
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
      photosHTML = `<div class="profile-photo-row">`;
      profile.images.forEach(u => { photosHTML += `<img src="${u}" class="card-photo-thumb" />`; });
      photosHTML += `</div>`;
    }
    detailsEl.innerHTML = `
      <p class="profile-detail-text"><strong>Name:</strong> ${escapeHTML(profile.full_name)}</p>
      <p class="profile-detail-text"><strong>Location:</strong> ${escapeHTML(profile.location_name)}</p>
      <p class="profile-detail-text"><strong>Intent:</strong> ${escapeHTML(intentText)}</p>
      ${photosHTML}
      <p class="profile-detail-text-top"><strong>Bio:</strong><br/>"${escapeHTML(profile.bio || '')}"</p>
      ${profile.prompt_question ? `<p class="profile-detail-text-top"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</p>` : ''}
      <button type="button" id="complete-deep-dive-btn" class="deep-dive-trigger-btn">🧠 Complete Deep-Dive Questionnaire</button>
    `;
    const deepDiveBtn = document.getElementById('complete-deep-dive-btn');
    if (deepDiveBtn) {
      deepDiveBtn.addEventListener('click', async () => {
        modal.classList.remove('show');
        userAnswersMap = {};
        await loadQuestionnaire(true);
      });
    }
  } else {
    detailsEl.innerHTML = 'Profile not found.';
  }
}

async function openEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;
  
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!profile) return;
  
  document.getElementById('edit-full-name').value = profile.full_name || '';
  document.getElementById('edit-dob').value = profile.dob || ''; 
  document.getElementById('edit-location').value = profile.location_name || '';
  document.getElementById('edit-intent').value = profile.intent || 'both';
  document.getElementById('edit-bio').value = profile.bio || '';
  document.getElementById('edit-gender').value = profile.gender || '';
  document.getElementById('edit-pronouns').value = profile.pronouns || '';
  document.getElementById('edit-orientation').value = profile.orientation || '';
  document.getElementById('edit-relationship_status').value = profile.relationship_status || '';
  document.getElementById('edit-height').value = profile.height || '';
  document.getElementById('edit-education').value = profile.education || '';
  document.getElementById('edit-occupation').value = profile.occupation || '';
  document.getElementById('edit-religion').value = profile.religion || '';
  document.getElementById('edit-politics').value = profile.politics || '';
  document.getElementById('edit-languages').value = profile.languages || '';
  document.getElementById('edit-diet').value = profile.diet || '';
  document.getElementById('edit-smoking').value = profile.smoking || '';
  document.getElementById('edit-drinking').value = profile.drinking || '';
  document.getElementById('edit-children').value = profile.children || '';
  document.getElementById('edit-pets').value = profile.pets || '';
  document.getElementById('edit-prompt-q').value = profile.prompt_question || 'A simple joy that always grounds me is...';
  document.getElementById('edit-prompt-a').value = profile.prompt_answer || '';
  
  tempLatitude = profile.latitude || null;
  tempLongitude = profile.longitude || null;
  editPhotosTemp = profile.images ? [...profile.images] : [];
  renderEditPhotoThumbnails();
  modal.classList.add('show');
}

function openPartnerProfileModal(profile) {
  const modal = document.getElementById('partner-profile-modal');
  const bodyEl = document.getElementById('partner-profile-body');
  if (!bodyEl) return;
  
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';
  let photosHTML = '';
  if (profile.images && profile.images.length > 0) {
    photosHTML = `<div class="profile-photo-row">`;
    profile.images.forEach(u => { photosHTML += `<img src="${u}" class="card-photo-thumb" />`; });
    photosHTML += `</div>`;
  }
  bodyEl.innerHTML = `
    <div class="partner-header-flex">
      <div>
        <div class="partner-name-title">${escapeHTML(profile.full_name)}</div>
        <div class="partner-location-text">📍 ${escapeHTML(profile.location_name)}</div>
      </div>
      <div class="partner-header-actions">
        <div class="partner-badge">Matched Partner</div>
        <button type="button" onclick="openReportModal('${profile.id}')" class="partner-report-btn">🚩 Report User</button>
      </div>
    </div>
    ${photosHTML}
    <div class="partner-bio-box">
      "${escapeHTML(profile.bio || 'No bio provided.')}"
    </div>
    ${profile.prompt_question ? `<div class="partner-prompt-box"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</div>` : ''}
    <div class="partner-intent-text">
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
  if (!bodyEl) return;
  
  const intentText = profile.intent ? profile.intent.charAt(0).toUpperCase() + profile.intent.slice(1) : 'Both';
  let photosHTML = '';
  if (profile.images && profile.images.length > 0) {
    photosHTML = `<div class="profile-photo-row">`;
    profile.images.forEach(u => { photosHTML += `<img src="${u}" class="card-photo-thumb" />`; });
    photosHTML += `</div>`;
  }
  bodyEl.innerHTML = `
    <div class="partner-header-flex">
      <div>
        <div class="partner-name-title">${escapeHTML(profile.full_name)}</div>
        <div class="partner-location-text">📍 ${escapeHTML(profile.location_name)}</div>
      </div>
      <div class="partner-header-actions">
        <div class="partner-badge">Incoming Like</div>
        <button type="button" onclick="openReportModal('${profile.id}')" class="partner-report-btn">🚩 Report</button>
      </div>
    </div>
    ${photosHTML}
    <div class="partner-bio-box">
      "${escapeHTML(profile.bio || 'No bio provided.')}"
    </div>
    ${profile.prompt_question ? `<div class="partner-prompt-box"><strong>${escapeHTML(profile.prompt_question)}</strong><br/>"${escapeHTML(profile.prompt_answer || '')}"</div>` : ''}
    <div class="partner-intent-text">
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
