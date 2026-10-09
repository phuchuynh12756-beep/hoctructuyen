// Chạy bằng start.bat để tự nạp .env và dùng Gemini 2.5 Flash.
// Tất cả tài khoản đều bình đẳng; không có vai trò giáo viên/người quản trị.
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
const pub = (username, u) => ({ username, name: u.name, role: 'member' });

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
  // Không phân quyền giáo viên; tất cả tài khoản đều là thành viên bình đẳng.
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = { name, salt, hash: hash(password, salt), role: 'member', created: Date.now(), settings: { ...DEFAULT_SETTINGS } };
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

// Kho đề dùng ID ổn định và username người đăng để kiểm tra quyền ở máy chủ.
function readExamDB() {
  try { const db = JSON.parse(fs.readFileSync(EXAMS, 'utf8')); db.subjects ||= []; return db; }
  catch { return { subjects: [] }; }
}
function writeExamDB(db) { fs.mkdirSync(path.dirname(EXAMS), { recursive: true }); fs.writeFileSync(EXAMS, JSON.stringify(db, null, 2)); }
function normalizeExam(exam, user) {
  if (!exam || !String(exam.title || '').trim() || !Array.isArray(exam.questions) || !exam.questions.length) throw new Error('Đề cần có tiêu đề và ít nhất một câu hỏi');
  if (exam.questions.length > 50) throw new Error('Tối đa 50 câu mỗi đề');
  const questions = exam.questions.map((q, i) => {
    const type = ['choice','truefalse','short','essay'].includes(q.type) ? q.type : (Array.isArray(q.options) && q.options.length ? 'choice' : 'essay');
    const item = { type, q: String(q.q || '').trim().slice(0, 8000), explain: String(q.explain || '').slice(0, 4000) };
    if (!item.q) throw new Error(`Câu ${i+1} chưa có nội dung`);
    if (type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new Error(`Câu ${i+1}: trắc nghiệm cần 2–8 đáp án`);
      item.options = q.options.map(x => String(x).slice(0, 2000));
      item.answer = Number.isInteger(+q.answer) && +q.answer >= 0 && +q.answer < item.options.length ? +q.answer : null;
    } else if (type === 'truefalse') {
      item.options = ['Đúng','Sai']; item.answer = q.answer === 0 || q.answer === '0' || q.answer === true ? 0 : (q.answer === 1 || q.answer === '1' || q.answer === false ? 1 : null);
    } else {
      item.answerText = String(q.answerText || '');
    }
    return item;
  });
  return { id: crypto.randomUUID(), title: String(exam.title).trim().slice(0, 160), questions, createdBy: user.name, createdByUsername: user.username, createdAt: Date.now() };
}
app.post('/api/exams', auth, (req, res) => {
  try {
    const { subject, exam } = req.body || {};
    if (!String(subject || '').trim()) return res.status(400).json({ error: 'Nhập tên môn học' });
    const normalized = normalizeExam(exam, req.user);
    const db = readExamDB();
    let sub = db.subjects.find(x => String(x.name).toLowerCase() === String(subject).trim().toLowerCase());
    if (!sub) { sub = { name: String(subject).trim().slice(0,80), exams: [] }; db.subjects.push(sub); }
    sub.exams ||= []; sub.exams.push(normalized); writeExamDB(db);
    res.json({ ok: true, id: normalized.id, title: normalized.title, count: normalized.questions.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/exams/:id', auth, (req, res) => {
  const db = readExamDB();
  for (const sub of db.subjects) {
    const idx = (sub.exams || []).findIndex(e => e.id === req.params.id);
    if (idx >= 0) {
      const exam = sub.exams[idx];
      if (!exam.createdByUsername || exam.createdByUsername !== req.user.username) return res.status(403).json({ error: 'Bạn chỉ có thể xóa đề do chính mình đăng.' });
      sub.exams.splice(idx, 1); writeExamDB(db);
      return res.json({ ok: true });
    }
  }
  res.status(404).json({ error: 'Không tìm thấy đề hoặc đề cũ chưa có mã quản lý.' });
});
app.put('/api/exams/:id', auth, (req, res) => {
  const db = readExamDB();
  for (const sub of db.subjects) {
    const idx = (sub.exams || []).findIndex(e => e.id === req.params.id);
    if (idx >= 0) {
      const old = sub.exams[idx];
      if (!old.createdByUsername || old.createdByUsername !== req.user.username) return res.status(403).json({ error: 'Bạn chỉ có thể sửa đề do chính mình đăng.' });
      try { const replacement = normalizeExam(req.body.exam, req.user); replacement.id = old.id; replacement.createdAt = old.createdAt; sub.exams[idx] = replacement; writeExamDB(db); return res.json({ ok: true }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
  }
  res.status(404).json({ error: 'Không tìm thấy đề.' });
});
app.post('/api/exams/from-image', auth, async (req, res) => {
  try {
    const { subject, title, image } = req.body || {};
    if (!String(subject || '').trim() || !image) return res.status(400).json({ error: 'Nhập môn học và tải ảnh đề lên.' });
    const m = String(image).match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/);
    if (!m) return res.status(400).json({ error: 'Ảnh phải là JPG, PNG hoặc WEBP.' });
    if (m[2].length > 10_000_000) return res.status(413).json({ error: 'Ảnh quá lớn, hãy chọn ảnh nhỏ hơn.' });
    const prompt = `Đọc nội dung ảnh đề học tập và chuyển thành JSON, không bịa phần bị mờ. Hãy giữ đúng ngôn ngữ/nội dung. Nếu không thấy đáp án thì answer để null. Hỗ trợ câu hỏi trắc nghiệm, đúng sai, trả lời ngắn và tự luận. JSON schema: {"title":"${String(title||'Đề từ ảnh').slice(0,120)}","questions":[{"type":"choice|truefalse|short|essay","q":"nội dung câu hỏi","options":["A","B"],"answer":0,"answerText":"","explain":""}]}. Với choice cần 2-8 options; truefalse có answer 0 hoặc 1; short/essay không cần options. Tối đa 50 câu. Chỉ trả JSON.`;
    const raw = await gemini({ contents: [{ role:'user', parts:[{text:prompt},{inlineData:{mimeType:m[1],data:m[2]}}] }], generationConfig:{responseMimeType:'application/json'} });
    const exam = JSON.parse(raw); exam.title = String(title || exam.title || 'Đề từ ảnh');
    const normalized = normalizeExam(exam, req.user); const db = readExamDB();
    let sub = db.subjects.find(x => String(x.name).toLowerCase() === String(subject).trim().toLowerCase());
    if (!sub) { sub = { name:String(subject).trim().slice(0,80), exams:[] }; db.subjects.push(sub); }
    sub.exams.push(normalized); writeExamDB(db);
    res.json({ok:true,title:normalized.title,count:normalized.questions.length,id:normalized.id});
  } catch (e) { res.status(500).json({error:'Không đọc được đề từ ảnh: '+e.message}); }
});
app.post('/api/generate-exam', auth, async (req, res) => {
  try {
    const { subject, topic, count = 5 } = req.body;
    if (!subject || !topic) return res.status(400).json({ error: 'Thiếu môn hoặc chủ đề' });
    const n = Math.min(Math.max(+count || 5, 1), 20);
    const prompt = `Soạn đề ôn tập môn ${subject}, chủ đề ${topic}, gồm ${n} câu trắc nghiệm. Trả về JSON: {"title":string,"questions":[{"type":"choice","q":string,"options":[string,string,string,string],"answer":0,"explain":string}]}. Viết tất cả công thức toán bằng LaTeX có dấu phân cách $...$ hoặc $$...$$. Dùng \\sqrt{...} cho căn, \\frac{...}{...} cho phân số, ^ cho số mũ. Ví dụ: $\\sqrt{49}$, $\\frac{3}{4}$, $x^2$. Không để dấu LaTeX trần.`;
    const raw = await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } });
    const exam = normalizeExam(JSON.parse(raw), req.user); const db = readExamDB();
    let sub = db.subjects.find(x => x.name.toLowerCase() === subject.trim().toLowerCase());
    if (!sub) { sub = { name: subject.trim(), exams: [] }; db.subjects.push(sub); }
    sub.exams.push(exam); writeExamDB(db);
    res.json({ ok: true, id: exam.id, title: exam.title, count: exam.questions.length });
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
