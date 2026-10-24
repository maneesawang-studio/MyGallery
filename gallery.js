let galleryData = [];

function getProjectText(value, language) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return value[language] || value.en || value.th || '';
}

// 2. ฟังก์ชันแสดงผลหน้า Gallery รวม
function renderGallery() {
    const gridContainer = document.getElementById('galleryGrid');
    if (!gridContainer) return;

    gridContainer.replaceChildren();
    const language = document.documentElement.lang;
    const projectAlt = language === 'th'
        ? 'ผลงานออกแบบโลโก้และอัตลักษณ์แบรนด์โดย MNSW Studio'
        : 'logo design and visual identity project by MNSW Studio';
    galleryData.forEach(item => {
        const link = document.createElement('a');
        link.href = `ProjectDetail/?id=${encodeURIComponent(item.id)}`;
        link.className = 'gallery-item';
        const imageBox = document.createElement('div');
        imageBox.className = 'image-box';
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = `${getProjectText(item.title, language)} ${projectAlt}`;
        image.loading = 'lazy';
        image.decoding = 'async';
        imageBox.append(image);

        const info = document.createElement('div');
        info.className = 'item-info';
        const title = document.createElement('span');
        title.className = 'item-title';
        title.textContent = getProjectText(item.title, language);
        const year = document.createElement('span');
        year.className = 'item-year';
        year.textContent = item.year;
        info.append(title, year);
        link.append(imageBox, info);
        gridContainer.append(link);
    });
}

function renderProjectDetail(projectId) {
    const imgDisplay = document.getElementById('projImage');
    if (!imgDisplay) return; // ถ้าไม่ใช่หน้าดีเทลให้ข้ามไป

    const currentIndex = galleryData.findIndex(p => p.id === projectId);
    if (currentIndex === -1) {
        window.location.href = '../Gallery/';
        return;
    }

    const currentProject = galleryData[currentIndex];
    const canonicalUrl = `https://maneesawang-studio.github.io/Maneesawang_Gallery/ProjectDetail/?id=${encodeURIComponent(currentProject.id)}`;
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.href = canonicalUrl;

    const titleElement = document.getElementById('projTitle');
    const subtitleElement = document.getElementById('projSubTitle');
    const yearElement = document.getElementById('projYear');
    const contentSection = document.getElementById('project-extra-content');

    const renderProjectContent = language => {
        const projectTitle = getProjectText(currentProject.title, language);
        const concept = getProjectText(currentProject.concept, language);
        const description = getProjectText(currentProject.description, language);
        if (titleElement) titleElement.textContent = projectTitle;
        if (subtitleElement) subtitleElement.textContent = getProjectText(currentProject.subTitle, language);
        if (yearElement) yearElement.textContent = currentProject.year;
        imgDisplay.alt = language === 'th'
            ? `ผลงานออกแบบโลโก้และอัตลักษณ์แบรนด์ ${projectTitle} โดย MNSW Studio`
            : `${projectTitle} logo design and visual identity project by MNSW Studio`;

        if (!contentSection) return;
        contentSection.replaceChildren();
        if (concept) {
            const conceptSection = document.createElement('section');
            const conceptHeading = document.createElement('h2');
            conceptHeading.textContent = language === 'th' ? 'แนวคิดการออกแบบ' : 'Design concept';
            const conceptText = document.createElement('p');
            conceptText.textContent = concept;
            conceptSection.append(conceptHeading, conceptText);
            contentSection.append(conceptSection);
        }
        if (description) {
            const descriptionSection = document.createElement('section');
            const descriptionHeading = document.createElement('h2');
            descriptionHeading.textContent = language === 'th' ? 'รายละเอียดผลงาน' : 'Project details';
            const descriptionText = document.createElement('p');
            descriptionText.textContent = description;
            descriptionSection.append(descriptionHeading, descriptionText);
            contentSection.append(descriptionSection);
        }
        (Array.isArray(currentProject.fields) ? currentProject.fields : []).forEach(field => {
            const label = getProjectText(field.label, language);
            const value = getProjectText(field.value, language);
            if (!label || !value) return;
            const fieldSection = document.createElement('section');
            const heading = document.createElement('h2');
            heading.textContent = label;
            const text = document.createElement('p');
            text.textContent = value;
            fieldSection.append(heading, text);
            contentSection.append(fieldSection);
        });
        contentSection.hidden = contentSection.childElementCount === 0;
    };

    const updateProjectMetadata = language => {
        const projectTitle = getProjectText(currentProject.title, language);
        const pageTitle = language === 'th'
            ? `${projectTitle} | ผลงานออกแบบโลโก้ MNSW Studio`
            : `${projectTitle} | MNSW Studio Logo Design`;
        const pageDescription = language === 'th'
            ? (getProjectText(currentProject.description, language) || `ชมผลงาน ${projectTitle} โดย MNSW Studio ผลงานออกแบบโลโก้และอัตลักษณ์แบรนด์ ปี ${currentProject.year}`)
            : (getProjectText(currentProject.description, language) || `Explore the ${projectTitle} project by MNSW Studio. View selected logo and visual identity work created in ${currentProject.year}.`);
        const imageUrl = `https://maneesawang-studio.github.io/Maneesawang_Gallery/${currentProject.image.split('/').map(encodeURIComponent).join('/')}`;
        document.title = pageTitle;
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) metaDescription.content = pageDescription;

        const socialMetadata = {
            'og:title': pageTitle,
            'og:description': pageDescription,
            'og:url': canonicalUrl,
            'og:image': imageUrl,
            'og:image:alt': language === 'th'
                ? `ผลงานออกแบบโลโก้และอัตลักษณ์แบรนด์ ${projectTitle} โดย MNSW Studio`
                : `${projectTitle} logo design and visual identity project by MNSW Studio`,
            'twitter:title': pageTitle,
            'twitter:description': pageDescription,
            'twitter:image': imageUrl
        };
        Object.entries(socialMetadata).forEach(([property, content]) => {
            const meta = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
            if (meta) meta.content = content;
        });

        const structuredData = document.getElementById('project-structured-data');
        if (structuredData) {
            structuredData.textContent = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'CreativeWork',
                name: projectTitle,
                description: pageDescription,
                url: canonicalUrl,
                image: imageUrl,
                dateCreated: currentProject.year,
                inLanguage: language,
                creator: {
                    '@type': 'Organization',
                    name: 'MNSW Studio',
                    url: 'https://maneesawang-studio.github.io/Maneesawang_Gallery/'
                }
            });
        }
    };
    updateProjectMetadata(document.documentElement.lang);
    imgDisplay.src = currentProject.image;
    renderProjectContent(document.documentElement.lang);
    window.addEventListener('languagechange', event => {
        updateProjectMetadata(event.detail.language);
        renderProjectContent(event.detail.language);
    });
    window.addEventListener('languagechange', event => {
        updateProjectMetadata(event.detail.language);
        renderProjectContent(event.detail.language);
    });

    const btnNext = document.getElementById('btnNextProject');
    if (btnNext) {
        const nextIndex = (currentIndex + 1) % galleryData.length;
        btnNext.href = `ProjectDetail/?id=${galleryData[nextIndex].id}`;
    }
}

async function loadProjects() {
    const response = await fetch('data/projects.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`โหลดข้อมูลผลงานไม่สำเร็จ (${response.status})`);
    const projects = await response.json();
    if (!Array.isArray(projects) || projects.some(project =>
        !project || typeof project.id !== 'string' || typeof project.title !== 'string' ||
        typeof project.year !== 'string' || typeof project.image !== 'string'
    )) {
        throw new Error('รูปแบบข้อมูลใน data/projects.json ไม่ถูกต้อง');
    }
    return projects;
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        galleryData = await loadProjects();
        renderGallery();
        const projectId = new URLSearchParams(window.location.search).get('id') || galleryData[0]?.id;
        if (projectId) renderProjectDetail(projectId);
        window.addEventListener('languagechange', event => {
            renderGallery();
        });
    } catch (error) {
        console.error('Unable to load portfolio projects.', error);
        const message = document.documentElement.lang === 'th'
            ? 'โหลดข้อมูลผลงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
            : 'Unable to load projects. Please try again.';
        const gallery = document.getElementById('galleryGrid');
        if (gallery) gallery.textContent = message;
        const title = document.getElementById('projTitle');
        if (title) title.textContent = message;
    }
});
