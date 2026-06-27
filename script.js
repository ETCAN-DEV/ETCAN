    
    const SCRIPT_URL = "/api";


    const lang = localStorage.getItem('currentLang') || 'fr';
document.documentElement.dir = (lang === 'fr') ? 'ltr' : 'rtl';
// ==========================================
 // 1. تحديد اللغة
if (typeof window.currentLang === 'undefined') {
    window.currentLang = localStorage.getItem('currentLang') || 'fr';
}

// 2. دالة الترجمة
function applyTranslations(lang) {
    try {
        if (!translations || !translations[lang]) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) el.textContent = translations[lang][key];
        });

        const logoName = document.querySelector('.logo-text');
        if (logoName && translations[lang]['logoText']) {
            logoName.textContent = translations[lang]['logoText'];
        }

        const langBtn = document.getElementById('lang-toggle');
        if (langBtn) langBtn.textContent = translations[lang]['langToggle'];

        const dirValue = (lang === 'fr') ? 'ltr' : 'rtl';
        document.documentElement.dir = dirValue;
        document.body.setAttribute('dir', dirValue);
    } catch (e) { console.error("Translation Error:", e); }
}

// 3. تحميل الهيدر وتفعيل القوائم (هنا الحل الجذري)
fetch("header.html")
    .then(r => r.text())
    .then(d => {
        document.getElementById("header-placeholder").innerHTML = d;
        
        // --- تفعيل القائمة هنا (بما أن الهيدر أصبح موجوداً الآن) ---
        const menuToggleBtn = document.getElementById('menuToggleBtn');
        const navList = document.getElementById('nav-list');
        
        if (menuToggleBtn && navList) {
            menuToggleBtn.onclick = () => {
                navList.classList.toggle('active');
            };
        }

        // تفعيل القوائم المنسدلة (Dropdowns)
        document.querySelectorAll('.dropdown > a').forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                link.parentElement.classList.toggle('active');
            };
        });

        // تطبيق الترجمة بعد تحميل العناصر
        applyTranslations(window.currentLang);
    })
    .catch(err => console.error("Error loading header:", err));

// 4. دالة الإغلاق عند الانتقال
function closeMenu(pageId) {
    const navList = document.getElementById('nav-list');
    if (navList) navList.classList.remove('active');
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
    if (typeof navigateTo === 'function') navigateTo(pageId);
}

// ==========================================
    function switchLanguage() {
        window.currentLang = (window.currentLang === 'ar') ? 'fr' : 'ar';
        localStorage.setItem('selectedLang', window.currentLang);
        applyTranslations(window.currentLang);
    }
        
// 1. التهيئة عند التحميل

// نستخدم load بدلاً من DOMContentLoaded لضمان تحميل الصور والعناصر الخارجية
window.addEventListener('load', () => {
    // 1. تحديد اللغة (الفرنسية كافتراضي)
    const savedLang = localStorage.getItem('currentLang') || 'fr';
    window.currentLang = savedLang;

    // 2. تطبيق الترجمة
    applyTranslations(window.currentLang);

    // 3. ضبط الاتجاه فوراً لتفادي القائمة المعكوسة
    document.documentElement.dir = (window.currentLang === 'ar') ? 'rtl' : 'ltr';

    if (typeof WEB_APP_URL === 'undefined' && typeof SCRIPT_URL !== 'undefined') {
        window.WEB_APP_URL = SCRIPT_URL;
    }
});

window.onload = function() {
    const savedName = localStorage.getItem('userName');
    if (savedName) handleLoginUIEffects("teacher", savedName);
};

// 2. إدارة الواجهة الموحدة (Auth Mode)
function switchAuthMode(mode) {
    const title = document.getElementById('authTitle');
    const authBtnText = document.getElementById('authLinkText'); 
    const submitBtn = document.getElementById('mainSubmitBtn'); 
    const toggleText = document.getElementById('authToggleText');

    if (mode === 'register') {
        title.innerText = "فتح حساب جديد في أكاديمية إتقان";
        authBtnText.innerText = "تسجيل جديد";
        submitBtn.innerText = "تسجيل";
        toggleText.innerHTML = 'لديك حساب؟ <a href="javascript:void(0)" onclick="switchAuthMode(\'login\')">دخول</a>';
    } else if (mode === 'login') {
        title.innerText = "تسجيل الدخول إلى أكاديمية إتقان";
        authBtnText.innerText = "تسجيل الدخول";
        submitBtn.innerText = "دخول";
        toggleText.innerHTML = 'ليس لديك حساب؟ <a href="javascript:void(0)" onclick="switchAuthMode(\'register\')">فتح حساب جديد</a>';
    } else if (mode === 'forgot') {
        title.innerText = "استعادة كلمة المرور";
        authBtnText.innerText = "استعادة";
        submitBtn.innerText = "إرسال رابط الاستعادة";
    }
}

// 3. دالة الدخول الموحد (تم إصلاح المتغيرات هنا)
async function handleUnifiedLogin(event) {
    if (event) event.preventDefault();

    const userInput = document.getElementById('loginUsername');
    const passInput = document.getElementById('loginPassword');
    
    if (!userInput.value || !passInput.value) {
        alert("يرجى إدخال اسم المستخدم وكلمة المرور");
        return false;
    }

    const usernameValue = userInput.value.trim();
    const passwordValue = passInput.value.trim();

    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: "unifiedLogin",
            username: usernameValue, // استخدام المتغير الصحيح
            password: passwordValue  // استخدام المتغير الصحيح
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('userName', data.name);
            handleLoginUIEffects(data.role, data.name);
            showPage(data.role === 'teacher' ? 'teacher-dashboard' : 'parent-dashboard');
        } else {
            alert("خطأ: " + (data.message || "بيانات الدخول غير صحيحة"));
        }
    })
    .catch(err => console.error("خطأ الاتصال:", err));
}


function handleLoginUIEffects(userRole, userName) {
    console.log("جارٍ تحديث واجهة المستخدم لـ: " + userName); // فحص للـ Console

    const authLi = document.getElementById('authNavLi'); 
    const welcomeLi = document.getElementById('navWelcomeLi');
    const welcomeArea = document.getElementById('navUserWelcomeArea'); 

    // إخفاء زر الدخول
    if (authLi) {
        authLi.style.display = 'none';
    } else {
        console.warn("تحذير: العنصر authNavLi غير موجود في الـ HTML");
    }

    // إظهار منطقة الترحيب وحقن زر الخروج
    if (welcomeLi && welcomeArea) {
        welcomeArea.innerHTML = `
            <span style="color: var(--secondary);">أهلاً: ${userName}</span>
            <span id="logoutBtn" style="color:red; cursor:pointer;">[خروج]</span>
        `;
        welcomeLi.style.display = 'flex'; // تأكد أن التنسيق flex يعمل
    } else {
        console.error("خطأ: العنصر navWelcomeLi أو navUserWelcomeArea غير موجود!");
    }
    
    // إذا كنت تستخدم صفحة المعلم
    if (userRole === "teacher") {
        fetchTeacherDashboardData(userName);
    }
}



// 4. التأثيرات البصرية بعد الدخول
function handleLoginUIEffects(userRole, userName) {
    const welcomeArea = document.getElementById('navUserWelcomeArea'); 
    // ... باقي الكود الخاص بك ...
    
    if (welcomeArea) {
        welcomeArea.innerHTML = `
            <span style="color: var(--secondary);">أهلاً: ${userName}</span>
            <span id="logoutBtn" style="color:red; cursor:pointer;">[خروج]</span>
        `;
    }
    // ...
}

// دالة الخروج الصحيحة
function logout() {
    const userName = localStorage.getItem('userName') || "زائرنا الكريم";
    localStorage.removeItem('userName'); 
    localStorage.removeItem('userRole');
    
    // إظهار صفحة الشكر
    document.querySelectorAll('section').forEach(sec => sec.style.display = 'none');
    document.getElementById('logout-page').style.display = 'block';
    document.getElementById('thanks-message').innerText = `شكراً لك يا ${userName}، سيتم تحويلك للرئيسية بعد قليل...`;
    
    // تحويل تلقائي بعد 3 ثوانٍ
    setTimeout(() => {
        navigateTo('home');
        // إعادة إظهار زر الدخول بعد التحويل
        document.getElementById('authNavLi').style.display = 'block';
        document.getElementById('navWelcomeLi').style.display = 'none';
    }, 3000);
}

// 5. إدارة الصفحات
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
    
    const target = document.getElementById(pageId);
    if (target) target.style.display = 'block';
}

// ... (باقي الدوال الخاصة بك: fetchTeacherDashboardData, saveFromWeb, navigateTo .. إلخ، تبقى كما هي دون تغيير)






// دالة بسيطة لضبط الزر عند تحميل الصفحة
function initNavbar() {
    const loginText = document.getElementById('loginText');
    const isLogged = checkUserSession(); // وظيفة تتحقق إذا كان المستخدم مسجلاً أم لا

    if (isLogged) {
        loginText.innerText = "لوحة التحكم"; // هنا يتغير الاسم تلقائياً
        // يمكنك أيضاً تغيير الوظيفة عند الضغط
    } else {
        loginText.innerText = "دخول المسجلين"; // الحالة الافتراضية
    }
}
// دالة إظهار وإخفاء كلمة المرور عند الضغط على العين
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('loginPassword');
    const toggleBtn = document.getElementById('togglePasswordBtn');
    if (passwordInput && toggleBtn) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.classList.remove('fa-eye');
            toggleBtn.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            toggleBtn.classList.remove('fa-eye-slash');
            toggleBtn.classList.add('fa-eye');
        }
    }
}

// ==========================================
function toggleLoginUI(isLoggedIn) {
    const loginLink = document.getElementById('loginLink');
    const loginText = document.getElementById('loginText');
    const loginLi = document.getElementById('navLoginLi');
    const registerLi = document.getElementById('navRegisterLi');

    if (isLoggedIn) {
        // حالة: المستخدم مسجل دخول
        loginText.innerText = "لوحة التحكم";
        loginLink.onclick = function() { showPage('teacher-dashboard'); };
        registerLi.style.display = 'none'; // إخفاء زر التسجيل
    } else {
        // حالة: المستخدم زائر (الوضع الافتراضي)
        loginText.innerText = "دخول / تسجيل";
        loginLink.onclick = function() { showPage('teacher-login'); };
        registerLi.style.display = 'block';
    }
}

// دالة جلب البيانات لملء قائمة التلاميذ المنسدلة للأساتذة
function fetchTeacherDashboardData(teacherName) {
    const currentUrl = typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : SCRIPT_URL;
    const url = `${currentUrl}?action=getTeacherDashboardData&teacherName=${encodeURIComponent(teacherName)}`;
    
    fetch(url)
    .then(res => res.json())
    .then(response => {
        if (response.status === "success") {
            const selector = document.getElementById('dashboardStudentSelector');
            if (selector) {
                selector.innerHTML = '<option value="">-- اختر التلميذ --</option>';
                const studentList = [...new Set(response.data.map(item => item.student))];
                
                if (studentList.length === 0) {
                    selector.innerHTML = '<option value="">لا يوجد تلاميذ مسجلين باسمك</option>';
                    return;
                }

                studentList.forEach(student => {
                    const option = document.createElement('option');
                    option.value = student;
                    option.textContent = student;
                    selector.appendChild(option);
                });
            }
            window.currentTeacherData = response.data;
        }
    })
    .catch(err => console.error("خطأ أثناء تحديث قائمة الطلاب:", err));
}

// ==========================================

// 4. نظام التنقل وإدارة المحتوى واللوحات
// ==========================================
function navigateTo(pageId) {
    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => {
        page.style.display = 'none';
        page.classList.remove('page-active');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'block';
        setTimeout(() => {
            targetPage.classList.add('page-active');
        }, 10);

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        console.log("Navigated successfully to: " + pageId);
    } else {
        console.error("Error: ID not found: " + pageId);
    }
}

// دالة عرض الأخبار ثنائية النمط: تأخذ من القاموس المحلي + تدعم الجلب الحي من الشيت
function fetchAndDisplayNews() {
    const container = document.getElementById('news-container');
    const homeHighlight = document.getElementById('home-news-highlight');

    // مصفوفة الأخبار الافتراضية محلياً من القاموس مباشرة
    const fallbackNews = [
        [translations['ar']['newsHighlight'], translations['fr']['newsHighlight']]
    ];

    function renderNews(newsList) {
        // أولاً: حقن كافة الأخبار بالتفصيل في صفحة الأخبار المستقلة
        if (container) {
            container.innerHTML = '';
            if (!newsList || newsList.length === 0) {
                container.innerHTML = `<p style="color: #a0aec0;">${translations[currentLang]['loadingNamesOption']}</p>`;
            } else {
                newsList.forEach(function(newsItem) {
                    const newsText = (currentLang === 'ar') ? newsItem[0] : newsItem[1];
                    if (!newsText) return;
                    const newsCard = document.createElement('div');
                    const isRtl = (currentLang === 'ar');
                    newsCard.style.cssText = `
                        background: #ffffff;
                        padding: 25px;
                        border-radius: 12px;
                        box-shadow: var(--shadow);
                        border-${isRtl ? 'right' : 'left'}: 5px solid var(--secondary);
                        text-align: ${isRtl ? 'right' : 'left'};
                        max-width: 800px;
                        width: 100%;
                        box-sizing: border-box;
                    `;
                    newsCard.innerHTML = `<p style="font-size: 1.1rem; color: var(--text-dark); line-height: 1.7; margin: 0;">${newsText}</p>`;
                    container.appendChild(newsCard);
                });
            }
        }

        // ثانياً: حقن أحدث خبر فقط في صندوق واجهة الصفحة الرئيسية
        if (homeHighlight) {
            homeHighlight.innerHTML = '';
            if (newsList && newsList.length > 0) {
                const latestNews = newsList[0];
                const newsText = (currentLang === 'ar') ? latestNews[0] : latestNews[1];
                if (newsText) {
                    const isRtl = (currentLang === 'ar');
                    homeHighlight.innerHTML = `
                        <div style="background: #ffffff; padding: 25px; border-radius: 15px; box-shadow: var(--shadow); border-${isRtl ? 'right' : 'left'}: 6px solid var(--secondary); text-align: ${isRtl ? 'right' : 'left'}; max-width: 800px; margin: 0 auto; width: 100%; box-sizing: border-box;">
                            <span style="background: var(--accent); color: var(--primary); padding: 4px 10px; border-radius: 6px; font-weight: 900; font-size: 0.8rem; margin-bottom: 10px; display: inline-block;">${currentLang === 'ar' ? 'آخر الأخبار' : 'Dernière Actualité'}</span>
                            <p style="font-size: 1.15rem; color: var(--text-dark); line-height: 1.7; margin-bottom: 15px;">${newsText}</p>
                            <a onclick="navigateTo('news-page')" style="color: var(--secondary); font-weight: bold; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;">
                                <span>${currentLang === 'ar' ? 'عرض كافة الأخبار' : 'Voir toutes les actualités'}</span> 
                                <i class="fas ${isRtl ? 'fa-arrow-left' : 'fa-arrow-right'}"></i>
                            </a>
                        </div>
                    `;
                }
            } else {
                homeHighlight.innerHTML = `<p style="color: #a0aec0;">${currentLang === 'ar' ? 'لا توجد أخبار حالياً.' : 'Aucune actualité pour le moment.'}</p>`;
            }
        }
    }

    fetch('/api?action=getNews')
        .then(res => res.json())
        .then(newsList => {
            if (newsList && newsList.length > 0) {
                renderNews(newsList);
            } else {
                renderNews(fallbackNews);
            }
        })
        .catch(() => {
            renderNews(fallbackNews);
        });
}
// ==========================================
// 5. معالجة النماذج (الاتصال والتسجيل والطلاب)
// ==========================================

// نموذج الاتصال (Formspree)
document.getElementById('contact-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = this;
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${currentLang === 'fr' ? 'Envoi...' : 'جاري الإرسال...'}`;
    
    try {
        const response = await fetch(form.action, {
            method: form.method,
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
            showToast(currentLang === 'fr' ? '✅ Message envoyé avec succès !' : '✅ تم إرسال رسالتك بنجاح !', 'success');
            form.reset();
        } else {
            showToast(currentLang === 'fr' ? '❌ Erreur de serveur.' : '❌ حدث خطأ في الخادم أثناء الإرسال.', 'danger');
        }
    } catch (error) {
        showToast(currentLang === 'fr' ? '❌ Erreur de connexion.' : '❌ خطأ في الاتصال بالشبكة.', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// نموذج التسجيل الجديد (شيت + واتساب)
document.getElementById('registrationForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentUrl = typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : SCRIPT_URL;
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const course = document.getElementById('regCourse').value;

    try {
        fetch(currentUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                type: "register",
                name: name,
                phone: phone,
                course: course
            })
        });
    } catch (err) { 
        console.log("Sheet registration error", err); 
    }

    let message = "";
    if (currentLang === 'fr') {
        message = `Bonjour Académie ITQAN,%0A%0A` +
                  `Je souhaite inscrire un nouvel étudiant :%0A` +
                  `*Nom complet :* ${name}%0A` +
                  `*Téléphone :* ${phone}%0A` +
                  `*Formation demandée :* ${course}%0A%0A` +
                  `Merci de bien vouloir confirmer mon inscription.`;
    } else {
        message = `السلام عليكم أكاديمية إتقان،%0A%0A` +
                  `أرغب في التسجيل بطلب جديد:%0A` +
                  `*الاسم:* ${name}%0A` +
                  `*الهاتف:* ${phone}%0A` +
                  `*الدورة:* ${course}%0A%0A` +
                  `يرجى تأكيد تسجيل طلبي.`;
    }

    const whatsappUrl = `https://wa.me/212633661441?text=${message}`;
    window.open(whatsappUrl, '_blank');

    document.getElementById('regStatus').innerHTML = translations[currentLang]['redirectingMsg'];
    showToast(translations[currentLang]['redirectingMsg'], 'success');
    this.reset();
});

// جلب نتائج الطلاب للبوابة الموحدة
async function fetchStudentResult() {
    const currentUrl = typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : SCRIPT_URL;
    const name = document.getElementById('searchName').value.trim();
    const btn = document.getElementById('searchBtn');
    const loader = document.getElementById('searchLoader');
    const resArea = document.getElementById('resultArea');

    if(!name) { 
        showToast(translations[currentLang]['enterNameAlert'], 'danger'); 
        return; 
    }

    btn.disabled = true;
    if (loader) loader.style.display = "inline-block";
    if (resArea) resArea.style.display = "none";

    try {
        const resp = await fetch(`${currentUrl}?action=getResult&name=${encodeURIComponent(name)}`);
        const data = await resp.json();

        if (data.status === "success") {
            const headingText = translations[currentLang]['studentCard'];
            document.getElementById('studentDisplayName').innerText = `${headingText} ${name}`;
            
            document.getElementById('resultDetails').innerHTML = data.results.map(r => {
                const translatedLabel = translations[currentLang]['fields'][r.label] || r.label;
                return `
                    <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #f1f5f9; text-align: start;">
                        <span style="font-weight:bold; color:#64748b;">${translatedLabel}</span>
                        <span style="font-weight:700;">${r.value || '---'}</span>
                    </div>
                `;
            }).join('');
            if (resArea) resArea.style.display = "block";
            showToast(translations[currentLang]['portalHeader'], 'success');
        } else {
            showToast(translations[currentLang]['noResultAlert'], 'danger');
        }
    } catch (e) {
        showToast(translations[currentLang]['serverErrorAlert'], 'danger');
    } finally {
        btn.disabled = false;
        if (loader) loader.style.display = "none";
    }
}

// ==========================================
// 6. لوحة تحكم المعلم (بناء الحقول، المراقبة، والحفظ)
// ==========================================

function initTeacherDashboard(teacherName) {
    const fields = ["مراجعة", "استظهار", "إعداد", "اللغة العربية", "التربية", "الفرض", "ملاحظات", "الدرجة النهائية"];
    const grid = document.getElementById('ratingGrid');
    if (grid) {
        grid.innerHTML = fields.map(f => {
            const translatedFieldLabel = translations[currentLang]['fields'][f] || f;
            return `
                <div class="form-group">
                    <label>${translatedFieldLabel}</label>
                    <input type="text" class="rating-input" data-field-origin="${f}" placeholder="--">
                </div>
            `;
        }).join('');
    }

    // إعداد مراقبة اختيار الطلاب ديناميكياً لتعبئة النقاط تلقائياً
    const selector = document.getElementById('dashboardStudentSelector') || document.getElementById('studentSelect');
    if (selector) {
        selector.addEventListener('change', function() {
            const selectedStudent = this.value;
            if (!selectedStudent || !window.currentTeacherData) return;
            
            // تصفية البيانات الخاصة بالطالب المختار
            const studentRecords = window.currentTeacherData.filter(item => item.student === selectedStudent);
            
            // تفريغ الحقول أولاً ثم تعبئتها حياً بناءً على ما هو قادم من السيرفر
            document.querySelectorAll('.rating-input').forEach(input => {
                const fieldName = input.getAttribute('data-field-origin');
                const record = studentRecords.find(r => r.label === fieldName);
                input.value = record ? record.value : "";
            });
        });
    }
}

// دالة حفظ البيانات الصافية من واجهة المعلم وإرسالها للسيرفر الموحد
async function saveFromWeb() {
    const currentUrl = typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : SCRIPT_URL;
    const selector = document.getElementById('dashboardStudentSelector') || document.getElementById('studentSelect');
    const name = selector ? selector.value : '';
    const btn = document.getElementById('saveBtnWeb');

    if (!name) {
        showToast("يرجى اختيار التلميذ أولاً", "danger");
        return;
    }

    // تجميع البيانات في شكل مصفوفة كائنات تحتوي على الحقل والقيمة بدقة لضمان توافق الشيت
    const ratings = Array.from(document.querySelectorAll('.rating-input')).map(input => {
        return {
            field: input.getAttribute('data-field-origin'),
            value: input.value.trim()
        };
    });

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${translations[currentLang]['savingBtnText']}`;

    try {
        const response = await fetch(currentUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: "saveTeacherRatings",
                name: name,
                ratings: ratings
            })
        });
        
        showToast(translations[currentLang]['saveSuccessAlert'], 'success');
        // تفريغ المدخلات بعد الحفظ الناجح
        document.querySelectorAll('.rating-input').forEach(i => i.value = "");
        if (selector) selector.value = "";
    } catch (e) {
        showToast(translations[currentLang]['saveErrorAlert'], 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-save"></i> <span>${translations[currentLang]['dashSaveBtn']}</span>`;
    }
}

// 2. تحديث التوقيت التلقائي بفارق 12 دقيقة لكل نشاط
// ==========================================
function calculateTimeline() {
    const startInput = document.getElementById('startTimeInput');
    if (!startInput) return;
    
    let baseMinutes = parseInt(startInput.value) || 0;
    const timeCells = document.querySelectorAll('.time-col');

    timeCells.forEach((cell, index) => {
        if (cell.innerText === '-' || index > 5) return; 

        let currentMinutes = baseMinutes + (index * 12);
        let hours = Math.floor(currentMinutes / 60);
        let mins = currentMinutes % 60;
        let formattedMins = mins < 10 ? '0' + mins : mins;
        
        if (hours > 0) {
            cell.innerText = `${hours}:${formattedMins}`;
        } else {
            cell.innerText = `${formattedMins}`;
        }
    });
}

// ربط الضغط على زر Enter داخل إنبوت التوقيت
const startTimeInputEl = document.getElementById('startTimeInput');
if(startTimeInputEl) {
    startTimeInputEl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { calculateTimeline(); }
    });
}

// ==========================================
// 4. ربط قائمة اختيار التلميذ وجلب الأرشيف حياً (باستخدام الثابت الموحد)
// ==========================================

function setupStudentSelectorLogic(currentTeacherName) {
    const selector = document.getElementById('dashboardStudentSelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">-- جاري تحميل تلاميذك... --</option>';
    
    // تحويل الطلب الأول إلى POST لجلب أسماء التلاميذ
    fetch(SCRIPT_URL, {
  method: 'POST',
  mode: 'cors',         // 👈 إجبار المتصفح على السماح بالاتصال المتبادل
  redirect: 'follow',   // 👈 تفعيل تتبع الروابط البديلة التي يولدها جوجل تلقائياً
  headers: {
    'Content-Type': 'text/plain;charset=utf-8'
  },
  body: JSON.stringify({
    action: "unifiedLogin",
    username: username, 
    password: password  
  })
})
    .then(res => res.json())
    .then(studentsList => {
        selector.innerHTML = '<option value="">-- اختر التلميذ --</option>';
        
        if (!studentsList || studentsList.length === 0) {
            selector.innerHTML = '<option value="">❌ لا يوجد تلاميذ مسجلين باسمك</option>';
            return;
        }

        studentsList.forEach(studentName => {
            const option = document.createElement('option');
            option.value = studentName;
            option.innerText = studentName;
            selector.appendChild(option);
        });
    })
    .catch(err => {
        console.error("خطأ:", err);
        selector.innerHTML = '<option value="">-- فشل جلب القائمة --</option>';
    });

    // تفعيل مراقبة قائمة الاختيار
    selector.onchange = null; 
    selector.addEventListener('change', function() {
        const studentName = this.value;
        if (!studentName) {
            clearDashboardForm();
            return;
        }

        document.getElementById('studentArchiveTableBody').innerHTML = `<tr><td colspan="8" style="padding:15px; color:#ff9800;"><i class="fas fa-spinner fa-spin"></i> جاري استدعاء سجلات التلميذ من DB_RESPONSES...</td></tr>`;

        // تحويل الطلب الثاني إلى POST لجلب أرشيف التلميذ المختار
        fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "getStudentArchive",
                student: studentName,
                teacher: currentTeacherName
            })
        })
        .then(res => res.json())
        .then(data => {
            // ملء خانات الإنجازات السابقة
            if(data.lastRow) {
                document.getElementById('prev_revision').innerText = data.lastRow.revision || '---';
                document.getElementById('prev_recitation').innerText = data.lastRow.recitation || '---';
                document.getElementById('prev_preparation').innerText = data.lastRow.preparation || '---';
                document.getElementById('prev_arabe').innerText = data.lastRow.arabe || '---';
                document.getElementById('prev_tarbiya').innerText = data.lastRow.tarbiya || '---';
                document.getElementById('prev_devoir').innerText = data.lastRow.devoir || '---';
                document.getElementById('prev_remarque').innerText = data.lastRow.remarque || '---';
                document.getElementById('prev_grade').innerText = data.lastRow.grade || '---';
            } else {
                const defaults = ['prev_revision', 'prev_recitation', 'prev_preparation', 'prev_arabe', 'prev_tarbiya', 'prev_devoir', 'prev_remarque', 'prev_grade'];
                defaults.forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = "---"; });
            }

            // بناء جدول الأرشيف الزمني السفلي
            const archiveBody = document.getElementById('studentArchiveTableBody');
            if (data.history && data.history.length > 0) {
                archiveBody.innerHTML = data.history.map(row => `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 10px; background:#fdfbf7;">${row.timestamp}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.revision || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.recitation || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.preparation || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.arabe || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.devoir || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px;">${row.remarque || '-'}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 10px; font-weight:bold; background:#fff5f5;">${row.grade || '-'}</td>
                    </tr>
                `).join('');
            } else {
                archiveBody.innerHTML = `<tr><td colspan="8" style="padding:15px; color:#94a3b8;">لا توجد سجلات مؤرشفة سابقة لهذا التلميذ.</td></tr>`;
            }
        })
        .catch(err => {
            console.error(err);
            document.getElementById('studentArchiveTableBody').innerHTML = `<tr><td colspan="8" style="padding:15px; color:#ef4444;">خطأ أثناء الاتصال بقاعدة البيانات.</td></tr>`;
        });
    });
}
// ==========================================
// 5. تفعيل أزرار الحفظ (POST للثابت الموحد) والتفريغ المباشر
// ==========================================
function saveFromWeb() {
    const student = document.getElementById('dashboardStudentSelector').value;
    const teacher = document.getElementById('displayTeacherName').innerText;
    
    if (!student) {
        alert("تنبيه: يرجى تحديد اسم التلميذ المستهدف أولاً قبل عملية الحفظ!");
        return;
    }

    const payload = {
        action: "saveDashboardScores",
        teacher: teacher,
        student: student,
        date: document.getElementById('currentDateDisplay').innerText,
        startTime: document.getElementById('startTimeInput').value,
        
        revision: { text: document.getElementById('input_revision').value, score: document.getElementById('score_revision').value },
        recitation: { text: document.getElementById('input_recitation').value, score: document.getElementById('score_recitation').value },
        preparation: { text: document.getElementById('input_preparation').value, score: document.getElementById('score_preparation').value },
        arabe: { text: document.getElementById('input_arabe').value, score: document.getElementById('score_arabe').value },
        tarbiya: { text: document.getElementById('input_tarbiya').value, score: document.getElementById('score_tarbiya').value },
        devoir: { text: document.getElementById('input_devoir').value, score: document.getElementById('score_devoir').value },
        attendance: document.getElementById('input_attendance') ? document.getElementById('input_attendance').value : 'present',
        remarque: document.getElementById('input_remarque').value,
        finalGrade: document.getElementById('input_grade').value
    };

    // إرسال طلب POST مباشرة إلى الثابت العام دون أي تكرار روابط
    fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        if(res.status === 'success') {
            alert(`تم الحفظ والترحيل بنجاح لـ: ${student}`);
            clearDashboardForm();
        } else {
            alert("حدث خطأ أثناء محاولة الترحيل: " + res.message);
        }
    })
    .catch(err => {
        console.error("خطأ الإرسال:", err);
        alert("فشل الاتصال بالسيرفر، تأكد من إعدادات الـ URL المحددة.");
    });
}

function clearDashboardForm() {
    document.getElementById('input_revision').value = "";
    document.getElementById('input_recitation').value = "";
    document.getElementById('input_preparation').value = "";
    document.getElementById('input_arabe').value = "";
    document.getElementById('input_tarbiya').value = "";
    document.getElementById('input_devoir').value = "";
    document.getElementById('input_remarque').value = "";
    document.getElementById('input_grade').value = "";
    const attEl = document.getElementById('input_attendance');
    if (attEl) attEl.value = 'present';

    document.getElementById('score_revision').value = "";
    document.getElementById('score_recitation').value = "";
    document.getElementById('score_preparation').value = "";
    document.getElementById('score_arabe').value = "";
    document.getElementById('score_tarbiya').value = "";
    document.getElementById('score_devoir').value = "";

    const defaults = ['prev_revision', 'prev_recitation', 'prev_preparation', 'prev_arabe', 'prev_tarbiya', 'prev_devoir', 'prev_remarque', 'prev_grade'];
    defaults.forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = "---"; });
    
    document.getElementById('studentArchiveTableBody').innerHTML = `<tr><td colspan="8" style="border: 1px solid #cbd5e1; padding: 15px; color: #64748b;">يرجى اختيار تلميذ لعرض شريط الأرشيف الخاص به هنا...</td></tr>`;
}       

document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'logoutBtn') {
        logout(); // استدعاء دالة الخروج التي كتبناها سابقاً
    }
});
// نظام القائمة المنسدلة الموحد (يعمل فور تحميل الهيدر أو بعده)
document.addEventListener('click', (e) => {
    const navList = document.getElementById('nav-list');
    const menuBtn = document.getElementById('menuToggleBtn');

    // 1. إذا ضغط على زر القائمة: قم بالتبديل (Toggle)
    if (e.target.closest('#menuToggleBtn')) {
        navList?.classList.toggle('active');
        return; // توقف، لا تنفذ الأوامر التالية
    }

    // 2. إذا ضغط على زر القائمة المنسدلة (Dropdown):
    const dropBtn = e.target.closest('.dropdown-btn');
    if (dropBtn) {
        e.preventDefault();
        // أغلق أي دروب داون آخر مفتوح (اختياري لترتيب أفضل)
        document.querySelectorAll('.dropdown').forEach(d => {
            if (d !== dropBtn.parentElement) d.classList.remove('active');
        });
        dropBtn.parentElement.classList.toggle('active');
        return; // توقف
    }

    // 3. إذا ضغط في أي مكان آخر (وليس داخل القائمة نفسها): أغلق الكل
    if (!e.target.closest('#nav-list') && !e.target.closest('#menuToggleBtn')) {
        navList?.classList.remove('active');
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
    }
});
