import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.text({ type: 'text/plain;charset=utf-8' }));
app.use(express.static(__dirname));

function parseBody(body) {
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return {}; }
    }
    return body || {};
}

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
                    { label: 'مراجعة', value: r.revision_score || '' },
                    { label: 'استظهار', value: r.recitation_score || '' },
                    { label: 'إعداد', value: r.preparation_score || '' },
                    { label: 'اللغة العربية', value: r.arabe_score || '' },
                    { label: 'التربية', value: r.tarbiya_score || '' },
                    { label: 'الفرض', value: r.devoir_score || '' },
                    { label: 'ملاحظات', value: r.remarque || '' },
                    { label: 'الدرجة النهائية', value: r.final_grade || '' },
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
            if (result.rows.length === 0) {
                return res.json({ status: 'not_found' });
            }
            const r = result.rows[0];
            const results = [
                { label: 'مراجعة', value: r.revision_score },
                { label: 'استظهار', value: r.recitation_score },
                { label: 'إعداد', value: r.preparation_score },
                { label: 'اللغة العربية', value: r.arabe_score },
                { label: 'التربية', value: r.tarbiya_score },
                { label: 'الفرض', value: r.devoir_score },
                { label: 'ملاحظات', value: r.remarque },
                { label: 'الدرجة النهائية', value: r.final_grade },
            ];
            return res.json({ status: 'success', results });
        }

        if (action === 'getNews') {
            const result = await pool.query(
                'SELECT * FROM news WHERE published = true ORDER BY created_at DESC'
            );
            const newsList = result.rows.map(row => [
                row.content_ar || row.title_ar || '',
                row.content_fr || row.title_fr || ''
            ]);
            return res.json(newsList);
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
            const result = await pool.query(
                'SELECT * FROM teachers WHERE name = $1',
                [username]
            );
            if (result.rows.length === 0) {
                return res.json({ success: false, message: 'المستخدم غير موجود' });
            }
            const teacher = result.rows[0];
            const match = await bcrypt.compare(password, teacher.password_hash);
            if (!match) {
                return res.json({ success: false, message: 'كلمة المرور غير صحيحة' });
            }
            return res.json({ success: true, name: teacher.name, role: 'teacher' });
        }

        if (action === 'getStudentArchive') {
            const { student, teacher } = body;
            const history = await pool.query(
                'SELECT * FROM session_grades WHERE student_name = $1 AND teacher_name = $2 ORDER BY created_at DESC',
                [student, teacher]
            );
            if (history.rows.length === 0) {
                return res.json({ lastRow: null, history: [] });
            }
            const last = history.rows[0];
            return res.json({
                lastRow: {
                    revision: last.revision_score,
                    recitation: last.recitation_score,
                    preparation: last.preparation_score,
                    arabe: last.arabe_score,
                    tarbiya: last.tarbiya_score,
                    devoir: last.devoir_score,
                    remarque: last.remarque,
                    grade: last.final_grade
                },
                history: history.rows.map(r => ({
                    timestamp: r.session_date || new Date(r.created_at).toLocaleDateString('fr-MA'),
                    revision: r.revision_score,
                    recitation: r.recitation_score,
                    preparation: r.preparation_score,
                    arabe: r.arabe_score,
                    tarbiya: r.tarbiya_score,
                    devoir: r.devoir_score,
                    remarque: r.remarque,
                    grade: r.final_grade
                }))
            });
        }

        if (action === 'saveDashboardScores') {
            const { teacher, student, date, startTime, revision, recitation, preparation, arabe, tarbiya, devoir, remarque, finalGrade } = body;
            await pool.query(
                `INSERT INTO session_grades
                 (teacher_name, student_name, session_date, start_time,
                  revision_text, revision_score,
                  recitation_text, recitation_score,
                  preparation_text, preparation_score,
                  arabe_text, arabe_score,
                  tarbiya_text, tarbiya_score,
                  devoir_text, devoir_score,
                  remarque, final_grade)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [
                    teacher, student, date, startTime,
                    revision?.text, revision?.score,
                    recitation?.text, recitation?.score,
                    preparation?.text, preparation?.score,
                    arabe?.text, arabe?.score,
                    tarbiya?.text, tarbiya?.score,
                    devoir?.text, devoir?.score,
                    remarque, finalGrade
                ]
            );
            return res.json({ status: 'success' });
        }

        if (action === 'saveTeacherRatings') {
            const { name: student, ratings, teacher } = body;
            const fieldMap = {
                'مراجعة': 'revision_score',
                'استظهار': 'recitation_score',
                'إعداد': 'preparation_score',
                'اللغة العربية': 'arabe_score',
                'التربية': 'tarbiya_score',
                'الفرض': 'devoir_score',
                'ملاحظات': 'remarque',
                'الدرجة النهائية': 'final_grade'
            };
            const vals = {};
            (ratings || []).forEach(r => {
                const col = fieldMap[r.field];
                if (col) vals[col] = r.value;
            });
            await pool.query(
                `INSERT INTO session_grades
                 (teacher_name, student_name, revision_score, recitation_score, preparation_score,
                  arabe_score, tarbiya_score, devoir_score, remarque, final_grade)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                    teacher || 'unknown', student,
                    vals.revision_score, vals.recitation_score, vals.preparation_score,
                    vals.arabe_score, vals.tarbiya_score, vals.devoir_score,
                    vals.remarque, vals.final_grade
                ]
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Académie ETCAN server running on port ${PORT}`);
});
