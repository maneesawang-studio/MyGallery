(() => {
    const config = window.ADMIN_CONFIG;
    const loginPanel = document.getElementById('login-panel');
    const workspace = document.getElementById('workspace');
    const loginButton = document.getElementById('login-button');
    const configHint = document.getElementById('config-hint');
    const statusMessage = document.getElementById('status-message');
    const projectList = document.getElementById('project-list');
    const projectCount = document.getElementById('project-count');
    const saveOrderButton = document.getElementById('save-order-button');
    const signedInUser = document.getElementById('signed-in-user');
    const projectForm = document.getElementById('project-form');
    const editorTitle = document.getElementById('editor-title');
    const deleteButton = document.getElementById('delete-project-button');
    const addProjectButton = document.getElementById('add-project-button');
    const saveButton = document.getElementById('save-project-button');
    const uploadInput = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const imagePlaceholder = document.getElementById('image-placeholder');
    const extraFields = document.getElementById('extra-fields');

    let projects = [];
    let selectedId = null;
    let accessToken = null;
    let refreshToken = null;
    let tokenExpiresAt = 0;
    let popup = null;
    let popupWatch = 0;
    let autoSlug = false;
    let hasUnsavedChanges = false;
    let orderChanged = false;
    let draggedProjectId = null;
    let isBusy = false;
    let statusTimer = 0;

    const apiUrl = typeof config?.apiUrl === 'string' ? config.apiUrl.replace(/\/+$/, '') : '';
    const apiOrigin = (() => {
        try {
            const workerUrl = new URL(apiUrl);
            return workerUrl.protocol === 'https:' ? workerUrl.origin : '';
        } catch {
            return '';
        }
    })();

    const showStatus = (message, type = 'success', duration = 6500) => {
        window.clearTimeout(statusTimer);
        statusMessage.textContent = message;
        statusMessage.dataset.type = type;
        statusMessage.hidden = false;
        if (duration > 0) {
            statusTimer = window.setTimeout(() => {
                statusMessage.hidden = true;
            }, duration);
        }
    };

    const setBusy = busy => {
        isBusy = busy;
        saveButton.disabled = busy;
        addProjectButton.disabled = busy;
        loginButton.disabled = busy;
        deleteButton.disabled = busy;
        uploadInput.disabled = busy;
        saveOrderButton.disabled = busy || !orderChanged || hasUnsavedChanges;
        projectList.querySelectorAll('button').forEach(button => {
            button.disabled = busy;
        });
        projectList.querySelectorAll('.admin-project-item').forEach(item => {
            item.draggable = !busy;
        });
    };

    const markUnsaved = () => {
        hasUnsavedChanges = true;
    };

    const confirmDiscardChanges = () => {
        if (!hasUnsavedChanges || window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการละทิ้งการแก้ไขหรือไม่?')) {
            hasUnsavedChanges = false;
            return true;
        }
        return false;
    };

    const localizedValue = value => {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object') return '';
        return value.th || value.en || '';
    };

    const makeElement = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    };

    const apiRequest = async (path, options = {}) => {
        if (!accessToken) throw new Error('กรุณาเข้าสู่ระบบ GitHub ก่อน');
        if (tokenExpiresAt < Date.now() + 60_000) await renewToken();
        const response = await fetch(`${apiUrl}${path}`, {
            ...options,
            credentials: 'omit',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
        const contentType = response.headers.get('Content-Type') || '';
        const result = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        if (!response.ok) {
            const message = typeof result === 'object' && result !== null ? result.error : result;
            if (response.status === 401 || response.status === 403) {
                clearSession();
                showStatus(message || 'เซสชันหมดอายุหรือไม่มีสิทธิ์ใน repository นี้ กรุณาเข้าสู่ระบบใหม่', 'error', 0);
            }
            throw new Error(message || `คำขอไม่สำเร็จ (${response.status})`);
        }
        return result;
    };

    const renewToken = async () => {
        if (!refreshToken) {
            clearSession();
            throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบ GitHub ใหม่');
        }
        const response = await fetch(`${apiUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        const result = await response.json();
        if (!response.ok || !result.accessToken) {
            clearSession();
            throw new Error(result.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        }
        accessToken = result.accessToken;
        refreshToken = result.refreshToken;
        tokenExpiresAt = Date.now() + result.expiresIn * 1000;
    };

    const clearSession = () => {
        accessToken = null;
        refreshToken = null;
        tokenExpiresAt = 0;
        projects = [];
        selectedId = null;
        if (popup && !popup.closed) popup.close();
        popup = null;
        workspace.hidden = true;
        loginPanel.hidden = false;
    };

    const validateProjects = value => {
        if (!Array.isArray(value)) throw new Error('รูปแบบข้อมูลผลงานไม่ถูกต้อง');
        const ids = new Set();
        value.forEach((project, index) => {
            if (!project || typeof project !== 'object' || Array.isArray(project)) {
                throw new Error(`ข้อมูลผลงานลำดับ ${index + 1} ไม่ถูกต้อง`);
            }
            if (typeof project.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id)) {
                throw new Error(`รหัสผลงานลำดับ ${index + 1} ต้องใช้ a-z, 0-9 และขีดกลาง`);
            }
            if (ids.has(project.id)) throw new Error(`มีรหัสผลงานซ้ำ: ${project.id}`);
            ids.add(project.id);
            if (typeof project.title !== 'string' || !project.title.trim()) {
                throw new Error(`กรุณาระบุชื่อผลงานลำดับ ${index + 1}`);
            }
            if (!/^\d{4}$/.test(String(project.year))) {
                throw new Error(`ปีของผลงาน ${project.title} ต้องเป็นปี 4 หลัก`);
            }
            if (typeof project.image !== 'string' || !project.image.trim()) {
                throw new Error(`กรุณาระบุรูปผลงาน ${project.title}`);
            }
            if (!Array.isArray(project.fields)) throw new Error(`รูปแบบข้อมูลเพิ่มเติมของ ${project.title} ไม่ถูกต้อง`);
            if (project.pinned !== undefined && typeof project.pinned !== 'boolean') {
                throw new Error(`สถานะปักหมุดของ ${project.title} ไม่ถูกต้อง`);
            }
        });
    };

    const loadProjects = async () => {
        const result = await apiRequest('/api/projects');
        validateProjects(result);
        projects = [...result].sort((first, second) => Number(second.pinned === true) - Number(first.pinned === true));
        hasUnsavedChanges = false;
        orderChanged = false;
        renderProjectList();
        projectCount.textContent = `(${projects.length})`;
        workspace.hidden = false;
        loginPanel.hidden = true;
    };

    const renderProjectList = () => {
        projectList.replaceChildren();
        projects.forEach(project => {
            const item = makeElement('div', 'admin-project-item');
            item.dataset.projectId = project.id;
            item.dataset.pinned = String(project.pinned === true);
            item.setAttribute('aria-current', String(project.id === selectedId));
            item.draggable = !isBusy;
            const selectButton = makeElement('button', 'admin-project-select');
            selectButton.type = 'button';
            selectButton.setAttribute('aria-current', String(project.id === selectedId));
            const image = document.createElement('img');
            image.src = project.image;
            image.alt = '';
            image.loading = 'lazy';
            image.addEventListener('error', () => {
                image.replaceWith(makeElement('span', 'admin-project-placeholder', 'M'));
            }, { once: true });

            const copy = makeElement('span', 'admin-project-copy');
            copy.append(
                makeElement('strong', '', project.title),
                makeElement('span', '', project.subTitle || 'MNSW Studio')
            );
            selectButton.append(image, copy, makeElement('span', 'admin-project-year', String(project.year)));
            selectButton.addEventListener('click', () => selectProject(project.id));

            const actions = makeElement('span', 'admin-project-actions');
            const pinButton = makeElement('button', 'admin-project-pin', project.pinned === true ? 'ปักหมุดแล้ว' : 'ปักหมุด');
            pinButton.type = 'button';
            pinButton.setAttribute('aria-pressed', String(project.pinned === true));
            pinButton.setAttribute('aria-label', `${project.pinned === true ? 'เลิกปักหมุด' : 'ปักหมุด'} ${project.title}`);
            pinButton.addEventListener('click', () => toggleProjectPin(project.id));
            const moveUpButton = makeElement('button', 'admin-project-move', '↑');
            moveUpButton.type = 'button';
            moveUpButton.setAttribute('aria-label', `เลื่อน ${project.title} ขึ้น`);
            moveUpButton.addEventListener('click', () => moveProject(project.id, -1));
            const moveDownButton = makeElement('button', 'admin-project-move', '↓');
            moveDownButton.type = 'button';
            moveDownButton.setAttribute('aria-label', `เลื่อน ${project.title} ลง`);
            moveDownButton.addEventListener('click', () => moveProject(project.id, 1));
            actions.append(pinButton, moveUpButton, moveDownButton);
            item.append(selectButton, actions);
            item.addEventListener('dragover', event => {
                if (draggedProjectId && isSamePinGroup(draggedProjectId, project.id)) event.preventDefault();
            });
            item.addEventListener('drop', event => {
                event.preventDefault();
                if (!draggedProjectId || draggedProjectId === project.id) return;
                const targetIndex = projects.findIndex(item => item.id === project.id);
                moveProjectToIndex(draggedProjectId, targetIndex);
            });
            projectList.append(item);
        });
        projectList.querySelectorAll('.admin-project-item').forEach(item => {
            const project = projects.find(entry => entry.id === item.dataset.projectId);
            if (!project) return;
            item.draggable = true;
            item.addEventListener('dragstart', event => {
                if (hasUnsavedChanges || isBusy) {
                    event.preventDefault();
                    showStatus('กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนจัดลำดับผลงาน', 'info');
                    return;
                }
                draggedProjectId = project.id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', project.id);
            });
            item.addEventListener('dragend', () => {
                draggedProjectId = null;
            });
        });
        projectList.querySelectorAll('button').forEach(button => {
            button.disabled = isBusy;
        });
        saveOrderButton.disabled = orderChanged === false || hasUnsavedChanges;
    };

    const isSamePinGroup = (firstId, secondId) => {
        const first = projects.find(project => project.id === firstId);
        const second = projects.find(project => project.id === secondId);
        return first && second && (first.pinned === true) === (second.pinned === true);
    };

    const moveProjectToIndex = (id, targetIndex) => {
        if (hasUnsavedChanges) {
            showStatus('กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนจัดลำดับผลงาน', 'info');
            return;
        }
        const sourceIndex = projects.findIndex(project => project.id === id);
        if (sourceIndex === -1 || !isSamePinGroup(id, projects[targetIndex]?.id)) return;
        const [project] = projects.splice(sourceIndex, 1);
        projects.splice(Math.max(0, Math.min(targetIndex, projects.length)), 0, project);
        orderChanged = true;
        renderProjectList();
    };

    const moveProject = (id, direction) => {
        const sourceIndex = projects.findIndex(project => project.id === id);
        const targetIndex = sourceIndex + direction;
        if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= projects.length) return;
        moveProjectToIndex(id, targetIndex);
    };

    const toggleProjectPin = id => {
        if (hasUnsavedChanges) {
            showStatus('กรุณาบันทึกหรือยกเลิกการแก้ไขก่อนเปลี่ยนการปักหมุด', 'info');
            return;
        }
        const project = projects.find(item => item.id === id);
        if (!project) return;
        project.pinned = project.pinned !== true;
        projects = [
            ...projects.filter(item => item.pinned === true),
            ...projects.filter(item => item.pinned !== true)
        ];
        orderChanged = true;
        renderProjectList();
    };

    const saveProjectOrder = async () => {
        if (!orderChanged || hasUnsavedChanges) return;
        setBusy(true);
        showStatus('กำลังบันทึกลำดับผลงานขึ้น GitHub…', 'info', 0);
        try {
            const result = await apiRequest('/api/projects', {
                method: 'PUT',
                body: JSON.stringify({ projects })
            });
            orderChanged = false;
            renderProjectList();
            showStatus(`บันทึกลำดับผลงานแล้ว (commit ${result.commit.slice(0, 7)}) เว็บจะอัปเดตหลัง GitHub Pages เผยแพร่ไฟล์`, 'success', 0);
        } catch (error) {
            renderProjectList();
            showStatus(error.message, 'error', 0);
        } finally {
            setBusy(false);
        }
    };

    const setImagePreview = imagePath => {
        if (!imagePath) {
            imagePreview.hidden = true;
            imagePlaceholder.hidden = false;
            return;
        }
        imagePreview.src = imagePath;
        imagePreview.hidden = false;
        imagePlaceholder.hidden = true;
        imagePreview.onerror = () => {
            imagePreview.hidden = true;
            imagePlaceholder.hidden = false;
            imagePlaceholder.textContent = 'โหลดรูปไม่สำเร็จ ตรวจสอบตำแหน่งไฟล์';
        };
    };

    const resetExtraFields = fields => {
        extraFields.replaceChildren();
        fields.forEach(field => addExtraField(field));
    };

    const addExtraField = (field = {}) => {
        const row = makeElement('div', 'admin-extra-row');
        const grid = makeElement('div', 'admin-form-grid');
        const inputs = [
            ['ชื่อข้อมูล / ไทย', localizedValue(field.label?.th), 'text'],
            ['Field name / English', localizedValue(field.label?.en), 'text'],
            ['รายละเอียด / ไทย', localizedValue(field.value?.th), 'textarea'],
            ['Details / English', localizedValue(field.value?.en), 'textarea']
        ];
        inputs.forEach(([label, value, type]) => {
            const wrapper = makeElement('label', 'admin-field');
            wrapper.append(makeElement('span', '', label));
            const input = document.createElement(type);
            if (type === 'textarea') {
                input.rows = 2;
                input.maxLength = 2000;
            } else {
                input.maxLength = 100;
            }
            input.value = value;
            input.dataset.extraField = label;
            wrapper.append(input);
            grid.append(wrapper);
        });
        const remove = makeElement('button', '', 'นำออก');
        remove.type = 'button';
        remove.addEventListener('click', () => row.remove());
        row.append(grid, remove);
        extraFields.append(row);
    };

    const selectProject = id => {
        if (selectedId !== id && !confirmDiscardChanges()) return;
        const project = projects.find(item => item.id === id);
        if (!project) return;
        selectedId = id;
        autoSlug = false;
        editorTitle.textContent = project.title;
        projectForm.elements.namedItem('id').value = project.id;
        projectForm.elements.namedItem('title').value = project.title;
        projectForm.elements.namedItem('subTitle').value = project.subTitle || '';
        projectForm.elements.namedItem('year').value = project.year;
        projectForm.elements.namedItem('image').value = project.image;
        projectForm.elements.namedItem('conceptTh').value = localizedValue(project.concept?.th);
        projectForm.elements.namedItem('conceptEn').value = localizedValue(project.concept?.en);
        projectForm.elements.namedItem('descriptionTh').value = localizedValue(project.description?.th);
        projectForm.elements.namedItem('descriptionEn').value = localizedValue(project.description?.en);
        resetExtraFields(project.fields || []);
        setImagePreview(project.image);
        projectForm.hidden = false;
        deleteButton.hidden = false;
        renderProjectList();
    };

    const newProject = () => {
        if (!confirmDiscardChanges()) return;
        const project = {
            id: `project-${Date.now()}`,
            title: '',
            subTitle: '',
            year: String(new Date().getFullYear()),
            image: '',
            concept: { th: '', en: '' },
            description: { th: '', en: '' },
            fields: []
        };
        projects.push(project);
        markUnsaved();
        projectCount.textContent = `(${projects.length})`;
        selectedId = project.id;
        autoSlug = true;
        editorTitle.textContent = 'เพิ่มผลงานใหม่';
        projectForm.reset();
        projectForm.elements.namedItem('id').value = project.id;
        projectForm.elements.namedItem('year').value = project.year;
        resetExtraFields([]);
        setImagePreview('');
        projectForm.hidden = false;
        deleteButton.hidden = true;
        renderProjectList();
        projectForm.elements.namedItem('title').focus();
    };

    const makeSlug = value => value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const readFormProject = () => {
        const form = projectForm.elements;
        const existingProject = projects.find(item => item.id === selectedId);
        const fields = [...extraFields.querySelectorAll('.admin-extra-row')].map(row => {
            const values = [...row.querySelectorAll('[data-extra-field]')].map(input => input.value.trim());
            return {
                label: { th: values[0], en: values[1] },
                value: { th: values[2], en: values[3] }
            };
        }).filter(field => Object.values(field.label).some(Boolean) || Object.values(field.value).some(Boolean));

        return {
            id: form.namedItem('id').value.trim(),
            title: form.namedItem('title').value.trim(),
            subTitle: form.namedItem('subTitle').value.trim(),
            year: form.namedItem('year').value,
            image: form.namedItem('image').value.trim(),
            concept: {
                th: form.namedItem('conceptTh').value.trim(),
                en: form.namedItem('conceptEn').value.trim()
            },
            description: {
                th: form.namedItem('descriptionTh').value.trim(),
                en: form.namedItem('descriptionEn').value.trim()
            },
            fields,
            pinned: existingProject?.pinned === true
        };
    };

    const dataUrlToBase64 = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);

    const uploadImage = async file => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB');
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) throw new Error('รองรับเฉพาะไฟล์ PNG, JPG และ WebP');

        setBusy(true);
        showStatus('กำลังอัปโหลดรูปไปยัง GitHub…', 'info', 0);
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(String(reader.result)));
            reader.addEventListener('error', () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ')));
            reader.readAsDataURL(file);
        });
        const result = await apiRequest('/api/images', {
            method: 'POST',
            body: JSON.stringify({
                filename: file.name,
                mimeType: file.type,
                base64: dataUrlToBase64(dataUrl)
            })
        });
        projectForm.elements.namedItem('image').value = result.path;
        setImagePreview(result.path);
        showStatus('อัปโหลดรูปขึ้น GitHub แล้ว อย่าลืมบันทึกข้อมูลผลงานเพื่อเผยแพร่รูป', 'success');
    };

    const saveCurrentProject = async event => {
        event.preventDefault();
        const project = readFormProject();
        const index = projects.findIndex(item => item.id === selectedId);
        const candidate = [...projects];
        if (index === -1) candidate.push(project);
        else candidate[index] = project;
        validateProjects(candidate);

        const previous = projects;
        projects = candidate;
        renderProjectList();
        projectCount.textContent = `(${projects.length})`;
        editorTitle.textContent = project.title;
        setBusy(true);
        showStatus('กำลังบันทึกข้อมูลผลงานขึ้น GitHub…', 'info', 0);
        try {
            const result = await apiRequest('/api/projects', {
                method: 'PUT',
                body: JSON.stringify({ projects })
            });
            selectedId = project.id;
            autoSlug = false;
            hasUnsavedChanges = false;
            orderChanged = false;
            renderProjectList();
            showStatus(`บันทึกข้อมูลและ sitemap แล้ว (commit ${result.commit.slice(0, 7)}) เว็บจะอัปเดตหลัง GitHub Pages เผยแพร่ไฟล์`, 'success', 0);
        } catch (error) {
            projects = previous;
            renderProjectList();
            projectCount.textContent = `(${projects.length})`;
            showStatus(error.message, 'error', 0);
        } finally {
            setBusy(false);
        }
    };

    const login = () => {
        if (!apiOrigin || apiUrl.includes('YOUR-CLOUDFLARE-WORKER')) {
            configHint.textContent = 'ยังไม่ได้ตั้งค่า Cloudflare Worker URL กรุณาทำตามขั้นตอนใน admin/SETUP.md ก่อน';
            configHint.hidden = false;
            return;
        }

        const expectedPopupName = 'mnsw-github-admin';
        popup = window.open(`${apiUrl}/auth/login`, expectedPopupName, 'popup,width=560,height=720');
        if (!popup) {
            showStatus('เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองอีกครั้ง', 'error', 0);
            return;
        }

        loginButton.disabled = true;
        showStatus('กรุณาเข้าสู่ระบบและอนุญาตแอปในหน้าต่าง GitHub ที่เปิดขึ้น', 'info', 0);
        const onMessage = async event => {
            if (event.origin !== apiOrigin || event.source !== popup || event.data?.type !== 'mnsw-github-auth') return;
            window.removeEventListener('message', onMessage);
            window.clearInterval(popupWatch);
            popupWatch = 0;
            if (popup && !popup.closed) popup.close();
            popup = null;
            accessToken = event.data.accessToken;
            refreshToken = event.data.refreshToken;
            tokenExpiresAt = Date.now() + Number(event.data.expiresIn || 28800) * 1000;
            try {
                const session = await apiRequest('/api/session');
                signedInUser.textContent = `เข้าสู่ระบบเป็น @${session.username} · ${session.repository}`;
                await loadProjects();
                if (projects.length) selectProject(projects[0].id);
                showStatus('เข้าสู่ระบบสำเร็จ ข้อมูลโครงการโหลดแล้ว', 'success');
            } catch (error) {
                clearSession();
                showStatus(error.message, 'error', 0);
            } finally {
                loginButton.disabled = false;
            }
        };
        window.addEventListener('message', onMessage);
        popupWatch = window.setInterval(() => {
            if (!popup || popup.closed) {
                window.clearInterval(popupWatch);
                popupWatch = 0;
                window.removeEventListener('message', onMessage);
                popup = null;
                loginButton.disabled = false;
                showStatus('หน้าต่างเข้าสู่ระบบถูกปิดก่อนเชื่อมต่อ กรุณาลองใหม่อีกครั้ง', 'error');
            }
        }, 500);
    };

    document.getElementById('login-button').addEventListener('click', login);
    document.getElementById('logout-button').addEventListener('click', () => {
        clearSession();
        showStatus('ออกจากระบบแล้ว', 'info');
    });
    addProjectButton.addEventListener('click', newProject);
    saveOrderButton.addEventListener('click', saveProjectOrder);
    document.getElementById('add-field-button').addEventListener('click', () => addExtraField());
    deleteButton.addEventListener('click', async () => {
        const project = projects.find(item => item.id === selectedId);
        if (!project) return;
        const confirmation = hasUnsavedChanges
            ? `ต้องการลบผลงาน “${project.title}” และบันทึกการลบขึ้น GitHub หรือไม่? การแก้ไขที่ยังไม่บันทึกจะถูกละทิ้ง`
            : `ต้องการลบผลงาน “${project.title}” และบันทึกการลบขึ้น GitHub หรือไม่?`;
        if (!window.confirm(confirmation)) return;
        hasUnsavedChanges = false;
        const previous = projects;
        projects = projects.filter(item => item.id !== selectedId);
        setBusy(true);
        showStatus('กำลังลบผลงานและบันทึกขึ้น GitHub…', 'info', 0);
        try {
            const result = await apiRequest('/api/projects', {
                method: 'PUT',
                body: JSON.stringify({ projects })
            });
            selectedId = null;
            hasUnsavedChanges = false;
            orderChanged = false;
            projectCount.textContent = `(${projects.length})`;
            projectForm.reset();
            projectForm.hidden = true;
            deleteButton.hidden = true;
            editorTitle.textContent = 'เลือกผลงานที่ต้องการแก้ไข';
            setImagePreview('');
            renderProjectList();
            showStatus(`ลบผลงานและ sitemap แล้ว (commit ${result.commit.slice(0, 7)})`, 'success', 0);
        } catch (error) {
            projects = previous;
            renderProjectList();
            showStatus(error.message, 'error', 0);
        } finally {
            setBusy(false);
        }
    });
    projectForm.addEventListener('submit', saveCurrentProject);
    projectForm.addEventListener('input', () => {
        markUnsaved();
        saveOrderButton.disabled = true;
    });
    projectForm.addEventListener('change', () => {
        markUnsaved();
        saveOrderButton.disabled = true;
    });
    uploadInput.addEventListener('change', async () => {
        try {
            await uploadImage(uploadInput.files?.[0]);
        } catch (error) {
            showStatus(error.message, 'error', 0);
        } finally {
            uploadInput.value = '';
            setBusy(false);
        }
    });
    projectForm.elements.namedItem('title').addEventListener('input', event => {
        const idField = projectForm.elements.namedItem('id');
        if (autoSlug) {
            const slug = makeSlug(event.target.value);
            if (slug) idField.value = slug;
        }
    });
    projectForm.elements.namedItem('id').addEventListener('input', () => {
        autoSlug = false;
    });
    window.addEventListener('beforeunload', event => {
        if (!hasUnsavedChanges) return;
        event.preventDefault();
        event.returnValue = '';
    });

    if (apiUrl.includes('YOUR-CLOUDFLARE-WORKER')) {
        configHint.textContent = 'ตั้งค่า Cloudflare Worker URL ใน admin/config.js ก่อนเข้าสู่ระบบ';
        configHint.hidden = false;
    }
})();
