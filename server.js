import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import nodemailer from 'nodemailer';
import cron from 'node-cron';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.text({ type: 'text/plain;charset=utf-8' }));

const adminTokens = new Set();

function parseBody(body) {
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return {}; }
    }
    return body || {};
}

function requireAdmin(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token || !adminTokens.has(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ── Public API ──────────────────────────────────────────────────────────────

app.get('/api', async (req, res) => {
    const action = req.query.action;
    try {
        if (action === 'getTeacherDashboardData') {
            const teacherName = req.query.teacherName;
            const studentRows = await pool.query(
                `SELECT DISTINCT student_name FROM session_grades WHERE teacher_name = $1
                 UNION
                 SELECT full_name AS student_name FROM students WHERE teacher_name = $1`,
                [teacherName]
            );
            const data = [];
            for (const row of studentRows.rows) {
                const latest = await pool.query(
                    'SELECT * FROM session_grades WHERE teacher_name = $1 AND student_name = $2 ORDER BY created_at DESC LIMIT 1',
                    [teacherName, row.student_name]
                );
                const r = latest.rows[0] || {};
                const fields = [
                    { label: 'مراجعة',        value: r.revision_score    || '' },
                    { label: 'استظهار',       value: r.recitation_score  || '' },
                    { label: 'إعداد',         value: r.preparation_score || '' },
                    { label: 'اللغة العربية', value: r.arabe_score       || '' },
                    { label: 'التربية',       value: r.tarbiya_score     || '' },
                    { label: 'الفرض',         value: r.devoir_score      || '' },
                    { label: 'ملاحظات',       value: r.remarque          || '' },
                    { label: 'الدرجة النهائية', value: r.final_grade     || '' },
                ];
                fields.forEach(f => data.push({ student: row.student_name, label: f.label, value: f.value }));
            }
            return res.json({ status: 'success', data });
        }

        if (action === 'getResult') {
            const name = req.query.name;
            const result = await pool.query(
                'SELECT * FROM session_grades WHERE student_name ILIKE $1 ORDER BY created_at DESC LIMIT 1',
                [name]
            );
            if (result.rows.length === 0) return res.json({ status: 'not_found' });
            const r = result.rows[0];
            return res.json({
                status: 'success',
                results: [
                    { label: 'مراجعة',          value: r.revision_score    },
                    { label: 'استظهار',         value: r.recitation_score  },
                    { label: 'إعداد',           value: r.preparation_score },
                    { label: 'اللغة العربية',   value: r.arabe_score       },
                    { label: 'التربية',         value: r.tarbiya_score     },
                    { label: 'الفرض',           value: r.devoir_score      },
                    { label: 'ملاحظات',         value: r.remarque          },
                    { label: 'الدرجة النهائية', value: r.final_grade       },
                ]
            });
        }

        if (action === 'getNews') {
            const result = await pool.query(
                'SELECT * FROM news WHERE published = true ORDER BY created_at DESC'
            );
            return res.json(result.rows.map(row => [
                row.content_ar || row.title_ar || '',
                row.content_fr || row.title_fr || ''
            ]));
        }

        res.json({ status: 'error', message: 'Unknown action' });
    } catch (err) {
        console.error('GET /api error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api', async (req, res) => {
    const body = parseBody(req.body);
    const action = body.action || body.type;
    try {
        if (action === 'unifiedLogin') {
            const { username, password } = body;
            const result = await pool.query('SELECT * FROM teachers WHERE name = $1', [username]);
            if (result.rows.length === 0)
                return res.json({ success: false, message: 'المستخدم غير موجود' });
            const teacher = result.rows[0];
            const match = await bcrypt.compare(password, teacher.password_hash);
            if (!match)
                return res.json({ success: false, message: 'كلمة المرور غير صحيحة' });
            return res.json({ success: true, name: teacher.name, role: 'teacher' });
        }

        if (action === 'getStudentArchive') {
            const { student, teacher } = body;
            const history = await pool.query(
                'SELECT * FROM session_grades WHERE student_name = $1 AND teacher_name = $2 ORDER BY created_at DESC',
                [student, teacher]
            );
            if (history.rows.length === 0) return res.json({ lastRow: null, history: [] });
            const last = history.rows[0];
            return res.json({
                lastRow: {
                    revision:    last.revision_score,
                    recitation:  last.recitation_score,
                    preparation: last.preparation_score,
                    arabe:       last.arabe_score,
                    tarbiya:     last.tarbiya_score,
                    devoir:      last.devoir_score,
                    remarque:    last.remarque,
                    grade:       last.final_grade
                },
                history: history.rows.map(r => ({
                    timestamp:   r.session_date || new Date(r.created_at).toLocaleDateString('fr-MA'),
                    revision:    r.revision_score,
                    recitation:  r.recitation_score,
                    preparation: r.preparation_score,
                    arabe:       r.arabe_score,
                    tarbiya:     r.tarbiya_score,
                    devoir:      r.devoir_score,
                    remarque:    r.remarque,
                    grade:       r.final_grade,
                    attendance:  r.attendance
                }))
            });
        }

        if (action === 'saveDashboardScores') {
            const { teacher, student, date, startTime, revision, recitation, preparation, arabe, tarbiya, devoir, remarque, finalGrade, attendance } = body;
            await pool.query(
                `INSERT INTO session_grades
                 (teacher_name, student_name, session_date, start_time,
                  revision_text, revision_score, recitation_text, recitation_score,
                  preparation_text, preparation_score, arabe_text, arabe_score,
                  tarbiya_text, tarbiya_score, devoir_text, devoir_score,
                  remarque, final_grade, attendance)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                [teacher, student, date, startTime,
                 revision?.text, revision?.score, recitation?.text, recitation?.score,
                 preparation?.text, preparation?.score, arabe?.text, arabe?.score,
                 tarbiya?.text, tarbiya?.score, devoir?.text, devoir?.score,
                 remarque, finalGrade, attendance || 'present']
            );
            return res.json({ status: 'success' });
        }

        if (action === 'saveTeacherRatings') {
            const { name: student, ratings, teacher, attendance } = body;
            const fieldMap = {
                'مراجعة': 'revision_score', 'استظهار': 'recitation_score',
                'إعداد': 'preparation_score', 'اللغة العربية': 'arabe_score',
                'التربية': 'tarbiya_score', 'الفرض': 'devoir_score',
                'ملاحظات': 'remarque', 'الدرجة النهائية': 'final_grade'
            };
            const vals = {};
            (ratings || []).forEach(r => { const col = fieldMap[r.field]; if (col) vals[col] = r.value; });
            await pool.query(
                `INSERT INTO session_grades
                 (teacher_name, student_name, revision_score, recitation_score, preparation_score,
                  arabe_score, tarbiya_score, devoir_score, remarque, final_grade, attendance)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [teacher || 'unknown', student,
                 vals.revision_score, vals.recitation_score, vals.preparation_score,
                 vals.arabe_score, vals.tarbiya_score, vals.devoir_score,
                 vals.remarque, vals.final_grade, attendance || 'present']
            );
            return res.json({ success: true });
        }

        if (action === 'register') {
            const { name, phone, course } = body;
            await pool.query(
                'INSERT INTO registrations (full_name, phone, status) VALUES ($1, $2, $3)',
                [name, phone, 'pending']
            );
            return res.json({ success: true });
        }

        res.json({ status: 'error', message: 'Unknown action' });
    } catch (err) {
        console.error('POST /api error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ── Teacher Auth ─────────────────────────────────────────────────────────────

const teacherTokens = new Map(); // token → teacherName

function requireTeacher(req, res, next) {
    const auth  = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token || !teacherTokens.has(token)) return res.status(401).json({ error: 'Unauthorized' });
    req.teacherName = teacherTokens.get(token);
    next();
}

app.get('/teacher', (req, res) => res.sendFile(join(__dirname, 'teacher-portal.html')));

app.post('/teacher/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const result = await pool.query('SELECT * FROM teachers WHERE name = $1', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Enseignant introuvable' });
    const teacher = result.rows[0];
    const match = await bcrypt.compare(password, teacher.password_hash);
    if (!match) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = crypto.randomBytes(32).toString('hex');
    teacherTokens.set(token, teacher.name);
    res.json({ token, name: teacher.name });
});

app.post('/teacher/logout', requireTeacher, (req, res) => {
    const token = req.headers['authorization'].replace('Bearer ', '').trim();
    teacherTokens.delete(token);
    res.json({ ok: true });
});

app.get('/api/teacher/students', requireTeacher, async (req, res) => {
    const rows = await pool.query(
        `SELECT s.id, s.full_name, s.phone, s.email, s.enrolled_at,
                c.name_fr AS course_fr, c.name_ar AS course_ar
         FROM students s
         LEFT JOIN courses c ON c.id = s.course_id
         WHERE s.teacher_name = $1
         ORDER BY s.full_name`, [req.teacherName]
    );
    res.json(rows.rows);
});

app.get('/api/teacher/grades', requireTeacher, async (req, res) => {
    const rows = await pool.query(
        `SELECT student_name, session_date, created_at, attendance,
                revision_score, recitation_score, preparation_score,
                arabe_score, tarbiya_score, devoir_score, remarque, final_grade
         FROM session_grades
         WHERE teacher_name = $1
         ORDER BY COALESCE(session_date::date, created_at::date) DESC
         LIMIT 300`, [req.teacherName]
    );
    res.json(rows.rows);
});

// ── Admin Auth ───────────────────────────────────────────────────────────────

app.post('/admin/login', async (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPassword) return res.status(401).json({ error: 'Wrong password' });
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.add(token);
    res.json({ token });
});

app.post('/admin/logout', requireAdmin, (req, res) => {
    const token = req.headers['authorization'].replace('Bearer ', '').trim();
    adminTokens.delete(token);
    res.json({ ok: true });
});

// ── Admin: Teachers ──────────────────────────────────────────────────────────

app.get('/admin/teachers', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT id, name, email, created_at FROM teachers ORDER BY created_at DESC');
    res.json(result.rows);
});

app.post('/admin/teachers', requireAdmin, async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
    const hash = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query(
            'INSERT INTO teachers (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
            [name, email || null, hash]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
        throw err;
    }
});

app.delete('/admin/teachers/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM teachers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

// ── Admin: Students ──────────────────────────────────────────────────────────

app.get('/admin/students', requireAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT s.id, s.full_name, s.teacher_name, s.email, s.phone,
                c.name_fr AS course_name, s.enrolled_at
         FROM students s
         LEFT JOIN courses c ON s.course_id = c.id
         ORDER BY s.enrolled_at DESC`
    );
    res.json(result.rows);
});

app.post('/admin/students', requireAdmin, async (req, res) => {
    const { full_name, teacher_name, email, phone, course_id } = req.body;
    if (!full_name) return res.status(400).json({ error: 'full_name required' });
    const result = await pool.query(
        'INSERT INTO students (full_name, teacher_name, email, phone, course_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [full_name, teacher_name || null, email || null, phone || null, course_id || null]
    );
    res.json(result.rows[0]);
});

app.delete('/admin/students/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM students WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

// ── Admin: Courses ───────────────────────────────────────────────────────────

app.get('/admin/courses', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM courses ORDER BY created_at DESC');
    res.json(result.rows);
});

app.post('/admin/courses', requireAdmin, async (req, res) => {
    const { name_fr, name_ar, category } = req.body;
    if (!name_fr) return res.status(400).json({ error: 'name_fr required' });
    const result = await pool.query(
        'INSERT INTO courses (name_fr, name_ar, category) VALUES ($1,$2,$3) RETURNING *',
        [name_fr, name_ar || null, category || null]
    );
    res.json(result.rows[0]);
});

app.delete('/admin/courses/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

// ── Admin: News ──────────────────────────────────────────────────────────────

app.get('/admin/news', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json(result.rows);
});

app.post('/admin/news', requireAdmin, async (req, res) => {
    const { title_fr, title_ar, content_fr, content_ar } = req.body;
    if (!content_fr && !content_ar) return res.status(400).json({ error: 'Content required' });
    const result = await pool.query(
        'INSERT INTO news (title_fr, title_ar, content_fr, content_ar) VALUES ($1,$2,$3,$4) RETURNING *',
        [title_fr || null, title_ar || null, content_fr || null, content_ar || null]
    );
    res.json(result.rows[0]);
});

app.patch('/admin/news/:id/toggle', requireAdmin, async (req, res) => {
    const result = await pool.query(
        'UPDATE news SET published = NOT published WHERE id = $1 RETURNING published',
        [req.params.id]
    );
    res.json(result.rows[0]);
});

app.delete('/admin/news/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

// ── Admin: Registrations ─────────────────────────────────────────────────────

app.get('/admin/registrations', requireAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT r.*, c.name_fr AS course_name
         FROM registrations r
         LEFT JOIN courses c ON r.course_id = c.id
         ORDER BY r.submitted_at DESC`
    );
    res.json(result.rows);
});

app.patch('/admin/registrations/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query(
        'UPDATE registrations SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
    );
    res.json(result.rows[0]);
});

// ── Admin: Grades (read-only overview) ───────────────────────────────────────

app.get('/admin/grades', requireAdmin, async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM session_grades ORDER BY created_at DESC LIMIT 200'
    );
    res.json(result.rows);
});

// ── Admin: Statistics ─────────────────────────────────────────────────────────

app.get('/admin/stats', requireAdmin, async (req, res) => {
    const [
        counts,
        regCounts,
        sessionsByMonth,
        avgByTeacher,
        topStudents,
        recentSessions
    ] = await Promise.all([
        pool.query(`
            SELECT
                (SELECT COUNT(*) FROM teachers)     AS teachers,
                (SELECT COUNT(*) FROM students)     AS students,
                (SELECT COUNT(*) FROM courses)      AS courses,
                (SELECT COUNT(*) FROM news WHERE published = true) AS news,
                (SELECT COUNT(*) FROM session_grades) AS sessions_total,
                (SELECT COUNT(*) FROM session_grades
                 WHERE created_at >= date_trunc('month', NOW())) AS sessions_this_month
        `),
        pool.query(`
            SELECT status, COUNT(*) AS count
            FROM registrations GROUP BY status
        `),
        pool.query(`
            SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                   COUNT(*) AS sessions
            FROM session_grades
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY 1 ORDER BY date_trunc('month', created_at)
        `),
        pool.query(`
            SELECT teacher_name,
                   COUNT(*) AS sessions,
                   ROUND(AVG(NULLIF(final_grade, '')::numeric), 1) AS avg_grade
            FROM session_grades
            WHERE final_grade IS NOT NULL AND final_grade != ''
            GROUP BY teacher_name ORDER BY sessions DESC
        `),
        pool.query(`
            SELECT student_name,
                   COUNT(*) AS sessions,
                   ROUND(AVG(NULLIF(final_grade, '')::numeric), 1) AS avg_grade
            FROM session_grades
            WHERE final_grade IS NOT NULL AND final_grade != ''
            GROUP BY student_name
            ORDER BY avg_grade DESC NULLS LAST LIMIT 10
        `),
        pool.query(`
            SELECT teacher_name, student_name, final_grade, session_date, created_at
            FROM session_grades ORDER BY created_at DESC LIMIT 10
        `)
    ]);

    const regMap = {};
    regCounts.rows.forEach(r => { regMap[r.status] = parseInt(r.count); });

    res.json({
        counts: counts.rows[0],
        registrations: regMap,
        sessionsByMonth: sessionsByMonth.rows,
        avgByTeacher: avgByTeacher.rows,
        topStudents: topStudents.rows,
        recentSessions: recentSessions.rows
    });
});

// ── Absence alerts (shared SQL) ───────────────────────────────────────────────

async function fetchAbsenceAlerts(teacherFilter = null) {
    const params = [];
    const teacherWhere = teacherFilter ? `AND sg.teacher_name = $1` : '';
    if (teacherFilter) params.push(teacherFilter);

    const sql = `
        WITH ranked AS (
            SELECT student_name, teacher_name, attendance,
                   ROW_NUMBER() OVER (
                       PARTITION BY student_name
                       ORDER BY COALESCE(session_date::date, created_at::date) DESC
                   ) AS rn
            FROM session_grades
            WHERE TRUE ${teacherWhere}
        ),
        last3 AS (
            SELECT student_name, teacher_name,
                   COUNT(*)                                                        AS total_recent,
                   SUM(CASE WHEN attendance = 'absent' THEN 1 ELSE 0 END)         AS absent_streak
            FROM ranked WHERE rn <= 3
            GROUP BY student_name, teacher_name
        )
        SELECT l.student_name, l.teacher_name,
               l.absent_streak::int,
               s.id AS student_id,
               (SELECT COALESCE(session_date::text, created_at::text)
                FROM session_grades sg2
                WHERE sg2.student_name = l.student_name
                ORDER BY COALESCE(session_date::date, created_at::date) DESC
                LIMIT 1) AS last_session
        FROM last3 l
        LEFT JOIN students s ON s.full_name = l.student_name
        WHERE l.absent_streak >= 3 AND l.total_recent = 3
        ORDER BY l.absent_streak DESC, l.student_name`;
    const result = await pool.query(sql, params);
    return result.rows;
}

app.get('/admin/absence-alerts', requireAdmin, async (req, res) => {
    try { res.json(await fetchAbsenceAlerts()); }
    catch (err) { console.error('absence-alerts error:', err); res.status(500).json({ error: err.message }); }
});

app.get('/api/teacher/absence-alerts', requireTeacher, async (req, res) => {
    try { res.json(await fetchAbsenceAlerts(req.teacherName)); }
    catch (err) { console.error('teacher absence-alerts error:', err); res.status(500).json({ error: err.message }); }
});

// ── Public student report ────────────────────────────────────────────────────

app.get('/report/:id', (req, res) => res.sendFile(join(__dirname, 'report.html')));

app.get('/api/report/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
        const [studentRes, gradesRes] = await Promise.all([
            pool.query(
                `SELECT s.id, s.full_name, s.teacher_name, s.phone, s.email, s.enrolled_at,
                        c.name_fr AS course_fr, c.name_ar AS course_ar
                 FROM students s
                 LEFT JOIN courses c ON c.id = s.course_id
                 WHERE s.id = $1`, [id]
            ),
            pool.query(
                `SELECT session_date, created_at,
                        revision_score, recitation_score, preparation_score,
                        arabe_score, tarbiya_score, devoir_score, remarque, final_grade,
                        attendance
                 FROM session_grades
                 WHERE student_name = (SELECT full_name FROM students WHERE id = $1)
                 ORDER BY COALESCE(session_date::date, created_at::date) DESC`, [id]
            )
        ]);
        if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found' });
        res.json({ student: studentRes.rows[0], grades: gradesRes.rows });
    } catch (err) {
        console.error('/api/report error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Email system ─────────────────────────────────────────────────────────────

function makeTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587'),
        secure: parseInt(SMTP_PORT || '587') === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
}

function digestEmailHtml(teacher, weekSessions, alerts, weekLabel) {
    const totalSessions = weekSessions.length;
    const presentCount  = weekSessions.filter(s => !s.attendance || s.attendance === 'present').length;
    const lateCount     = weekSessions.filter(s => s.attendance === 'late').length;
    const absentCount   = weekSessions.filter(s => s.attendance === 'absent').length;
    const finals        = weekSessions.map(s => parseFloat(s.final_grade)).filter(v => !isNaN(v));
    const avgGrade      = finals.length ? (finals.reduce((a,b)=>a+b,0)/finals.length).toFixed(1) : '—';

    const sessionRows = weekSessions.length
        ? weekSessions.map(s => `
            <tr>
              <td style="padding:9px 12px;border-bottom:1px solid #e8ecf2">${s.student_name}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #e8ecf2;text-align:center">
                ${s.attendance === 'absent' ? '<span style="color:#c62828;font-weight:700">✘ Absent</span>'
                  : s.attendance === 'late'   ? '<span style="color:#e65100;font-weight:700">⏱ Retard</span>'
                  : '<span style="color:#2e7d32;font-weight:700">✔ Présent</span>'}
              </td>
              <td style="padding:9px 12px;border-bottom:1px solid #e8ecf2;text-align:center;font-weight:700;color:${
                  parseFloat(s.final_grade)>=14 ? '#2e7d32' : parseFloat(s.final_grade)>=10 ? '#e65100' : '#c62828'
              }">${s.final_grade ?? '—'}/20</td>
              <td style="padding:9px 12px;border-bottom:1px solid #e8ecf2;color:#6c7a95;font-size:.85em">${s.remarque || ''}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="padding:20px;text-align:center;color:#6c7a95">Aucune séance cette semaine.</td></tr>`;

    const alertRows = alerts.length
        ? alerts.map(a => `
            <tr>
              <td style="padding:9px 12px;border-bottom:1px solid #fde8e8;color:#c62828;font-weight:700">${a.student_name}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #fde8e8">⚠️ ${a.absent_streak} absences consécutives</td>
            </tr>`).join('')
        : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f6fa;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="background:#1e3a5f;border-radius:14px 14px 0 0;padding:28px 32px">
    <table width="100%"><tr>
      <td><span style="font-size:1.6rem">🎓</span></td>
      <td style="padding-left:12px">
        <div style="color:white;font-size:1.1rem;font-weight:700">Académie ETCAN</div>
        <div style="color:#c8a94e;font-size:.85rem">Résumé hebdomadaire — ${weekLabel}</div>
      </td>
      <td align="right"><div style="color:rgba(255,255,255,.7);font-size:.82rem;direction:rtl">ملخص أسبوعي</div></td>
    </tr></table>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="background:white;padding:24px 32px 16px">
    <p style="color:#1a1a2e;font-size:1rem;margin:0 0 6px">Bonjour <strong>${teacher.name}</strong>,</p>
    <p style="color:#6c7a95;font-size:.88rem;margin:0">Voici le résumé de vos séances pour la semaine du <strong>${weekLabel}</strong>.</p>
  </td></tr>

  <!-- Stats row -->
  <tr><td style="background:white;padding:0 32px 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="background:#f4f6fa;border-radius:10px;padding:14px;width:25%">
          <div style="font-size:1.6rem;font-weight:700;color:#1e3a5f">${totalSessions}</div>
          <div style="font-size:.74rem;color:#6c7a95">Séances</div>
        </td>
        <td width="8"></td>
        <td align="center" style="background:#f0faf0;border-radius:10px;padding:14px;width:25%">
          <div style="font-size:1.6rem;font-weight:700;color:#2e7d32">${presentCount}</div>
          <div style="font-size:.74rem;color:#6c7a95">Présents</div>
        </td>
        <td width="8"></td>
        <td align="center" style="background:#fff8f0;border-radius:10px;padding:14px;width:25%">
          <div style="font-size:1.6rem;font-weight:700;color:#e65100">${lateCount}</div>
          <div style="font-size:.74rem;color:#6c7a95">Retards</div>
        </td>
        <td width="8"></td>
        <td align="center" style="background:#fff4f4;border-radius:10px;padding:14px;width:25%">
          <div style="font-size:1.6rem;font-weight:700;color:#c62828">${absentCount}</div>
          <div style="font-size:.74rem;color:#6c7a95">Absents</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Avg grade -->
  ${avgGrade !== '—' ? `<tr><td style="background:white;padding:0 32px 24px">
    <div style="background:#f4f6fa;border-radius:10px;padding:14px 18px;display:inline-block">
      <span style="color:#6c7a95;font-size:.85rem">Moyenne des notes cette semaine : </span>
      <strong style="font-size:1.1rem;color:#1e3a5f">${avgGrade} / 20</strong>
    </div>
  </td></tr>` : ''}

  <!-- Sessions table -->
  <tr><td style="background:white;padding:0 32px 8px">
    <div style="font-size:.78rem;text-transform:uppercase;letter-spacing:.8px;color:#6c7a95;margin-bottom:12px">Séances de la semaine</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e8ecf2">
      <thead>
        <tr style="background:#1e3a5f">
          <th style="padding:10px 12px;color:white;text-align:left;font-size:.78rem">Élève</th>
          <th style="padding:10px 12px;color:white;text-align:center;font-size:.78rem">Présence</th>
          <th style="padding:10px 12px;color:white;text-align:center;font-size:.78rem">Note</th>
          <th style="padding:10px 12px;color:white;text-align:left;font-size:.78rem">Remarque</th>
        </tr>
      </thead>
      <tbody>${sessionRows}</tbody>
    </table>
  </td></tr>

  <!-- Alerts -->
  ${alertRows ? `<tr><td style="background:white;padding:20px 32px 8px">
    <div style="background:#fff8f8;border:1.5px solid #f5c6c6;border-radius:10px;padding:16px 20px">
      <div style="font-size:.85rem;font-weight:700;color:#c62828;margin-bottom:10px">⚠️ Alertes d'absences répétées</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tbody>${alertRows}</tbody>
      </table>
    </div>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="background:#1e3a5f;border-radius:0 0 14px 14px;padding:18px 32px;margin-top:4px">
    <table width="100%"><tr>
      <td><span style="color:rgba(255,255,255,.6);font-size:.76rem">Académie ETCAN — résumé automatique</span></td>
      <td align="right"><span style="color:#c8a94e;font-size:.76rem">✦ أكاديمية إتقان ✦</span></td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function sendWeeklyDigests() {
    const transporter = makeTransporter();
    if (!transporter) {
        console.log('[email] SMTP not configured — skipping weekly digest');
        return { skipped: true, reason: 'SMTP not configured' };
    }

    // Date range: last 7 days
    const since = new Date(); since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);
    const weekLabel = since.toLocaleDateString('fr-FR', { day:'2-digit', month:'long' })
        + ' – ' + new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    // Get all teachers with email
    const teachers = await pool.query(
        `SELECT id, name, email FROM teachers WHERE email IS NOT NULL AND email != '' ORDER BY name`
    );

    const results = [];
    for (const teacher of teachers.rows) {
        try {
            const [sessionsRes, alertsRaw] = await Promise.all([
                pool.query(
                    `SELECT student_name, session_date, created_at, attendance, final_grade, remarque
                     FROM session_grades
                     WHERE teacher_name = $1
                       AND COALESCE(session_date::date, created_at::date) >= $2
                     ORDER BY COALESCE(session_date::date, created_at::date) DESC`,
                    [teacher.name, sinceStr]
                ),
                fetchAbsenceAlerts(teacher.name)
            ]);

            const html = digestEmailHtml(teacher, sessionsRes.rows, alertsRaw, weekLabel);
            const from = process.env.SMTP_FROM || process.env.SMTP_USER;
            await transporter.sendMail({
                from: `"Académie ETCAN" <${from}>`,
                to: teacher.email,
                subject: `📋 Résumé hebdomadaire — ${weekLabel}`,
                html
            });
            results.push({ name: teacher.name, email: teacher.email, status: 'sent' });
            console.log(`[email] Digest sent to ${teacher.name} <${teacher.email}>`);
        } catch (err) {
            results.push({ name: teacher.name, email: teacher.email, status: 'error', error: err.message });
            console.error(`[email] Failed for ${teacher.name}:`, err.message);
        }
    }
    return { results, weekLabel };
}

// Schedule: every Monday at 08:00
cron.schedule('0 8 * * 1', () => {
    console.log('[cron] Running weekly digest…');
    sendWeeklyDigests().catch(err => console.error('[cron] Digest error:', err));
}, { timezone: 'Africa/Casablanca' });

// Admin: trigger digest manually
app.post('/admin/send-digest', requireAdmin, async (req, res) => {
    try {
        const result = await sendWeeklyDigests();
        res.json(result);
    } catch (err) {
        console.error('send-digest error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Serve static files (must be last) ────────────────────────────────────────

app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'admin.html')));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Académie ETCAN server running on port ${PORT}`);
});
