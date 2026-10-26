# Indieflourish

An open-source, non-profit Progressive Web App (PWA) dedicated to addressing the loneliness epidemic and fostering genuine, values-first human connections—free from predatory, swipe-driven monetization mechanics.

---

## 🌟 Vision & Core Philosophy
Modern dating and social discovery platforms often prioritize continuous swiping and user retention metrics over authentic relationships. **Indieflourish** is built on a human-centric alternative model:
- **Zero Monetization:** No paid tiers, no premium "boosts," no paywalls, and no advertisements.
- **Slow Connection & Depth:** Encouraging intentional, focused dialogue over superficial volume.
- **Safety & Respect:** Proactive content safeguards and community-driven moderation.

---

## 🚀 Key Features

### 1. Values & Lifestyle Questionnaire
- Multi-category questionnaire capturing personal values, lifestyle habits, and relationship expectations.
- Transparent compatibility scoring computed transparently without black-box algorithmic manipulation.

### 2. Proximity-Based Discovery & GPS Auto-Detection
- One-tap browser geolocation (`navigator.geolocation`) auto-detects latitude/longitude and reverse-geocodes your location via OpenStreetMap.
- The Discover deck uses the **Haversine formula** to calculate true physical distance, surfacing local profiles nearby first.

### 3. Photo Management & On-Device AI Moderation (NSFWJS)
- Upload up to **5 profile photos** with inline preview thumbnail management.
- Integrated **NSFWJS (TensorFlow.js)** browser-side image classification automatically scans photos before upload. Explicit or suggestive content is blocked directly on your device before reaching cloud storage.

### 4. Interactive Prompts & Bio Commenting
- Engage with icebreaker prompt questions (e.g., *"A simple joy that grounds me..."*).
- Users can leave a direct reaction or note on someone's bio or prompt answer, which automatically submits a right-swipe connection request along with their note as the initial message.

### 5. Mindful Capacity Limits (3 Active Chats)
- Enforces a hard limit of **3 simultaneous active chat spaces** to prevent superficial conversation hoarding and curb ghosting.
- Unread message indicators alert users when a match responds.

### 6. Safety, Reporting & Unmatching
- Integrated **User Reporting System** allowing instant flagging for harassment, nudity, or fake profiles.
- One-tap **Unmatch** functionality to safely disconnect and free up active chat capacity.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** Vanilla HTML5 / CSS3 / JavaScript (ES6+) built as a Progressive Web App (PWA). Mobile-first, responsive, and installable directly to the home screen.
- **Client-Side AI:** TensorFlow.js & NSFWJS for on-device image moderation.
- **Backend & Database:** Supabase (PostgreSQL, Row Level Security, Storage Buckets, and Magic Link Auth).
- **Hosting & Deployment:** Vercel (Global Edge Network, automated deployment, custom domain support).

---

## 🗄️ Database Schema Overview

The Supabase PostgreSQL database consists of the following primary tables:
- `profiles`: Stores user info, bio, photos (`images[]`), prompt responses, location coordinates (`latitude`, `longitude`), and intent.
- `questions` & `user_answers`: Houses the compatibility questionnaire and individual user choices.
- `connections`: Tracks match requests, pending likes, accepted active chats, and rejected swipes (with automatic 30-day reset logic).
- `messages`: Real-time chat messaging per connection with Row Level Security.
- `reports`: Captures user flags and moderation reports safely.
- `storage.buckets ('profile-images')`: Publicly accessible storage bucket with authenticated upload RLS policies.

---

## 💻 Local Setup & Deployment

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/indieflourish.git](https://github.com/your-username/indieflourish.git)
   cd indieflourish
