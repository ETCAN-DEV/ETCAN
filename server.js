import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
                    grade:       r.final_grade
                }))
            });
        }

        if (action === 'saveDashboardScores') {
            const { teacher, student, date, startTime, revision, recitation, preparation, arabe, tarbiya, devoir, remarque, finalGrade } = body;
            await pool.query(
                `INSERT INTO session_grades
                 (teacher_name, student_name, session_date, start_time,
                  revision_text, revision_score, recitation_text, recitation_score,
                  preparation_text, preparation_score, arabe_text, arabe_score,
                  tarbiya_text, tarbiya_score, devoir_text, devoir_score,
                  remarque, final_grade)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [teacher, student, date, startTime,
                 revision?.text, revision?.score, recitation?.text, recitation?.score,
                 preparation?.text, preparation?.score, arabe?.text, arabe?.score,
                 tarbiya?.text, tarbiya?.score, devoir?.text, devoir?.score,
                 remarque, finalGrade]
            );
            return res.json({ status: 'success' });
        }

        if (action === 'saveTeacherRatings') {
            const { name: student, ratings, teacher } = body;
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
                  arabe_score, tarbiya_score, devoir_score, remarque, final_grade)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [teacher || 'unknown', student,
                 vals.revision_score, vals.recitation_score, vals.preparation_score,
                 vals.arabe_score, vals.tarbiya_score, vals.devoir_score,
                 vals.remarque, vals.final_grade]
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

// ── Serve static files (must be last) ────────────────────────────────────────

app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'admin.html')));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Académie ETCAN server running on port ${PORT}`);
});
