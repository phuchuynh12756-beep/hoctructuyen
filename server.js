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
const loadUsers = () => {
  let users;
  try { users = JSON.parse(fs.readFileSync(USERS, 'utf8')); } catch { users = {}; }
  // Tự cấp ID cho tài khoản cũ chưa có ID, không làm mất dữ liệu hiện có.
  let changed = false;
  const used = new Set(Object.values(users).map(u => u.id).filter(Boolean));
  for (const [username, u] of Object.entries(users)) {
    if (!u.id) {
      let id;
      do { id = 'HV-' + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (used.has(id));
      u.id = id; used.add(id); changed = true;
    }
  }
  if (changed) {
    try { fs.writeFileSync(USERS, JSON.stringify(users, null, 2)); } catch (e) { console.warn('Không lưu được ID người dùng:', e.message); }
  }
  return users;
};
const saveUsers = u => fs.writeFileSync(USERS, JSON.stringify(u, null, 2));
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const pub = (username, u) => ({ username, name: u.name, id: u.id, role: 'member' });

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
  let publicId;
  const existingIds = new Set(Object.values(users).map(x => x.id).filter(Boolean));
  do { publicId = 'HV-' + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (existingIds.has(publicId));
  users[username] = { id: publicId, name, salt, hash: hash(password, salt), role: 'member', created: Date.now(), settings: { ...DEFAULT_SETTINGS } };
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


/* ---------- Kết bạn, nhắn tin và gửi tệp ---------- */
const SOCIAL_FILE = path.join(DATA, 'social.json');
const UPLOAD_DIR = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
function readSocial() {
  try {
    const d = JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8'));
    return { requests: Array.isArray(d.requests) ? d.requests : [], friendships: Array.isArray(d.friendships) ? d.friendships : [], messages: Array.isArray(d.messages) ? d.messages : [] };
  } catch { return { requests: [], friendships: [], messages: [] }; }
}
function writeSocial(d) { fs.writeFileSync(SOCIAL_FILE, JSON.stringify(d, null, 2)); }
function findUserById(id) {
  const users = loadUsers();
  for (const [username, u] of Object.entries(users)) if (u.id && u.id.toUpperCase() === String(id || '').trim().toUpperCase()) return { username, ...pub(username, u) };
  return null;
}
function friendPair(a, b) { return [a, b].sort().join('|'); }
function areFriends(db, a, b) { return db.friendships.some(f => friendPair(f.a, f.b) === friendPair(a, b)); }
function publicUser(username) { const u = loadUsers()[username]; return u ? pub(username, u) : null; }
app.get('/api/social', auth, (req, res) => {
  const db = readSocial(), me = req.user.username;
  const users = loadUsers();
  const friends = db.friendships.filter(f => f.a === me || f.b === me).map(f => publicUser(f.a === me ? f.b : f.a)).filter(Boolean);
  const incoming = db.requests.filter(r => r.to === me && r.status === 'pending').map(r => ({ ...r, user: publicUser(r.from) })).filter(r => r.user);
  const outgoing = db.requests.filter(r => r.from === me && r.status === 'pending').map(r => ({ ...r, user: publicUser(r.to) })).filter(r => r.user);
  const conversations = {};
  for (const m of db.messages) {
    if (m.from !== me && m.to !== me) continue;
    const other = m.from === me ? m.to : m.from;
    if (!conversations[other] || conversations[other].createdAt < m.createdAt) conversations[other] = { user: publicUser(other), lastMessage: m.text || (m.attachment ? '📎 ' + m.attachment.name : ''), createdAt: m.createdAt };
  }
  res.json({ me: req.user, friends, incoming, outgoing, conversations: Object.values(conversations).filter(c => c.user).sort((a,b) => b.createdAt-a.createdAt) });
});
app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const users = loadUsers(), results = [];
  for (const [username, u] of Object.entries(users)) {
    if (username === req.user.username) continue;
    if (String(u.id || '').toLowerCase().includes(q) || username.toLowerCase().includes(q) || String(u.name || '').toLowerCase().includes(q)) {
      results.push(pub(username, u));
      if (results.length >= 20) break;
    }
  }
  res.json({ users: results });
});
app.post('/api/friends/request', auth, (req, res) => {
  const target = findUserById(req.body.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy ID người dùng.' });
  const me = req.user.username, to = target.username;
  if (me === to) return res.status(400).json({ error: 'Bạn không thể kết bạn với chính mình.' });
  const db = readSocial();
  if (areFriends(db, me, to)) return res.status(409).json({ error: 'Hai bạn đã là bạn bè.' });
  const pending = db.requests.find(r => r.from === me && r.to === to && r.status === 'pending');
  if (pending) return res.status(409).json({ error: 'Bạn đã gửi lời mời rồi.' });
  const reverse = db.requests.find(r => r.from === to && r.to === me && r.status === 'pending');
  if (reverse) {
    reverse.status = 'accepted';
    db.friendships.push({ a: me, b: to, createdAt: Date.now() });
  } else {
    db.requests.push({ id: crypto.randomUUID(), from: me, to, status: 'pending', createdAt: Date.now() });
  }
  writeSocial(db);
  res.json({ ok: true, message: reverse ? 'Hai bạn đã kết bạn!' : 'Đã gửi lời mời kết bạn.' });
});
app.post('/api/friends/respond', auth, (req, res) => {
  const db = readSocial();
  const r = db.requests.find(x => x.id === req.body.requestId && x.to === req.user.username && x.status === 'pending');
  if (!r) return res.status(404).json({ error: 'Không tìm thấy lời mời.' });
  if (req.body.accept) {
    r.status = 'accepted';
    if (!areFriends(db, r.from, r.to)) db.friendships.push({ a: r.from, b: r.to, createdAt: Date.now() });
  } else r.status = 'rejected';
  writeSocial(db); res.json({ ok: true });
});
app.get('/api/messages/:username', auth, (req, res) => {
  const other = String(req.params.username || '');
  const db = readSocial();
  if (!areFriends(db, req.user.username, other)) return res.status(403).json({ error: 'Chỉ bạn bè mới có thể nhắn tin.' });
  const messages = db.messages.filter(m => (m.from === req.user.username && m.to === other) || (m.from === other && m.to === req.user.username)).slice(-200);
  res.json({ messages: messages.map(m => ({ id:m.id, from:m.from, to:m.to, text:m.text, attachment:m.attachment || null, createdAt:m.createdAt })) });
});
const SAFE_FILES = {
  png:{mime:'image/png', image:true}, jpg:{mime:'image/jpeg',image:true}, jpeg:{mime:'image/jpeg',image:true},
  gif:{mime:'image/gif',image:true}, webp:{mime:'image/webp',image:true}, bmp:{mime:'image/bmp',image:true}, avif:{mime:'image/avif',image:true}, tif:{mime:'image/tiff'}, tiff:{mime:'image/tiff'}, heic:{mime:'image/heic'}, heif:{mime:'image/heif'}, ico:{mime:'image/x-icon'}, svg:{mime:'image/svg+xml'},
  pdf:{mime:'application/pdf'}, txt:{mime:'text/plain'}, csv:{mime:'text/csv'},
  doc:{mime:'application/msword'}, docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}, docm:{mime:'application/vnd.ms-word.document.macroEnabled.12'}, dot:{mime:'application/msword'}, dotx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.template'},
  ppt:{mime:'application/vnd.ms-powerpoint'}, pptx:{mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}, pptm:{mime:'application/vnd.ms-powerpoint.presentation.macroEnabled.12'}, pps:{mime:'application/vnd.ms-powerpoint'}, ppsx:{mime:'application/vnd.openxmlformats-officedocument.presentationml.slideshow'},
  xls:{mime:'application/vnd.ms-excel'}, xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}, xlsm:{mime:'application/vnd.ms-excel.sheet.macroEnabled.12'}, xlsb:{mime:'application/vnd.ms-excel.sheet.binary.macroEnabled.12'}, xltx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.template'},
  odt:{mime:'application/vnd.oasis.opendocument.text'}, ods:{mime:'application/vnd.oasis.opendocument.spreadsheet'},
  odp:{mime:'application/vnd.oasis.opendocument.presentation'}, rtf:{mime:'application/rtf'}
};
app.post('/api/messages/:username', auth, (req, res) => {
  const other = String(req.params.username || ''), me = req.user.username;
  const db = readSocial();
  if (!areFriends(db, me, other)) return res.status(403).json({ error: 'Chỉ bạn bè mới có thể nhắn tin.' });
  const text = String(req.body.text || '').trim().slice(0, 5000);
  let attachment = null;
  if (req.body.file) {
    const f = req.body.file;
    const name = path.basename(String(f.name || 'tep-tin')).slice(0, 180);
    const ext = path.extname(name).slice(1).toLowerCase();
    const rule = SAFE_FILES[ext];
    if (!rule) return res.status(415).json({ error: 'Loại tệp chưa được hỗ trợ. Hãy gửi ảnh, PDF hoặc tài liệu văn phòng phổ biến.' });
    const match = String(f.data || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) return res.status(400).json({ error: 'Dữ liệu tệp không hợp lệ.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Mỗi tệp tối đa 8 MB.' });
    const suppliedMime = String(f.mime || match[1]).toLowerCase();
    if (rule.mime !== suppliedMime && suppliedMime !== 'application/octet-stream' && !(ext === 'jpg' && suppliedMime === 'image/jpeg') && !(ext === 'txt' && suppliedMime === 'text/plain')) {
      return res.status(415).json({ error: 'Định dạng tệp không khớp với phần mở rộng.' });
    }
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(UPLOAD_DIR, id + '.' + ext), buffer, { flag: 'wx' });
    attachment = { id, name, size: buffer.length, mime: rule.mime, ext, image: !!rule.image };
  }
  if (!text && !attachment) return res.status(400).json({ error: 'Nhập tin nhắn hoặc chọn tệp.' });
  const message = { id: crypto.randomUUID(), from: me, to: other, text, attachment, createdAt: Date.now() };
  db.messages.push(message);
  if (db.messages.length > 10000) db.messages = db.messages.slice(-10000);
  writeSocial(db);
  res.json({ ok: true, message: { id:message.id, from:me, to:other, text, attachment, createdAt:message.createdAt } });
});
app.get('/api/files/:id', auth, (req, res) => {
  const db = readSocial(), id = String(req.params.id || '');
  const m = db.messages.find(x => x.attachment && x.attachment.id === id && (x.from === req.user.username || x.to === req.user.username));
  if (!m) return res.status(404).json({ error: 'Không tìm thấy tệp hoặc bạn không có quyền xem.' });
  const f = m.attachment, filePath = path.join(UPLOAD_DIR, f.id + '.' + f.ext);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Tệp không còn trên máy chủ.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', f.mime);
  const inline = !!f.image;
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(filePath);
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
    const type = ['choice','truefalse','short','essay','media'].includes(q.type) ? q.type : (Array.isArray(q.options) && q.options.length ? 'choice' : 'essay');
    const item = { type, q: String(q.q || '').trim().slice(0, 8000), explain: String(q.explain || '').slice(0, 4000) };
    if (typeof q.mediaUrl === 'string' && /^\/data\/exam-media\/[a-f0-9-]+\.(?:jpg|png|webp|gif|mp4|webm|mov)$/i.test(q.mediaUrl)) { item.mediaUrl = q.mediaUrl; item.mediaType = q.mediaType === 'video' ? 'video' : 'image'; }
    if (!item.q && !item.mediaUrl) throw new Error(`Câu ${i+1} chưa có nội dung hoặc ảnh/video`);
    if (type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new Error(`Câu ${i+1}: trắc nghiệm cần 2–8 đáp án`);
      item.options = q.options.map(x => String(x).slice(0, 2000));
      item.answer = Number.isInteger(+q.answer) && +q.answer >= 0 && +q.answer < item.options.length ? +q.answer : null;
    } else if (type === 'truefalse') {
      item.options = ['Đúng','Sai']; item.answer = q.answer === 0 || q.answer === '0' || q.answer === true ? 0 : (q.answer === 1 || q.answer === '1' || q.answer === false ? 1 : null);
    } else if (type !== 'media') {
      item.answerText = String(q.answerText || '');
    }
    return item;
  });
  return { id: crypto.randomUUID(), title: String(exam.title).trim().slice(0, 160), questions, createdBy: user.name, createdByUsername: user.username, createdAt: Date.now() };
}
// Tải ảnh/video minh họa câu hỏi; chỉ người đã đăng nhập mới được tải lên.
const EXAM_MEDIA_DIR = path.join(__dirname, 'public', 'data', 'exam-media');
fs.mkdirSync(EXAM_MEDIA_DIR, { recursive: true });
app.post('/api/exam-media', auth, (req, res) => {
  try {
    const { dataUrl, mediaType } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|webm|quicktime));base64,([\s\S]+)$/);
    if (!m) return res.status(400).json({ error: 'Chỉ hỗ trợ ảnh JPG/PNG/WEBP/GIF hoặc video MP4/WEBM/MOV.' });
    const isVideo = m[1].startsWith('video/');
    if (mediaType && mediaType !== (isVideo ? 'video' : 'image')) return res.status(400).json({ error: 'Loại tệp không khớp.' });
    const maxBytes = isVideo ? 8 * 1024 * 1024 : 5 * 1024 * 1024;
    if (m[2].length > Math.ceil(maxBytes * 4 / 3) + 16) return res.status(413).json({ error: isVideo ? 'Video tối đa 8 MB.' : 'Ảnh tối đa 5 MB.' });
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > maxBytes) return res.status(413).json({ error: isVideo ? 'Video tối đa 8 MB.' : 'Ảnh tối đa 5 MB.' });
    const ext = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov' })[m[1]];
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(EXAM_MEDIA_DIR, name), bytes, { flag: 'wx' });
    res.json({ ok: true, url: `/data/exam-media/${name}`, mediaType: isVideo ? 'video' : 'image' });
  } catch (e) { res.status(400).json({ error: 'Không tải được tệp: ' + e.message }); }
});

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
