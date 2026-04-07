
document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://qoaiibquchdlkvinjwvm.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYWlpYnF1Y2hkbGt2aW5qd3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjYxMTMsImV4cCI6MjA5MTEwMjExM30.dk6RNChNcZ4SyIyak_HKCMpwHhbfDz1pWMk-cr9fFqc';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let currentUser = null;
    let currentMap = null;
    let currentMarkers = [];

    const contentDiv = document.getElementById('content');
    const navHome = document.getElementById('nav-home');
    const navProfile = document.getElementById('nav-profile');
    const navLogout = document.getElementById('nav-logout');
    const navLogin = document.getElementById('nav-login');

    // --- Модальное окно входа ---
    let modal = null;
    function createModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; justify-content: center;
            align-items: center; z-index: 1000; display: none;
        `;
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px; width: 300px;">
                <h3>Вход или регистрация</h3>
                <input type="email" id="modal-email" placeholder="Email"><br>
                <input type="password" id="modal-password" placeholder="Пароль"><br>
                <button id="modal-login">Войти</button>
                <button id="modal-register">Зарегистрироваться</button>
                <button id="modal-close">Закрыть</button>
                <div id="modal-message" style="color:red;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('modal-close').onclick = () => modal.style.display = 'none';
        document.getElementById('modal-login').onclick = async () => {
            const email = document.getElementById('modal-email').value;
            const password = document.getElementById('modal-password').value;
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) document.getElementById('modal-message').innerText = error.message;
            else { modal.style.display = 'none'; await checkSession(); await showHomeScreen(); }
        };
        document.getElementById('modal-register').onclick = async () => {
            const email = document.getElementById('modal-email').value;
            const password = document.getElementById('modal-password').value;
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) document.getElementById('modal-message').innerText = error.message;
            else document.getElementById('modal-message').innerText = 'Регистрация успешна! Теперь войдите.';
        };
    }

    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        if (currentUser) {
            navProfile.style.display = 'inline-block';
            navLogout.style.display = 'inline-block';
            navLogin.style.display = 'none';
        } else {
            navProfile.style.display = 'none';
            navLogout.style.display = 'none';
            navLogin.style.display = 'inline-block';
        }
    }

    async function bookTraining(scheduleId) {
        if (!currentUser) { createModal(); modal.style.display = 'flex'; return; }
        const { data: existing } = await supabase.from('bookings').select('id').eq('user_id', currentUser.id).eq('schedule_id', scheduleId);
        if (existing?.length) { alert('Вы уже забронировали'); return; }
        const { error } = await supabase.from('bookings').insert([{ user_id: currentUser.id, schedule_id: scheduleId, status: 'confirmed' }]);
        if (error) { alert('Ошибка: ' + error.message); return; }
        const { data: sch } = await supabase.from('schedules').select('available_slots').eq('id', scheduleId).single();
        if (sch && sch.available_slots > 0) {
            await supabase.from('schedules').update({ available_slots: sch.available_slots - 1 }).eq('id', scheduleId);
        }
        alert('Забронировано!');
        await showHomeScreen();
    }

    async function showHomeScreen() {
        // Уничтожаем старую карту, если есть
        if (currentMap) { currentMap.remove(); currentMap = null; currentMarkers = []; }

        const { data: trainings, error } = await supabase
            .from('schedules')
            .select('*')
            .gte('start_time', new Date().toISOString())
            .order('start_time');
        if (error) { contentDiv.innerHTML = `<p>Ошибка: ${error.message}</p>`; return; }

        contentDiv.innerHTML = `
            <div id="map" style="height: 500px; width: 100%; border-radius: 8px;"></div>
            <div style="margin-top: 10px;">
                <input type="text" id="search-input" placeholder="Поиск по названию или адресу..." style="width: 100%; padding: 8px;">
                <div style="margin-top: 10px;">
                    <button id="filter-yoga">Йога</button>
                    <button id="filter-fitness">Фитнес</button>
                    <button id="filter-reset">Сбросить фильтры</button>
                </div>
            </div>
        `;

        // Инициализация карты
        let centerLat = 56.0184, centerLng = 92.8672;
        if (trainings[0]?.latitude) { centerLat = trainings[0].latitude; centerLng = trainings[0].longitude; }
        currentMap = L.map('map').setView([centerLat, centerLng], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(currentMap);

        function displayMarkers(filtered) {
            currentMarkers.forEach(m => currentMap.removeLayer(m));
            currentMarkers = [];
            filtered.forEach(t => {
                if (t.latitude && t.longitude) {
                    const m = L.marker([t.latitude, t.longitude]).addTo(currentMap);
                    const popupContent = `<b>${t.training_name}</b><br>${t.partner_name}<br>${t.address}<br>📅 ${new Date(t.start_time).toLocaleString()}<br>🪑 ${t.available_slots} мест<br>💰 ${t.price}₽<br><button id="book-${t.id}">Забронировать</button>`;
                    m.bindPopup(popupContent);
                    m.on('popupopen', () => {
                        document.getElementById(`book-${t.id}`)?.addEventListener('click', (e) => { e.stopPropagation(); bookTraining(t.id); });
                    });
                    currentMarkers.push(m);
                }
            });
        }

        displayMarkers(trainings);

        // Фильтры
        const searchInput = document.getElementById('search-input');
        const yogaBtn = document.getElementById('filter-yoga');
        const fitnessBtn = document.getElementById('filter-fitness');
        const resetBtn = document.getElementById('filter-reset');
        const filter = () => {
            let filtered = trainings.filter(t => t.training_name.toLowerCase().includes(searchInput.value.toLowerCase()) || (t.address && t.address.toLowerCase().includes(searchInput.value.toLowerCase())));
            if (yogaBtn.classList.contains('active')) filtered = filtered.filter(t => t.training_name.toLowerCase().includes('йога'));
            if (fitnessBtn.classList.contains('active')) filtered = filtered.filter(t => t.training_name.toLowerCase().includes('фитнес'));
            displayMarkers(filtered);
        };
        yogaBtn.onclick = () => { yogaBtn.classList.toggle('active'); fitnessBtn.classList.remove('active'); filter(); };
        fitnessBtn.onclick = () => { fitnessBtn.classList.toggle('active'); yogaBtn.classList.remove('active'); filter(); };
        resetBtn.onclick = () => { searchInput.value = ''; yogaBtn.classList.remove('active'); fitnessBtn.classList.remove('active'); displayMarkers(trainings); };
        searchInput.oninput = filter;
    }

    async function showProfileScreen() {
        if (!currentUser) { await showHomeScreen(); return; }
        const { data: bookings, error } = await supabase.from('bookings').select('*, schedules(*)').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if (error) { contentDiv.innerHTML = `<p>Ошибка: ${error.message}</p>`; return; }
        const userName = currentUser.user_metadata?.name || currentUser.email.split('@')[0];
        let initials = userName.charAt(0).toUpperCase();
let html = `<div style="text-align:center">
    <div style="width:80px; height:80px; border-radius:50%; background:#007bff; color:white; display:inline-flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:10px;">${initials}</div>
    <h2>${userName}</h2>
    <p>${currentUser.email}</p>
</div><h3>Мои бронирования</h3>`;
        if (!bookings.length) html += `<p>Нет броней.</p>`;
        else bookings.forEach(b => {
            const t = b.schedules;
            const isActive = new Date(t.start_time) > new Date();
            html += `<div class="training-card"><h3>${t.training_name}</h3><p>${new Date(t.start_time).toLocaleString()} | Статус: ${isActive ? 'Активна' : 'Завершена'}</p><p>${t.partner_name}, ${t.address}</p>${isActive ? `<button data-id="${b.id}" class="cancel-btn">Отменить</button>` : ''}</div>`;
        });
        html += `<div><button id="backHome">Назад</button> <button id="settingsBtn">Настройки</button></div>`;
        contentDiv.innerHTML = html;
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.onclick = async () => { await supabase.from('bookings').delete().eq('id', btn.dataset.id); alert('Отменено'); await showProfileScreen(); await showHomeScreen(); };
        });
        document.getElementById('backHome')?.addEventListener('click', () => showHomeScreen());
        document.getElementById('settingsBtn')?.addEventListener('click', () => alert('Настройки в следующей версии'));
    }

    async function logout() { await supabase.auth.signOut(); currentUser = null; await checkSession(); await showHomeScreen(); }

    navHome.onclick = () => showHomeScreen();
    navProfile.onclick = () => showProfileScreen();
    navLogout.onclick = () => logout();
    navLogin.onclick = () => { createModal(); modal.style.display = 'flex'; };

    checkSession().then(() => showHomeScreen());
});