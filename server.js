// Chạy bằng start.bat để tự nạp .env và dùng Gemini 2.5 Flash.
// Tài khoản đăng ký ĐẦU TIÊN sẽ là Giáo viên; các tài khoản sau là Học sinh.
//           SESSION_SECRET=chuỗi-bí-mật (không bắt buộc, mặc định tự sinh và lưu)
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Nạp .env trực tiếp, không cần package dotenv.
// Hỗ trợ KEY=value, KEY="value" và bỏ qua dòng trống/#comment.
(function loadDotEnv() {
  try {
    const envFile = path.join(__dirname, '.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch (e) { console.warn('Khong doc duoc .env:', e.message); }
})();

const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

const KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_SETTINGS = {
  theme: 'light',
  bgColor: '#f4f6fb',
  accent: '#4f46e5',
  fontScale: 1,
  teacherName: 'Giáo viên AI',
  personality: 'than-thien',
  address: 'minh-ban',
  responseLength: 'vua',
  teachingStyle: 'giai-thich',
  emojis: true,
  checkUnderstanding: true,
  latex: true
};
function cleanSettings(x = {}) {
  const o = { ...DEFAULT_SETTINGS, ...x };
  const allowed = {
    theme: ['light','dark','mint','sunset','custom'],
    personality: ['than-thien','nghiem-tuc','hai-huoc','khich-le','goi-mo'],
    address: ['co-thay-em','minh-ban','to-cac-ban','custom'],
    responseLength: ['ngan','vua','chi-tiet'],
    teachingStyle: ['giai-thich','tung-buoc','goi-mo','luyen-tap']
  };
  for (const k of Object.keys(allowed)) if (!allowed[k].includes(o[k])) o[k] = DEFAULT_SETTINGS[k];
  if (!/^#[0-9a-fA-F]{6}$/.test(String(o.bgColor))) o.bgColor = DEFAULT_SETTINGS.bgColor;
  if (!/^#[0-9a-fA-F]{6}$/.test(String(o.accent))) o.accent = DEFAULT_SETTINGS.accent;
  o.fontScale = Math.min(1.25, Math.max(.85, Number(o.fontScale) || 1));
  o.emojis = !!o.emojis; o.checkUnderstanding = !!o.checkUnderstanding; o.latex = !!o.latex;
  o.teacherName = String(o.teacherName || DEFAULT_SETTINGS.teacherName).slice(0, 40);
  return o;
}
function settingsFor(username) { const u = loadUsers()[username]; return cleanSettings(u?.settings); }
const DATA = path.join(__dirname, 'data');           // dữ liệu riêng tư (không public)
const USERS = path.join(DATA, 'users.json');
const EXAMS = path.join(__dirname, 'public', 'data', 'exams.json');
fs.mkdirSync(DATA, { recursive: true });

const SECRET = process.env.SESSION_SECRET || (() => {
  const f = path.join(DATA, 'secret.txt');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8');
})();

function buildSystem(settings) {
  const s = cleanSettings(settings);
  const personality = {
    'than-thien': 'thân thiện, gần gũi, kiên nhẫn',
    'nghiem-tuc': 'nghiêm túc, rõ ràng, kỷ luật nhưng không nặng nề',
    'hai-huoc': 'vui vẻ, có chút hài hước đúng lúc nhưng không làm loãng kiến thức',
    'khich-le': 'khích lệ, động viên và giúp học sinh tự tin',
    'goi-mo': 'gợi mở, ưu tiên câu hỏi dẫn dắt để học sinh tự suy luận'
  }[s.personality];
  const address = {
    'co-thay-em': 'xưng là cô/thầy và gọi người học là em',
    'minh-ban': 'xưng là mình và gọi người học là bạn',
    'to-cac-ban': 'xưng là tớ và gọi người học là các bạn',
    'custom': 'dùng cách xưng hô tự nhiên, lịch sự và không tự nhận vai trò ngoài yêu cầu của người học'
  }[s.address];
  const length = { ngan:'ngắn gọn, đi thẳng vào ý chính', vua:'độ dài vừa phải, đủ ví dụ và giải thích', 'chi-tiet':'chi tiết, chia nhỏ từng bước và có ví dụ' }[s.responseLength];
  const style = { 'giai-thich':'ưu tiên giải thích khái niệm bằng ví dụ', 'tung-buoc':'trình bày theo từng bước rõ ràng', 'goi-mo':'đặt câu hỏi gợi ý trước khi đưa đáp án hoàn chỉnh', 'luyen-tap':'kết hợp giải thích với bài tập nhỏ để luyện ngay' }[s.teachingStyle];
  return `Bạn là ${s.teacherName}, một giáo viên AI có phương pháp sư phạm tốt. Phong cách: ${personality}. ${address}. Hãy ${length}; ${style}.
Hãy ưu tiên tính chính xác, nói rõ khi đề bài thiếu dữ kiện hoặc có nhiều cách hiểu. Không bịa nguồn hay dữ kiện. ${s.checkUnderstanding ? 'Sau mỗi phần quan trọng, có thể đặt 1 câu hỏi kiểm tra ngắn nếu phù hợp.' : 'Không tự động đặt câu hỏi kiểm tra sau mỗi phần.'} ${s.emojis ? 'Có thể dùng emoji vừa phải khi giúp giao tiếp dễ gần.' : 'Không dùng emoji trừ khi người học yêu cầu.'}
${s.latex ? 'Công thức toán/lý/hóa phải viết bằng LaTeX, dùng $...$ hoặc $$...$$.' : 'Có thể viết công thức bằng văn bản dễ đọc, không bắt buộc LaTeX.'}
Trả lời bằng Markdown khi phù hợp.`;
}


app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/api/health', (req, res) => {
  res.json({ ok: true, geminiConfigured: !!process.env.GEMINI_API_KEY, model: GEMINI_MODEL });
});

/* ---------- Tài khoản ---------- */
const loadUsers = () => { try { return JSON.parse(fs.readFileSync(USERS, 'utf8')); } catch { return {}; } };
const saveUsers = u => fs.writeFileSync(USERS, JSON.stringify(u, null, 2));
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const pub = (username, u) => ({ username, name: u.name, role: u.role });

function sign(username) {
  const p = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
}
function verify(t) {
  try {
    const [p, sig] = String(t).split('.');
    const e = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
    if (!sig || sig.length !== e.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(e))) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url'));
    if (d.exp < Date.now()) return null;
    const u = loadUsers()[d.u];
    return u ? pub(d.u, u) : null;
  } catch { return null; }
}
const auth = (req, res, next) => {
  const u = verify((req.headers.authorization || '').replace('Bearer ', ''));
  if (!u) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
  req.user = u; next();
};

const fails = new Map(); // chống dò mật khẩu
function tooMany(key) { const f = fails.get(key); return f && f.n >= 8 && Date.now() - f.t < 10 * 60e3; }
function fail(key) { const f = fails.get(key); fails.set(key, { n: (f && Date.now() - f.t < 10 * 60e3 ? f.n : 0) + 1, t: Date.now() }); }

app.post('/api/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập 3-30 ký tự: chữ thường, số, _ . -' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập họ tên' });
  const users = loadUsers();
  if (users[username]) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  // Dùng nội bộ: không cần mã giáo viên. Tài khoản đầu tiên là giáo viên,
  // các tài khoản đăng ký sau là học sinh.
  const isTeacher = Object.keys(users).length === 0;
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = { name, salt, hash: hash(password, salt), role: isTeacher ? 'teacher' : 'student', created: Date.now(), settings: { ...DEFAULT_SETTINGS } };
  saveUsers(users);
  res.json({ token: sign(username), user: pub(username, users[username]) });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const key = req.ip + '|' + username;
  if (tooMany(key)) return res.status(429).json({ error: 'Sai quá nhiều lần, thử lại sau 10 phút' });
  const u = loadUsers()[username];
  const ok = u && crypto.timingSafeEqual(Buffer.from(hash(String(req.body.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) { fail(key); return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' }); }
  res.json({ token: sign(username), user: pub(username, u) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));
app.get('/api/settings', auth, (req, res) => res.json({ settings: settingsFor(req.user.username) }));
app.put('/api/settings', auth, (req, res) => {
  const users = loadUsers();
  if (!users[req.user.username]) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  users[req.user.username].settings = cleanSettings(req.body || {});
  saveUsers(users);
  res.json({ ok: true, settings: users[req.user.username].settings });
});

/* ---------- Gemini ---------- */
async function gemini(body) {
  if (!KEY) throw new Error('Chưa cấu hình GEMINI_API_KEY');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Lỗi Gemini');
  return d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

app.post('/api/chat', auth, async (req, res) => {
  try {
    const text = await gemini({ systemInstruction: { parts: [{ text: buildSystem(settingsFor(req.user.username)) }] }, contents: req.body.contents });
    res.json({ text: text || '(Không có phản hồi)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mọi tài khoản đã đăng nhập đều có thể đóng góp đề vào kho tự luyện.
app.post('/api/exams', auth, (req, res) => {
  try {
    const { subject, exam } = req.body || {};
    if (!subject || !exam || !exam.title || !Array.isArray(exam.questions) || !exam.questions.length) return res.status(400).json({ error: 'Đề chưa đủ môn, tiêu đề hoặc câu hỏi' });
    if (exam.questions.length > 50) return res.status(400).json({ error: 'Tối đa 50 câu mỗi đề' });
    const normalized = { title: String(exam.title).trim().slice(0, 160), questions: exam.questions.map((q, i) => {
      if (!q || !q.q || !Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(+q.answer) || +q.answer < 0 || +q.answer > 3) throw new Error(`Câu ${i+1} không hợp lệ`);
      return { q: String(q.q), options: q.options.map(x => String(x)), answer: +q.answer, explain: String(q.explain || '') };
    }), createdBy: req.user.name, createdAt: Date.now() };
    let db = { subjects: [] };
    try { db = JSON.parse(fs.readFileSync(EXAMS, 'utf8')); } catch {}
    db.subjects ||= [];
    let sub = db.subjects.find(x => String(x.name).toLowerCase() === String(subject).trim().toLowerCase());
    if (!sub) { sub = { name: String(subject).trim().slice(0, 80), exams: [] }; db.subjects.push(sub); }
    sub.exams ||= []; sub.exams.push(normalized);
    fs.mkdirSync(path.dirname(EXAMS), { recursive: true });
    fs.writeFileSync(EXAMS, JSON.stringify(db, null, 2));
    res.json({ ok: true, title: normalized.title, count: normalized.questions.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// AI tạo đề: mọi tài khoản đã đăng nhập đều có thể đóng góp.
app.post('/api/generate-exam', auth, async (req, res) => {
  try {
    const { subject, topic, count = 5 } = req.body;
    if (!subject || !topic) return res.status(400).json({ error: 'Thiếu môn hoặc chủ đề' });
    const n = Math.min(Math.max(+count || 5, 1), 20);
    const prompt = `Hãy soạn đề ôn trắc nghiệm gồm ${n} câu, môn "${subject}", chủ đề "${topic}", mức độ phù hợp học sinh phổ thông, mỗi câu có đúng 4 đáp án. Mọi công thức toán/lý/hóa viết bằng LaTeX trong $...$. Trả về JSON đúng dạng: {"title": string, "questions": [{"q": string, "options": [string,string,string,string], "answer": số từ 0 đến 3, "explain": string}]}`;
    const raw = await gemini({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const exam = JSON.parse(raw);
    if (!exam.questions?.length) throw new Error('AI trả về đề rỗng, thử lại');
    const db = JSON.parse(fs.readFileSync(EXAMS, 'utf8'));
    let s = db.subjects.find(x => x.name.toLowerCase() === subject.trim().toLowerCase());
    if (!s) { s = { name: subject.trim(), exams: [] }; db.subjects.push(s); }
    exam.createdBy = req.user.name; exam.createdAt = Date.now();
    s.exams.push(exam);
    fs.writeFileSync(EXAMS, JSON.stringify(db, null, 2));
    res.json({ ok: true, title: exam.title, count: exam.questions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Tín hiệu WebRTC (chỉ người đã đăng nhập) ---------- */
io.use((s, next) => {
  const u = verify(s.handshake.auth?.token);
  if (!u) return next(new Error('unauthorized'));
  s.user = u; next();
});
io.on('connection', s => {
  s.on('join', room => {
    s.join(room);
    s.room = room;
    const others = [...(io.sockets.adapter.rooms.get(room) || [])].filter(i => i !== s.id)
      .map(id => ({ id, name: io.sockets.sockets.get(id)?.user?.name }));
    s.emit('peers', others);
  });
  s.on('signal', ({ to, data }) => io.to(to).emit('signal', { from: s.id, name: s.user.name, data }));
  s.on('disconnect', () => s.room && s.to(s.room).emit('peer-left', s.id));
});

srv.listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
