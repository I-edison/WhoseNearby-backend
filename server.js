// whoseNearby — Waitlist Backend Server
// Node.js + Express + PostgreSQL (Supabase)

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const BREVO_API_KEY = process.env.BREVO_API_KEY;
//const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signups (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      contact    TEXT NOT NULL UNIQUE,
      city       TEXT NOT NULL,
      role       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("Database ready");
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ADMIN_USERS = [
  { username: "admin", password: process.env.ADMIN_PASSWORD || "admin" },
  {
    username: "team",
    password: process.env.TEAM_PASSWORD || "change_this_too",
  },
];

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

const sessions = new Set();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(__dirname));

// ── HELPERS ──────────────────────────────────────────────────────────────────
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
  const headers = ["ID", "Name", "Contact", "City", "Role", "Signed up"];
  const rows = signups.map((s) =>
    [
      s.id,
      `"${s.name || ""}"`,
      `"${s.contact || ""}"`,
      `"${s.city || ""}"`,
      `"${s.role || ""}"`,
      `"${s.created_at || ""}"`,
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

/* async function sendEmail({ to, subject, body }) {
  const transporter = nodemailer.createTransport(EMAIL_CONFIG);
  return transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    to,
    subject,
    html: body,
  });
} */

async function sendEmail({ to, subject, body }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_ADDRESS },
      to: [{ email: to }],
      subject,
      htmlContent: body,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo error (${response.status}): ${errBody}`);
  }

  return response.json();
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public: receive a new waitlist signup
app.post("/api/signup", async (req, res) => {
  const { name, contact, city, role } = req.body;

  if (!name || !contact || !city || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO signups (name, contact, city, role) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, contact, city, role],
    );

    const countResult = await pool.query("SELECT COUNT(*) FROM signups");
    const total = parseInt(countResult.rows[0].count);

    // Send confirmation email if contact is an email address
    if (contact.includes("@")) {
      sendEmail({
        to: contact,
        subject: `You're on the whoseNearby waitlist🎉, ${name.split(" ")[0]}!`,
        body: `
          <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#0D2818">
            <div style="background:#1B7A3E;padding:28px 32px;border-radius:12px 12px 0 0">
              <h2 style="color:#fff;margin:0;font-size:22px">
                whose<strong style="color:#B6DFC4">Nearby</strong>
              </h2>
            </div>
            <div style="padding:28px 32px;border:1px solid #DDE5DE;border-top:none;border-radius:0 0 12px 12px">
              <h3 style="font-size:20px;margin:0 0 12px">
                You're on the list, ${name.split(" ")[0]}.
              </h3>
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

    res.json({ success: true, position: total });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Already registered" });
    }
    console.error("Signup error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
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

// Admin: get all signups with optional filters
app.get("/api/admin/users", requireAuth, async (req, res) => {
  try {
    const { city, role, search } = req.query;
    let query = "SELECT * FROM signups WHERE 1=1";
    const params = [];
    let i = 1;

    if (city) {
      query += ` AND city = $${i++}`;
      params.push(city);
    }
    if (role) {
      query += ` AND role = $${i++}`;
      params.push(role);
    }
    if (search) {
      query += ` AND (LOWER(name) LIKE $${i} OR LOWER(contact) LIKE $${i})`;
      params.push(`%${search.toLowerCase()}%`);
      i++;
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    const totalResult = await pool.query("SELECT COUNT(*) FROM signups");

    res.json({
      total: parseInt(totalResult.rows[0].count),
      filtered: result.rows.length,
      users: result.rows,
    });
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ error: "Could not fetch users" });
  }
});

// Admin: export signups as CSV
app.get("/api/admin/export", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM signups ORDER BY created_at DESC",
    );
    const csv = toCSV(result.rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="whosenearby-waitlist.csv"',
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

// Admin: send email to one or all users
app.post("/api/admin/email", requireAuth, async (req, res) => {
  const { to, subject, body, sendToAll } = req.body;

  if (!subject || !body) {
    return res.status(400).json({ error: "Subject and body are required" });
  }

  try {
    if (sendToAll) {
      const result = await pool.query(
        "SELECT * FROM signups WHERE contact LIKE '%@%'",
      );
      const results = [];
      for (const user of result.rows) {
        try {
          await sendEmail({
            to: user.contact,
            subject,
            body: body.replace(/\{\{name\}\}/g, user.name.split(" ")[0]),
          });
          results.push({ contact: user.contact, sent: true });
        } catch (err) {
          results.push({
            contact: user.contact,
            sent: false,
            error: err.message,
          });
        }
      }
      return res.json({ success: true, results });
    }

    if (!to) return res.status(400).json({ error: "Recipient email required" });
    await sendEmail({ to, subject, body });
    res.json({ success: true });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`whoseNearby backend running on port ${PORT}`);
      console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
