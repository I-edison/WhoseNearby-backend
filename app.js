// whoseNearby waitlist form — posts to the Node.js backend
// Replace API_URL below with your real server URL before deploying

const API_URL = "https://whosenearby-backend.onrender.com"; // ← update this before deploying


const form = document.getElementById("waitlist-form");
const successBox = document.getElementById("waitlist-success");
const successName = document.getElementById("success-name");
const submitBtn = document.getElementById("wl-submit");
const errorNote = document.getElementById("wl-note");

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("wl-name").value.trim();
  const contact = document.getElementById("wl-contact").value.trim();
  const city = document.getElementById("wl-city").value;
  const role = document.getElementById("wl-role").value;

  if (!name || !contact || !city || !role) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Join";
  errorNote.style.color = "";
  errorNote.textContent = "No spam, ever. Just one message when we launch.";

  try {
    const res = await fetch(`${API_URL}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact, city, role }),
    });

    const data = await res.json();

    if (res.status === 409) {
      // Already registered
      errorNote.textContent = "Looks like you already signed up!";
      errorNote.style.color = "#D97706";
      submitBtn.disabled = false;
      submitBtn.textContent = "Join the waitlist";
      return;
    }

    if (!res.ok) throw new Error(data.error || "Something went wrong");

    // Success
    form.hidden = true;
    successBox.hidden = false;
    successName.textContent = name.split(" ")[0];
  } catch (err) {
    // Fallback: save locally so no signup is silently lost
    saveLocalBackup({ name, contact, city, role });
    errorNote.textContent = "Hmm, that didn't send. Try again in a moment.";
    errorNote.style.color = "#E24B4A";
    submitBtn.disabled = false;
    submitBtn.textContent = "Try again";
  }
});

function saveLocalBackup(entry) {
  try {
    const key = "wn_waitlist_backup";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.push({ ...entry, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    /* ignore */
  }
}

// Scroll reveal
const revealEls = document.querySelectorAll(
  ".how-card, .badge-demo-row, .providers-card",
);
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  },
  { threshold: 0.15 },
);

revealEls.forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(16px)";
  el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
  observer.observe(el);
});

app.use(cors({ origin: '*' }));
