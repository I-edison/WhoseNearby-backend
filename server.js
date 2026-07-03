// whoseNearby — Waitlist Backend Server
// Node.js + Express
//
// What this handles:
//   POST /api/signup      — receive waitlist signups from the website form
//   POST /api/admin/login — authenticate admin users
//   GET  /api/admin/users — return all signups (admin only)
//   GET  /api/admin/export — download signups as CSV (admin only)
//   POST /api/admin/email  — send an email to one or all signups (admin only)
//
// Setup instructions are in README.md

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Move these to a real .env file before deploying — never commit real passwords
const ADMIN_USERS = [
  {
    username: "admin",
    password: process.env.ADMIN_PASSWORD || "admin",
  },
  {
    username: "team",
    password: process.env.TEAM_PASSWORD || "admin",
  },
];

// Gmail SMTP config — replace with your real Gmail address in .env
// You'll need an App Password from Google (not your regular password):
// myaccount.google.com → Security → 2-Step Verification → App passwords
const EMAIL_CONFIG = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "iyaseeddyzin@gmail.com",
    pass: process.env.EMAIL_PASS || "kctt rnky srsr mblq",
  },
};

const FROM_NAME = "whoseNearby";
const FROM_ADDRESS = process.env.EMAIL_USER || "iyaseeddyzin@gmail.com";

// Simple session store (in-memory — fine for 2-3 admins)
const sessions = new Set();

// Data file path
const DATA_FILE = path.join(__dirname, "data", "signups.json");

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── HELPERS ──────────────────────────────────────────────────────────────────
function readSignups() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeSignups(signups) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(signups, null, 2));
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function requireAuth(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function toCSV(signups) {
  const headers = ["Name", "Contact", "City", "Role", "Signed up"];
  const rows = signups.map((s) =>
    [
      `"${s.name || ""}"`,
      `"${s.contact || ""}"`,
      `"${s.city || ""}"`,
      `"${s.role || ""}"`,
      `"${s.timestamp || ""}"`,
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

async function sendEmail({ to, subject, body }) {
  const transporter = nodemailer.createTransport(EMAIL_CONFIG);
  return transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to,
    subject,
    html: body,
  });
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

// Public: receive a new waitlist signup
app.post("/api/signup", (req, res) => {
  const { name, contact, city, role } = req.body;
  if (!name || !contact || !city || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const signups = readSignups();

  // Prevent duplicate signups from the same contact
  if (signups.some((s) => s.contact === contact)) {
    return res.status(409).json({ error: "Already registered" });
  }

  const entry = {
    id: signups.length + 1,
    name,
    contact,
    city,
    role,
    timestamp: new Date().toISOString(),
  };

  signups.push(entry);
  writeSignups(signups);

  // Optionally send a confirmation email if contact looks like an email
  if (contact.includes("@")) {
    sendEmail({
      to: contact,
      subject: `You're on the whoseNearby waitlist, ${name.split(" ")[0]}!`,
      body: `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#0D2818">
          <div style="background:#1B7A3E;padding:28px 32px;border-radius:12px 12px 0 0">
            <h2 style="color:#ffffff;margin:0;font-size:22px">whose<strong style="color:#B6DFC4">Nearby</strong></h2>
          </div>
          <div style="padding:28px 32px;border:1px solid #DDE5DE;border-top:none;border-radius:0 0 12px 12px">
            <h3 style="font-size:20px;margin:0 0 12px">You're on the list, ${name.split(" ")[0]}.</h3>
            <p style="color:#5C6B62;line-height:1.6">
              We'll reach out the moment whoseNearby launches in ${city}. 
              Thanks for being early — you'll be first to know.
            </p>
            <div style="margin:24px 0;padding:16px;background:#E8F5EE;border-radius:8px">
              <p style="margin:0;font-size:13px;color:#0F5A28">
                <strong>You joined as:</strong> ${role}
              </p>
            </div>
            <p style="color:#8A958F;font-size:12px;margin-top:24px">
              — The whoseNearby team
            </p>
          </div>
        </div>
      `,
    }).catch((err) => console.error("Confirmation email error:", err));
  }

  res.json({ success: true, position: signups.length });
});

// Admin: login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const user = ADMIN_USERS.find(
    (u) => u.username === username && u.password === password,
  );
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = generateToken();
  sessions.add(token);
  res.json({ token });
});

// Admin: logout
app.post("/api/admin/logout", requireAuth, (req, res) => {
  sessions.delete(req.headers["x-admin-token"]);
  res.json({ success: true });
});

// Admin: get all signups
app.get("/api/admin/users", requireAuth, (req, res) => {
  const signups = readSignups();
  const { city, role, search } = req.query;
  let results = signups;
  if (city) results = results.filter((s) => s.city === city);
  if (role) results = results.filter((s) => s.role === role);
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.contact?.toLowerCase().includes(q),
    );
  }
  res.json({ total: signups.length, filtered: results.length, users: results });
});

// Admin: export as CSV
app.get("/api/admin/export", requireAuth, (req, res) => {
  const signups = readSignups();
  const csv = toCSV(signups);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="whosenearby-waitlist.csv"',
  );
  res.send(csv);
});

// Admin: send email to one user or all users
app.post("/api/admin/email", requireAuth, async (req, res) => {
  const { to, subject, body, sendToAll } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ error: "Subject and body are required" });
  }

  try {
    if (sendToAll) {
      const signups = readSignups();
      const emailSignups = signups.filter((s) => s.contact.includes("@"));
      const results = [];
      for (const signup of emailSignups) {
        try {
          await sendEmail({
            to: signup.contact,
            subject,
            body: body.replace("{{name}}", signup.name.split(" ")[0]),
          });
          results.push({ contact: signup.contact, sent: true });
        } catch (err) {
          results.push({
            contact: signup.contact,
            sent: false,
            error: err.message,
          });
        }
      }
      return res.json({ success: true, results });
    }

    if (!to)
      return res.status(400).json({ error: "Recipient email is required" });
    await sendEmail({ to, subject, body });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`whoseNearby backend running on port ${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
});
