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
    [...galleryData].sort((first, second) => Number(second.pinned === true) - Number(first.pinned === true)).forEach(item => {
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
    const detailContainer = document.querySelector('.project-detail-container');
    if (!detailContainer) return;

    const currentIndex = galleryData.findIndex(p => p.id === projectId);
    if (currentIndex === -1) {
        window.location.href = '../Gallery/';
        return;
    }

    const backLink = document.createElement('a');
    backLink.href = 'Gallery/';
    backLink.className = 'btn btn-secondary btn-all-work';

    const metaArea = document.createElement('div');
    metaArea.className = 'project-meta-area';
    const infoBlock = document.createElement('div');
    infoBlock.className = 'project-info-block';
    const subtitleElement = document.createElement('div');
    subtitleElement.id = 'projSubTitle';
    subtitleElement.className = 'sub-title';
    const titleElement = document.createElement('h1');
    titleElement.id = 'projTitle';
    titleElement.className = 'project-detail-title';
    const yearLabel = document.createElement('div');
    yearLabel.className = 'year-label';
    const yearElement = document.createElement('div');
    yearElement.id = 'projYear';
    yearElement.className = 'year-value';
    infoBlock.append(subtitleElement, titleElement, yearLabel, yearElement);
    metaArea.append(infoBlock);

    const contentSection = document.createElement('div');
    contentSection.id = 'project-extra-content';
    contentSection.className = 'project-extra-content';
    contentSection.hidden = true;

    const imageArea = document.createElement('div');
    imageArea.className = 'project-image-area';
    const imgDisplay = document.createElement('img');
    imgDisplay.id = 'projImage';
    imgDisplay.className = 'project-main-img';
    imageArea.append(imgDisplay);

    const projectNavigation = document.createElement('div');
    projectNavigation.className = 'project-nav-area';
    const btnNext = document.createElement('a');
    btnNext.id = 'btnNextProject';
    btnNext.className = 'btn btn-secondary btn-next-project';
    projectNavigation.append(btnNext);

    detailContainer.replaceChildren(backLink, metaArea, contentSection, imageArea, projectNavigation);

    const currentProject = galleryData[currentIndex];
    const canonicalUrl = `https://maneesawang-studio.github.io/MyGallery/ProjectDetail/?id=${encodeURIComponent(currentProject.id)}`;
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.href = canonicalUrl;

    const renderProjectContent = language => {
        backLink.textContent = language === 'th' ? '‹ ผลงานทั้งหมด' : '‹ All projects';
        yearLabel.textContent = language === 'th' ? 'ปี' : 'Year';
        btnNext.textContent = language === 'th' ? 'ผลงานถัดไป ›' : 'Next project ›';

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
        const imageUrl = `https://maneesawang-studio.github.io/MyGallery/${currentProject.image.split('/').map(encodeURIComponent).join('/')}`;
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
                    url: 'https://maneesawang-studio.github.io/MyGallery/'
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

    const nextIndex = (currentIndex + 1) % galleryData.length;
    btnNext.href = `ProjectDetail/?id=${encodeURIComponent(galleryData[nextIndex].id)}`;
}

async function loadProjects() {
    const response = await fetch('data/projects.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`โหลดข้อมูลผลงานไม่สำเร็จ (${response.status})`);
    const projects = await response.json();
    if (!Array.isArray(projects) || projects.some(project =>
        !project || typeof project.id !== 'string' || typeof project.title !== 'string' ||
        typeof project.year !== 'string' || typeof project.image !== 'string' ||
        (project.pinned !== undefined && typeof project.pinned !== 'boolean')
    )) {
        throw new Error('รูปแบบข้อมูลใน data/projects.json ไม่ถูกต้อง');
    }
    return projects;
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        galleryData = await loadProjects();
        galleryData.sort((first, second) => Number(second.pinned === true) - Number(first.pinned === true));
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
